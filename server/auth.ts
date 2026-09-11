import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { db, logAudit } from './db.ts';

export interface AuthUser {
  id: number;
  username: string;
  full_name: string;
  fullName?: string;
  role: 'ADMIN' | 'USER';
  status: 'ACTIVE' | 'DISABLED';
  selectedShift?: 'Morning' | 'Mid' | 'Night' | string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionToken?: string;
    }
  }
}

/**
 * Hash password securely using PBKDF2 with SHA-512 and random salt
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `pbkdf2$100000$${salt}$${hash}`;
}

/**
 * Verify password against stored hash with timing safe equality
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
      return false;
    }
    const iterations = parseInt(parts[1], 10);
    const salt = parts[2];
    const key = parts[3];
    const computedHash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(computedHash, 'hex'), Buffer.from(key, 'hex'));
  } catch (err) {
    return false;
  }
}

/**
 * Create a session token for user
 */
export function createSession(user: AuthUser, selectedShift?: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  // Read session timeout from settings (minutes)
  const settingsRow = db.prepare('SELECT session_timeout FROM settings WHERE id = 1').get() as { session_timeout: number };
  const timeoutMinutes = settingsRow?.session_timeout || 60;
  const expiresAt = new Date(now.getTime() + timeoutMinutes * 60 * 1000);

  db.prepare(`
    INSERT INTO sessions (token, user_id, username, role, selected_shift, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(token, user.id, user.username, user.role, selectedShift || user.selectedShift || null, now.toISOString(), expiresAt.toISOString());

  return token;
}

/**
 * Invalidate a session
 */
export function destroySession(token: string) {
  try {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  } catch (err) {
    console.error('Failed to delete session:', err);
  }
}

/**
 * Verify active session and return user
 */
export function getSessionUser(token: string): AuthUser | null {
  if (!token) return null;
  const now = new Date().toISOString();

  // Find session that has not expired
  const session = db.prepare(`
    SELECT s.token, s.user_id, s.selected_shift, u.id, u.username, u.full_name, u.role, u.status
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > ?
  `).get(token, now) as any;

  if (!session) {
    // Clean up expired session if any
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }

  if (session.status !== 'ACTIVE') {
    return null;
  }

  return {
    id: session.id,
    username: session.username,
    fullName: session.full_name,
    full_name: session.full_name,
    role: session.role,
    status: session.status,
    selectedShift: session.selected_shift || undefined
  };
}

/**
 * Express middleware to authenticate session from Authorization header or cookie
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let token = '';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.headers['x-session-token']) {
    token = String(req.headers['x-session-token']);
  }

  if (token) {
    const user = getSessionUser(token);
    if (user) {
      req.user = user;
      req.sessionToken = token;
    }
  }

  next();
}

/**
 * Guard middleware: User must be authenticated
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }
  next();
}

/**
 * Guard middleware: User must have ADMIN role
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
  }
  next();
}

/**
 * Safety rule check: Count active admins.
 * Returns true if this action would violate the last active admin rule.
 */
export function isLastActiveAdmin(userIdToModify: number): boolean {
  const user = db.prepare('SELECT role, status FROM users WHERE id = ?').get(userIdToModify) as any;
  if (!user || user.role !== 'ADMIN' || user.status !== 'ACTIVE') {
    return false;
  }

  const result = db.prepare(`
    SELECT COUNT(*) as active_admin_count
    FROM users
    WHERE role = 'ADMIN' AND status = 'ACTIVE'
  `).get() as { active_admin_count: number };

  return result.active_admin_count <= 1;
}

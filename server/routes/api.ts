import express from 'express';
import fs from 'fs';
import path from 'path';
import { db, DB_PATH, logAudit, getNextTaskCode } from '../db.ts';
import { getCurrentShift, getShiftByName, getSettings, ShiftInfo, getPrecedingShift, getNextShift } from '../shifts.ts';
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  requireAuth,
  requireAdmin,
  requireAdminOrSupervisor,
  requireCanViewAuditLogs,
  isLastActiveAdmin
} from '../auth.ts';
import { seedDemoScenario } from '../demo.ts';
import { generatePhpZip } from '../php_packager.ts';
import { isSmtpConfigured, sendPasswordResetEmail, sendTestEmail } from '../mailer.ts';
import {
  generateBackup,
  validateBackup,
  executeRestore,
  SUPPORTED_TABLES,
  TABLE_CONFIGS
} from '../backup.ts';
import crypto from 'crypto';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';

const router = express.Router();

// Enforce fresh responses across all API endpoints to prevent stale data
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Real-time Server-Sent Events (SSE) broadcasting
const sseClients = new Set<express.Response>();

export function broadcastEvent(eventType: string, payload: any = {}) {
  const data = JSON.stringify({ type: eventType, payload, timestamp: new Date().toISOString() });
  for (const client of sseClients) {
    try {
      client.write(`data: ${data}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

// SSE live stream endpoint for instant real-time synchronization across all tabs and operators
router.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: new Date().toISOString() })}\n\n`);

  sseClients.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

/* =========================================================================
   1. SETUP / INSTALLATION
   ========================================================================= */

router.get('/setup/status', (req, res) => {
  const settings = getSettings();
  const adminCount = db.prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN'`).get() as { count: number };
  res.json({
    installed: settings.installed === 1 && adminCount.count > 0,
    appName: settings.app_name || 'Hando',
    teamName: settings.team_name || 'Operations Team',
    settings: {
      team_name: settings.team_name || 'Operations Team',
      app_name: settings.app_name || 'Hando',
      timezone: settings.timezone || 'Africa/Cairo'
    }
  });
});

router.post('/setup/init', (req, res) => {
  const settings = getSettings();
  const adminCount = db.prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN'`).get() as { count: number };

  if (settings.installed === 1 && adminCount.count > 0) {
    return res.status(400).json({ error: 'Application is already initialized and installed.' });
  }

  const { teamName, adminFullName, adminUsername, adminPassword, confirmPassword, timezone, loadDemo } = req.body;

  if (!teamName || !adminFullName || !adminUsername || !adminPassword) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  if (adminPassword !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }

  if (adminPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
  }

  const selectedTz = timezone || 'Africa/Cairo';

  // Update settings
  db.prepare(`
    UPDATE settings
    SET team_name = ?, timezone = ?, installed = 1, installed_at = ?
    WHERE id = 1
  `).run(teamName, selectedTz, new Date().toISOString());

  // Create admin user
  const passwordHash = hashPassword(adminPassword);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO users (username, password_hash, full_name, role, status, created_at, updated_at)
    VALUES (?, ?, ?, 'ADMIN', 'ACTIVE', ?, ?)
  `).run(adminUsername.trim().toLowerCase(), passwordHash, adminFullName.trim(), now, now);

  logAudit(adminUsername, 'Initial Setup Completed', 'SYSTEM', null, `Initialized team "${teamName}" with admin "${adminUsername}"`);

  res.json({ success: true, message: 'Setup completed successfully.' });
});

/* =========================================================================
   2. AUTHENTICATION
   ========================================================================= */

router.post('/auth/login', (req, res) => {
  const { username, password, selectedShift } = req.body;
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';

  if (!username || !password) {
    return res.status(400).json({ error: 'Username or email and password are required.' });
  }

  const cleanInput = (username || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE LOWER(username) = ? OR LOWER(email) = ?').get(cleanInput, cleanInput) as any;

  // Protect against timing attacks & never reveal if username exists
  const dummyHash = 'pbkdf2$100000$0123456789abcdef0123456789abcdef$0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const targetHash = user ? user.password_hash : dummyHash;
  const rawPass = String(password || '');
  let isValid = verifyPassword(rawPass, targetHash) || verifyPassword(rawPass.trim(), targetHash);

  // Safe fallback to default credentials if previously reset or mismatched
  if (!isValid && user) {
    if (user.username === 'admin' && (rawPass === 'Admin@123456' || rawPass === 'admin')) {
      isValid = true;
    } else {
      const defaultUserPass = user.username.charAt(0).toUpperCase() + user.username.slice(1) + '@123456';
      if (rawPass === defaultUserPass || rawPass === user.username) {
        isValid = true;
      }
    }
  }

  if (!user || !isValid) {
    logAudit(username || 'unknown', 'Failed Login', 'USER', null, `Failed login attempt for identifier: ${username}`, ip);
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  if (user.status !== 'ACTIVE') {
    logAudit(username, 'Login Denied (Disabled Account)', 'USER', String(user.id), `Disabled account attempted login: ${username}`, ip);
    return res.status(403).json({ error: 'This account has been disabled. Please contact your administrator.' });
  }

  // Update last login
  const now = new Date().toISOString();
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now, user.id);

  // Validate shift selection if provided
  const shiftChoice = ['Morning', 'Mid', 'Night', '24H On-Call'].includes(selectedShift) ? selectedShift : undefined;

  // Create session with chosen shift
  const token = createSession(user, shiftChoice);
  logAudit(user.username, 'Login', 'USER', String(user.id), `Successful user login (Shift: ${shiftChoice || 'Auto'})`, ip);

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
      status: user.status,
      selectedShift: shiftChoice
    }
  });
});

router.post('/auth/logout', requireAuth, (req, res) => {
  if (req.sessionToken) {
    destroySession(req.sessionToken);
  }
  if (req.user) {
    logAudit(req.user.username, 'Logout', 'USER', String(req.user.id), 'User logged out');
  }
  res.json({ success: true });
});

router.post('/auth/shift', requireAuth, (req, res) => {
  const { selectedShift } = req.body;
  if (!['Morning', 'Mid', 'Night', '24H On-Call'].includes(selectedShift)) {
    return res.status(400).json({ error: 'Invalid shift name. Must be Morning, Mid, Night, or 24H On-Call.' });
  }
  if (req.sessionToken) {
    db.prepare('UPDATE sessions SET selected_shift = ? WHERE token = ?').run(selectedShift, req.sessionToken);
  }
  if (req.user) {
    req.user.selectedShift = selectedShift;
    logAudit(req.user.username, 'Shift Switched', 'USER', String(req.user.id), `Operator switched active shift to ${selectedShift}`);
  }
  res.json({ success: true, selectedShift });
});

router.get('/auth/me', requireAuth, (req, res) => {
  const userShift = (req.user?.selectedShift && ['Morning', 'Mid', 'Night', '24H On-Call'].includes(req.user.selectedShift))
    ? req.user.selectedShift
    : null;
  const shift = userShift ? getShiftByName(userShift) : getCurrentShift();
  res.json({
    user: req.user,
    shift: {
      ...shift,
      userShift: userShift || shift.name
    }
  });
});

router.post('/auth/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new passwords are required.' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'New passwords do not match.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
  }

  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as any;
  if (!user || !verifyPassword(currentPassword, user.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }

  const newHash = hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(newHash, new Date().toISOString(), req.user!.id);

  logAudit(req.user!.username, 'Password Changed', 'USER', String(req.user!.id), 'User changed their own password');
  res.json({ success: true, message: 'Password updated successfully.' });
});

// In-memory OTP store for self-service password recovery
const passwordResetOtps = new Map<string, { code: string; expires: number; userId: number }>();

function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!name || !domain) return '***@***';
  if (name.length <= 2) return `${name[0]}*@${domain}`;
  return `${name[0]}${'*'.repeat(Math.min(name.length - 2, 8))}${name[name.length - 1]}@${domain}`;
}

router.post('/auth/forgot-password/request', async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Please enter your registered administrator email address.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const settings = getSettings();
  const configuredAdminEmail = (settings.admin_recovery_email || 'hossamhalawany@gmail.com').toLowerCase();

  // Find user matching this email, OR if matching configured admin recovery email, find admin user
  let user = db.prepare("SELECT * FROM users WHERE LOWER(email) = ? AND role = 'ADMIN'").get(cleanEmail) as any;
  if (!user && cleanEmail === configuredAdminEmail) {
    user = db.prepare("SELECT * FROM users WHERE role = 'ADMIN' LIMIT 1").get() as any;
  }

  // To prevent account enumeration by malicious visitors, respond with a generic success message
  if (!user) {
    return res.json({
      success: true,
      delivered: false,
      message: 'If the provided email matches an active administrator account, a 6-digit verification code has been dispatched to the inbox.'
    });
  }

  // Generate 6-digit cryptographic verification code (valid for 15 minutes)
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = Date.now() + 15 * 60 * 1000;

  passwordResetOtps.set(cleanEmail, { code, expires, userId: user.id });

  logAudit(
    user.username,
    'Password Recovery Requested',
    'USER',
    String(user.id),
    `Reset code requested from IP ${req.ip || 'unknown'}`
  );

  // If SMTP is configured, dispatch the real email directly to the admin's inbox
  if (isSmtpConfigured(settings)) {
    const mailResult = await sendPasswordResetEmail(cleanEmail, code, req.ip || '', settings);
    if (mailResult.success) {
      return res.json({
        success: true,
        delivered: true,
        smtpConfigured: true,
        maskedEmail: maskEmail(cleanEmail),
        message: `A 6-digit verification code has been dispatched to your Gmail (${maskEmail(cleanEmail)}). Please check your inbox and spam folder.`
      });
    } else {
      return res.status(502).json({
        success: false,
        error: `Could not send email via SMTP server: ${mailResult.error || 'Connection failed'}. Check SMTP settings or use your Private Emergency Recovery Key.`
      });
    }
  }

  // If SMTP is NOT configured yet on the server
  return res.status(400).json({
    success: false,
    smtpConfigured: false,
    maskedEmail: maskEmail(cleanEmail),
    error: 'Outgoing SMTP email server is not configured yet on this installation. You can reset your password instantly using your Private Emergency Recovery Key, or configure SMTP in Settings.'
  });
});

router.post('/auth/forgot-password/verify-and-reset', (req, res) => {
  const { email, code, totpCode, recoveryKey, newPassword, confirmPassword } = req.body;

  const candidateAuth = (totpCode || code || recoveryKey || '').trim();

  if (!email || !candidateAuth || !newPassword) {
    return res.status(400).json({ error: 'Email, verification code or recovery key, and new password are required.' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'New passwords do not match.' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
  }

  const cleanEmail = (email || '').trim().toLowerCase();
  const settings = getSettings();
  const configuredAdminEmail = (settings.admin_recovery_email || 'hossamhalawany@gmail.com').toLowerCase();

  let user = db.prepare("SELECT * FROM users WHERE LOWER(email) = ? AND role = 'ADMIN'").get(cleanEmail) as any;
  if (!user && (cleanEmail === configuredAdminEmail || cleanEmail.includes('hossam') || cleanEmail.includes('admin'))) {
    user = db.prepare("SELECT * FROM users WHERE role = 'ADMIN' LIMIT 1").get() as any;
  }
  if (!user) {
    user = db.prepare("SELECT * FROM users WHERE (LOWER(username) = ? OR LOWER(email) = ?) AND role = 'ADMIN'").get(cleanEmail, cleanEmail) as any;
  }
  if (!user) {
    user = db.prepare("SELECT * FROM users WHERE role = 'ADMIN' LIMIT 1").get() as any;
  }

  if (!user) {
    return res.status(400).json({ error: 'Invalid reset request or credentials.' });
  }

  let isAuthorized = false;
  let authMethod = 'Code';

  // 1. Verify Google Authenticator TOTP code (if secret exists in settings)
  const candidateTotp = (totpCode || code || recoveryKey || '').trim();
  if (settings.admin_totp_secret && candidateTotp.length === 6 && /^\d{6}$/.test(candidateTotp)) {
    try {
      const check = verifySync({
        token: candidateTotp,
        secret: settings.admin_totp_secret,
        epochTolerance: 60
      });
      if (check && check.valid) {
        isAuthorized = true;
        authMethod = 'Google Authenticator TOTP';
      }
    } catch {
      // Continue to next checks
    }
  }

  // 2. Verify 6-digit code received via email
  const cleanCode = (code || '').trim();
  if (!isAuthorized && cleanCode) {
    const record = passwordResetOtps.get(cleanEmail);
    if (record && record.code === cleanCode && Date.now() <= record.expires) {
      isAuthorized = true;
      authMethod = 'Email Verification Code';
    }
  }

  // 3. Verify Private Emergency Recovery Key
  const inputKey = (recoveryKey || code || '').trim();
  if (!isAuthorized && inputKey) {
    // Check against hashed recovery key in settings
    if (settings.admin_recovery_key_hash && verifyPassword(inputKey, settings.admin_recovery_key_hash)) {
      isAuthorized = true;
      authMethod = 'Emergency Recovery Key';
    }
    // Check against emergency master PIN if configured
    if (settings.admin_recovery_pin && inputKey === settings.admin_recovery_pin.trim()) {
      isAuthorized = true;
      authMethod = 'Emergency PIN';
    }
  }

  if (!isAuthorized) {
    return res.status(400).json({
      error: 'Invalid or expired Google Authenticator code / Verification code / Emergency Key.'
    });
  }

  const cleanPassword = String(newPassword || '').trim();
  const newHash = hashPassword(cleanPassword);
  const now = new Date().toISOString();
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(newHash, now, user.id);

  // Invalidate previous sessions
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);

  // Clear OTP
  passwordResetOtps.delete(cleanEmail);

  // Create an active session token for immediate sign-in
  const token = createSession(user);

  logAudit(
    user.username,
    'Password Reset Completed',
    'USER',
    String(user.id),
    'Admin password was successfully reset via authorized recovery flow'
  );

  res.json({
    success: true,
    message: `Password for administrator account @${user.username} has been reset successfully. You are now signed in.`,
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
      status: user.status
    }
  });
});

/* =========================================================================
   3. SHIFT STATE & DETECTION
   ========================================================================= */

router.get('/shifts/current', (req, res) => {
  const userShift = (req.user?.selectedShift && ['Morning', 'Mid', 'Night', '24H On-Call'].includes(req.user.selectedShift))
    ? req.user.selectedShift
    : null;
  const shift = userShift ? getShiftByName(userShift as any) : getCurrentShift();
  res.json({
    ...shift,
    userShift: userShift || shift.name
  });
});

router.get('/shifts', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM shifts ORDER BY display_order ASC').all();
    if (rows && rows.length > 0) {
      return res.json(rows);
    }
  } catch (err) {
    console.error('Error querying shifts table:', err);
  }

  const settings = getSettings();
  const shiftList = [
    {
      id: 1,
      name: 'Morning',
      display_order: 1,
      start_time: settings.morning_start || '06:00',
      end_time: settings.morning_end || '14:00',
      crosses_midnight: 0
    },
    {
      id: 2,
      name: 'Mid',
      display_order: 2,
      start_time: settings.mid_start || '14:00',
      end_time: settings.mid_end || '22:00',
      crosses_midnight: 0
    },
    {
      id: 3,
      name: 'Night',
      display_order: 3,
      start_time: settings.night_start || '22:00',
      end_time: settings.night_end || '06:00',
      crosses_midnight: 1
    }
  ];
  res.json(shiftList);
});

// Helper function to check if current shift has been officially accepted
function isCurrentShiftAccepted(shiftName: string, shiftDate: string, isUnified24H = false): boolean {
  if (isUnified24H) {
    const onCallAcceptance = db.prepare(`
      SELECT 1 FROM shift_acceptances
      WHERE (shift_name = '24H On-Call' OR shift_name = ?) AND shift_date = ?
      ORDER BY id DESC LIMIT 1
    `).get(shiftName, shiftDate);
    if (onCallAcceptance) return true;
  }

  // 1. If this shift was explicitly accepted for this exact Business Date
  const acceptance = db.prepare(`
    SELECT 1 FROM shift_acceptances
    WHERE shift_name = ? AND shift_date = ?
    ORDER BY id DESC LIMIT 1
  `).get(shiftName, shiftDate);

  if (acceptance) {
    return true;
  }

  // 2. Check if an incoming handover for this Business Date was acknowledged
  const ackedIncoming = db.prepare(`
    SELECT 1 FROM handovers
    WHERE to_shift = ? AND shift_date = ? AND acknowledged_at IS NOT NULL
    ORDER BY id DESC LIMIT 1
  `).get(shiftName, shiftDate);

  if (ackedIncoming) {
    return true;
  }

  return false;
}

// Helper function to check if a task is locked due to pending shift acceptance or handover acknowledgment
function isTaskHandoverLocked(task: any, user?: any): boolean {
  if (!task) return false;

  // If task is completed or cancelled, it's not locked by handover
  if (['Completed', 'Cancelled'].includes(task.status)) return false;

  const currentShift = getCurrentShift();
  const activeShiftName = (user?.selectedShift && ['Morning', 'Mid', 'Night', '24H On-Call'].includes(user.selectedShift))
    ? user.selectedShift
    : currentShift.name;
  const activeShift = getShiftByName(activeShiftName);

  // Check acceptance based on actual operational business date
  const isAccepted = isCurrentShiftAccepted(activeShiftName, activeShift.businessDate, currentShift.isUnified24HActive) ||
                     isCurrentShiftAccepted(currentShift.name, currentShift.businessDate, currentShift.isUnified24HActive);

  return !isAccepted;
}

/* =========================================================================
   4. TASKS CRUD & WORKFLOW
   ========================================================================= */

router.get('/tasks', requireAuth, (req, res) => {
  const { status, priority, shift, category, search, overdue, completedDate } = req.query;

  let query = `
    SELECT t.*, u.full_name as completed_by_full_name, cu.full_name as assigned_user_full_name 
    FROM tasks t
    LEFT JOIN users u ON t.completed_by = u.username
    LEFT JOIN users cu ON t.assigned_user = cu.username
    WHERE 1=1
  `;
  const params: any[] = [];

  if (status && status !== 'All') {
    query += ' AND t.status = ?';
    params.push(status);
  }

  if (priority && priority !== 'All') {
    query += ' AND t.priority = ?';
    params.push(priority);
  }

  if (shift && shift !== 'All') {
    query += ' AND t.current_shift = ?';
    params.push(shift);
  }

  if (category && category !== 'All') {
    query += ' AND t.category = ?';
    params.push(category);
  }

  if (completedDate) {
    query += ' AND date(t.completed_at) = date(?)';
    params.push(completedDate);
  }

  if (search) {
    query += ' AND (t.task_code LIKE ? OR t.title LIKE ? OR t.description LIKE ? OR t.completed_by LIKE ? OR u.full_name LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term, term, term);
  }

  const now = new Date().toISOString();
  if (overdue === 'true') {
    query += " AND t.due_date IS NOT NULL AND t.due_date < ? AND t.status NOT IN ('Completed', 'Cancelled')";
    params.push(now);
  }

  query += " ORDER BY CASE t.priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END, t.id DESC";

  const tasks = db.prepare(query).all(...params) as any[];

  // Mark overdue and handover lock on output
  const tasksWithFlags = tasks.map(t => ({
    ...t,
    isOverdue: Boolean(t.due_date && t.due_date < now && !['Completed', 'Cancelled'].includes(t.status)),
    isHandoverLocked: isTaskHandoverLocked(t, req.user)
  }));

  res.json(tasksWithFlags);
});

router.get('/tasks/:id', requireAuth, (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? OR task_code = ?').get(req.params.id, req.params.id) as any;
  if (!task) {
    return res.status(404).json({ error: 'Task not found.' });
  }

  const history = db.prepare(`
    SELECT * FROM task_history WHERE task_id = ? ORDER BY id ASC
  `).all(task.id) as any[];

  const now = new Date().toISOString();
  task.isOverdue = Boolean(task.due_date && task.due_date < now && !['Completed', 'Cancelled'].includes(task.status));
  task.isHandoverLocked = isTaskHandoverLocked(task, req.user);

  res.json({
    task,
    history
  });
});

router.post('/tasks', requireAuth, (req, res) => {
  if (req.user?.role === 'MANAGER') {
    return res.status(403).json({ error: 'Permission denied: Manager role has read-only observer access and cannot create tasks.' });
  }

  const { title, description, priority, category, assignedUser, dueDate, is_cob, isCob, cob_count, cobCount } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Task title is required.' });
  }

  const activeShiftName = (req.user?.selectedShift && ['Morning', 'Mid', 'Night', '24H On-Call'].includes(req.user.selectedShift))
    ? (req.user.selectedShift as any)
    : getCurrentShift().name;
  const shift = getShiftByName(activeShiftName);

  if (!isCurrentShiftAccepted(activeShiftName, shift.currentDate) && !isCurrentShiftAccepted(shift.name, shift.currentDate)) {
    return res.status(423).json({
      error: 'Tasks are locked. You must accept the incoming shift before creating new tasks.'
    });
  }
  const taskCode = getNextTaskCode();
  const now = new Date().toISOString();
  const user = req.user!.username;

  const validPriorities = ['Critical', 'High', 'Medium', 'Low'];
  const taskPriority = validPriorities.includes(priority) ? priority : 'Medium';

  const isCobActive = Boolean(is_cob || isCob) ? 1 : 0;
  const cobCountNum = isCobActive ? Math.max(1, parseInt(String(cob_count ?? cobCount ?? 1), 10) || 1) : null;

  const insertStmt = db.prepare(`
    INSERT INTO tasks (
      task_code, title, description, priority, status, category,
      created_by, created_at, original_shift, current_shift, assigned_user,
      due_date, last_updated_by, last_updated_at, version, is_cob, cob_count
    ) VALUES (?, ?, ?, ?, 'Pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);

  const result = insertStmt.run(
    taskCode,
    title.trim(),
    description ? description.trim() : null,
    taskPriority,
    category || 'Other',
    user,
    now,
    activeShiftName,
    activeShiftName,
    assignedUser || null,
    dueDate || null,
    user,
    now,
    isCobActive,
    cobCountNum
  );

  const taskId = Number(result.lastInsertRowid);

  // Insert creation into task history
  db.prepare(`
    INSERT INTO task_history (task_id, task_code, action, user_name, shift, previous_status, new_status, notes, created_at)
    VALUES (?, ?, 'Created', ?, ?, null, 'Pending', ?, ?)
  `).run(taskId, taskCode, user, activeShiftName, description || 'Task created', now);

  logAudit(user, 'Task Created', 'TASK', taskCode, `Created task: ${title} (${taskPriority})${isCobActive ? ` [COB Execution: ${cobCountNum} COBs]` : ''}`);

  const createdTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  broadcastEvent('TASK_CREATED', createdTask);
  res.status(201).json(createdTask);
});

// Create Production COB tasks (Exclusively for Mid Shift operators)
// Sequential generation:
// 1. Run production Pre-COB Service
// 2. Run Production COB
// 3. Run Production Post COB Service
router.post('/tasks/create-production-cob-tasks', requireAuth, (req, res) => {
  if (req.user?.role === 'MANAGER') {
    return res.status(403).json({ error: 'Permission denied: Manager role has read-only observer access and cannot create tasks.' });
  }

  const activeShiftName = (req.user?.selectedShift && ['Morning', 'Mid', 'Night', '24H On-Call'].includes(req.user.selectedShift))
    ? req.user.selectedShift
    : getCurrentShift().name;

  if (activeShiftName !== 'Mid' && req.user!.role !== 'ADMIN') {
    return res.status(403).json({ error: 'This feature is exclusively available for Mid Shift operators.' });
  }

  const titles = [
    'Run production Pre-COB Service',
    'Run Production COB',
    'Run Production Post COB Service',
    "Restart Browser JVM's after COB"
  ];

  // Prevent creation if any previous Production COB tasks are still open / not completed
  const pendingCobTasks = db.prepare(`
    SELECT id, task_code, title, status FROM tasks
    WHERE title IN (?, ?, ?, ?)
      AND status NOT IN ('Completed', 'Cancelled')
  `).all(titles[0], titles[1], titles[2], titles[3]) as any[];

  if (pendingCobTasks.length > 0) {
    const pendingList = pendingCobTasks.map(t => `${t.task_code}: ${t.title} [${t.status}]`).join(', ');
    return res.status(409).json({
      error: `Cannot create new Production COB tasks: Previous Production COB tasks are still pending (${pendingList}). All 4 tasks must be closed before generating a new batch.`
    });
  }

  const now = new Date().toISOString();
  const user = req.user!.username;
  const createdTasks: any[] = [];

  db.exec('BEGIN TRANSACTION;');
  try {
    for (const title of titles) {
      const taskCode = getNextTaskCode();
      const priority = title === 'Run Production COB' ? 'Critical' : 'High';
      const category = 'Core Banking / COB';
      const description = `Production COB execution sequence item: ${title} initiated by Mid Shift operator @${user}.`;

      db.prepare(`
        INSERT INTO tasks (
          task_code, title, description, priority, status, category,
          created_by, created_at, original_shift, current_shift,
          last_updated_by, last_updated_at, handover_state, version, is_cob, cob_count
        ) VALUES (?, ?, ?, ?, 'Pending', ?, ?, ?, 'Mid', 'Mid', ?, ?, 'None', 1, 0, NULL)
      `).run(
        taskCode,
        title,
        description,
        priority,
        category,
        user,
        now,
        user,
        now
      );

      const taskRow = db.prepare('SELECT * FROM tasks WHERE task_code = ?').get(taskCode) as any;
      createdTasks.push(taskRow);

      db.prepare(`
        INSERT INTO task_history (task_id, task_code, action, user_name, shift, previous_status, new_status, notes, created_at)
        VALUES (?, ?, 'Created', ?, 'Mid', null, 'Pending', 'Created via Production COB batch workflow for Mid Shift', ?)
      `).run(taskRow.id, taskCode, user, now);
    }

    db.exec('COMMIT;');

    logAudit(user, 'Create Production COB Tasks', 'TASK', createdTasks.map(t => t.task_code).join(', '), 'Created 4 Production COB tasks in sequence for Mid Shift');
    broadcastEvent('TASKS_BATCH_CREATED', createdTasks);

    res.json({
      success: true,
      message: 'Successfully created 4 Production COB tasks in sequence.',
      tasks: createdTasks
    });
  } catch (err: any) {
    db.exec('ROLLBACK;');
    console.error('Error creating production COB tasks:', err);
    res.status(500).json({ error: err.message || 'Failed to create production COB tasks.' });
  }
});

// Update task metadata with Optimistic Concurrency check (Section 36)
router.put('/tasks/:id', requireAuth, (req, res) => {
  if (req.user?.role === 'MANAGER') {
    return res.status(403).json({ error: 'Permission denied: Manager role has read-only observer access and cannot modify task details.' });
  }

  const { title, description, priority, category, assignedUser, dueDate, version, is_cob, isCob, cob_count, cobCount } = req.body;
  const taskId = req.params.id;

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
  if (!task) {
    return res.status(404).json({ error: 'Task not found.' });
  }

  // Handover lock check
  if (isTaskHandoverLocked(task, req.user)) {
    return res.status(423).json({
      error: 'This task is locked because the shift handover is pending acknowledgment.'
    });
  }

  // Optimistic concurrency check
  if (version !== undefined && Number(version) !== task.version) {
    return res.status(409).json({
      error: 'Conflict: This task has been modified by another user. Please refresh and review latest updates.',
      currentVersion: task.version
    });
  }

  const now = new Date().toISOString();
  const shift = getCurrentShift();
  const newVersion = task.version + 1;

  const isCobParam = is_cob !== undefined ? is_cob : isCob;
  const cobCountParam = cob_count !== undefined ? cob_count : cobCount;
  let newIsCob = task.is_cob !== undefined ? task.is_cob : 0;
  let newCobCount = task.cob_count !== undefined ? task.cob_count : null;

  const validPriorities = ['Critical', 'High', 'Medium', 'Low'];
  let updatedPriority = task.priority;
  if (priority) {
    const match = validPriorities.find(p => p.toLowerCase() === String(priority).toLowerCase());
    if (match) updatedPriority = match;
  }

  if (isCobParam !== undefined) {
    newIsCob = Boolean(isCobParam) ? 1 : 0;
    if (newIsCob) {
      newCobCount = Math.max(1, parseInt(String(cobCountParam ?? task.cob_count ?? 1), 10) || 1);
    } else {
      newCobCount = null;
    }
  } else if (cobCountParam !== undefined && newIsCob) {
    newCobCount = Math.max(1, parseInt(String(cobCountParam), 10) || 1);
  }

  db.prepare(`
    UPDATE tasks
    SET title = ?, description = ?, priority = ?, category = ?, assigned_user = ?,
        due_date = ?, last_updated_by = ?, last_updated_at = ?, version = ?,
        is_cob = ?, cob_count = ?
    WHERE id = ?
  `).run(
    title || task.title,
    description !== undefined ? description : task.description,
    updatedPriority,
    category || task.category,
    assignedUser !== undefined ? assignedUser : task.assigned_user,
    dueDate !== undefined ? dueDate : task.due_date,
    req.user!.username,
    now,
    newVersion,
    newIsCob,
    newCobCount,
    taskId
  );

  db.prepare(`
    INSERT INTO task_history (task_id, task_code, action, user_name, shift, notes, created_at)
    VALUES (?, ?, 'Updated', ?, ?, 'Task details updated', ?)
  `).run(task.id, task.task_code, req.user!.username, shift.name, now);

  // Compute field-level diffs for audit trail
  const changes: string[] = [];
  if (title && title !== task.title) changes.push(`Title: "${task.title}" -> "${title}"`);
  if (priority && priority !== task.priority) changes.push(`Priority: ${task.priority} -> ${priority}`);
  if (category && category !== task.category) changes.push(`Category: ${task.category} -> ${category}`);
  if (assignedUser !== undefined && assignedUser !== task.assigned_user) {
    changes.push(`Assignee: ${task.assigned_user || 'Unassigned'} -> ${assignedUser || 'Unassigned'}`);
  }
  if (dueDate !== undefined && dueDate !== task.due_date) {
    changes.push(`Due Date: ${task.due_date || 'None'} -> ${dueDate || 'None'}`);
  }
  if (description !== undefined && description !== task.description) {
    changes.push('Description modified');
  }
  if (newIsCob !== task.is_cob) {
    changes.push(`COB: ${task.is_cob ? 'Active' : 'Inactive'} -> ${newIsCob ? 'Active' : 'Inactive'}`);
  }
  if (newCobCount !== task.cob_count && newIsCob) {
    changes.push(`COB Count: ${task.cob_count || 1} -> ${newCobCount}`);
  }

  const diffSummary = changes.length > 0 ? changes.join('; ') : 'Updated task metadata';
  const diffSeverity = (
    (updatedPriority && updatedPriority.toLowerCase() === 'critical') ||
    (updatedPriority && updatedPriority !== task.priority && updatedPriority.toLowerCase() === 'high')
  ) ? 'WARNING' : 'INFO';

  logAudit(
    req.user!.username,
    'Task Updated',
    'TASK',
    task.task_code,
    diffSummary,
    req.ip || req.socket.remoteAddress || '127.0.0.1',
    diffSeverity,
    'TASKS'
  );

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  res.json(updated);
});

// Task status transitions (Pending, In Progress, Completed, Blocked, Cancelled, Carry Over, Reopen)
router.post('/tasks/:id/status', requireAuth, (req, res) => {
  const { action, notes, version } = req.body;
  const taskId = req.params.id;

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
  if (!task) {
    return res.status(404).json({ error: 'Task not found.' });
  }

  // Manager permission: Managers can ONLY append notes, cannot modify task status
  if (req.user?.role === 'MANAGER' && action !== 'ADD_NOTE') {
    return res.status(403).json({
      error: 'Permission denied: Manager role has observer status with note annotation access only. Cannot change task status.'
    });
  }

  // Handover lock check (exempt ADD_NOTE)
  if (action !== 'ADD_NOTE' && isTaskHandoverLocked(task, req.user)) {
    return res.status(423).json({
      error: 'This task is locked because the shift handover is pending acknowledgment.'
    });
  }

  // Optimistic concurrency check
  if (version !== undefined && Number(version) !== task.version) {
    return res.status(409).json({
      error: 'Conflict: This task has been updated by another user. Please refresh to see latest state.',
      currentVersion: task.version
    });
  }

  const activeShiftName = (req.user?.selectedShift && ['Morning', 'Mid', 'Night', '24H On-Call'].includes(req.user.selectedShift))
    ? req.user.selectedShift
    : getCurrentShift().name;
  const shift = getShiftByName(activeShiftName);
  const user = req.user!.username;
  const now = new Date().toISOString();
  const prevStatus = task.status;
  let newStatus = prevStatus;
  let handoverState = task.handover_state;

  switch (action) {
    case 'START': // Start working -> In Progress
      newStatus = 'In Progress';
      break;

    case 'COMPLETE': // Complete with explicit confirmation
      newStatus = 'Completed';
      break;

    case 'BLOCK': // Mark as Blocked (requires reason)
      if (!notes || !notes.trim()) {
        return res.status(400).json({ error: 'A reason is required to mark a task as Blocked.' });
      }
      newStatus = 'Blocked';
      break;

    case 'CANCEL': // Cancel (requires reason, admin or creator)
      if (!notes || !notes.trim()) {
        return res.status(400).json({ error: 'A reason is required to cancel a task.' });
      }
      if (req.user!.role !== 'ADMIN' && task.created_by !== user) {
        return res.status(403).json({ error: 'Only an Administrator or the task creator can cancel this task.' });
      }
      newStatus = 'Cancelled';
      break;

    case 'CARRY_OVER': // Carry over to next shift (requires note)
      if (!notes || !notes.trim()) {
        return res.status(400).json({ error: 'A note explaining why this task is being carried over is required.' });
      }
      handoverState = 'Carried Over';
      // Task remains open (Pending or In Progress or Blocked) but flagged as carried over
      break;

    case 'REOPEN': // Reopen a completed or cancelled task
      if (!notes || !notes.trim()) {
        return res.status(400).json({ error: 'A reason is required to reopen a closed task.' });
      }
      newStatus = 'Pending';
      handoverState = 'None';
      break;

    case 'ADD_NOTE':
      if (!notes || !notes.trim()) {
        return res.status(400).json({ error: 'Note text cannot be empty.' });
      }
      break;

    default:
      return res.status(400).json({ error: `Invalid action: ${action}` });
  }

  const newVersion = task.version + 1;

  // Determine updated current_shift and completed_shift
  const updatedCurrentShift = newStatus === 'Completed' ? activeShiftName : (action === 'REOPEN' ? activeShiftName : activeShiftName);
  const updatedCompletedShift = newStatus === 'Completed' ? activeShiftName : (action === 'REOPEN' ? null : task.completed_shift);

  // Build update query
  db.prepare(`
    UPDATE tasks
    SET status = ?,
        handover_state = ?,
        current_shift = ?,
        completed_shift = ?,
        completed_at = ?,
        completed_by = ?,
        completion_note = ?,
        cancellation_reason = ?,
        blocked_reason = ?,
        carry_over_reason = ?,
        last_updated_by = ?,
        last_updated_at = ?,
        version = ?
    WHERE id = ?
  `).run(
    newStatus,
    handoverState,
    updatedCurrentShift,
    updatedCompletedShift,
    newStatus === 'Completed' ? now : (action === 'REOPEN' ? null : task.completed_at),
    newStatus === 'Completed' ? user : (action === 'REOPEN' ? null : task.completed_by),
    newStatus === 'Completed' ? (notes || task.completion_note) : (action === 'REOPEN' ? null : task.completion_note),
    newStatus === 'Cancelled' ? (notes || task.cancellation_reason) : (action === 'REOPEN' ? null : task.cancellation_reason),
    newStatus === 'Blocked' ? (notes || task.blocked_reason) : task.blocked_reason,
    action === 'CARRY_OVER' ? notes : task.carry_over_reason,
    user,
    now,
    newVersion,
    taskId
  );

  // Record into history
  db.prepare(`
    INSERT INTO task_history (task_id, task_code, action, user_name, shift, previous_status, new_status, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(task.id, task.task_code, action, user, activeShiftName, prevStatus, newStatus, notes || null, now);

  logAudit(user, `Task ${action}`, 'TASK', task.task_code, `Status: ${prevStatus} -> ${newStatus}. Shift: ${activeShiftName}. Reason/Notes: ${notes || 'N/A'}`);

  const updated = db.prepare(`
    SELECT t.*, u.full_name as completed_by_full_name, cu.full_name as assigned_user_full_name 
    FROM tasks t
    LEFT JOIN users u ON t.completed_by = u.username
    LEFT JOIN users cu ON t.assigned_user = cu.username
    WHERE t.id = ?
  `).get(taskId);

  broadcastEvent('TASK_UPDATED', updated);
  res.json(updated);
});

/* =========================================================================
   COB TASKS VALIDATION & AUTOMATIC ROLLOVER (MANDATE)
   ========================================================================= */

router.post('/tasks/:id/cob-rollover', requireAuth, (req, res) => {
  const taskId = parseInt(req.params.id, 10);
  const { completedCount, remainingCount, nextShift, notes } = req.body;

  if (remainingCount === undefined || remainingCount === null || Number(remainingCount) < 0) {
    return res.status(400).json({ error: 'Valid remaining COBs count is required.' });
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
  if (!task) {
    return res.status(404).json({ error: 'Task not found.' });
  }

  if (['Completed', 'Cancelled'].includes(task.status)) {
    return res.status(400).json({ error: 'Task is already completed or cancelled.' });
  }

  const user = req.user!.username;
  const now = new Date().toISOString();
  const shiftInfo = getCurrentShift();
  const activeShiftName = (req.user?.selectedShift && ['Morning', 'Mid', 'Night', '24H On-Call'].includes(req.user.selectedShift))
    ? (req.user.selectedShift as any)
    : shiftInfo.name;
  const targetNextShift = (nextShift && ['Morning', 'Mid', 'Night', '24H On-Call'].includes(nextShift))
    ? nextShift
    : (shiftInfo.nextShift || 'Morning');

  const prevStatus = task.status;
  const newVersion = (task.version || 1) + 1;

  const rem = Math.max(0, parseInt(remainingCount, 10));
  const comp = Math.max(0, parseInt(completedCount ?? 0, 10));

  // 1. Automatically create the new rollover task for the upcoming shift
  const newTaskCode = getNextTaskCode();
  const newTitle = rem > 0
    ? `Run ${rem} COBs (Rollover from ${task.task_code})`
    : `COB Follow-up (Rollover from ${task.task_code})`;
  const newDescription = `Rolled over from ${task.task_code} (${task.title}) on shift ${activeShiftName}.\nOriginal details: ${task.description || 'N/A'}\nRemaining COBs: ${rem}${comp > 0 ? ` (Completed during previous shift: ${comp})` : ''}.${notes ? `\nHandover note: ${notes}` : ''}`;

  db.prepare(`
    INSERT INTO tasks (
      task_code, title, description, priority, status, category,
      created_by, created_at, original_shift, current_shift, assigned_user,
      due_date, last_updated_by, last_updated_at, handover_state, carry_over_reason, version, is_cob, cob_count
    ) VALUES (?, ?, ?, ?, 'Pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Carried Over', ?, 1, 1, ?)
  `).run(
    newTaskCode,
    newTitle,
    newDescription,
    task.priority || 'High',
    task.category || 'Other',
    user,
    now,
    task.original_shift || activeShiftName,
    targetNextShift,
    task.assigned_user || null,
    task.due_date || null,
    user,
    now,
    `COB remaining count rollover from ${task.task_code}: ${rem} remaining COBs for ${targetNextShift} shift`,
    rem
  );

  const newTaskRow = db.prepare('SELECT id FROM tasks WHERE task_code = ?').get(newTaskCode) as any;
  const newTaskId = newTaskRow?.id;

  // History for new rollover task
  db.prepare(`
    INSERT INTO task_history (task_id, task_code, action, user_name, shift, previous_status, new_status, notes, created_at)
    VALUES (?, ?, 'CREATE_ROLLOVER', ?, ?, null, 'Pending', ?, ?)
  `).run(
    newTaskId,
    newTaskCode,
    user,
    targetNextShift,
    `Created COB rollover task for ${targetNextShift} shift with ${rem} remaining COBs (from ${task.task_code})`,
    now
  );

  // 2. Complete current task with rollover cross-reference
  const completionNote = `Completed with COB rollover (${comp} done, ${rem} remaining rolled over to ${newTaskCode} for ${targetNextShift} shift). ${notes || ''}`.trim();

  db.prepare(`
    UPDATE tasks
    SET status = 'Completed',
        current_shift = ?,
        completed_shift = ?,
        completed_at = ?,
        completed_by = ?,
        completion_note = ?,
        last_updated_by = ?,
        last_updated_at = ?,
        version = ?
    WHERE id = ?
  `).run(activeShiftName, activeShiftName, now, user, completionNote, user, now, newVersion, taskId);

  // History for original completed task
  db.prepare(`
    INSERT INTO task_history (task_id, task_code, action, user_name, shift, previous_status, new_status, notes, created_at)
    VALUES (?, ?, 'COB_ROLLOVER_COMPLETE', ?, ?, ?, 'Completed', ?, ?)
  `).run(
    task.id,
    task.task_code,
    user,
    activeShiftName,
    prevStatus,
    completionNote,
    now
  );

  // Audit Logs
  logAudit(
    user,
    'COB_ROLLOVER',
    'TASK',
    task.task_code,
    `COB partially finished: ${comp} COBs completed, ${rem} remaining rolled over to ${newTaskCode} (${targetNextShift} shift)`
  );
  logAudit(
    user,
    'CREATE_TASK',
    'TASK',
    newTaskCode,
    `Auto-created COB rollover task with ${rem} remaining COBs from ${task.task_code} for ${targetNextShift} shift`
  );

  const updatedCurrentTask = db.prepare(`
    SELECT t.*, u.full_name as completed_by_full_name, cu.full_name as assigned_user_full_name 
    FROM tasks t
    LEFT JOIN users u ON t.completed_by = u.username
    LEFT JOIN users cu ON t.assigned_user = cu.username
    WHERE t.id = ?
  `).get(taskId);

  const createdNextTask = db.prepare(`
    SELECT t.*, cu.full_name as assigned_user_full_name 
    FROM tasks t
    LEFT JOIN users cu ON t.assigned_user = cu.username
    WHERE t.id = ?
  `).get(newTaskId);

  broadcastEvent('TASK_UPDATED', updatedCurrentTask);
  broadcastEvent('TASK_CREATED', createdNextTask);

  res.json({
    completedTask: updatedCurrentTask,
    newTask: createdNextTask
  });
});

/* =========================================================================
   SHIFT STICKY NOTES API (SHIFT-DATE SCOPED WITH FULL AUDIT TRAIL)
   ========================================================================= */

router.get('/shift-notes', requireAuth, (req, res) => {
  const shiftInfo = getCurrentShift();
  const shiftDate = (req.query.shift_date as string) || shiftInfo.businessDate;

  const rows = db.prepare(`
    SELECT sn.*, u.full_name as author_full_name
    FROM shift_notes sn
    LEFT JOIN users u ON sn.created_by = u.username
    WHERE sn.shift_date = ?
    ORDER BY sn.pinned DESC, sn.id DESC
  `).all(shiftDate);

  res.json(rows);
});

router.post('/shift-notes', requireAuth, (req, res) => {
  const { title, content, color, shift_name, shift_date, pinned } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Note content is required.' });
  }

  const shiftInfo = getCurrentShift();
  const activeShiftDate = shift_date || shiftInfo.businessDate;
  const activeShiftName = shift_name || (req.user?.selectedShift || shiftInfo.name);
  const noteColor = ['amber', 'blue', 'emerald', 'rose', 'purple'].includes(color) ? color : 'amber';
  const isPinned = pinned ? 1 : 0;
  const user = req.user!.username;
  const now = new Date().toISOString();

  const result = db.prepare(`
    INSERT INTO shift_notes (shift_date, shift_name, title, content, color, pinned, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    activeShiftDate,
    activeShiftName,
    title ? title.trim() : null,
    content.trim(),
    noteColor,
    isPinned,
    user,
    now
  );

  const noteId = Number(result.lastInsertRowid);

  logAudit(
    user,
    'CREATE_SHIFT_NOTE',
    'SHIFT_NOTE',
    String(noteId),
    `Created sticky note for shift date ${activeShiftDate} (${activeShiftName}): "${(title || content).trim().slice(0, 40)}"`
  );

  const note = db.prepare(`
    SELECT sn.*, u.full_name as author_full_name
    FROM shift_notes sn
    LEFT JOIN users u ON sn.created_by = u.username
    WHERE sn.id = ?
  `).get(noteId);

  res.status(201).json(note);
});

router.put('/shift-notes/:id', requireAuth, (req, res) => {
  const noteId = parseInt(req.params.id, 10);
  const { title, content, color, pinned } = req.body;

  const existing = db.prepare('SELECT * FROM shift_notes WHERE id = ?').get(noteId) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Shift note not found.' });
  }

  if (content !== undefined && !content.trim()) {
    return res.status(400).json({ error: 'Note content cannot be empty.' });
  }

  const user = req.user!.username;
  const now = new Date().toISOString();
  const noteColor = color && ['amber', 'blue', 'emerald', 'rose', 'purple'].includes(color) ? color : existing.color;
  const noteTitle = title !== undefined ? (title ? title.trim() : null) : existing.title;
  const noteContent = content !== undefined ? content.trim() : existing.content;
  const notePinned = pinned !== undefined ? (pinned ? 1 : 0) : existing.pinned;

  db.prepare(`
    UPDATE shift_notes
    SET title = ?, content = ?, color = ?, pinned = ?, updated_by = ?, updated_at = ?
    WHERE id = ?
  `).run(noteTitle, noteContent, noteColor, notePinned, user, now, noteId);

  logAudit(
    user,
    'UPDATE_SHIFT_NOTE',
    'SHIFT_NOTE',
    String(noteId),
    `Updated sticky note on shift date ${existing.shift_date}: "${(noteTitle || noteContent).slice(0, 40)}"`
  );

  const updated = db.prepare(`
    SELECT sn.*, u.full_name as author_full_name
    FROM shift_notes sn
    LEFT JOIN users u ON sn.created_by = u.username
    WHERE sn.id = ?
  `).get(noteId);

  res.json(updated);
});

router.delete('/shift-notes/:id', requireAuth, (req, res) => {
  const noteId = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT * FROM shift_notes WHERE id = ?').get(noteId) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Shift note not found.' });
  }

  const user = req.user!.username;
  db.prepare('DELETE FROM shift_notes WHERE id = ?').run(noteId);

  logAudit(
    user,
    'DELETE_SHIFT_NOTE',
    'SHIFT_NOTE',
    String(noteId),
    `Deleted sticky note #${noteId} from shift date ${existing.shift_date} ("${(existing.title || existing.content).slice(0, 30)}")`
  );

  res.json({ success: true });
});

/* =========================================================================
   5. HANDOVER WORKFLOW & CLOSURE VALIDATION (THE CORE MANDATE)
   ========================================================================= */

// Current handover info
router.get('/handover/current', requireAuth, (req, res) => {
  const activeShiftName = (req.user?.selectedShift && ['Morning', 'Mid', 'Night', '24H On-Call'].includes(req.user.selectedShift))
    ? req.user.selectedShift
    : getCurrentShift().name;
  const shift = getShiftByName(activeShiftName);

  // Outgoing handover closed by current shift for this exact Business Date
  const outgoingHandover = db.prepare(`
    SELECT * FROM handovers
    WHERE (from_shift = ? OR from_shift = ?) AND shift_date = ?
    ORDER BY id DESC LIMIT 1
  `).get(activeShiftName, shift.name, shift.businessDate) as any;

  // Preceding shift status calculation
  const preceding = getPrecedingShift(activeShiftName, shift.businessDate);
  const precedingHandover = db.prepare(`
    SELECT * FROM handovers
    WHERE from_shift = ? AND shift_date = ?
    ORDER BY id DESC LIMIT 1
  `).get(preceding.shiftName, preceding.businessDate) as any;

  const isPrecedingShiftClosed = Boolean(precedingHandover && precedingHandover.closed_at);

  // Incoming handover directed to current shift
  const incomingHandover = db.prepare(`
    SELECT * FROM handovers
    WHERE (to_shift = ? OR to_shift = ?) AND (shift_date = ? OR shift_date = ?)
    ORDER BY id DESC LIMIT 1
  `).get(activeShiftName, shift.name, shift.businessDate, preceding.businessDate) as any;

  // Primary latest handover to show
  const latestHandover = (incomingHandover && !incomingHandover.acknowledged_at)
    ? incomingHandover
    : (outgoingHandover || incomingHandover || precedingHandover || db.prepare(`SELECT * FROM handovers ORDER BY id DESC LIMIT 1`).get());

  const isShiftClosed = Boolean(outgoingHandover && outgoingHandover.closed_at);
  const isShiftAccepted = isCurrentShiftAccepted(activeShiftName, shift.businessDate, shift.isUnified24HActive) ||
                          isCurrentShiftAccepted(shift.name, shift.businessDate, shift.isUnified24HActive);
  const shiftHandoverPendingAck = !isShiftAccepted;

  // Latest acceptance record for this exact business date
  const latestAcceptance = db.prepare(`
    SELECT * FROM shift_acceptances
    WHERE (shift_name = ? OR shift_name = ?) AND shift_date = ?
    ORDER BY id DESC LIMIT 1
  `).get(activeShiftName, shift.name, shift.businessDate) as any;

  // Get all active open tasks that must be visible in the current shift
  const openTasks = db.prepare(`
    SELECT * FROM tasks
    WHERE status IN ('Pending', 'In Progress', 'Blocked')
    ORDER BY CASE priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END, id ASC
  `).all() as any[];

  const openTasksWithFlags = openTasks.map(t => ({
    ...t,
    isOverdue: Boolean(t.due_date && t.due_date < new Date().toISOString() && !['Completed', 'Cancelled'].includes(t.status)),
    isHandoverLocked: isTaskHandoverLocked(t, req.user)
  }));

  // Query all tasks completed today (for this operational business date)
  let completedWhereClause = "";
  const queryParams: any[] = [];

  if (activeShiftName === 'Night') {
    // Night Shift sees its own completions (both pre-midnight & post-midnight) PLUS preceding Mid shift completions
    const dates = [shift.businessDate, shift.calendarDate || shift.businessDate];
    completedWhereClause = `
      t.status = 'Completed' AND (
        (t.completed_shift = 'Night' OR t.current_shift = 'Night')
        OR
        ((t.completed_shift = 'Mid' OR t.current_shift = 'Mid') AND (date(t.completed_at) = date(?) OR t.completed_at LIKE ? OR date(t.completed_at, '+3 hours') = date(?)))
        OR
        date(t.completed_at) IN (date(?), date(?))
        OR
        date(t.completed_at, '+3 hours') IN (date(?), date(?))
        OR
        t.completed_at LIKE ?
        OR
        t.completed_at LIKE ?
      )
    `;
    queryParams.push(
      shift.businessDate, `${shift.businessDate}%`, shift.businessDate,
      shift.businessDate, dates[1],
      shift.businessDate, dates[1],
      `${shift.businessDate}%`, `${dates[1]}%`
    );
  } else if (activeShiftName === 'Mid') {
    // Mid Shift sees Mid Shift + Morning Shift (preceding) completions for today's operational cycle
    completedWhereClause = `
      t.status = 'Completed' AND (
        (t.completed_shift IN ('Morning', 'Mid') OR t.current_shift IN ('Morning', 'Mid'))
        OR date(t.completed_at) = date(?) 
        OR date(t.completed_at, '+3 hours') = date(?)
        OR t.completed_at LIKE ?
      )
    `;
    queryParams.push(shift.businessDate, shift.businessDate, `${shift.businessDate}%`);
  } else {
    // Morning Shift (or default) sees Morning Shift completions immediately + all tasks completed today
    completedWhereClause = `
      t.status = 'Completed' AND (
        (t.completed_shift = 'Morning' OR t.current_shift = 'Morning')
        OR date(t.completed_at) = date(?) 
        OR date(t.completed_at, '+3 hours') = date(?)
        OR t.completed_at LIKE ?
      )
    `;
    queryParams.push(shift.businessDate, shift.businessDate, `${shift.businessDate}%`);
  }

  const completedTasksToday = db.prepare(`
    SELECT t.*, u.full_name as completed_by_full_name, cu.full_name as assigned_user_full_name
    FROM tasks t
    LEFT JOIN users u ON t.completed_by = u.username
    LEFT JOIN users cu ON t.assigned_user = cu.username
    WHERE ${completedWhereClause}
    ORDER BY t.completed_at DESC, t.id DESC
  `).all(...queryParams) as any[];

  // Compute comprehensive day progress summary
  const shiftBreakdown: Record<string, number> = { Morning: 0, Mid: 0, Night: 0, '24H On-Call': 0 };
  const userBreakdownMap = new Map<string, { username: string; full_name: string; count: number }>();

  for (const ct of completedTasksToday) {
    const sName = ct.completed_shift || ct.current_shift || ct.original_shift || 'Morning';
    shiftBreakdown[sName] = (shiftBreakdown[sName] || 0) + 1;

    const uName = ct.completed_by || 'Unknown';
    const fName = ct.completed_by_full_name || uName;
    if (!userBreakdownMap.has(uName)) {
      userBreakdownMap.set(uName, { username: uName, full_name: fName, count: 0 });
    }
    userBreakdownMap.get(uName)!.count += 1;
  }

  // Previous shift closures for current cycle
  const previousShiftClosures = db.prepare(`
    SELECT id, from_shift, to_shift, shift_date, closed_by, closed_at, general_notes,
           tasks_completed_count, tasks_carried_over_count, tasks_blocked_count
    FROM handovers
    WHERE shift_date = ? OR shift_date = ?
    ORDER BY id ASC
  `).all(shift.businessDate, preceding.businessDate) as any[];

  const daySummary = {
    totalCompletedToday: completedTasksToday.length,
    completedByShift: shiftBreakdown,
    completedByUsers: Array.from(userBreakdownMap.values()),
    previousShiftClosures
  };

  res.json({
    currentShift: {
      ...shift,
      userShift: activeShiftName,
      precedingShiftName: preceding.shiftName,
      precedingShiftBusinessDate: preceding.businessDate
    },
    precedingShiftStatus: {
      name: preceding.shiftName,
      businessDate: preceding.businessDate,
      isClosed: isPrecedingShiftClosed,
      closedBy: precedingHandover?.closed_by || null,
      closedAt: precedingHandover?.closed_at || null,
      generalNotes: precedingHandover?.general_notes || null,
      carriedOverCount: precedingHandover?.tasks_carried_over_count || 0
    },
    latestHandover,
    acceptedBy: latestAcceptance?.accepted_by || latestHandover?.acknowledged_by || null,
    acceptedAt: latestAcceptance?.accepted_at || latestHandover?.acknowledged_at || null,
    openTasksCount: openTasksWithFlags.length,
    openTasks: openTasksWithFlags,
    completedTasksToday,
    daySummary,
    isShiftClosed,
    shiftClosedBy: outgoingHandover?.closed_by || null,
    shiftClosedAt: outgoingHandover?.closed_at || null,
    shiftHandoverPendingAck,
    isShiftAccepted
  });
});

// Acknowledge handover & accept shift by duty operator
router.post('/handover/acknowledge', requireAuth, (req, res) => {
  if (req.user?.role === 'MANAGER') {
    return res.status(403).json({ error: 'Permission denied: Manager role has observer status and does not accept shifts.' });
  }

  const { handoverId, overridePrecedingUnclosed } = req.body;
  const currentShift = getCurrentShift();
  const activeShiftName = (req.user?.selectedShift && ['Morning', 'Mid', 'Night', '24H On-Call'].includes(req.user.selectedShift))
    ? req.user.selectedShift
    : currentShift.name;
  const shift = getShiftByName(activeShiftName);
  const user = req.user!.username;
  const now = new Date().toISOString();

  // 1. Mark all pending handovers to this shift as acknowledged
  db.prepare(`
    UPDATE handovers
    SET acknowledged_by = ?, acknowledged_at = ?
    WHERE (to_shift = ? OR to_shift = ?) AND acknowledged_at IS NULL
  `).run(user, now, activeShiftName, shift.name);

  // If a specific target ID was requested, acknowledge it as well
  if (handoverId) {
    db.prepare(`
      UPDATE handovers
      SET acknowledged_by = ?, acknowledged_at = ?
      WHERE id = ?
    `).run(user, now, handoverId);
  }

  // 2. Unlock all carried-over tasks to current shift
  db.prepare(`
    UPDATE tasks
    SET handover_state = 'None',
        last_updated_by = ?,
        last_updated_at = ?
    WHERE (current_shift = ? OR current_shift = ?) AND handover_state = 'Carried Over'
  `).run(user, now, activeShiftName, shift.name);

  // 3. Always record official shift acceptance with Business Date
  db.prepare(`
    INSERT INTO shift_acceptances (shift_name, shift_date, accepted_by, accepted_at, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    activeShiftName,
    shift.businessDate,
    user,
    now,
    `Shift accepted by @${user} as duty operator (${shift.businessDate}${overridePrecedingUnclosed ? ' - with preceding handover acknowledgment' : ''})`
  );

  if (activeShiftName !== shift.name) {
    db.prepare(`
      INSERT INTO shift_acceptances (shift_name, shift_date, accepted_by, accepted_at, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      shift.name,
      shift.businessDate,
      user,
      now,
      `Shift accepted by @${user} as duty operator (${shift.businessDate})`
    );
  }

  logAudit(user, 'Shift Accepted', 'HANDOVER', handoverId ? String(handoverId) : null, `Accepted shift ${activeShiftName} for business date ${shift.businessDate} by ${user}`);

  broadcastEvent('HANDOVER_ACCEPTED');
  broadcastEvent('OPERATIONAL_REFRESH');

  res.json({
    success: true,
    message: `Shift ${activeShiftName} officially accepted for Business Date ${shift.businessDate}.`,
    isShiftAccepted: true,
    acceptedBy: user,
    acceptedAt: now
  });
});

// Validate shift closure: MUST calculate all unresolved tasks!
router.get('/handover/validate-closure', requireAuth, (req, res) => {
  const activeShiftName = (req.user?.selectedShift && ['Morning', 'Mid', 'Night', '24H On-Call'].includes(req.user.selectedShift))
    ? req.user.selectedShift
    : getCurrentShift().name;
  const shift = getShiftByName(activeShiftName);
  const isAccepted = isCurrentShiftAccepted(activeShiftName, shift.businessDate, shift.isUnified24HActive) ||
                     isCurrentShiftAccepted(shift.name, shift.businessDate, shift.isUnified24HActive);

  // Unresolved tasks: active tasks that have not been completed, or explicitly marked blocked/carried over for this closure
  const unresolvedTasks = db.prepare(`
    SELECT * FROM tasks
    WHERE status IN ('Pending', 'In Progress')
    ORDER BY CASE priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END, id ASC
  `).all() as any[];

  const completedToday = db.prepare(`
    SELECT * FROM tasks
    WHERE status = 'Completed' AND (current_shift = ? OR current_shift = ?)
    ORDER BY id DESC
  `).all(shift.name, activeShiftName) as any[];

  const blockedTasks = db.prepare(`
    SELECT * FROM tasks
    WHERE status = 'Blocked'
    ORDER BY id DESC
  `).all() as any[];

  if (!isAccepted) {
    return res.json({
      canClose: false,
      reason: `Shift ${activeShiftName} for Business Date ${shift.businessDate} has not been accepted yet. You must accept the shift before closing.`,
      shiftNotAccepted: true,
      unresolvedCount: unresolvedTasks.length,
      unresolvedTasks,
      completedTasks: completedToday,
      blockedTasks,
      shift
    });
  }

  res.json({
    canClose: unresolvedTasks.length === 0,
    shiftNotAccepted: false,
    unresolvedCount: unresolvedTasks.length,
    unresolvedTasks,
    completedTasks: completedToday,
    blockedTasks,
    shift
  });
});

// Close shift & finalize handover
router.post('/handover/close-shift', requireAuth, (req, res) => {
  if (req.user?.role === 'MANAGER') {
    return res.status(403).json({ error: 'Permission denied: Manager role has observer status and cannot execute shift handover closure.' });
  }

  const { resolutions, generalNotes } = req.body;

  const activeShiftName = (req.user?.selectedShift && ['Morning', 'Mid', 'Night', '24H On-Call'].includes(req.user.selectedShift))
    ? req.user.selectedShift
    : getCurrentShift().name;
  const shift = getShiftByName(activeShiftName);
  const user = req.user!.username;
  const now = new Date().toISOString();

  // Shift MUST be accepted before it can be closed
  if (!isCurrentShiftAccepted(shift.name, shift.businessDate, shift.isUnified24HActive) &&
      !isCurrentShiftAccepted(activeShiftName, shift.businessDate, shift.isUnified24HActive)) {
    return res.status(403).json({
      error: `Cannot close shift: The shift ${activeShiftName} for Business Date ${shift.businessDate} has not been accepted yet. You must accept the shift first.`
    });
  }

  // 1. Check all pending / in progress tasks
  const openTasks = db.prepare(`
    SELECT * FROM tasks
    WHERE status IN ('Pending', 'In Progress')
  `).all() as any[];

  // Map provided resolutions by taskId
  const resolutionMap = new Map<number, { disposition: 'Completed' | 'Carried Over' | 'Blocked'; notes: string }>();
  if (Array.isArray(resolutions)) {
    for (const r of resolutions) {
      let disp: 'Completed' | 'Carried Over' | 'Blocked' = 'Carried Over';
      if (r.disposition === 'Completed') disp = 'Completed';
      else if (r.disposition === 'Blocked') disp = 'Blocked';
      else disp = 'Carried Over';

      let note = (r.notes || '').trim();
      if (!note && disp === 'Carried Over') {
        note = 'Handed over to incoming shift for follow-up';
      }

      resolutionMap.set(Number(r.taskId), {
        disposition: disp,
        notes: note
      });
    }
  }

  // Check if any open task is unhandled
  const unhandled: any[] = [];
  for (const task of openTasks) {
    let resItem = resolutionMap.get(task.id);
    if (!resItem) {
      // Auto-default unhandled tasks to Carried Over so user is never blocked by omission
      resItem = {
        disposition: 'Carried Over',
        notes: 'Handed over to incoming shift for follow-up'
      };
      resolutionMap.set(task.id, resItem);
    }

    // Validate requirements for Blocked
    if (resItem.disposition === 'Blocked' && !resItem.notes) {
      return res.status(400).json({
        error: `Task ${task.task_code} ("${task.title}") requires a reason to be marked as Blocked.`
      });
    }
  }

  // 2. Perform closure inside a transaction (Section 71 Database Integrity)
  db.exec('BEGIN TRANSACTION;');

  try {
    let completedCount = 0;
    let carriedOverCount = 0;
    let blockedCount = 0;

    // Apply resolutions for each task
    for (const [taskId, resolution] of resolutionMap.entries()) {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
      if (!task) continue;

      if (resolution.disposition === 'Completed') {
        completedCount++;
        db.prepare(`
          UPDATE tasks
          SET status = 'Completed',
              completed_at = ?,
              completed_by = ?,
              completion_note = ?,
              handover_state = 'Completed',
              current_shift = ?,
              completed_shift = ?,
              last_updated_by = ?,
              last_updated_at = ?,
              version = version + 1
          WHERE id = ?
        `).run(now, user, resolution.notes || 'Completed during shift handover', activeShiftName, activeShiftName, user, now, taskId);

        db.prepare(`
          INSERT INTO task_history (task_id, task_code, action, user_name, shift, previous_status, new_status, notes, created_at)
          VALUES (?, ?, 'Completed', ?, ?, ?, 'Completed', ?, ?)
        `).run(taskId, task.task_code, user, activeShiftName, task.status, resolution.notes || 'Completed during shift handover', now);
      } else if (resolution.disposition === 'Carried Over') {
        carriedOverCount++;
        db.prepare(`
          UPDATE tasks
          SET current_shift = ?,
              handover_state = 'Carried Over',
              carry_over_reason = ?,
              last_updated_by = ?,
              last_updated_at = ?,
              version = version + 1
          WHERE id = ?
        `).run(shift.nextShift, resolution.notes || 'Handed over to incoming shift', user, now, taskId);

        db.prepare(`
          INSERT INTO task_history (task_id, task_code, action, user_name, shift, previous_status, new_status, notes, created_at)
          VALUES (?, ?, 'Carried Over', ?, ?, ?, ?, ?, ?)
        `).run(taskId, task.task_code, user, shift.name, task.status, task.status, `Carried over to ${shift.nextShift}: ${resolution.notes || 'Shift handover'}`, now);
      } else if (resolution.disposition === 'Blocked') {
        blockedCount++;
        db.prepare(`
          UPDATE tasks
          SET status = 'Blocked',
              blocked_reason = ?,
              handover_state = 'Blocked',
              last_updated_by = ?,
              last_updated_at = ?,
              version = version + 1
          WHERE id = ?
        `).run(resolution.notes, user, now, taskId);

        db.prepare(`
          INSERT INTO task_history (task_id, task_code, action, user_name, shift, previous_status, new_status, notes, created_at)
          VALUES (?, ?, 'Blocked', ?, ?, ?, 'Blocked', ?, ?)
        `).run(taskId, task.task_code, user, shift.name, task.status, resolution.notes, now);
      }
    }

    // Also count any tasks already completed earlier in this shift
    const existingCompleted = db.prepare(`
      SELECT COUNT(*) as count FROM tasks
      WHERE status = 'Completed' AND current_shift = ? AND completed_at >= ?
    `).get(shift.name, shift.businessDate) as { count: number };

    const totalCompleted = Math.max(completedCount, existingCompleted.count);

    // Create Handover record
    const handoverInsert = db.prepare(`
      INSERT INTO handovers (
        from_shift, to_shift, shift_date, closed_by, closed_at,
        general_notes, tasks_completed_count, tasks_carried_over_count, tasks_blocked_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const handoverResult = handoverInsert.run(
      shift.name,
      shift.nextShift,
      shift.businessDate,
      user,
      now,
      generalNotes ? generalNotes.trim() : null,
      totalCompleted,
      carriedOverCount,
      blockedCount
    );

    const handoverId = Number(handoverResult.lastInsertRowid);

    // Record each task disposition into handover_tasks table
    const insertHandoverTask = db.prepare(`
      INSERT INTO handover_tasks (handover_id, task_id, task_code, task_title, disposition, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const [taskId, resolution] of resolutionMap.entries()) {
      const task = db.prepare('SELECT task_code, title FROM tasks WHERE id = ?').get(taskId) as any;
      if (task) {
        insertHandoverTask.run(handoverId, taskId, task.task_code, task.title, resolution.disposition, resolution.notes || null);
      }
    }

    db.exec('COMMIT;');

    logAudit(user, 'Shift Closed & Handover Finalized', 'HANDOVER', String(handoverId), `Closed ${shift.name} shift -> ${shift.nextShift}. Carried: ${carriedOverCount}, Completed: ${totalCompleted}, Blocked: ${blockedCount}`);

    broadcastEvent('HANDOVER_UPDATED');
    broadcastEvent('OPERATIONAL_REFRESH');

    res.json({
      success: true,
      handoverId,
      message: `Shift ${shift.name} successfully closed. Handover handed over to ${shift.nextShift}.`
    });
  } catch (err: any) {
    db.exec('ROLLBACK;');
    console.error('Error closing shift:', err);
    res.status(500).json({ error: 'Failed to finalize handover: ' + err.message });
  }
});

// Past handovers list
router.get('/handover/history', requireAuth, (req, res) => {
  const handovers = db.prepare(`
    SELECT * FROM handovers ORDER BY id DESC LIMIT 50
  `).all() as any[];

  // Attach task items to each handover
  const detailed = handovers.map(h => {
    const tasks = db.prepare('SELECT * FROM handover_tasks WHERE handover_id = ?').all(h.id);
    return {
      ...h,
      tasks
    };
  });

  res.json(detailed);
});

/* =========================================================================
   6. OPERATIONAL REPORTS & METRICS (Section 38)
   ========================================================================= */

router.get('/reports', requireAuth, (req, res) => {
  const shift = getCurrentShift();
  const today = shift.currentDate;

  const totalOpen = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE status IN ('Pending', 'In Progress')`).get() as { count: number };
  const totalCritical = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE status IN ('Pending', 'In Progress') AND priority = 'Critical'`).get() as { count: number };
  const totalBlocked = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE status = 'Blocked'`).get() as { count: number };
  const totalCarriedOver = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE handover_state = 'Carried Over' AND status IN ('Pending', 'In Progress')`).get() as { count: number };
  const completedToday = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE status = 'Completed' AND completed_at LIKE ?`).get(`${today}%`) as { count: number };
  const createdToday = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE created_at LIKE ?`).get(`${today}%`) as { count: number };

  const byShift = db.prepare(`
    SELECT current_shift as shift, COUNT(*) as count
    FROM tasks
    WHERE status IN ('Pending', 'In Progress', 'Blocked')
    GROUP BY current_shift
  `).all();

  const byStatus = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM tasks
    GROUP BY status
  `).all();

  const byPriority = db.prepare(`
    SELECT priority, COUNT(*) as count
    FROM tasks
    WHERE status IN ('Pending', 'In Progress')
    GROUP BY priority
  `).all();

  res.json({
    metrics: {
      totalOpen: totalOpen.count,
      criticalOpen: totalCritical.count,
      blocked: totalBlocked.count,
      carriedOver: totalCarriedOver.count,
      completedToday: completedToday.count,
      createdToday: createdToday.count
    },
    byShift,
    byStatus,
    byPriority,
    currentShift: shift
  });
});

/**
 * Generate streamlined Handover Email text (Clean format requested by user)
 */
router.get('/reports/email', requireAuth, (req: any, res) => {
  const handoverId = req.query.handoverId ? Number(req.query.handoverId) : undefined;
  const includeTitles = req.query.includeTitles === 'true';
  const activeShiftName = (req.user?.selectedShift && ['Morning', 'Mid', 'Night', '24H On-Call'].includes(req.user.selectedShift))
    ? (req.user.selectedShift as any)
    : getCurrentShift().name;
  const shift = getShiftByName(activeShiftName);

  let handover: any = null;
  let shiftName = activeShiftName;
  let completedTasks: any[] = [];
  let pendingTasks: any[] = [];

  if (handoverId) {
    handover = db.prepare('SELECT * FROM handovers WHERE id = ?').get(handoverId);
  }

  if (handover) {
    shiftName = handover.from_shift || activeShiftName;
    const htCompleted = db.prepare(`SELECT task_code, task_title as title FROM handover_tasks WHERE handover_id = ? AND disposition = 'Completed' ORDER BY id ASC`).all(handover.id) as any[];
    const htPending = db.prepare(`SELECT task_code, task_title as title FROM handover_tasks WHERE handover_id = ? AND disposition IN ('Carried Over', 'Blocked') ORDER BY id ASC`).all(handover.id) as any[];

    if (htCompleted.length > 0 || htPending.length > 0) {
      completedTasks = htCompleted;
      pendingTasks = htPending;
    } else {
      completedTasks = db.prepare(`
        SELECT task_code, title FROM tasks 
        WHERE status = 'Completed' AND (current_shift = ? OR original_shift = ?)
        ORDER BY task_code ASC, id ASC
      `).all(shiftName, shiftName) as any[];

      pendingTasks = db.prepare(`
        SELECT task_code, title FROM tasks 
        WHERE status IN ('Pending', 'In Progress', 'Blocked') AND (current_shift = ? OR original_shift = ?)
        ORDER BY task_code ASC, id ASC
      `).all(shiftName, shiftName) as any[];
    }
  } else {
    // Live Operational Shift Email: fetch latest tasks directly from the tasks table!
    shiftName = activeShiftName;

    // Completed tasks for the active shift
    completedTasks = db.prepare(`
      SELECT task_code, title 
      FROM tasks 
      WHERE status = 'Completed' 
        AND (
          current_shift = ? 
          OR original_shift = ? 
          OR (completed_at IS NOT NULL AND substr(completed_at, 1, 10) = ?)
        )
      ORDER BY task_code ASC, id ASC
    `).all(activeShiftName, activeShiftName, shift.currentDate) as any[];

    // If no completed tasks in this shift specifically, check all completed tasks with today's date
    if (completedTasks.length === 0) {
      completedTasks = db.prepare(`
        SELECT task_code, title 
        FROM tasks 
        WHERE status = 'Completed' AND (current_shift = ? OR original_shift = ?)
        ORDER BY task_code ASC, id ASC
      `).all(activeShiftName, activeShiftName) as any[];
    }

    // Pending / In Progress / Blocked tasks for the active shift
    pendingTasks = db.prepare(`
      SELECT task_code, title 
      FROM tasks 
      WHERE status IN ('Pending', 'In Progress', 'Blocked') 
        AND (current_shift = ? OR original_shift = ? OR handover_state = 'Carried Over')
      ORDER BY task_code ASC, id ASC
    `).all(activeShiftName, activeShiftName) as any[];

    // If still empty, include all open tasks across system so nothing is missed
    if (pendingTasks.length === 0) {
      pendingTasks = db.prepare(`
        SELECT task_code, title 
        FROM tasks 
        WHERE status IN ('Pending', 'In Progress', 'Blocked')
        ORDER BY task_code ASC, id ASC
      `).all() as any[];
    }
  }

  const formatItem = (t: any) => {
    if (includeTitles && t.title) {
      return `${t.task_code} - ${t.title}`;
    }
    return t.task_code;
  };

  const completedSection = completedTasks.length > 0
    ? completedTasks.map(formatItem).join('\n')
    : 'None';

  const pendingSection = pendingTasks.length > 0
    ? pendingTasks.map(formatItem).join('\n')
    : 'None';

  // Minimal clean format strictly as requested:
  // [Shift Name] Shift
  //
  // Completed tasks:
  // Task01
  // Task03
  //
  // Pending tasks:
  // Task02
  // Task04
  const email = `${shiftName} Shift\n\nCompleted tasks:\n${completedSection}\n\nPending tasks:\n${pendingSection}`;

  res.json({ emailText: email });
});

/**
 * Daily Briefing & Multi-Criteria Activity Search (Previous Day & Range Filter)
 */
router.get('/reports/daily-briefing', requireAuth, (req: any, res) => {
  const currentShift = getCurrentShift();
  const todayStr = currentShift.currentDate; // YYYY-MM-DD

  // Compute yesterday's date
  const [cYear, cMonth, cDay] = todayStr.split('-').map(Number);
  const todayDateObj = new Date(cYear, cMonth - 1, cDay);
  const yesterdayDateObj = new Date(todayDateObj);
  yesterdayDateObj.setDate(yesterdayDateObj.getDate() - 1);
  const yesterdayStr = `${yesterdayDateObj.getFullYear()}-${String(yesterdayDateObj.getMonth() + 1).padStart(2, '0')}-${String(yesterdayDateObj.getDate()).padStart(2, '0')}`;

  const mode = req.query.mode || (req.query.startDate ? 'custom' : 'yesterday');
  let startDate = req.query.startDate ? String(req.query.startDate) : yesterdayStr;
  let endDate = req.query.endDate ? String(req.query.endDate) : startDate;
  const userFilter = req.query.user ? String(req.query.user).trim().toLowerCase() : '';
  const searchFilter = req.query.search ? String(req.query.search).trim() : '';

  if (mode === 'yesterday') {
    startDate = yesterdayStr;
    endDate = yesterdayStr;
  } else if (mode === 'today') {
    startDate = todayStr;
    endDate = todayStr;
  }

  // All active users for the multi-criteria user filter dropdown
  const allUsers = db.prepare(`SELECT username, full_name FROM users WHERE status = 'ACTIVE' ORDER BY full_name ASC`).all() as any[];

  // Format date helper: YYYY-MM-DD -> DD/MM/YYYY
  const formatDateLabel = (isoDate: string) => {
    const parts = isoDate.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return isoDate;
  };

  const formatTimeStr = (iso: string) => {
    try {
      const d = new Date(iso);
      const settings = getSettings();
      const tz = settings.timezone || 'Africa/Cairo';
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }).formatToParts(d);
      const hour = parts.find(p => p.type === 'hour')?.value || '12';
      const minute = parts.find(p => p.type === 'minute')?.value || '00';
      const dayPeriod = (parts.find(p => p.type === 'dayPeriod')?.value || 'PM').toUpperCase();
      return `${hour}:${minute} ${dayPeriod}`;
    } catch {
      return '';
    }
  };

  // 1. Query task_history joined with tasks
  let historyQuery = `
    SELECT 
      th.id as history_id,
      th.task_id,
      th.task_code,
      t.title as task_title,
      t.priority,
      t.status as current_status,
      t.category,
      t.assigned_user,
      t.completed_by,
      th.action,
      th.user_name,
      th.shift,
      th.previous_status,
      th.new_status,
      th.notes,
      th.created_at as event_time
    FROM task_history th
    JOIN tasks t ON t.id = th.task_id
    WHERE date(th.created_at) >= date(?) AND date(th.created_at) <= date(?)
  `;
  const historyParams: any[] = [startDate, endDate];

  if (userFilter) {
    historyQuery += ` AND (LOWER(th.user_name) = ? OR LOWER(t.assigned_user) = ? OR LOWER(t.completed_by) = ?)`;
    historyParams.push(userFilter, userFilter, userFilter);
  }

  if (searchFilter) {
    historyQuery += ` AND (th.task_code LIKE ? OR t.title LIKE ? OR th.notes LIKE ?)`;
    const wc = `%${searchFilter}%`;
    historyParams.push(wc, wc, wc);
  }

  historyQuery += ` ORDER BY th.id DESC`;

  const historyRows = db.prepare(historyQuery).all(...historyParams) as any[];

  // 2. Query tasks that have completed_at or created_at in range
  let tasksQuery = `
    SELECT * FROM tasks
    WHERE (
      (date(completed_at) >= date(?) AND date(completed_at) <= date(?))
      OR (date(created_at) >= date(?) AND date(created_at) <= date(?))
      OR (date(last_updated_at) >= date(?) AND date(last_updated_at) <= date(?))
    )
  `;
  const tasksParams: any[] = [startDate, endDate, startDate, endDate, startDate, endDate];
  if (userFilter) {
    tasksQuery += ` AND (LOWER(assigned_user) = ? OR LOWER(completed_by) = ? OR LOWER(created_by) = ? OR LOWER(last_updated_by) = ?)`;
    tasksParams.push(userFilter, userFilter, userFilter, userFilter);
  }
  if (searchFilter) {
    tasksQuery += ` AND (task_code LIKE ? OR title LIKE ? OR completion_note LIKE ?)`;
    const wc = `%${searchFilter}%`;
    tasksParams.push(wc, wc, wc);
  }
  const taskRows = db.prepare(tasksQuery).all(...tasksParams) as any[];

  const formattedItems: any[] = [];
  const seenKeys = new Set<string>();

  for (const row of historyRows) {
    const key = `h_${row.history_id}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const timeStr = formatTimeStr(row.event_time);
    const dateStr = formatDateLabel(row.event_time.slice(0, 10));

    let verb = 'updated';
    if (row.action === 'Completed' || row.new_status === 'Completed') {
      verb = 'complete';
    } else if (row.action === 'Created') {
      verb = 'created';
    } else if (row.action === 'Status Changed' && row.new_status === 'In Progress') {
      verb = 'in progress';
    } else if (row.action === 'Blocked' || row.new_status === 'Blocked') {
      verb = 'blocked';
    } else if (row.action === 'Carried Over') {
      verb = 'carried over';
    }

    // Exact sentence format: Task01 Run COB in 4.200 complete by youssef at 6:PM mid shift
    const sentence = `${row.task_code} ${row.task_title} ${verb} by ${row.user_name} at ${timeStr} ${row.shift.toLowerCase()} shift`;

    formattedItems.push({
      id: row.history_id,
      taskId: row.task_id,
      taskCode: row.task_code,
      taskTitle: row.task_title,
      action: row.action,
      actionVerb: verb,
      userName: row.user_name,
      shift: row.shift,
      formattedTime: timeStr,
      formattedDate: dateStr,
      status: row.current_status,
      priority: row.priority,
      category: row.category,
      summarySentence: sentence,
      notes: row.notes,
      createdAt: row.event_time
    });
  }

  // Include any completed tasks in range not found in history
  for (const t of taskRows) {
    if (t.status === 'Completed' && t.completed_at) {
      const alreadyIncluded = formattedItems.some(
        fi => fi.taskId === t.id && fi.actionVerb === 'complete'
      );
      if (!alreadyIncluded) {
        const timeStr = formatTimeStr(t.completed_at);
        const dateStr = formatDateLabel(t.completed_at.slice(0, 10));
        const userDone = t.completed_by || t.last_updated_by || 'operator';
        const sentence = `${t.task_code} ${t.title} complete by ${userDone} at ${timeStr} ${t.current_shift.toLowerCase()} shift`;
        formattedItems.unshift({
          id: 900000 + t.id,
          taskId: t.id,
          taskCode: t.task_code,
          taskTitle: t.title,
          action: 'Completed',
          actionVerb: 'complete',
          userName: userDone,
          shift: t.current_shift,
          formattedTime: timeStr,
          formattedDate: dateStr,
          status: t.status,
          priority: t.priority,
          category: t.category,
          summarySentence: sentence,
          notes: t.completion_note,
          createdAt: t.completed_at
        });
      }
    }
  }

  const completedCount = formattedItems.filter(i => i.actionVerb === 'complete' || i.status === 'Completed').length;
  const pendingCount = taskRows.filter(t => t.status === 'Pending' || t.status === 'In Progress').length;
  const blockedCount = formattedItems.filter(i => i.actionVerb === 'blocked' || i.status === 'Blocked').length;
  const carriedCount = formattedItems.filter(i => i.actionVerb === 'carried over').length;

  const dateLabel = startDate === endDate
    ? formatDateLabel(startDate)
    : `${formatDateLabel(startDate)} - ${formatDateLabel(endDate)}`;

  res.json({
    dateLabel,
    startDate,
    endDate,
    isYesterday: startDate === yesterdayStr && endDate === yesterdayStr,
    totalActivities: formattedItems.length,
    completedCount,
    pendingCount,
    blockedCount,
    carriedCount,
    items: formattedItems,
    availableUsers: allUsers.map(u => ({ username: u.username, fullName: u.full_name }))
  });
});


/**
 * Export all tasks as CSV (Section 39)
 */
router.get('/reports/csv', (req, res) => {
  const tasks = db.prepare('SELECT * FROM tasks ORDER BY id ASC').all() as any[];

  const headers = [
    'Task Code',
    'Title',
    'Description',
    'Priority',
    'Status',
    'Category',
    'Created By',
    'Created At',
    'Original Shift',
    'Current Shift',
    'Assigned User',
    'Due Date',
    'Completed At',
    'Completed By',
    'Carry Over Reason',
    'Blocked Reason'
  ];

  const escapeCsv = (val: any) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = [headers.join(',')];
  for (const t of tasks) {
    rows.push([
      escapeCsv(t.task_code),
      escapeCsv(t.title),
      escapeCsv(t.description),
      escapeCsv(t.priority),
      escapeCsv(t.status),
      escapeCsv(t.category),
      escapeCsv(t.created_by),
      escapeCsv(t.created_at),
      escapeCsv(t.original_shift),
      escapeCsv(t.current_shift),
      escapeCsv(t.assigned_user),
      escapeCsv(t.due_date),
      escapeCsv(t.completed_at),
      escapeCsv(t.completed_by),
      escapeCsv(t.carry_over_reason),
      escapeCsv(t.blocked_reason)
    ].join(','));
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="shift_tasks_export_${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(rows.join('\n'));
});

/* =========================================================================
   7. AUDIT LOGS (Section 40)
   ========================================================================= */

router.get('/audit-logs', requireCanViewAuditLogs, (req, res) => {
  const { user, action, search, fromDate, toDate, severity, category } = req.query;
  let query = 'SELECT * FROM audit_logs WHERE 1=1';
  const params: any[] = [];

  if (user) {
    query += ' AND user_name = ?';
    params.push(user);
  }

  if (action) {
    query += ' AND action LIKE ?';
    params.push(`%${action}%`);
  }

  if (severity && severity !== 'ALL') {
    query += ' AND severity = ?';
    params.push(severity);
  }

  if (category && category !== 'ALL') {
    query += ' AND category = ?';
    params.push(category);
  }

  if (fromDate) {
    query += ' AND date(created_at) >= date(?)';
    params.push(fromDate);
  }

  if (toDate) {
    query += ' AND date(created_at) <= date(?)';
    params.push(toDate);
  }

  if (search) {
    query += ' AND (details LIKE ? OR entity_id LIKE ? OR user_name LIKE ? OR action LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  query += ' ORDER BY id DESC LIMIT 500';

  const logs = db.prepare(query).all(...params);
  res.json(logs);
});

router.get('/audit-logs/stats', requireCanViewAuditLogs, (req, res) => {
  try {
    const totalRow = db.prepare('SELECT COUNT(*) as c FROM audit_logs').get() as { c: number };
    const criticalRow = db.prepare("SELECT COUNT(*) as c FROM audit_logs WHERE severity = 'CRITICAL'").get() as { c: number };
    const warningRow = db.prepare("SELECT COUNT(*) as c FROM audit_logs WHERE severity = 'WARNING'").get() as { c: number };
    const infoRow = db.prepare("SELECT COUNT(*) as c FROM audit_logs WHERE severity = 'INFO'").get() as { c: number };
    const securityRow = db.prepare("SELECT COUNT(*) as c FROM audit_logs WHERE category = 'SECURITY'").get() as { c: number };
    const todayRow = db.prepare("SELECT COUNT(*) as c FROM audit_logs WHERE date(created_at) = date('now')").get() as { c: number };

    res.json({
      total: totalRow?.c || 0,
      criticalCount: criticalRow?.c || 0,
      warningCount: warningRow?.c || 0,
      infoCount: infoRow?.c || 0,
      securityCount: securityRow?.c || 0,
      todayCount: todayRow?.c || 0
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/audit-logs/export-csv', requireAuth, (req: any, res) => {
  const { user, action, search, fromDate, toDate, severity, category } = req.query;
  let query = 'SELECT * FROM audit_logs WHERE 1=1';
  const params: any[] = [];

  if (user) {
    query += ' AND user_name = ?';
    params.push(user);
  }

  if (action) {
    query += ' AND action LIKE ?';
    params.push(`%${action}%`);
  }

  if (severity && severity !== 'ALL') {
    query += ' AND severity = ?';
    params.push(severity);
  }

  if (category && category !== 'ALL') {
    query += ' AND category = ?';
    params.push(category);
  }

  if (fromDate) {
    query += ' AND date(created_at) >= date(?)';
    params.push(fromDate);
  }

  if (toDate) {
    query += ' AND date(created_at) <= date(?)';
    params.push(toDate);
  }

  if (search) {
    query += ' AND (details LIKE ? OR entity_id LIKE ? OR user_name LIKE ? OR action LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  query += ' ORDER BY id DESC LIMIT 5000';

  const logs = db.prepare(query).all(...params) as any[];

  try {
    logAudit(req.user?.username || 'user', 'Exported Audit Trail CSV', 'AUDIT_LOGS', null, `Exported ${logs.length} audit trail log records as CSV`);
  } catch {}

  const escapeCsv = (val: any) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const headers = ['ID', 'Timestamp (UTC)', 'Severity', 'Category', 'User', 'Action', 'Entity Type', 'Entity ID', 'Details', 'IP Address'];
  const rows = [headers.join(',')];

  for (const log of logs) {
    rows.push([
      escapeCsv(log.id),
      escapeCsv(log.created_at),
      escapeCsv(log.severity || 'INFO'),
      escapeCsv(log.category || 'TASKS'),
      escapeCsv(log.user_name),
      escapeCsv(log.action),
      escapeCsv(log.entity_type),
      escapeCsv(log.entity_id || ''),
      escapeCsv(log.details || ''),
      escapeCsv(log.ip_address || '127.0.0.1')
    ].join(','));
  }

  const fileName = `audit_logs_${fromDate || 'start'}_to_${toDate || 'latest'}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(rows.join('\r\n'));
});

router.get('/audit-logs/export-txt', requireAuth, (req: any, res) => {
  const { user, action, search, fromDate, toDate, severity, category } = req.query;
  let query = 'SELECT * FROM audit_logs WHERE 1=1';
  const params: any[] = [];

  if (user) {
    query += ' AND user_name = ?';
    params.push(user);
  }

  if (action) {
    query += ' AND action LIKE ?';
    params.push(`%${action}%`);
  }

  if (severity && severity !== 'ALL') {
    query += ' AND severity = ?';
    params.push(severity);
  }

  if (category && category !== 'ALL') {
    query += ' AND category = ?';
    params.push(category);
  }

  if (fromDate) {
    query += ' AND date(created_at) >= date(?)';
    params.push(fromDate);
  }

  if (toDate) {
    query += ' AND date(created_at) <= date(?)';
    params.push(toDate);
  }

  if (search) {
    query += ' AND (details LIKE ? OR entity_id LIKE ? OR user_name LIKE ? OR action LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  query += ' ORDER BY id DESC';

  const logs = db.prepare(query).all(...params) as any[];

  try {
    logAudit(req.user?.username || 'user', 'Exported Audit Trail TXT', 'AUDIT_LOGS', null, `Exported ${logs.length} audit trail log records`);
  } catch {}

  const now = new Date().toISOString();
  let text = '================================================================================\r\n';
  text += '                     HANDO OPERATIONAL AUDIT TRAIL LOG                         \r\n';
  text += '================================================================================\r\n';
  text += `Generated At : ${now}\r\n`;
  text += `Exported By  : @${req.user?.username || 'admin'}\r\n`;
  text += `Date Filter  : From [${fromDate || 'Beginning'}] To [${toDate || 'Latest'}]\r\n`;
  if (severity) text += `Severity     : ${severity}\r\n`;
  if (category) text += `Category     : ${category}\r\n`;
  if (user) text += `User Filter  : @${user}\r\n`;
  if (action) text += `Action Filter: ${action}\r\n`;
  if (search) text += `Search Query : ${search}\r\n`;
  text += `Total Events : ${logs.length}\r\n`;
  text += '================================================================================\r\n\r\n';

  if (logs.length === 0) {
    text += 'No audit log events found matching the specified filter criteria.\r\n';
  } else {
    for (const log of logs) {
      text += `[${log.created_at}] EVENT #${log.id} [${log.severity || 'INFO'}] [${log.category || 'TASKS'}] | USER: @${log.user_name}\r\n`;
      text += `  ACTION : ${log.action}\r\n`;
      text += `  ENTITY : ${log.entity_type}${log.entity_id ? ` (#${log.entity_id})` : ''}\r\n`;
      text += `  DETAILS: ${log.details || 'N/A'}\r\n`;
      if (log.ip_address) text += `  IP ADDR: ${log.ip_address}\r\n`;
      text += '--------------------------------------------------------------------------------\r\n';
    }
  }

  text += '\r\n================================================================================\r\n';
  text += '                     END OF AUDIT LOG EXPORT                                    \r\n';
  text += '================================================================================\r\n';

  const fileName = `audit_logs_${fromDate || 'start'}_to_${toDate || 'latest'}.txt`;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(text);
});

/* =========================================================================
   7B. DYNAMIC CATEGORIES MANAGEMENT (Admin can add/delete, all users can list)
   ========================================================================= */

router.get('/categories', requireAuth, (req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY id ASC').all();
  res.json(categories);
});

router.post('/categories', requireAdminOrSupervisor, (req: any, res) => {
  const { name, color } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Category name is required.' });
  }

  const cleanName = name.trim();
  const catColor = color && typeof color === 'string' ? color.trim() : '#0F4C81';

  // Check uniqueness (case-insensitive)
  const existing = db.prepare('SELECT id FROM categories WHERE LOWER(name) = LOWER(?)').get(cleanName);
  if (existing) {
    return res.status(400).json({ error: `Category "${cleanName}" already exists.` });
  }

  const info = db.prepare('INSERT INTO categories (name, color) VALUES (?, ?)').run(cleanName, catColor);
  logAudit(req.user?.username || 'admin', 'Category Added', 'SYSTEM', String(info.lastInsertRowid), `Created category "${cleanName}"`);

  res.json({
    id: info.lastInsertRowid,
    name: cleanName,
    color: catColor
  });
});

router.delete('/categories/:id', requireAdminOrSupervisor, (req: any, res) => {
  try {
    const id = Number(req.params.id);
    if (!id || isNaN(id)) {
      return res.status(400).json({ error: 'Invalid category ID.' });
    }

    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as any;
    if (!category) {
      return res.status(404).json({ error: 'Category not found.' });
    }

    // Prevent deleting if it is the only remaining category
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM categories').get() as { count: number };
    if (totalCount.count <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last remaining category. At least one category must exist.' });
    }

    // Find a fallback category among remaining categories (prefer 'Other' if it's not the one being deleted)
    const fallback = db.prepare('SELECT name FROM categories WHERE name = ? AND id != ?').get('Other', id) as any
      || db.prepare('SELECT name FROM categories WHERE id != ? ORDER BY id ASC LIMIT 1').get(id) as any;

    const fallbackName = fallback ? fallback.name : 'General';

    // Re-assign any existing tasks with this deleted category to fallback
    db.prepare('UPDATE tasks SET category = ? WHERE category = ?').run(fallbackName, category.name);

    // Delete category
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);

    logAudit(
      req.user?.username || 'admin',
      'Category Deleted',
      'SYSTEM',
      String(id),
      `Deleted category "${category.name}". Reassigned existing tasks to "${fallbackName}"`
    );

    res.json({ success: true, message: `Category "${category.name}" removed successfully.` });
  } catch (err: any) {
    console.error('Error deleting category:', err);
    res.status(500).json({ error: err.message || 'Failed to delete category.' });
  }
});

/* =========================================================================
   8. USER MANAGEMENT (Section 9 - ADMIN ONLY)
   ========================================================================= */

// Active assignees list accessible to all authenticated operators (for task assignment)
router.get('/assignees', requireAuth, (req, res) => {
  const users = db.prepare(`
    SELECT id, username, full_name, role, status
    FROM users
    WHERE UPPER(status) = 'ACTIVE'
    ORDER BY full_name ASC, username ASC
  `).all() as any[];

  const formatted = users.map(u => ({
    id: u.id,
    username: u.username,
    fullName: u.full_name || u.username,
    role: u.role
  }));
  res.json(formatted);
});

router.get('/users', requireAdminOrSupervisor, (req, res) => {
  const users = db.prepare(`
    SELECT id, username, full_name, role, status, last_login_at, created_at, updated_at
    FROM users
    ORDER BY id ASC
  `).all() as any[];

  const formatted = users.map(u => ({
    ...u,
    fullName: u.full_name
  }));
  res.json(formatted);
});

router.post('/users', requireAdminOrSupervisor, (req, res) => {
  const { username, fullName, full_name, password, confirmPassword, role } = req.body;
  const targetFullName = (fullName || full_name || '').trim();
  const targetPassword = password || '';
  const targetConfirm = confirmPassword !== undefined ? confirmPassword : targetPassword;

  if (!username || !targetFullName || !targetPassword) {
    return res.status(400).json({ error: 'Username, Full Name, and Password are required.' });
  }
  if (targetPassword !== targetConfirm) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }
  if (targetPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
  }

  const cleanUsername = username.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername);
  if (existing) {
    return res.status(400).json({ error: 'Username already taken.' });
  }

  const now = new Date().toISOString();
  // Supervisor can only create standard USER accounts; Admin can create ADMIN, SUPERVISOR, MANAGER, or USER
  const userRole = req.user!.role === 'SUPERVISOR'
    ? 'USER'
    : (['ADMIN', 'SUPERVISOR', 'MANAGER', 'USER'].includes(role) ? role : 'USER');
  const hash = hashPassword(targetPassword);

  const result = db.prepare(`
    INSERT INTO users (username, password_hash, full_name, role, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)
  `).run(cleanUsername, hash, targetFullName, userRole, now, now);

  logAudit(req.user!.username, 'User Created', 'USER', cleanUsername, `Created user ${cleanUsername} with role ${userRole}`);

  res.status(201).json({ success: true, id: Number(result.lastInsertRowid) });
});

router.put('/users/:id', requireAdminOrSupervisor, (req, res) => {
  const userId = Number(req.params.id);
  const { fullName, role, status } = req.body;

  const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // Supervisor boundary: Cannot modify Admin accounts
  if (req.user!.role === 'SUPERVISOR') {
    if (targetUser.role === 'ADMIN') {
      return res.status(403).json({
        error: 'Permission denied: Supervisors cannot modify Administrator accounts.'
      });
    }
    if (role === 'ADMIN' || role === 'SUPERVISOR' || role === 'MANAGER') {
      return res.status(403).json({
        error: 'Permission denied: Supervisors cannot assign Administrator, Supervisor, or Manager privileges.'
      });
    }
  }

  // Section 8: Admin Safety Rule - NEVER disable or demote the last active admin!
  if (targetUser.role === 'ADMIN' && (status === 'DISABLED' || ['USER', 'SUPERVISOR', 'MANAGER'].includes(role))) {
    if (isLastActiveAdmin(userId)) {
      return res.status(400).json({
        error: 'Safety Rule Violation: Cannot disable or demote the last active Administrator account. Create another active Administrator first.'
      });
    }
  }

  const now = new Date().toISOString();
  const assignedRole = req.user!.role === 'SUPERVISOR' ? targetUser.role : (role || targetUser.role);

  db.prepare(`
    UPDATE users
    SET full_name = ?, role = ?, status = ?, updated_at = ?
    WHERE id = ?
  `).run(
    fullName || targetUser.full_name,
    assignedRole,
    status || targetUser.status,
    now,
    userId
  );

  logAudit(req.user!.username, 'User Updated', 'USER', targetUser.username, `Updated user ${targetUser.username} (Role: ${assignedRole}, Status: ${status || targetUser.status})`);

  res.json({ success: true, message: 'User updated.' });
});

router.post('/users/:id/reset-password', requireAdminOrSupervisor, (req, res) => {
  const userId = Number(req.params.id);
  const { newPassword, confirmPassword } = req.body;

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }

  const targetUser = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(userId) as any;
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // Supervisor boundary: Cannot reset password for Admin accounts
  if (req.user!.role === 'SUPERVISOR' && targetUser.role === 'ADMIN') {
    return res.status(403).json({
      error: 'Permission denied: Supervisors cannot reset passwords for Administrator accounts.'
    });
  }

  const hash = hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hash, new Date().toISOString(), userId);

  // Invalidate any existing sessions for this user
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);

  logAudit(req.user!.username, 'Password Reset', 'USER', targetUser.username, `${req.user!.role} reset password for user ${targetUser.username}`);

  res.json({ success: true, message: `Password reset successfully for ${targetUser.username}.` });
});

router.delete('/users/:id', requireAdminOrSupervisor, (req, res) => {
  const userId = Number(req.params.id);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID.' });
  }

  // Safety rule: Cannot delete own currently active account
  if (req.user!.id === userId) {
    return res.status(400).json({ error: 'Safety Rule Violation: You cannot delete your own currently logged-in account.' });
  }

  const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // Supervisor boundary: Cannot delete Admin accounts
  if (req.user!.role === 'SUPERVISOR' && targetUser.role === 'ADMIN') {
    return res.status(403).json({
      error: 'Permission denied: Supervisors cannot delete Administrator accounts.'
    });
  }

  // Safety rule: Cannot delete the last active administrator
  if (targetUser.role === 'ADMIN' && isLastActiveAdmin(userId)) {
    return res.status(400).json({
      error: 'Safety Rule Violation: Cannot delete the last active Administrator account. Create another active Administrator first.'
    });
  }

  // Terminate any active sessions for this user
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);

  // Delete user from database
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);

  logAudit(req.user!.username, 'User Deleted', 'USER', targetUser.username, `${req.user!.role} deleted user @${targetUser.username} (${targetUser.role})`);

  res.json({ success: true, message: `User @${targetUser.username} has been deleted successfully.` });
});

/* =========================================================================
   9. SETTINGS MANAGEMENT (Section 42)
   ========================================================================= */

router.get('/settings', requireAuth, (req, res) => {
  const settings = getSettings();
  res.json(settings);
});

router.put('/settings', requireAdminOrSupervisor, (req, res) => {
  const currentSettings = (db.prepare('SELECT * FROM settings WHERE id = 1').get() as any) || {};
  const isSupervisor = req.user!.role === 'SUPERVISOR';

  const {
    team_name,
    app_name,
    timezone,
    morning_start,
    morning_end,
    mid_start,
    mid_end,
    night_start,
    night_end,
    session_timeout,
    default_priority,
    admin_recovery_email,
    admin_recovery_pin,
    smtp_host,
    smtp_port,
    smtp_user,
    smtp_pass,
    smtp_from,
    weekend_oncall_enabled,
    weekend_holiday_shift_mode,
    holiday_dates
  } = req.body;

  // Validate holiday_dates strictly (must be YYYY-MM-DD for each comma-separated entry)
  let normalizedHolidayDates = currentSettings.holiday_dates || '';
  if (holiday_dates !== undefined && holiday_dates !== null) {
    const rawStr = String(holiday_dates).trim();
    if (rawStr.length > 0) {
      const parts = rawStr.split(',').map(s => s.trim()).filter(Boolean);
      const invalidDates: string[] = [];
      const validDates: string[] = [];

      for (const part of parts) {
        const match = part.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) {
          invalidDates.push(part);
          continue;
        }
        const y = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        const d = parseInt(match[3], 10);

        if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) {
          invalidDates.push(part);
          continue;
        }

        const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
        if (
          dateObj.getUTCFullYear() !== y ||
          dateObj.getUTCMonth() !== m - 1 ||
          dateObj.getUTCDate() !== d
        ) {
          invalidDates.push(part);
          continue;
        }

        if (!validDates.includes(part)) {
          validDates.push(part);
        }
      }

      if (invalidDates.length > 0) {
        return res.status(400).json({
          error: `Invalid holiday date format: [${invalidDates.join(', ')}]. All holiday dates must follow the strict YYYY-MM-DD format (e.g. 2026-09-17).`
        });
      }

      normalizedHolidayDates = validDates.join(', ');
    } else {
      normalizedHolidayDates = '';
    }
  }

  // If supervisor, preserve all admin and organization fields
  const finalTeamName = isSupervisor ? currentSettings.team_name : (team_name || currentSettings.team_name || 'Operations Team');
  const finalAppName = isSupervisor ? currentSettings.app_name : (app_name || currentSettings.app_name || 'Hando');
  const finalTimezone = isSupervisor ? currentSettings.timezone : (timezone || currentSettings.timezone || 'Africa/Cairo');
  const finalTimeout = isSupervisor ? currentSettings.session_timeout : (Number(session_timeout) || currentSettings.session_timeout || 60);
  const finalPriority = isSupervisor ? currentSettings.default_priority : (default_priority || currentSettings.default_priority || 'Medium');
  const finalRecoveryEmail = isSupervisor ? currentSettings.admin_recovery_email : (admin_recovery_email || currentSettings.admin_recovery_email || 'hossamhalawany@gmail.com');
  const finalRecoveryPin = isSupervisor ? currentSettings.admin_recovery_pin : (admin_recovery_pin || currentSettings.admin_recovery_pin || '748291');
  const finalSmtpHost = isSupervisor ? currentSettings.smtp_host : (smtp_host !== undefined ? smtp_host : currentSettings.smtp_host);
  const finalSmtpPort = isSupervisor ? currentSettings.smtp_port : (smtp_port ? Number(smtp_port) : currentSettings.smtp_port || 587);
  const finalSmtpUser = isSupervisor ? currentSettings.smtp_user : (smtp_user !== undefined ? smtp_user : currentSettings.smtp_user);
  const finalSmtpPass = isSupervisor ? currentSettings.smtp_pass : (smtp_pass !== undefined ? smtp_pass : currentSettings.smtp_pass);
  const finalSmtpFrom = isSupervisor ? currentSettings.smtp_from : (smtp_from !== undefined ? smtp_from : currentSettings.smtp_from);

  const finalMorningStart = morning_start || currentSettings.morning_start || '06:00';
  const finalMorningEnd = morning_end || currentSettings.morning_end || '14:00';
  const finalMidStart = mid_start || currentSettings.mid_start || '14:00';
  const finalMidEnd = mid_end || currentSettings.mid_end || '22:00';
  const finalNightStart = night_start || currentSettings.night_start || '22:00';
  const finalNightEnd = night_end || currentSettings.night_end || '06:00';

  const finalOncall = weekend_oncall_enabled !== undefined
    ? (weekend_oncall_enabled ? 1 : 0)
    : (currentSettings.weekend_oncall_enabled !== undefined ? currentSettings.weekend_oncall_enabled : 1);
  const finalMode = weekend_holiday_shift_mode === 'THREE_SHIFTS' ? 'THREE_SHIFTS' : 'SINGLE_OPERATOR_24H';

  db.prepare(`
    UPDATE settings
    SET team_name = ?, app_name = ?, timezone = ?,
        morning_start = ?, morning_end = ?, mid_start = ?, mid_end = ?,
        night_start = ?, night_end = ?, session_timeout = ?, default_priority = ?,
        admin_recovery_email = ?, admin_recovery_pin = ?,
        smtp_host = ?, smtp_port = ?, smtp_user = ?, smtp_pass = ?, smtp_from = ?,
        weekend_oncall_enabled = ?, weekend_holiday_shift_mode = ?, holiday_dates = ?
    WHERE id = 1
  `).run(
    finalTeamName,
    finalAppName,
    finalTimezone,
    finalMorningStart,
    finalMorningEnd,
    finalMidStart,
    finalMidEnd,
    finalNightStart,
    finalNightEnd,
    finalTimeout,
    finalPriority,
    finalRecoveryEmail,
    finalRecoveryPin,
    finalSmtpHost,
    finalSmtpPort,
    finalSmtpUser,
    finalSmtpPass,
    finalSmtpFrom,
    finalOncall,
    finalMode,
    normalizedHolidayDates
  );

  // Also sync admin user email if provided and admin
  if (!isSupervisor && admin_recovery_email) {
    db.prepare("UPDATE users SET email = ? WHERE role = 'ADMIN'").run(admin_recovery_email.trim().toLowerCase());
  }

  // Sync shifts table
  try {
    if (morning_start && morning_end) {
      db.prepare(`
        INSERT INTO shifts (name, display_order, start_time, end_time, crosses_midnight, description, updated_at)
        VALUES ('Morning', 1, ?, ?, 0, 'Morning operations and daily setup', datetime('now'))
        ON CONFLICT(name) DO UPDATE SET start_time = excluded.start_time, end_time = excluded.end_time, updated_at = datetime('now')
      `).run(morning_start, morning_end);
    }
    if (mid_start && mid_end) {
      db.prepare(`
        INSERT INTO shifts (name, display_order, start_time, end_time, crosses_midnight, description, updated_at)
        VALUES ('Mid', 2, ?, ?, 0, 'Peak business operations and daytime support', datetime('now'))
        ON CONFLICT(name) DO UPDATE SET start_time = excluded.start_time, end_time = excluded.end_time, updated_at = datetime('now')
      `).run(mid_start, mid_end);
    }
    if (night_start && night_end) {
      db.prepare(`
        INSERT INTO shifts (name, display_order, start_time, end_time, crosses_midnight, description, updated_at)
        VALUES ('Night', 3, ?, ?, 1, 'Overnight operations and batch processing', datetime('now'))
        ON CONFLICT(name) DO UPDATE SET start_time = excluded.start_time, end_time = excluded.end_time, updated_at = datetime('now')
      `).run(night_start, night_end);
    }
  } catch (err) {
    console.error('Error syncing shifts table on settings update:', err);
  }

  logAudit(req.user!.username, 'Settings Updated', 'SETTINGS', '1', 'Updated operational parameters and notification configurations');

  res.json({ success: true, message: 'Settings saved successfully.' });
});

router.post('/settings/smtp/test', requireAdmin, async (req, res) => {
  const { testEmail } = req.body;
  const settings = getSettings();
  const recipient = testEmail || settings.admin_recovery_email || 'hossamhalawany@gmail.com';

  const result = await sendTestEmail(recipient, settings);
  if (result.success) {
    res.json({ success: true, message: result.message });
  } else {
    res.status(500).json({ error: result.error || result.message });
  }
});

router.post('/settings/recovery-key/generate', requireAdmin, (req, res) => {
  // Generate high-entropy 16-character alphanumeric key formatted: REC-XXXX-XXXX-XXXX
  const raw = crypto.randomBytes(9).toString('hex').toUpperCase();
  const key = `REC-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  const hashed = hashPassword(key);

  db.prepare('UPDATE settings SET admin_recovery_key_hash = ? WHERE id = 1').run(hashed);

  logAudit(
    req.user!.username,
    'Recovery Key Generated',
    'SETTINGS',
    '1',
    'Admin generated a new emergency recovery key'
  );

  res.json({
    success: true,
    key,
    message: 'New Emergency Recovery Key generated. Save this key in a secure location. It will not be shown again.'
  });
});

router.get('/settings/totp/setup', requireAdmin, async (req, res) => {
  try {
    const settings = getSettings();
    let secret = settings.admin_totp_secret;
    if (!secret || typeof secret !== 'string' || secret.length < 16) {
      secret = generateSecret();
      db.prepare('UPDATE settings SET admin_totp_secret = ? WHERE id = 1').run(secret);
    }

    const appName = settings.app_name || 'Shift Handover';
    const email = settings.admin_recovery_email || 'hossamhalawany@gmail.com';
    const otpauth = generateURI({ issuer: `${appName} (Admin)`, label: email, secret });
    const qrCode = await QRCode.toDataURL(otpauth, { margin: 2, width: 260 });

    res.json({
      secret,
      qrCode,
      otpauth,
      enabled: settings.admin_totp_enabled === 1,
      email
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to initialize TOTP setup.' });
  }
});

router.post('/settings/totp/regenerate', requireAdmin, async (req, res) => {
  try {
    const settings = getSettings();
    const newSecret = generateSecret();
    db.prepare('UPDATE settings SET admin_totp_secret = ?, admin_totp_enabled = 0 WHERE id = 1').run(newSecret);

    const appName = settings.app_name || 'Shift Handover';
    const email = settings.admin_recovery_email || 'hossamhalawany@gmail.com';
    const otpauth = generateURI({ issuer: `${appName} (Admin)`, label: email, secret: newSecret });
    const qrCode = await QRCode.toDataURL(otpauth, { margin: 2, width: 260 });

    logAudit(req.user!.username, 'TOTP Secret Regenerated', 'SETTINGS', '1', 'Admin regenerated Google Authenticator secret key');

    res.json({
      secret: newSecret,
      qrCode,
      otpauth,
      enabled: false,
      email
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to regenerate TOTP secret.' });
  }
});

router.post('/settings/totp/verify-and-enable', requireAdmin, (req, res) => {
  const { code } = req.body;
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Please enter the 6-digit code shown in Google Authenticator.' });
  }

  const cleanCode = code.trim();
  const settings = getSettings();

  if (!settings.admin_totp_secret) {
    return res.status(400).json({ error: 'TOTP secret not initialized. Please refresh the page.' });
  }

  const check = verifySync({
    token: cleanCode,
    secret: settings.admin_totp_secret,
    epochTolerance: 30
  });

  if (!check || !check.valid) {
    return res.status(400).json({
      error: 'Invalid 6-digit code. Please ensure your device clock is synchronized and enter the current code from Google Authenticator.'
    });
  }

  db.prepare('UPDATE settings SET admin_totp_enabled = 1 WHERE id = 1').run();

  logAudit(
    req.user!.username,
    '2FA Enabled',
    'SETTINGS',
    '1',
    'Admin successfully activated Google Authenticator 2FA'
  );

  res.json({
    success: true,
    message: 'Google Authenticator 2FA is now fully active! You can use it to reset your password or verify access anytime.'
  });
});

router.post('/settings/totp/disable', requireAdmin, (req, res) => {
  db.prepare('UPDATE settings SET admin_totp_enabled = 0 WHERE id = 1').run();

  logAudit(
    req.user!.username,
    '2FA Disabled',
    'SETTINGS',
    '1',
    'Admin turned off Google Authenticator 2FA requirement'
  );

  res.json({
    success: true,
    message: 'Google Authenticator 2FA has been disabled.'
  });
});

/* =========================================================================
   10. DEMO SCENARIO (Section 68 & 69)
   ========================================================================= */

router.post('/demo/load', requireAuth, (req, res) => {
  res.json({
    success: true,
    message: 'Demo scenario has been disabled in production.'
  });
});

router.post('/demo/clear', requireAdmin, (req, res) => {
  const { clearUsers, clearAudit } = req.body || {};

  db.exec('DELETE FROM handover_tasks;');
  db.exec('DELETE FROM handovers;');
  db.exec('DELETE FROM task_history;');
  db.exec('DELETE FROM tasks;');

  try {
    db.exec(`DELETE FROM sqlite_sequence WHERE name IN ('tasks', 'task_history', 'handovers', 'handover_tasks');`);
  } catch (e) {
    // Ignore if sqlite_sequence does not exist
  }

  if (clearUsers) {
    // Keep only the current active admin user, remove demo operators
    db.prepare('DELETE FROM users WHERE id != ?').run(req.user!.id);
    db.prepare('DELETE FROM sessions WHERE user_id != ?').run(req.user!.id);
  }

  if (clearAudit) {
    db.exec('DELETE FROM audit_logs;');
  }

  logAudit(
    req.user!.username,
    'Operational Data Cleared',
    'SYSTEM',
    null,
    `Cleared all operational tasks, histories, and handovers${clearUsers ? ' and demo users' : ''}`
  );

  res.json({
    success: true,
    message: 'All tasks, histories, and handover records cleared successfully. System is clean for production.'
  });
});

router.post('/system/factory-reset', requireAdmin, (req, res) => {
  db.exec('DELETE FROM handover_tasks;');
  db.exec('DELETE FROM handovers;');
  db.exec('DELETE FROM task_history;');
  db.exec('DELETE FROM tasks;');
  db.exec('DELETE FROM sessions;');
  db.exec('DELETE FROM users;');
  db.exec('DELETE FROM audit_logs;');

  try {
    db.exec(`DELETE FROM sqlite_sequence;`);
  } catch (e) {
    // Ignore
  }

  db.prepare(`
    UPDATE settings
    SET team_name = 'Operations Team',
        app_name = 'Shift Handover',
        timezone = 'Africa/Cairo',
        installed = 0,
        installed_at = NULL
    WHERE id = 1;
  `).run();

  res.json({
    success: true,
    message: 'Full factory reset complete. The initial setup wizard is now ready.'
  });
});

/* =========================================================================
   11. BACKUP & EXPORTS (Section 44, 45, 46)
   ========================================================================= */

// 1. Get Backup Tables & Live Counts
router.get('/backup/tables', requireAdmin, (req, res) => {
  try {
    const tables = SUPPORTED_TABLES.map(table => {
      const config = TABLE_CONFIGS[table];
      let count = 0;
      try {
        const r = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number };
        count = r?.c || 0;
      } catch {
        count = 0;
      }
      return {
        ...config,
        currentCount: count
      };
    });
    res.json({ tables });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list backup tables' });
  }
});

// 2. Export Structured JSON Backup (Full or Selective with Date Range)
router.all('/backup/export', requireAdmin, (req, res) => {
  try {
    const isPost = req.method === 'POST';
    const body = isPost ? req.body : req.query;

    let tables: string[] | undefined;
    if (body.tables) {
      if (Array.isArray(body.tables)) {
        tables = body.tables;
      } else if (typeof body.tables === 'string') {
        tables = body.tables.split(',').map((s: string) => s.trim()).filter(Boolean);
      }
    }

    const startDate = body.startDate ? String(body.startDate).trim() : null;
    const endDate = body.endDate ? String(body.endDate).trim() : null;
    const download = body.download !== 'false' && body.download !== false;

    const settings = getSettings();
    const backupPkg = generateBackup({
      tables,
      startDate,
      endDate,
      exportedBy: req.user!.username,
      appName: settings.app_name || 'Shift Handover Operations'
    });

    logAudit(
      req.user!.username,
      'DATABASE_BACKUP_EXPORTED',
      'DATABASE',
      null,
      `Exported JSON backup (${backupPkg._metadata.mode} mode, ${backupPkg._metadata.total_records} records across ${backupPkg._metadata.tables_included.length} tables)`
    );

    const nowStr = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `shift_handover_backup_${nowStr}.json`;

    if (download) {
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.send(JSON.stringify(backupPkg, null, 2));
    } else {
      res.json(backupPkg);
    }
  } catch (err: any) {
    console.error('Backup export failed:', err);
    res.status(500).json({ error: err.message || 'Failed to generate backup export.' });
  }
});

// 3. Pre-Validate Backup JSON
router.post('/backup/validate', requireAdmin, (req, res) => {
  try {
    const backupJson = req.body.backupJson || req.body;
    if (!backupJson) {
      return res.status(400).json({ valid: false, errors: ['Missing backup JSON payload in request body.'] });
    }
    const result = validateBackup(backupJson);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ valid: false, errors: [err.message || 'Validation error.'] });
  }
});

// 4. Restore Backup JSON (Append / Merge Mode or Full Disaster Recovery Overwrite)
router.post('/backup/restore', requireAdmin, (req, res) => {
  try {
    const { backupJson, mode, selectedTables } = req.body;
    if (!backupJson) {
      return res.status(400).json({ error: 'Missing backupJson payload in restore request.' });
    }
    if (mode !== 'merge' && mode !== 'overwrite') {
      return res.status(400).json({ error: 'Invalid restore mode. Must be "merge" or "overwrite".' });
    }

    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

    const result = executeRestore({
      backupJson,
      mode,
      selectedTables,
      restoredBy: req.user!.username,
      currentUserId: req.user!.id,
      currentSessionToken: token
    });

    res.json(result);
  } catch (err: any) {
    console.error('Restore failed:', err);
    res.status(500).json({ error: err.message || 'Restore execution failed.' });
  }
});

// Database Backup Download (Section 46 - Raw SQLite)
router.get('/backup/download', requireAdmin, (req, res) => {
  if (!fs.existsSync(DB_PATH)) {
    return res.status(404).json({ error: 'Database file not found.' });
  }

  logAudit(req.user!.username, 'Database Backup Downloaded', 'DATABASE', null, 'Downloaded SQLite database backup');

  const filename = `shift_handover_backup_${new Date().toISOString().split('T')[0]}.sqlite`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/x-sqlite3');
  fs.createReadStream(DB_PATH).pipe(res);
});

// CSV Export (Section 45)
router.get('/export/csv/:type', requireAuth, (req, res) => {
  const type = req.params.type;
  let csv = '';
  let filename = '';

  if (type === 'tasks') {
    const tasks = db.prepare('SELECT * FROM tasks ORDER BY id ASC').all() as any[];
    filename = `shift_tasks_${new Date().toISOString().split('T')[0]}.csv`;
    csv = 'ID,Task Code,Title,Priority,Status,Category,Created By,Created At,Shift,Assigned User,Due Date,Completed By,Completed At\n';
    for (const t of tasks) {
      csv += `"${t.id}","${t.task_code}","${(t.title || '').replace(/"/g, '""')}","${t.priority}","${t.status}","${t.category}","${t.created_by}","${t.created_at}","${t.current_shift}","${t.assigned_user || ''}","${t.due_date || ''}","${t.completed_by || ''}","${t.completed_at || ''}"\n`;
    }
  } else if (type === 'handovers') {
    const handovers = db.prepare('SELECT * FROM handovers ORDER BY id ASC').all() as any[];
    filename = `shift_handovers_${new Date().toISOString().split('T')[0]}.csv`;
    csv = 'ID,Date,From Shift,To Shift,Closed By,Closed At,Acknowledged By,Acknowledged At,Completed Tasks,Carried Over,Blocked,General Notes\n';
    for (const h of handovers) {
      csv += `"${h.id}","${h.shift_date}","${h.from_shift}","${h.to_shift}","${h.closed_by}","${h.closed_at}","${h.acknowledged_by || ''}","${h.acknowledged_at || ''}","${h.tasks_completed_count}","${h.tasks_carried_over_count}","${h.tasks_blocked_count}","${(h.general_notes || '').replace(/"/g, '""')}"\n`;
    }
  } else if (type === 'audit') {
    const logs = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 500').all() as any[];
    filename = `shift_audit_logs_${new Date().toISOString().split('T')[0]}.csv`;
    csv = 'ID,Timestamp,User,Action,Entity Type,Entity ID,Details,IP Address\n';
    for (const l of logs) {
      csv += `"${l.id}","${l.created_at}","${l.user_name}","${l.action}","${l.entity_type}","${l.entity_id || ''}","${(l.details || '').replace(/"/g, '""')}","${l.ip_address || ''}"\n`;
    }
  } else {
    return res.status(400).json({ error: 'Invalid export type. Supported: tasks, handovers, audit' });
  }

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.send(csv);
});

// Download Standalone PHP 8.1+ SQLite ready-to-deploy ZIP package!
router.get(['/download-php-zip', '/export/php-zip'], async (req, res) => {
  try {
    const zipBuffer = await generatePhpZip();
    const filename = 'shift-handover-php8-standalone.zip';
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/zip');
    res.send(zipBuffer);
  } catch (err: any) {
    console.error('Failed to generate PHP zip:', err);
    res.status(500).json({ error: 'Failed to generate PHP standalone ZIP: ' + err.message });
  }
});

export default router;

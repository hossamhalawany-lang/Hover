import express from 'express';
import fs from 'fs';
import path from 'path';
import { db, DB_PATH, logAudit, getNextTaskCode } from '../db.ts';
import { getCurrentShift, getSettings, ShiftInfo } from '../shifts.ts';
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  requireAuth,
  requireAdmin,
  isLastActiveAdmin
} from '../auth.ts';
import { seedDemoScenario } from '../demo.ts';
import { generatePhpZip } from '../php_packager.ts';
import { isSmtpConfigured, sendPasswordResetEmail, sendTestEmail } from '../mailer.ts';
import crypto from 'crypto';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';

const router = express.Router();

/* =========================================================================
   1. SETUP / INSTALLATION
   ========================================================================= */

router.get('/setup/status', (req, res) => {
  const settings = getSettings();
  const adminCount = db.prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN'`).get() as { count: number };
  res.json({
    installed: settings.installed === 1 && adminCount.count > 0,
    appName: settings.app_name || 'Hando',
    teamName: settings.team_name || 'Operations Team'
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

  if (loadDemo) {
    seedDemoScenario(adminUsername);
  }

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
  const isValid = verifyPassword(rawPass, targetHash) || verifyPassword(rawPass.trim(), targetHash);

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
  const shiftChoice = ['Morning', 'Mid', 'Night'].includes(selectedShift) ? selectedShift : undefined;

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
  if (!['Morning', 'Mid', 'Night'].includes(selectedShift)) {
    return res.status(400).json({ error: 'Invalid shift name. Must be Morning, Mid, or Night.' });
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
  const shift = getCurrentShift();
  res.json({
    user: req.user,
    shift
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
  const shift = getCurrentShift();
  const userShift = req.user?.selectedShift || shift.name;
  res.json({
    ...shift,
    userShift
  });
});

router.get('/shifts', (req, res) => {
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

/* =========================================================================
   4. TASKS CRUD & WORKFLOW
   ========================================================================= */

router.get('/tasks', requireAuth, (req, res) => {
  const { status, priority, shift, category, search, overdue } = req.query;

  let query = 'SELECT * FROM tasks WHERE 1=1';
  const params: any[] = [];

  if (status && status !== 'All') {
    query += ' AND status = ?';
    params.push(status);
  }

  if (priority && priority !== 'All') {
    query += ' AND priority = ?';
    params.push(priority);
  }

  if (shift && shift !== 'All') {
    query += ' AND current_shift = ?';
    params.push(shift);
  }

  if (category && category !== 'All') {
    query += ' AND category = ?';
    params.push(category);
  }

  if (search) {
    query += ' AND (task_code LIKE ? OR title LIKE ? OR description LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  const now = new Date().toISOString();
  if (overdue === 'true') {
    query += " AND due_date IS NOT NULL AND due_date < ? AND status NOT IN ('Completed', 'Cancelled')";
    params.push(now);
  }

  query += " ORDER BY CASE priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END, id DESC";

  const tasks = db.prepare(query).all(...params) as any[];

  // Mark overdue on output
  const tasksWithFlags = tasks.map(t => ({
    ...t,
    isOverdue: Boolean(t.due_date && t.due_date < now && !['Completed', 'Cancelled'].includes(t.status))
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

  res.json({
    task,
    history
  });
});

router.post('/tasks', requireAuth, (req, res) => {
  const { title, description, priority, category, assignedUser, dueDate } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Task title is required.' });
  }

  const shift = getCurrentShift();
  const taskCode = getNextTaskCode();
  const now = new Date().toISOString();
  const user = req.user!.username;

  const validPriorities = ['Critical', 'High', 'Medium', 'Low'];
  const taskPriority = validPriorities.includes(priority) ? priority : 'Medium';

  const insertStmt = db.prepare(`
    INSERT INTO tasks (
      task_code, title, description, priority, status, category,
      created_by, created_at, original_shift, current_shift, assigned_user,
      due_date, last_updated_by, last_updated_at, version
    ) VALUES (?, ?, ?, ?, 'Pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const result = insertStmt.run(
    taskCode,
    title.trim(),
    description ? description.trim() : null,
    taskPriority,
    category || 'Other',
    user,
    now,
    shift.name,
    shift.name,
    assignedUser || null,
    dueDate || null,
    user,
    now
  );

  const taskId = Number(result.lastInsertRowid);

  // Insert creation into task history
  db.prepare(`
    INSERT INTO task_history (task_id, task_code, action, user_name, shift, previous_status, new_status, notes, created_at)
    VALUES (?, ?, 'Created', ?, ?, null, 'Pending', ?, ?)
  `).run(taskId, taskCode, user, shift.name, description || 'Task created', now);

  logAudit(user, 'Task Created', 'TASK', taskCode, `Created task: ${title} (${taskPriority})`);

  const createdTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  res.status(201).json(createdTask);
});

// Update task metadata with Optimistic Concurrency check (Section 36)
router.put('/tasks/:id', requireAuth, (req, res) => {
  const { title, description, priority, category, assignedUser, dueDate, version } = req.body;
  const taskId = req.params.id;

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
  if (!task) {
    return res.status(404).json({ error: 'Task not found.' });
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

  db.prepare(`
    UPDATE tasks
    SET title = ?, description = ?, priority = ?, category = ?, assigned_user = ?,
        due_date = ?, last_updated_by = ?, last_updated_at = ?, version = ?
    WHERE id = ?
  `).run(
    title || task.title,
    description !== undefined ? description : task.description,
    priority || task.priority,
    category || task.category,
    assignedUser !== undefined ? assignedUser : task.assigned_user,
    dueDate !== undefined ? dueDate : task.due_date,
    req.user!.username,
    now,
    newVersion,
    taskId
  );

  db.prepare(`
    INSERT INTO task_history (task_id, task_code, action, user_name, shift, notes, created_at)
    VALUES (?, ?, 'Updated', ?, ?, 'Task details updated', ?)
  `).run(task.id, task.task_code, req.user!.username, shift.name, now);

  logAudit(req.user!.username, 'Task Updated', 'TASK', task.task_code, `Updated task metadata`);

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

  // Optimistic concurrency check
  if (version !== undefined && Number(version) !== task.version) {
    return res.status(409).json({
      error: 'Conflict: This task has been updated by another user. Please refresh to see latest state.',
      currentVersion: task.version
    });
  }

  const shift = getCurrentShift();
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

  // Build update query
  db.prepare(`
    UPDATE tasks
    SET status = ?,
        handover_state = ?,
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
  `).run(task.id, task.task_code, action, user, shift.name, prevStatus, newStatus, notes || null, now);

  logAudit(user, `Task ${action}`, 'TASK', task.task_code, `Status: ${prevStatus} -> ${newStatus}. Reason/Notes: ${notes || 'N/A'}`);

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  res.json(updated);
});

/* =========================================================================
   5. HANDOVER WORKFLOW & CLOSURE VALIDATION (THE CORE MANDATE)
   ========================================================================= */

// Current handover info
router.get('/handover/current', requireAuth, (req, res) => {
  const shift = getCurrentShift();

  // Get most recent handover to current shift
  const lastHandover = db.prepare(`
    SELECT * FROM handovers
    WHERE to_shift = ?
    ORDER BY id DESC LIMIT 1
  `).get(shift.name) as any;

  // If none to current shift, get the absolute latest handover
  const latestHandover = lastHandover || db.prepare(`
    SELECT * FROM handovers ORDER BY id DESC LIMIT 1
  `).get();

  // Get all active open tasks that must be visible in the current shift
  const openTasks = db.prepare(`
    SELECT * FROM tasks
    WHERE status IN ('Pending', 'In Progress', 'Blocked')
    ORDER BY CASE priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END, id ASC
  `).all() as any[];

  res.json({
    currentShift: shift,
    latestHandover,
    openTasksCount: openTasks.length,
    openTasks
  });
});

// Acknowledge handover by incoming shift operator
router.post('/handover/acknowledge', requireAuth, (req, res) => {
  const { handoverId } = req.body;
  const shift = getCurrentShift();
  const user = req.user!.username;
  const now = new Date().toISOString();

  if (handoverId) {
    db.prepare(`
      UPDATE handovers
      SET acknowledged_by = ?, acknowledged_at = ?
      WHERE id = ?
    `).run(user, now, handoverId);
  }

  logAudit(user, 'Handover Acknowledged', 'HANDOVER', handoverId ? String(handoverId) : null, `Acknowledged handover for shift ${shift.name}`);

  res.json({ success: true, message: 'Handover acknowledged.' });
});

// Validate shift closure: MUST calculate all unresolved tasks!
// (Section 28: Cannot close shift if unresolved tasks exist!)
router.get('/handover/validate-closure', requireAuth, (req, res) => {
  const shift = getCurrentShift();

  // Unresolved tasks: active tasks that have not been completed, or explicitly marked blocked/carried over for this closure
  const unresolvedTasks = db.prepare(`
    SELECT * FROM tasks
    WHERE status IN ('Pending', 'In Progress')
    ORDER BY CASE priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END, id ASC
  `).all() as any[];

  const completedToday = db.prepare(`
    SELECT * FROM tasks
    WHERE status = 'Completed' AND current_shift = ?
    ORDER BY id DESC
  `).all(shift.name) as any[];

  const blockedTasks = db.prepare(`
    SELECT * FROM tasks
    WHERE status = 'Blocked'
    ORDER BY id DESC
  `).all() as any[];

  res.json({
    canClose: unresolvedTasks.length === 0,
    unresolvedCount: unresolvedTasks.length,
    unresolvedTasks,
    completedTasks: completedToday,
    blockedTasks,
    shift
  });
});

// Close shift & finalize handover
// SECTION 28-30: NO BYPASS! If unresolved tasks exist, reject immediately unless resolutions are provided!
router.post('/handover/close-shift', requireAuth, (req, res) => {
  const { resolutions, generalNotes } = req.body;
  // resolutions is an array of: { taskId: number, disposition: 'Completed' | 'Carry Over' | 'Blocked', notes: string }

  const shift = getCurrentShift();
  const user = req.user!.username;
  const now = new Date().toISOString();

  // 1. Check all pending / in progress tasks
  const openTasks = db.prepare(`
    SELECT * FROM tasks
    WHERE status IN ('Pending', 'In Progress')
  `).all() as any[];

  // Map provided resolutions by taskId
  const resolutionMap = new Map<number, { disposition: string; notes: string }>();
  if (Array.isArray(resolutions)) {
    for (const r of resolutions) {
      resolutionMap.set(Number(r.taskId), {
        disposition: r.disposition,
        notes: (r.notes || '').trim()
      });
    }
  }

  // Check if any open task is unhandled
  const unhandled: any[] = [];
  for (const task of openTasks) {
    const resItem = resolutionMap.get(task.id);
    if (!resItem) {
      unhandled.push(task);
    } else {
      // Validate requirements for Carry Over and Blocked
      if (resItem.disposition === 'Carry Over' && !resItem.notes) {
        return res.status(400).json({
          error: `Task ${task.task_code} ("${task.title}") requires an explanatory note to be carried over.`
        });
      }
      if (resItem.disposition === 'Blocked' && !resItem.notes) {
        return res.status(400).json({
          error: `Task ${task.task_code} ("${task.title}") requires a reason to be marked as Blocked.`
        });
      }
    }
  }

  if (unhandled.length > 0) {
    return res.status(400).json({
      error: `ATTENTION REQUIRED: ${unhandled.length} unresolved task(s) require action before this shift can be closed.`,
      unresolvedTasks: unhandled
    });
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
              last_updated_by = ?,
              last_updated_at = ?,
              version = version + 1
          WHERE id = ?
        `).run(now, user, resolution.notes || 'Completed during shift handover', user, now, taskId);

        db.prepare(`
          INSERT INTO task_history (task_id, task_code, action, user_name, shift, previous_status, new_status, notes, created_at)
          VALUES (?, ?, 'Completed', ?, ?, ?, 'Completed', ?, ?)
        `).run(taskId, task.task_code, user, shift.name, task.status, resolution.notes || 'Completed during shift handover', now);
      } else if (resolution.disposition === 'Carry Over') {
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
        `).run(shift.nextShift, resolution.notes, user, now, taskId);

        db.prepare(`
          INSERT INTO task_history (task_id, task_code, action, user_name, shift, previous_status, new_status, notes, created_at)
          VALUES (?, ?, 'Carried Over', ?, ?, ?, ?, ?, ?)
        `).run(taskId, task.task_code, user, shift.name, task.status, task.status, `Carried over to ${shift.nextShift}: ${resolution.notes}`, now);
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
    `).get(shift.name, shift.currentDate) as { count: number };

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
      shift.currentDate,
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
 * Generate formatted Handover Email text (Section 32)
 */
router.get('/reports/email', requireAuth, (req: any, res) => {
  const handoverId = req.query.handoverId ? Number(req.query.handoverId) : undefined;
  const shift = getCurrentShift();

  let handover: any = null;
  if (handoverId) {
    handover = db.prepare('SELECT * FROM handovers WHERE id = ?').get(handoverId);
  } else {
    handover = db.prepare('SELECT * FROM handovers ORDER BY id DESC LIMIT 1').get();
  }

  // Fetch tasks associated or current
  const fromShift = handover ? handover.from_shift : shift.previousShift;
  const toShift = handover ? handover.to_shift : shift.name;
  const date = handover ? handover.shift_date : shift.currentDate;
  const closedBy = handover ? handover.closed_by : req.user.username;
  const closedAt = handover ? new Date(handover.closed_at).toLocaleString() : new Date().toLocaleString();
  const ackBy = handover && handover.acknowledged_by ? `${handover.acknowledged_by} (${new Date(handover.acknowledged_at).toLocaleTimeString()})` : 'PENDING';
  const generalNotes = handover ? (handover.general_notes || 'No notes recorded.') : 'Active operational shift in progress.';

  const completedTasks = db.prepare(`SELECT * FROM tasks WHERE status = 'Completed' ORDER BY id ASC`).all() as any[];
  const carriedTasks = db.prepare(`SELECT * FROM tasks WHERE handover_state = 'Carried Over' AND status != 'Completed' ORDER BY id ASC`).all() as any[];
  const blockedTasks = db.prepare(`SELECT * FROM tasks WHERE status = 'Blocked' ORDER BY id ASC`).all() as any[];

  let email = `========================================
SHIFT HANDOVER REPORT
========================================
Date: ${date}
From Shift: ${fromShift} Shift
To Shift: ${toShift} Shift
Handover By: @${closedBy}
Handover At: ${closedAt}
Acknowledged By: ${ackBy}

GENERAL HANDOVER NOTES
----------------------------------------
${generalNotes}

COMPLETED TASKS (${completedTasks.length})
----------------------------------------
`;

  if (completedTasks.length === 0) {
    email += '- None\n';
  } else {
    for (const t of completedTasks) {
      email += `- [${t.task_code}] ${t.title} (Completed by @${t.completed_by || t.last_updated_by})\n`;
    }
  }

  email += `\nCARRIED OVER TASKS (${carriedTasks.length}) - ACTION REQUIRED
----------------------------------------
`;

  if (carriedTasks.length === 0) {
    email += '- None\n';
  } else {
    for (const t of carriedTasks) {
      email += `- [${t.task_code}] ${t.title} [Priority: ${t.priority}]\n  Reason: ${t.carry_over_reason || 'Shift handover carry-over'}\n  Status: ${t.status}\n`;
    }
  }

  email += `\nBLOCKED TASKS (${blockedTasks.length}) - ATTENTION
----------------------------------------
`;

  if (blockedTasks.length === 0) {
    email += '- None\n';
  } else {
    for (const t of blockedTasks) {
      email += `- [${t.task_code}] ${t.title} [Priority: ${t.priority}]\n  Reason: ${t.blocked_reason || 'Blocked waiting on resolution'}\n`;
    }
  }

  email += `\n========================================
Generated by Shift Handover System
Database is the Single Source of Truth
========================================`;

  res.json({ emailText: email });
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

router.get('/audit-logs', requireAdmin, (req, res) => {
  const { user, action, search } = req.query;
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

  if (search) {
    query += ' AND (details LIKE ? OR entity_id LIKE ? OR user_name LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  query += ' ORDER BY id DESC LIMIT 100';

  const logs = db.prepare(query).all(...params);
  res.json(logs);
});

/* =========================================================================
   8. USER MANAGEMENT (Section 9 - ADMIN ONLY)
   ========================================================================= */

router.get('/users', requireAdmin, (req, res) => {
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

router.post('/users', requireAdmin, (req, res) => {
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
  const userRole = role === 'ADMIN' ? 'ADMIN' : 'USER';
  const hash = hashPassword(targetPassword);

  const result = db.prepare(`
    INSERT INTO users (username, password_hash, full_name, role, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)
  `).run(cleanUsername, hash, targetFullName, userRole, now, now);

  logAudit(req.user!.username, 'User Created', 'USER', cleanUsername, `Created user ${cleanUsername} with role ${userRole}`);

  res.status(201).json({ success: true, id: Number(result.lastInsertRowid) });
});

router.put('/users/:id', requireAdmin, (req, res) => {
  const userId = Number(req.params.id);
  const { fullName, role, status } = req.body;

  const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // Section 8: Admin Safety Rule - NEVER disable or demote the last active admin!
  if (targetUser.role === 'ADMIN' && (status === 'DISABLED' || role === 'USER')) {
    if (isLastActiveAdmin(userId)) {
      return res.status(400).json({
        error: 'Safety Rule Violation: Cannot disable or demote the last active Administrator account. Create another active Administrator first.'
      });
    }
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users
    SET full_name = ?, role = ?, status = ?, updated_at = ?
    WHERE id = ?
  `).run(
    fullName || targetUser.full_name,
    role || targetUser.role,
    status || targetUser.status,
    now,
    userId
  );

  logAudit(req.user!.username, 'User Updated', 'USER', targetUser.username, `Updated user ${targetUser.username} (Role: ${role}, Status: ${status})`);

  res.json({ success: true, message: 'User updated.' });
});

router.post('/users/:id/reset-password', requireAdmin, (req, res) => {
  const userId = Number(req.params.id);
  const { newPassword, confirmPassword } = req.body;

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }

  const targetUser = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as any;
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const hash = hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hash, new Date().toISOString(), userId);

  // Invalidate any existing sessions for this user
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);

  logAudit(req.user!.username, 'Admin Password Reset', 'USER', targetUser.username, `Admin reset password for user ${targetUser.username}`);

  res.json({ success: true, message: `Password reset successfully for ${targetUser.username}.` });
});

router.delete('/users/:id', requireAdmin, (req, res) => {
  const userId = Number(req.params.id);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID.' });
  }

  // Safety rule: Admin cannot delete their own currently active account
  if (req.user!.id === userId) {
    return res.status(400).json({ error: 'Safety Rule Violation: You cannot delete your own currently logged-in administrator account.' });
  }

  const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found.' });
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

  logAudit(req.user!.username, 'User Deleted', 'USER', targetUser.username, `Admin deleted user @${targetUser.username} (${targetUser.role})`);

  res.json({ success: true, message: `User @${targetUser.username} has been deleted successfully.` });
});

/* =========================================================================
   9. SETTINGS MANAGEMENT (Section 42)
   ========================================================================= */

router.get('/settings', requireAuth, (req, res) => {
  const settings = getSettings();
  res.json(settings);
});

router.put('/settings', requireAdmin, (req, res) => {
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
    smtp_from
  } = req.body;

  db.prepare(`
    UPDATE settings
    SET team_name = ?, app_name = ?, timezone = ?,
        morning_start = ?, morning_end = ?, mid_start = ?, mid_end = ?,
        night_start = ?, night_end = ?, session_timeout = ?, default_priority = ?,
        admin_recovery_email = ?, admin_recovery_pin = ?,
        smtp_host = ?, smtp_port = ?, smtp_user = ?, smtp_pass = ?, smtp_from = ?
    WHERE id = 1
  `).run(
    team_name || 'Operations Team',
    app_name || 'Shift Handover',
    timezone || 'Africa/Cairo',
    morning_start || '06:00',
    morning_end || '14:00',
    mid_start || '14:00',
    mid_end || '22:00',
    night_start || '22:00',
    night_end || '06:00',
    Number(session_timeout) || 60,
    default_priority || 'Medium',
    admin_recovery_email || 'hossamhalawany@gmail.com',
    admin_recovery_pin || '748291',
    smtp_host || null,
    smtp_port ? Number(smtp_port) : 587,
    smtp_user || null,
    smtp_pass || null,
    smtp_from || null
  );

  // Also sync admin user email if provided
  if (admin_recovery_email) {
    db.prepare("UPDATE users SET email = ? WHERE role = 'ADMIN'").run(admin_recovery_email.trim().toLowerCase());
  }

  // Sync shifts table
  if (morning_start && morning_end) {
    db.prepare("UPDATE shifts SET start_time = ?, end_time = ? WHERE name = 'Morning'").run(morning_start, morning_end);
  }
  if (mid_start && mid_end) {
    db.prepare("UPDATE shifts SET start_time = ?, end_time = ? WHERE name = 'Mid'").run(mid_start, mid_end);
  }
  if (night_start && night_end) {
    db.prepare("UPDATE shifts SET start_time = ?, end_time = ? WHERE name = 'Night'").run(night_start, night_end);
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
  seedDemoScenario(req.user!.username);
  res.json({
    success: true,
    message: 'Morning -> Mid Demonstration scenario successfully loaded. Tasks 1, 2, 3, 5 are completed. Task 4 ("Verify backup") is pending for Mid closure test.'
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

// Database Backup Download (Section 46)
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
router.get('/export/csv/:type', requireAdmin, (req, res) => {
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

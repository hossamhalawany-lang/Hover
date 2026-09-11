import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

// Ensure data directory exists
const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const DB_PATH = path.join(DATA_DIR, 'shift_handover.sqlite');

export const db = new DatabaseSync(DB_PATH);

// Enable foreign keys and WAL mode for reliability
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

/**
 * Initialize all database tables and schema
 */
export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      team_name TEXT NOT NULL DEFAULT 'Operations Team',
      app_name TEXT NOT NULL DEFAULT 'Shift Handover',
      timezone TEXT NOT NULL DEFAULT 'Africa/Cairo',
      morning_start TEXT NOT NULL DEFAULT '06:00',
      morning_end TEXT NOT NULL DEFAULT '14:00',
      mid_start TEXT NOT NULL DEFAULT '14:00',
      mid_end TEXT NOT NULL DEFAULT '22:00',
      night_start TEXT NOT NULL DEFAULT '22:00',
      night_end TEXT NOT NULL DEFAULT '06:00',
      session_timeout INTEGER NOT NULL DEFAULT 60,
      default_priority TEXT NOT NULL DEFAULT 'Medium',
      installed INTEGER NOT NULL DEFAULT 0,
      installed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('ADMIN', 'USER')),
      status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'DISABLED')) DEFAULT 'ACTIVE',
      last_login_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT NOT NULL CHECK (priority IN ('Critical', 'High', 'Medium', 'Low')) DEFAULT 'Medium',
      status TEXT NOT NULL CHECK (status IN ('Pending', 'In Progress', 'Completed', 'Blocked', 'Cancelled')) DEFAULT 'Pending',
      category TEXT NOT NULL DEFAULT 'Other',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      original_shift TEXT NOT NULL,
      current_shift TEXT NOT NULL,
      assigned_user TEXT,
      due_date TEXT,
      last_updated_by TEXT NOT NULL,
      last_updated_at TEXT NOT NULL,
      completed_at TEXT,
      completed_by TEXT,
      completion_note TEXT,
      cancellation_reason TEXT,
      blocked_reason TEXT,
      carry_over_reason TEXT,
      handover_state TEXT NOT NULL DEFAULT 'None',
      version INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS task_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      task_code TEXT NOT NULL,
      action TEXT NOT NULL,
      user_name TEXT NOT NULL,
      shift TEXT NOT NULL,
      previous_status TEXT,
      new_status TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS handovers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_shift TEXT NOT NULL,
      to_shift TEXT NOT NULL,
      shift_date TEXT NOT NULL,
      closed_by TEXT NOT NULL,
      closed_at TEXT NOT NULL,
      acknowledged_by TEXT,
      acknowledged_at TEXT,
      general_notes TEXT,
      tasks_completed_count INTEGER DEFAULT 0,
      tasks_carried_over_count INTEGER DEFAULT 0,
      tasks_blocked_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS handover_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      handover_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      task_code TEXT NOT NULL,
      task_title TEXT NOT NULL,
      disposition TEXT NOT NULL CHECK (disposition IN ('Completed', 'Carried Over', 'Blocked')),
      notes TEXT,
      FOREIGN KEY (handover_id) REFERENCES handovers(id) ON DELETE CASCADE,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      ip_address TEXT
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      color TEXT NOT NULL DEFAULT '#0F4C81'
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      role TEXT NOT NULL,
      selected_shift TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_code ON tasks(task_code);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_shift ON tasks(current_shift);
    CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
    CREATE INDEX IF NOT EXISTS idx_task_history_task ON task_history(task_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
  `);

  // Ensure selected_shift column exists if table was created previously
  try {
    db.exec('ALTER TABLE sessions ADD COLUMN selected_shift TEXT;');
  } catch {
    // Ignore error if column already exists
  }

  // Ensure email column exists on users table
  try {
    db.exec('ALTER TABLE users ADD COLUMN email TEXT;');
  } catch {
    // Ignore error if column already exists
  }

  // Ensure recovery columns exist on settings table
  try {
    db.exec("ALTER TABLE settings ADD COLUMN admin_recovery_email TEXT DEFAULT 'hossamhalawany@gmail.com';");
  } catch {
    // Ignore error if column already exists
  }
  try {
    db.exec("ALTER TABLE settings ADD COLUMN admin_recovery_pin TEXT DEFAULT '748291';");
  } catch {
    // Ignore error if column already exists
  }
  try {
    db.exec("ALTER TABLE settings ADD COLUMN smtp_host TEXT;");
  } catch {
    // Ignore
  }
  try {
    db.exec("ALTER TABLE settings ADD COLUMN smtp_port INTEGER DEFAULT 587;");
  } catch {
    // Ignore
  }
  try {
    db.exec("ALTER TABLE settings ADD COLUMN smtp_user TEXT;");
  } catch {
    // Ignore
  }
  try {
    db.exec("ALTER TABLE settings ADD COLUMN smtp_pass TEXT;");
  } catch {
    // Ignore
  }
  try {
    db.exec("ALTER TABLE settings ADD COLUMN smtp_from TEXT;");
  } catch {
    // Ignore
  }
  try {
    db.exec("ALTER TABLE settings ADD COLUMN admin_recovery_key_hash TEXT;");
  } catch {
    // Ignore
  }
  try {
    db.exec("ALTER TABLE settings ADD COLUMN admin_totp_secret TEXT;");
  } catch {
    // Ignore
  }
  try {
    db.exec("ALTER TABLE settings ADD COLUMN admin_totp_enabled INTEGER DEFAULT 0;");
  } catch {
    // Ignore
  }

  // Ensure admin user has recovery email set
  try {
    db.prepare("UPDATE users SET email = 'hossamhalawany@gmail.com' WHERE role = 'ADMIN' AND (email IS NULL OR email = '')").run();
  } catch {
    // Ignore
  }

  // Seed default categories if not present
  const catCount = db.prepare('SELECT COUNT(*) as count FROM categories').get() as { count: number };
  if (catCount.count === 0) {
    const insertCat = db.prepare('INSERT INTO categories (name, color) VALUES (?, ?)');
    const defaultCats = [
      ['Incident', '#DC3545'],
      ['Monitoring', '#F0AD4E'],
      ['Application', '#0F4C81'],
      ['Infrastructure', '#16324F'],
      ['Database', '#6f42c1'],
      ['Request', '#198754'],
      ['Other', '#6c757d']
    ];
    for (const [name, color] of defaultCats) {
      insertCat.run(name, color);
    }
  }

  // Ensure default settings row exists
  const settingsRow = db.prepare('SELECT id FROM settings WHERE id = 1').get();
  if (!settingsRow) {
    db.prepare(`
      INSERT INTO settings (id, team_name, app_name, timezone, installed)
      VALUES (1, 'Operations & IT Team', 'Shift Handover', 'Africa/Cairo', 0)
    `).run();
  }
}

export function logAudit(userName: string, action: string, entityType: string, entityId: string | null = null, details: string | null = null, ipAddress: string | null = null) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (created_at, user_name, action, entity_type, entity_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(new Date().toISOString(), userName, action, entityType, entityId, details, ipAddress || '127.0.0.1');
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}

export function getNextTaskCode(): string {
  const result = db.prepare(`SELECT MAX(id) as max_id FROM tasks`).get() as { max_id: number | null };
  const nextNumber = (result?.max_id || 0) + 1;
  return `TASK-${String(nextNumber).padStart(6, '0')}`;
}

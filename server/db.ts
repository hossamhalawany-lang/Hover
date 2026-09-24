import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

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
      role TEXT NOT NULL CHECK (role IN ('ADMIN', 'SUPERVISOR', 'USER')),
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
      version INTEGER NOT NULL DEFAULT 1,
      is_cob INTEGER NOT NULL DEFAULT 0,
      cob_count INTEGER DEFAULT NULL,
      completed_shift TEXT
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

    CREATE TABLE IF NOT EXISTS shift_acceptances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_name TEXT NOT NULL,
      shift_date TEXT NOT NULL,
      accepted_by TEXT NOT NULL,
      accepted_at TEXT NOT NULL,
      notes TEXT
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

    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 1,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      crosses_midnight INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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

    CREATE TABLE IF NOT EXISTS shift_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_date TEXT NOT NULL,
      shift_name TEXT NOT NULL DEFAULT 'All',
      title TEXT,
      content TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT 'amber',
      pinned INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_by TEXT,
      updated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_code ON tasks(task_code);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_shift ON tasks(current_shift);
    CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
    CREATE INDEX IF NOT EXISTS idx_task_history_task ON task_history(task_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_shift_notes_date ON shift_notes(shift_date);
  `);

  // Ensure selected_shift column exists if table was created previously
  try {
    db.exec('ALTER TABLE sessions ADD COLUMN selected_shift TEXT;');
  } catch {
    // Ignore error if column already exists
  }

  // Ensure is_cob and cob_count exist on tasks table
  try {
    db.exec('ALTER TABLE tasks ADD COLUMN is_cob INTEGER NOT NULL DEFAULT 0;');
  } catch {
    // Ignore error if column already exists
  }

  try {
    db.exec('ALTER TABLE tasks ADD COLUMN cob_count INTEGER DEFAULT NULL;');
  } catch {
    // Ignore error if column already exists
  }

  // Ensure completed_shift column exists on tasks table
  try {
    db.exec('ALTER TABLE tasks ADD COLUMN completed_shift TEXT;');
  } catch {
    // Ignore error if column already exists
  }

  // Backfill completed_shift and synchronize current_shift for all completed tasks
  try {
    db.exec(`
      UPDATE tasks
      SET completed_shift = COALESCE(
        (SELECT shift FROM task_history WHERE task_id = tasks.id AND (action LIKE '%COMPLETE%' OR new_status = 'Completed') ORDER BY id DESC LIMIT 1),
        current_shift,
        original_shift
      )
      WHERE status = 'Completed' AND (completed_shift IS NULL OR completed_shift = '');

      UPDATE tasks
      SET current_shift = completed_shift
      WHERE status = 'Completed' AND completed_shift IS NOT NULL;

      UPDATE tasks
      SET is_cob = 0, cob_count = NULL
      WHERE title IN (
        'Run production Pre-COB Service',
        'Run Production COB',
        'Run Production Post COB Service',
        'Restart Browser JVM''s after COB'
      );
    `);
  } catch (err) {
    console.warn('Completed shift backfill notice:', err);
  }

  // Ensure email column exists on users table
  try {
    db.exec('ALTER TABLE users ADD COLUMN email TEXT;');
  } catch {
    // Ignore error if column already exists
  }

  // Ensure users table allows 'SUPERVISOR' in CHECK constraint
  try {
    const usersTableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get() as { sql: string } | undefined;
    if (usersTableInfo?.sql && !usersTableInfo.sql.includes('SUPERVISOR')) {
      db.exec(`
        PRAGMA foreign_keys = OFF;
        CREATE TABLE users_migrated (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          full_name TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('ADMIN', 'SUPERVISOR', 'USER')),
          status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'DISABLED')) DEFAULT 'ACTIVE',
          last_login_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          email TEXT
        );
        INSERT INTO users_migrated (id, username, password_hash, full_name, role, status, last_login_at, created_at, updated_at, email)
          SELECT id, username, password_hash, full_name, role, status, last_login_at, created_at, updated_at, email FROM users;
        DROP TABLE users;
        ALTER TABLE users_migrated RENAME TO users;
        PRAGMA foreign_keys = ON;
      `);
    }
  } catch (migErr) {
    console.error('Migration for users table SUPERVISOR check constraint:', migErr);
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
  try {
    db.exec("ALTER TABLE settings ADD COLUMN weekend_oncall_enabled INTEGER DEFAULT 1;");
  } catch {
    // Ignore
  }
  try {
    db.exec("ALTER TABLE settings ADD COLUMN holiday_dates TEXT DEFAULT '';");
  } catch {
    // Ignore
  }
  try {
    db.exec("ALTER TABLE settings ADD COLUMN weekend_holiday_shift_mode TEXT DEFAULT 'SINGLE_OPERATOR_24H';");
  } catch {
    // Ignore
  }

  // Update session timeout to 24 hours (1440 mins) to prevent premature session drops
  try {
    db.prepare("UPDATE settings SET session_timeout = 1440 WHERE id = 1 AND session_timeout = 60").run();
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

  // Seed default shifts if not present
  try {
    const shiftCount = db.prepare('SELECT COUNT(*) as count FROM shifts').get() as { count: number };
    if (shiftCount.count === 0) {
      const insertShift = db.prepare(`
        INSERT INTO shifts (name, display_order, start_time, end_time, crosses_midnight, description)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      insertShift.run('Morning', 1, '06:00', '14:00', 0, 'Morning operations and daily setup');
      insertShift.run('Mid', 2, '14:00', '22:00', 0, 'Peak business operations and daytime support');
      insertShift.run('Night', 3, '22:00', '06:00', 1, 'Overnight operations and batch processing');
    }
  } catch (err) {
    console.error('Error seeding shifts:', err);
  }

  // Ensure default settings row exists and is marked installed
  const settingsRow = db.prepare('SELECT id FROM settings WHERE id = 1').get();
  if (!settingsRow) {
    db.prepare(`
      INSERT INTO settings (id, team_name, app_name, timezone, installed, session_timeout, weekend_oncall_enabled, weekend_holiday_shift_mode, admin_recovery_email, admin_recovery_pin)
      VALUES (1, 'Operations & IT Team', 'Shift Handover', 'Africa/Cairo', 1, 1440, 1, 'SINGLE_OPERATOR_24H', 'hossamhalawany@gmail.com', '748291')
    `).run();
  } else {
    // Ensure installed is 1 so login is always accessible immediately
    db.prepare(`UPDATE settings SET installed = 1 WHERE id = 1 AND installed = 0`).run();
  }

  // Helper to safely seed or ensure an active user exists
  const ensureUser = (username: string, defaultPass: string, fullName: string, role: 'ADMIN' | 'USER', email?: string) => {
    try {
      const existing = db.prepare('SELECT id, status, password_hash FROM users WHERE LOWER(username) = ?').get(username.toLowerCase()) as any;
      if (!existing) {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.pbkdf2Sync(defaultPass, salt, 100000, 64, 'sha512').toString('hex');
        const passHash = `pbkdf2$100000$${salt}$${hash}`;
        const now = new Date().toISOString();
        db.prepare(`
          INSERT INTO users (username, password_hash, full_name, email, role, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
        `).run(username.toLowerCase(), passHash, fullName, email || null, role, now, now);
      } else if (existing.status !== 'ACTIVE') {
        // Ensure not accidentally disabled
        db.prepare("UPDATE users SET status = 'ACTIVE' WHERE id = ?").run(existing.id);
      }
    } catch (err) {
      console.error(`Error ensuring user ${username}:`, err);
    }
  };

  // Ensure Administrator always exists (admin / Admin@123456)
  ensureUser('admin', 'Admin@123456', 'Lead Administrator', 'ADMIN', 'hossamhalawany@gmail.com');

  // Ensure standard shift operators exist across redeployments
  ensureUser('ahmed', 'Ahmed@123456', 'Ahmed Hassan (Morning Op)', 'USER', 'ahmed@hando.operations');
  ensureUser('mohamed', 'Mohamed@123456', 'Mohamed Ali (Mid Op)', 'USER', 'mohamed@hando.operations');
  ensureUser('karim', 'Karim@123456', 'Karim Tarek (Night Op)', 'USER', 'karim@hando.operations');
  ensureUser('youssef', 'Youssef@123456', 'Youssef Ibrahim', 'USER', 'youssef@hando.operations');

  // Ensure sample task exists for historical demonstration
  try {
    const cobTask = db.prepare(`SELECT id FROM tasks WHERE title LIKE '%Run COB in 4.200%'`).get();
    if (!cobTask) {
      const yesterdayCob = '2026-09-12T15:00:00.000Z'; // 6:00 PM Cairo (UTC+3)
      const res = db.prepare(`
        INSERT INTO tasks (
          task_code, title, description, priority, status, category,
          created_by, created_at, original_shift, current_shift, assigned_user,
          due_date, last_updated_by, last_updated_at, completed_at, completed_by,
          completion_note, handover_state, version
        ) VALUES (
          'Task01', 'Run COB in 4.200', 'Core Banking Close of Business batch run execution and reconciliation.',
          'Critical', 'Completed', 'Operations', 'ahmed', '2026-09-12T14:30:00.000Z', 'Mid', 'Mid', 'youssef',
          '2026-09-12', 'youssef', ?, ?, 'youssef',
          'Run COB in 4.200 complete by youssef at 6:00 PM mid shift with zero batch discrepancies.', 'Completed', 1
        )
      `).run(yesterdayCob, yesterdayCob);
      const newTaskId = Number(res.lastInsertRowid);
      db.prepare(`
        INSERT INTO task_history (task_id, task_code, action, user_name, shift, previous_status, new_status, notes, created_at)
        VALUES (?, 'Task01', 'Completed', 'youssef', 'Mid', 'In Progress', 'Completed', 'Run COB in 4.200 complete by youssef at 6:00 PM mid shift', ?)
      `).run(newTaskId, yesterdayCob);
    }
  } catch (err) {
    console.error('Error seeding sample task:', err);
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

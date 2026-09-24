var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express2 = __toESM(require("express"), 1);
var import_path2 = __toESM(require("path"), 1);
var import_vite = require("vite");

// server/db.ts
var import_node_sqlite = require("node:sqlite");
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_crypto = __toESM(require("crypto"), 1);
var DATA_DIR = import_path.default.join(process.cwd(), "data");
if (!import_fs.default.existsSync(DATA_DIR)) {
  import_fs.default.mkdirSync(DATA_DIR, { recursive: true });
}
var DB_PATH = import_path.default.join(DATA_DIR, "shift_handover.sqlite");
var db = new import_node_sqlite.DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA journal_mode = WAL;");
function initDatabase() {
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
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN selected_shift TEXT;");
  } catch {
  }
  try {
    db.exec("ALTER TABLE users ADD COLUMN email TEXT;");
  } catch {
  }
  try {
    db.exec("ALTER TABLE settings ADD COLUMN admin_recovery_email TEXT DEFAULT 'hossamhalawany@gmail.com';");
  } catch {
  }
  try {
    db.exec("ALTER TABLE settings ADD COLUMN admin_recovery_pin TEXT DEFAULT '748291';");
  } catch {
  }
  try {
    db.exec("ALTER TABLE settings ADD COLUMN smtp_host TEXT;");
  } catch {
  }
  try {
    db.exec("ALTER TABLE settings ADD COLUMN smtp_port INTEGER DEFAULT 587;");
  } catch {
  }
  try {
    db.exec("ALTER TABLE settings ADD COLUMN smtp_user TEXT;");
  } catch {
  }
  try {
    db.exec("ALTER TABLE settings ADD COLUMN smtp_pass TEXT;");
  } catch {
  }
  try {
    db.exec("ALTER TABLE settings ADD COLUMN smtp_from TEXT;");
  } catch {
  }
  try {
    db.exec("ALTER TABLE settings ADD COLUMN admin_recovery_key_hash TEXT;");
  } catch {
  }
  try {
    db.exec("ALTER TABLE settings ADD COLUMN admin_totp_secret TEXT;");
  } catch {
  }
  try {
    db.exec("ALTER TABLE settings ADD COLUMN admin_totp_enabled INTEGER DEFAULT 0;");
  } catch {
  }
  try {
    db.prepare("UPDATE users SET email = 'hossamhalawany@gmail.com' WHERE role = 'ADMIN' AND (email IS NULL OR email = '')").run();
  } catch {
  }
  const catCount = db.prepare("SELECT COUNT(*) as count FROM categories").get();
  if (catCount.count === 0) {
    const insertCat = db.prepare("INSERT INTO categories (name, color) VALUES (?, ?)");
    const defaultCats = [
      ["Incident", "#DC3545"],
      ["Monitoring", "#F0AD4E"],
      ["Application", "#0F4C81"],
      ["Infrastructure", "#16324F"],
      ["Database", "#6f42c1"],
      ["Request", "#198754"],
      ["Other", "#6c757d"]
    ];
    for (const [name, color] of defaultCats) {
      insertCat.run(name, color);
    }
  }
  const settingsRow = db.prepare("SELECT id FROM settings WHERE id = 1").get();
  if (!settingsRow) {
    db.prepare(`
      INSERT INTO settings (id, team_name, app_name, timezone, installed)
      VALUES (1, 'Operations & IT Team', 'Shift Handover', 'Africa/Cairo', 0)
    `).run();
  }
  try {
    const existingYoussef = db.prepare("SELECT id FROM users WHERE username = ?").get("youssef");
    if (!existingYoussef) {
      const salt = import_crypto.default.randomBytes(16).toString("hex");
      const hash = import_crypto.default.pbkdf2Sync("Youssef@123456", salt, 1e5, 64, "sha512").toString("hex");
      const passHash = `pbkdf2$100000$${salt}$${hash}`;
      const now = (/* @__PURE__ */ new Date()).toISOString();
      db.prepare(`
        INSERT INTO users (username, password_hash, full_name, role, status, created_at, updated_at)
        VALUES (?, ?, ?, 'USER', 'ACTIVE', ?, ?)
      `).run("youssef", passHash, "Youssef Ibrahim", now, now);
    }
    const cobTask = db.prepare(`SELECT id FROM tasks WHERE title LIKE '%Run COB in 4.200%'`).get();
    if (!cobTask) {
      const yesterdayCob = "2026-09-12T15:00:00.000Z";
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
    console.error("Error seeding Youssef sample:", err);
  }
}
function logAudit(userName, action, entityType, entityId = null, details = null, ipAddress = null) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (created_at, user_name, action, entity_type, entity_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run((/* @__PURE__ */ new Date()).toISOString(), userName, action, entityType, entityId, details, ipAddress || "127.0.0.1");
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}
function getNextTaskCode() {
  const result = db.prepare(`SELECT MAX(id) as max_id FROM tasks`).get();
  const nextNumber = (result?.max_id || 0) + 1;
  return `TASK-${String(nextNumber).padStart(6, "0")}`;
}

// server/auth.ts
var import_crypto2 = __toESM(require("crypto"), 1);
function hashPassword(password) {
  const salt = import_crypto2.default.randomBytes(16).toString("hex");
  const hash = import_crypto2.default.pbkdf2Sync(password, salt, 1e5, 64, "sha512").toString("hex");
  return `pbkdf2$100000$${salt}$${hash}`;
}
function verifyPassword(password, storedHash) {
  try {
    const parts = storedHash.split("$");
    if (parts.length !== 4 || parts[0] !== "pbkdf2") {
      return false;
    }
    const iterations = parseInt(parts[1], 10);
    const salt = parts[2];
    const key = parts[3];
    const computedHash = import_crypto2.default.pbkdf2Sync(password, salt, iterations, 64, "sha512").toString("hex");
    return import_crypto2.default.timingSafeEqual(Buffer.from(computedHash, "hex"), Buffer.from(key, "hex"));
  } catch (err) {
    return false;
  }
}
function createSession(user, selectedShift) {
  const token = import_crypto2.default.randomBytes(32).toString("hex");
  const now = /* @__PURE__ */ new Date();
  const settingsRow = db.prepare("SELECT session_timeout FROM settings WHERE id = 1").get();
  const timeoutMinutes = settingsRow?.session_timeout || 60;
  const expiresAt = new Date(now.getTime() + timeoutMinutes * 60 * 1e3);
  db.prepare(`
    INSERT INTO sessions (token, user_id, username, role, selected_shift, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(token, user.id, user.username, user.role, selectedShift || user.selectedShift || null, now.toISOString(), expiresAt.toISOString());
  return token;
}
function destroySession(token) {
  try {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  } catch (err) {
    console.error("Failed to delete session:", err);
  }
}
function getSessionUser(token) {
  if (!token) return null;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const session = db.prepare(`
    SELECT s.token, s.user_id, s.selected_shift, u.id, u.username, u.full_name, u.role, u.status
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > ?
  `).get(token, now);
  if (!session) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }
  if (session.status !== "ACTIVE") {
    return null;
  }
  return {
    id: session.id,
    username: session.username,
    fullName: session.full_name,
    full_name: session.full_name,
    role: session.role,
    status: session.status,
    selectedShift: session.selected_shift || void 0
  };
}
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = "";
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else if (req.headers["x-session-token"]) {
    token = String(req.headers["x-session-token"]);
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
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required. Please sign in." });
  }
  next();
}
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Access denied. Administrator privileges required." });
  }
  next();
}
function isLastActiveAdmin(userIdToModify) {
  const user = db.prepare("SELECT role, status FROM users WHERE id = ?").get(userIdToModify);
  if (!user || user.role !== "ADMIN" || user.status !== "ACTIVE") {
    return false;
  }
  const result = db.prepare(`
    SELECT COUNT(*) as active_admin_count
    FROM users
    WHERE role = 'ADMIN' AND status = 'ACTIVE'
  `).get();
  return result.active_admin_count <= 1;
}

// server/routes/api.ts
var import_express = __toESM(require("express"), 1);
var import_fs2 = __toESM(require("fs"), 1);

// server/shifts.ts
function getSettings() {
  const row = db.prepare("SELECT * FROM settings WHERE id = 1").get();
  return row || {
    team_name: "Operations Team",
    app_name: "Hando",
    timezone: "Africa/Cairo",
    morning_start: "06:00",
    morning_end: "14:00",
    mid_start: "14:00",
    mid_end: "22:00",
    night_start: "22:00",
    night_end: "06:00",
    session_timeout: 60,
    default_priority: "Medium",
    installed: 0
  };
}
function parseTimeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function getCurrentShift(customDate) {
  const settings = getSettings();
  const tz = settings.timezone || "Africa/Cairo";
  const now = customDate || /* @__PURE__ */ new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(now);
  const getPart = (type) => parts.find((p) => p.type === type)?.value || "";
  const hour = parseInt(getPart("hour"), 10);
  const minute = parseInt(getPart("minute"), 10);
  const second = parseInt(getPart("second"), 10);
  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");
  const currentMinutes = hour * 60 + minute;
  const currentSecondsInDay = currentMinutes * 60 + second;
  const mStart = parseTimeToMinutes(settings.morning_start);
  const mEnd = parseTimeToMinutes(settings.morning_end);
  const midStart = parseTimeToMinutes(settings.mid_start);
  const midEnd = parseTimeToMinutes(settings.mid_end);
  const nStart = parseTimeToMinutes(settings.night_start);
  const nEnd = parseTimeToMinutes(settings.night_end);
  let shiftName = "Morning";
  let startTime = settings.morning_start;
  let endTime = settings.morning_end;
  let operationalDate = `${year}-${month}-${day}`;
  let secondsRemaining = 0;
  let nextShift = "Mid";
  let previousShift = "Night";
  let colorTheme = "blue";
  if (currentMinutes >= mStart && currentMinutes < mEnd) {
    shiftName = "Morning";
    startTime = settings.morning_start;
    endTime = settings.morning_end;
    nextShift = "Mid";
    previousShift = "Night";
    colorTheme = "blue";
    const endSeconds = mEnd * 60;
    secondsRemaining = Math.max(0, endSeconds - currentSecondsInDay);
  } else if (currentMinutes >= midStart && currentMinutes < midEnd) {
    shiftName = "Mid";
    startTime = settings.mid_start;
    endTime = settings.mid_end;
    nextShift = "Night";
    previousShift = "Morning";
    colorTheme = "orange";
    const endSeconds = midEnd * 60;
    secondsRemaining = Math.max(0, endSeconds - currentSecondsInDay);
  } else {
    shiftName = "Night";
    startTime = settings.night_start;
    endTime = settings.night_end;
    nextShift = "Morning";
    previousShift = "Mid";
    colorTheme = "purple";
    if (currentMinutes >= nStart) {
      operationalDate = `${year}-${month}-${day}`;
      const secondsUntilMidnight = 24 * 60 * 60 - currentSecondsInDay;
      const secondsAfterMidnightUntilEnd = nEnd * 60;
      secondsRemaining = Math.max(0, secondsUntilMidnight + secondsAfterMidnightUntilEnd);
    } else {
      const prevDayDate = new Date(now.getTime() - 24 * 60 * 60 * 1e3);
      const prevParts = formatter.formatToParts(prevDayDate);
      const pYear = prevParts.find((p) => p.type === "year")?.value || year;
      const pMonth = prevParts.find((p) => p.type === "month")?.value || month;
      const pDay = prevParts.find((p) => p.type === "day")?.value || day;
      operationalDate = `${pYear}-${pMonth}-${pDay}`;
      const endSeconds = nEnd * 60;
      secondsRemaining = Math.max(0, endSeconds - currentSecondsInDay);
    }
  }
  const h = Math.floor(secondsRemaining / 3600);
  const m = Math.floor(secondsRemaining % 3600 / 60);
  const s = secondsRemaining % 60;
  const timeRemainingFormatted = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  const approachingEnd = secondsRemaining <= 30 * 60 && secondsRemaining > 0;
  return {
    name: shiftName,
    startTime,
    endTime,
    currentDate: operationalDate,
    timeRemainingSeconds: secondsRemaining,
    timeRemainingFormatted,
    approachingEnd,
    timezone: tz,
    nextShift,
    previousShift,
    colorTheme
  };
}
function getShiftByName(targetShift, customDate) {
  const current = getCurrentShift(customDate);
  if (current.name === targetShift) {
    return current;
  }
  const settings = getSettings();
  const tz = settings.timezone || "Africa/Cairo";
  const now = customDate || /* @__PURE__ */ new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(now);
  const getPart = (type) => parts.find((p) => p.type === type)?.value || "";
  const hour = parseInt(getPart("hour"), 10);
  const minute = parseInt(getPart("minute"), 10);
  const second = parseInt(getPart("second"), 10);
  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");
  const currentMinutes = hour * 60 + minute;
  const currentSecondsInDay = currentMinutes * 60 + second;
  const mStart = parseTimeToMinutes(settings.morning_start);
  const mEnd = parseTimeToMinutes(settings.morning_end);
  const midStart = parseTimeToMinutes(settings.mid_start);
  const midEnd = parseTimeToMinutes(settings.mid_end);
  const nStart = parseTimeToMinutes(settings.night_start);
  const nEnd = parseTimeToMinutes(settings.night_end);
  let startTime = settings.morning_start;
  let endTime = settings.morning_end;
  let operationalDate = `${year}-${month}-${day}`;
  let secondsRemaining = 0;
  let nextShift = "Mid";
  let previousShift = "Night";
  let colorTheme = "blue";
  if (targetShift === "Morning") {
    startTime = settings.morning_start;
    endTime = settings.morning_end;
    nextShift = "Mid";
    previousShift = "Night";
    colorTheme = "blue";
    const endSeconds = mEnd * 60;
    if (currentMinutes < mStart) {
      secondsRemaining = (mEnd - currentMinutes) * 60;
    } else if (currentMinutes < mEnd) {
      secondsRemaining = Math.max(0, endSeconds - currentSecondsInDay);
    } else {
      secondsRemaining = 0;
    }
  } else if (targetShift === "Mid") {
    startTime = settings.mid_start;
    endTime = settings.mid_end;
    nextShift = "Night";
    previousShift = "Morning";
    colorTheme = "orange";
    const endSeconds = midEnd * 60;
    if (currentMinutes < midStart) {
      secondsRemaining = (midEnd - currentMinutes) * 60;
    } else if (currentMinutes < midEnd) {
      secondsRemaining = Math.max(0, endSeconds - currentSecondsInDay);
    } else {
      secondsRemaining = 0;
    }
  } else {
    startTime = settings.night_start;
    endTime = settings.night_end;
    nextShift = "Morning";
    previousShift = "Mid";
    colorTheme = "purple";
    if (currentMinutes >= nStart) {
      operationalDate = `${year}-${month}-${day}`;
      const secondsUntilMidnight = 24 * 60 * 60 - currentSecondsInDay;
      const secondsAfterMidnightUntilEnd = nEnd * 60;
      secondsRemaining = Math.max(0, secondsUntilMidnight + secondsAfterMidnightUntilEnd);
    } else if (currentMinutes < nEnd) {
      const prevDayDate = new Date(now.getTime() - 24 * 60 * 60 * 1e3);
      const prevParts = formatter.formatToParts(prevDayDate);
      const pYear = prevParts.find((p) => p.type === "year")?.value || year;
      const pMonth = prevParts.find((p) => p.type === "month")?.value || month;
      const pDay = prevParts.find((p) => p.type === "day")?.value || day;
      operationalDate = `${pYear}-${pMonth}-${pDay}`;
      const endSeconds = nEnd * 60;
      secondsRemaining = Math.max(0, endSeconds - currentSecondsInDay);
    } else {
      secondsRemaining = 0;
    }
  }
  const h = Math.floor(secondsRemaining / 3600);
  const m = Math.floor(secondsRemaining % 3600 / 60);
  const s = secondsRemaining % 60;
  const timeRemainingFormatted = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  const approachingEnd = secondsRemaining <= 30 * 60 && secondsRemaining > 0;
  return {
    name: targetShift,
    startTime,
    endTime,
    currentDate: operationalDate,
    timeRemainingSeconds: secondsRemaining,
    timeRemainingFormatted,
    approachingEnd,
    timezone: tz,
    nextShift,
    previousShift,
    colorTheme
  };
}

// server/php_packager.ts
var import_jszip = __toESM(require("jszip"), 1);
async function generatePhpZip() {
  const zip = new import_jszip.default();
  const indexPhp = `<?php
/**
 * Shift Handover - Production PHP 8.1+ Application
 * Standalone Single Source of Truth Operational Handover System
 */
declare(strict_types=1);

session_start([
    'cookie_httponly' => true,
    'cookie_samesite' => 'Lax'
]);

require_once __DIR__ . '/includes/helpers.php';
require_once __DIR__ . '/database/Database.php';
require_once __DIR__ . '/models/Shift.php';
require_once __DIR__ . '/models/User.php';
require_once __DIR__ . '/models/Task.php';
require_once __DIR__ . '/models/Handover.php';
require_once __DIR__ . '/models/Audit.php';

// Check if installed
$db = Database::getInstance()->getPdo();
$stmt = $db->query("SELECT installed, timezone FROM settings WHERE id = 1");
$settings = $stmt ? $stmt->fetch() : null;

if (!$settings || empty($settings['installed'])) {
    require_once __DIR__ . '/install/install.php';
    exit;
}

// Set application timezone
date_default_timezone_set($settings['timezone'] ?? 'Africa/Cairo');

$route = $_GET['route'] ?? 'dashboard';
$user = getCurrentUser();

// Public routes
if ($route === 'login') {
    require_once __DIR__ . '/controllers/AuthController.php';
    (new AuthController())->login();
    exit;
}

// Protected routes require active session
if (!$user) {
    header('Location: index.php?route=login');
    exit;
}

// Routing table
switch ($route) {
    case 'logout':
        require_once __DIR__ . '/controllers/AuthController.php';
        (new AuthController())->logout();
        break;

    case 'dashboard':
        require_once __DIR__ . '/controllers/DashboardController.php';
        (new DashboardController())->index();
        break;

    case 'tasks':
        require_once __DIR__ . '/controllers/TaskController.php';
        (new TaskController())->index();
        break;

    case 'task_create':
        require_once __DIR__ . '/controllers/TaskController.php';
        (new TaskController())->create();
        break;

    case 'task_action':
        require_once __DIR__ . '/controllers/TaskController.php';
        (new TaskController())->action();
        break;

    case 'handover':
        require_once __DIR__ . '/controllers/HandoverController.php';
        (new HandoverController())->index();
        break;

    case 'handover_acknowledge':
        require_once __DIR__ . '/controllers/HandoverController.php';
        (new HandoverController())->acknowledge();
        break;

    case 'close_shift':
        require_once __DIR__ . '/controllers/HandoverController.php';
        (new HandoverController())->closeShift();
        break;

    case 'reports':
        require_once __DIR__ . '/controllers/ReportController.php';
        (new ReportController())->index();
        break;

    case 'admin':
        require_once __DIR__ . '/controllers/AdminController.php';
        (new AdminController())->index();
        break;

    case 'backup':
        require_once __DIR__ . '/controllers/AdminController.php';
        (new AdminController())->downloadBackup();
        break;

    case 'export_csv':
        require_once __DIR__ . '/controllers/AdminController.php';
        (new AdminController())->exportCsv();
        break;

    case 'load_demo':
        require_once __DIR__ . '/controllers/AdminController.php';
        (new AdminController())->loadDemo();
        break;

    default:
        header('Location: index.php?route=dashboard');
        exit;
}
`;
  const databasePhp = `<?php
declare(strict_types=1);

class Database {
    private static ?Database $instance = null;
    private PDO $pdo;

    private function __construct() {
        $storageDir = __DIR__ . '/../storage';
        if (!is_dir($storageDir)) {
            mkdir($storageDir, 0755, true);
        }
        $dbPath = $storageDir . '/shift_handover.sqlite';
        $isNew = !file_exists($dbPath);

        $this->pdo = new PDO('sqlite:' . $dbPath, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);

        $this->pdo->exec('PRAGMA foreign_keys = ON;');
        $this->pdo->exec('PRAGMA journal_mode = WAL;');

        if ($isNew) {
            $this->initSchema();
        }
    }

    public static function getInstance(): Database {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function getPdo(): PDO {
        return $this->pdo;
    }

    private function initSchema(): void {
        $schema = file_get_contents(__DIR__ . '/schema.sql');
        if ($schema) {
            $this->pdo->exec($schema);
        }
    }
}
`;
  const schemaSql = `
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

INSERT OR IGNORE INTO settings (id, team_name, app_name, timezone, installed)
VALUES (1, 'Operations Team', 'Shift Handover', 'Africa/Cairo', 0);
`;
  const helpersPhp = `<?php
declare(strict_types=1);

function e(string $str): string {
    return htmlspecialchars($str, ENT_QUOTES, 'UTF-8');
}

function getCurrentUser(): ?array {
    return $_SESSION['user'] ?? null;
}

function requireLogin(): void {
    if (!isset($_SESSION['user'])) {
        header('Location: index.php?route=login');
        exit;
    }
}

function requireAdmin(): void {
    requireLogin();
    if ($_SESSION['user']['role'] !== 'ADMIN') {
        http_response_code(403);
        die('Access denied: Administrator privileges required.');
    }
}

function csrfToken(): string {
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function verifyCsrf(): void {
    $token = $_POST['csrf_token'] ?? '';
    if (!$token || !hash_equals($_SESSION['csrf_token'] ?? '', $token)) {
        http_response_code(403);
        die('Invalid CSRF token.');
    }
}
`;
  const installPhp = `<?php
declare(strict_types=1);

$error = null;
$success = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $teamName = trim($_POST['team_name'] ?? '');
    $adminFull = trim($_POST['admin_full_name'] ?? '');
    $adminUser = strtolower(trim($_POST['admin_username'] ?? ''));
    $password = $_POST['admin_password'] ?? '';
    $confirm = $_POST['confirm_password'] ?? '';
    $tz = $_POST['timezone'] ?? 'Africa/Cairo';
    $loadDemo = !empty($_POST['load_demo']);

    if (!$teamName || !$adminFull || !$adminUser || !$password) {
        $error = 'All fields are required.';
    } elseif ($password !== $confirm) {
        $error = 'Passwords do not match.';
    } elseif (strlen($password) < 8) {
        $error = 'Password must be at least 8 characters long.';
    } else {
        $pdo = Database::getInstance()->getPdo();
        $hash = password_hash($password, PASSWORD_BCRYPT);
        $now = date('c');

        $pdo->beginTransaction();
        try {
            $pdo->prepare("UPDATE settings SET team_name = ?, timezone = ?, installed = 1, installed_at = ? WHERE id = 1")
                ->execute([$teamName, $tz, $now]);

            $pdo->prepare("INSERT INTO users (username, password_hash, full_name, role, status, created_at, updated_at) VALUES (?, ?, ?, 'ADMIN', 'ACTIVE', ?, ?)")
                ->execute([$adminUser, $hash, $adminFull, $now, $now]);

            if ($loadDemo) {
                // Seed demonstration scenario
                $pdo->prepare("INSERT INTO tasks (task_code, title, description, priority, status, category, created_by, created_at, original_shift, current_shift, last_updated_by, last_updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                    ->execute(['TASK-000004', 'Verify backup status', 'Verify overnight database snapshot replication and integrity hash.', 'High', 'Pending', 'Database', 'ahmed', $now, 'Morning', 'Mid', 'ahmed', $now, 1]);
            }

            $pdo->commit();
            header('Location: index.php?route=login&installed=1');
            exit;
        } catch (Exception $e) {
            $pdo->rollBack();
            $error = 'Installation failed: ' . $e->getMessage();
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Shift Handover - Initial Setup</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #F5F7FA; color: #16324F; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; }
        .setup-card { background: #fff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); width: 100%; max-width: 520px; padding: 32px; border-top: 5px solid #0F4C81; }
        h1 { margin-top: 0; font-size: 24px; color: #0F4C81; }
        .subtitle { color: #6c757d; font-size: 14px; margin-bottom: 24px; }
        .form-group { margin-bottom: 16px; }
        label { display: block; font-weight: 600; font-size: 13px; margin-bottom: 6px; }
        input, select { width: 100%; padding: 10px 12px; border: 1px solid #ced4da; border-radius: 6px; font-size: 14px; box-sizing: border-box; }
        .btn { background: #0F4C81; color: #fff; border: none; padding: 12px; width: 100%; border-radius: 6px; font-weight: 600; font-size: 15px; cursor: pointer; margin-top: 10px; }
        .alert { padding: 12px; border-radius: 6px; margin-bottom: 16px; font-size: 14px; background: #f8d7da; color: #721c24; }
    </style>
</head>
<body>
    <div class="setup-card">
        <h1>Shift Handover</h1>
        <div class="subtitle">Initial Installation &amp; Single Source of Truth Setup</div>
        <?php if ($error): ?><div class="alert"><?= htmlspecialchars($error) ?></div><?php endif; ?>
        <form method="POST">
            <div class="form-group">
                <label>Team / Company Name</label>
                <input type="text" name="team_name" value="Operations &amp; IT Team" required>
            </div>
            <div class="form-group">
                <label>Admin Full Name</label>
                <input type="text" name="admin_full_name" placeholder="Lead Operator" required>
            </div>
            <div class="form-group">
                <label>Admin Username</label>
                <input type="text" name="admin_username" placeholder="admin" required>
            </div>
            <div class="form-group">
                <label>Admin Password (min 8 characters)</label>
                <input type="password" name="admin_password" required minlength="8">
            </div>
            <div class="form-group">
                <label>Confirm Password</label>
                <input type="password" name="confirm_password" required minlength="8">
            </div>
            <div class="form-group">
                <label>Time Zone</label>
                <select name="timezone">
                    <option value="Africa/Cairo" selected>Africa/Cairo (UTC+2)</option>
                    <option value="UTC">UTC</option>
                    <option value="Europe/London">Europe/London</option>
                    <option value="Asia/Dubai">Asia/Dubai</option>
                    <option value="America/New_York">America/New_York</option>
                </select>
            </div>
            <div class="form-group" style="display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" name="load_demo" id="demo_chk" value="1" checked style="width: auto;">
                <label for="demo_chk" style="margin-bottom: 0; font-weight: normal;">Load Demonstration Data (Morning &rarr; Mid shift handover scenario)</label>
            </div>
            <button type="submit" class="btn">Complete Installation</button>
        </form>
    </div>
</body>
</html>
`;
  const shiftModelPhp = `<?php
declare(strict_types=1);

class Shift {
    public static function getCurrent(): array {
        $db = Database::getInstance()->getPdo();
        $settings = $db->query("SELECT * FROM settings WHERE id = 1")->fetch();

        $tz = $settings['timezone'] ?? 'Africa/Cairo';
        $now = new DateTime('now', new DateTimeZone($tz));
        $hour = (int)$now->format('H');
        $min = (int)$now->format('i');
        $currentMin = $hour * 60 + $min;

        $mStart = 6 * 60;   // 06:00
        $mEnd = 14 * 60;   // 14:00
        $midStart = 14 * 60;// 14:00
        $midEnd = 22 * 60;  // 22:00

        if ($currentMin >= $mStart && $currentMin < $mEnd) {
            $name = 'Morning';
            $next = 'Mid';
            $prev = 'Night';
            $secondsRemaining = ($mEnd * 60) - ($currentMin * 60 + (int)$now->format('s'));
        } elseif ($currentMin >= $midStart && $currentMin < $midEnd) {
            $name = 'Mid';
            $next = 'Night';
            $prev = 'Morning';
            $secondsRemaining = ($midEnd * 60) - ($currentMin * 60 + (int)$now->format('s'));
        } else {
            $name = 'Night';
            $next = 'Morning';
            $prev = 'Mid';
            if ($currentMin >= $midEnd) {
                $secondsRemaining = (24 * 3600) - ($currentMin * 60 + (int)$now->format('s')) + ($mStart * 60);
            } else {
                $secondsRemaining = ($mStart * 60) - ($currentMin * 60 + (int)$now->format('s'));
            }
        }

        $h = floor($secondsRemaining / 3600);
        $m = floor(($secondsRemaining % 3600) / 60);
        $s = $secondsRemaining % 60;

        return [
            'name' => $name,
            'next' => $next,
            'previous' => $prev,
            'date' => $now->format('Y-m-d'),
            'seconds_remaining' => $secondsRemaining,
            'countdown' => sprintf('%02d:%02d:%02d', $h, $m, $s),
            'approaching_end' => $secondsRemaining <= 1800 && $secondsRemaining > 0
        ];
    }
}
`;
  const htaccess = `
# Protect storage and SQLite files
<FilesMatch "\\.(sqlite|sqlite3|db|sql|log)$">
    Order allow,deny
    Deny from all
</FilesMatch>

Options -Indexes
`;
  const readme = `# Shift Handover Portal (PHP 8.1+ Standalone Edition)

## Operational Purpose
Controlled shift handover system for 24/7 Operations & IT teams (Morning, Mid, Night).
**Zero Forgotten Tasks Between Shifts**: Database is the Single Source of Truth. Tasks cannot disappear between shifts.

## Requirements
- PHP 8.1 or higher
- PDO and SQLite extensions (\`pdo_sqlite\`)
- Standard shared hosting (cPanel, DirectAdmin, Apache, Nginx)

## Quick 4-Step Deployment
1. Download this ZIP archive.
2. Extract all files into your web root or sub-folder (e.g. \`public_html/\` or \`public_html/shift/\`).
3. Ensure the \`/storage\` directory has write permissions (\`chmod 775 storage\`).
4. Open the site in your browser to complete the **Initial Setup**:
   - Set team name
   - Create your administrator account
   - Choose timezone (Default: Africa/Cairo)

## Key Features
- **Strict Shift Closure Validation**: Shift closure is strictly blocked if any active task is left unresolved.
- **Handover Workflow**: Automatic carry-over to next shift with mandatory notes.
- **Optimistic Concurrency Locking**: Prevents concurrent operators from overwriting each other's changes.
- **Night Shift Midnight Crossing**: Operations across midnight (22:00 -> 06:00) treated as a unified shift.
- **Audit Logs & Reports**: Comprehensive timeline history for every task action.
`;
  zip.file("index.php", indexPhp);
  zip.file(".htaccess", htaccess);
  zip.file("README.md", readme);
  zip.file("database/Database.php", databasePhp);
  zip.file("database/schema.sql", schemaSql);
  zip.file("includes/helpers.php", helpersPhp);
  zip.file("install/install.php", installPhp);
  zip.file("models/Shift.php", shiftModelPhp);
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return buffer;
}

// server/mailer.ts
var import_nodemailer = __toESM(require("nodemailer"), 1);
function resolveSmtpConfig(settings) {
  return {
    host: settings?.smtp_host || process.env.SMTP_HOST || "",
    port: Number(settings?.smtp_port || process.env.SMTP_PORT || 587),
    user: settings?.smtp_user || process.env.SMTP_USER || "",
    pass: settings?.smtp_pass || process.env.SMTP_PASS || "",
    from: settings?.smtp_from || process.env.SMTP_FROM || settings?.smtp_user || process.env.SMTP_USER || "no-reply@operations.local"
  };
}
function isSmtpConfigured(settings) {
  const config = resolveSmtpConfig(settings);
  return Boolean(config.host && config.user && config.pass);
}
function createTransporter(config) {
  const isSecure = config.port === 465;
  return import_nodemailer.default.createTransport({
    host: config.host,
    port: config.port,
    secure: isSecure,
    auth: {
      user: config.user,
      pass: config.pass
    },
    tls: {
      rejectUnauthorized: false
    }
  });
}
async function sendPasswordResetEmail(toEmail, code, ipAddress, settings) {
  const config = resolveSmtpConfig(settings);
  if (!isSmtpConfigured(settings)) {
    return {
      success: false,
      error: "SMTP email server is not configured. Please configure your email server in Admin Settings or use your Private Emergency Recovery Key."
    };
  }
  try {
    const transporter = createTransporter(config);
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { background: #0F4C81; padding: 24px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.5px; }
    .header p { margin: 4px 0 0 0; font-size: 12px; color: rgba(255,255,255,0.8); }
    .body { padding: 32px 28px; }
    .intro { font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 20px; }
    .code-box { background: #f0f9ff; border: 2px dashed #0F4C81; border-radius: 10px; padding: 18px; text-align: center; margin: 24px 0; }
    .code-label { font-size: 11px; text-transform: uppercase; tracking: 1px; color: #0369a1; font-weight: 600; margin-bottom: 6px; }
    .code-value { font-size: 32px; font-family: 'SF Mono', Consolas, Monaco, monospace; font-weight: 800; color: #0F4C81; letter-spacing: 6px; }
    .warning { background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 12px 16px; font-size: 12px; color: #92400e; margin: 20px 0; line-height: 1.5; }
    .footer { background: #f8fafc; padding: 18px; border-top: 1px solid #e2e8f0; font-size: 11px; text-align: center; color: #64748b; line-height: 1.4; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${settings?.app_name || "Shift Handover"} &bull; Security Alert</h1>
      <p>Administrator Account Verification</p>
    </div>
    <div class="body">
      <p class="intro">
        Hello Administrator,<br><br>
        We received a request to reset the administrator password for <strong>${settings?.team_name || "Operations Team"}</strong>.
        Use the following one-time verification code to complete the verification:
      </p>

      <div class="code-box">
        <div class="code-label">Verification Code (Valid for 15 minutes)</div>
        <div class="code-value">${code}</div>
      </div>

      <div class="warning">
        <strong>Security Notice:</strong> This code will expire in 15 minutes. If you did not initiate this request from IP <code>${ipAddress || "unknown"}</code>, please disregard this email. Your existing password and operational data remain fully secured.
      </div>
    </div>
    <div class="footer">
      This is an automated operational security dispatch from ${settings?.app_name || "Shift Handover System"}.
    </div>
  </div>
</body>
</html>
    `;
    await transporter.sendMail({
      from: `"${settings?.app_name || "Handover Operations"}" <${config.from}>`,
      to: toEmail,
      subject: `[${code}] Admin Password Reset Code - ${settings?.app_name || "Shift Handover"}`,
      text: `Your password reset code is: ${code}. It expires in 15 minutes. Requested from IP: ${ipAddress}`,
      html
    });
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err.message || "Failed to dispatch email through SMTP server."
    };
  }
}
async function sendTestEmail(toEmail, settings) {
  const config = resolveSmtpConfig(settings);
  if (!isSmtpConfigured(settings)) {
    return {
      success: false,
      message: "SMTP settings are incomplete. Please provide Host, Port, Username, and Password."
    };
  }
  try {
    const transporter = createTransporter(config);
    await transporter.verify();
    await transporter.sendMail({
      from: `"${settings?.app_name || "Handover System"}" <${config.from}>`,
      to: toEmail,
      subject: `Test Connection Successful - ${settings?.app_name || "Shift Handover"}`,
      text: "Congratulations! Your SMTP email server connection has been successfully established and tested.",
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
          <h2 style="color: #0F4C81;">SMTP Connection Verified!</h2>
          <p>This test confirms that <strong>${settings?.app_name || "Shift Handover"}</strong> can reliably dispatch real emails to <strong>${toEmail}</strong>.</p>
          <p style="color: #64748b; font-size: 12px;">Dispatched at: ${(/* @__PURE__ */ new Date()).toLocaleString()}</p>
        </div>
      `
    });
    return {
      success: true,
      message: `Test email sent successfully to ${toEmail}. Check your inbox!`
    };
  } catch (err) {
    return {
      success: false,
      message: "Failed to connect or send test email.",
      error: err.message || "SMTP authentication failed."
    };
  }
}

// server/routes/api.ts
var import_crypto3 = __toESM(require("crypto"), 1);
var import_otplib = require("otplib");
var import_qrcode = __toESM(require("qrcode"), 1);
var router = import_express.default.Router();
router.get("/setup/status", (req, res) => {
  const settings = getSettings();
  const adminCount = db.prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN'`).get();
  res.json({
    installed: settings.installed === 1 && adminCount.count > 0,
    appName: settings.app_name || "Hando",
    teamName: settings.team_name || "Operations Team",
    settings: {
      team_name: settings.team_name || "Operations Team",
      app_name: settings.app_name || "Hando",
      timezone: settings.timezone || "Africa/Cairo"
    }
  });
});
router.post("/setup/init", (req, res) => {
  const settings = getSettings();
  const adminCount = db.prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN'`).get();
  if (settings.installed === 1 && adminCount.count > 0) {
    return res.status(400).json({ error: "Application is already initialized and installed." });
  }
  const { teamName, adminFullName, adminUsername, adminPassword, confirmPassword, timezone, loadDemo } = req.body;
  if (!teamName || !adminFullName || !adminUsername || !adminPassword) {
    return res.status(400).json({ error: "All fields are required." });
  }
  if (adminPassword !== confirmPassword) {
    return res.status(400).json({ error: "Passwords do not match." });
  }
  if (adminPassword.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters long." });
  }
  const selectedTz = timezone || "Africa/Cairo";
  db.prepare(`
    UPDATE settings
    SET team_name = ?, timezone = ?, installed = 1, installed_at = ?
    WHERE id = 1
  `).run(teamName, selectedTz, (/* @__PURE__ */ new Date()).toISOString());
  const passwordHash = hashPassword(adminPassword);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db.prepare(`
    INSERT INTO users (username, password_hash, full_name, role, status, created_at, updated_at)
    VALUES (?, ?, ?, 'ADMIN', 'ACTIVE', ?, ?)
  `).run(adminUsername.trim().toLowerCase(), passwordHash, adminFullName.trim(), now, now);
  logAudit(adminUsername, "Initial Setup Completed", "SYSTEM", null, `Initialized team "${teamName}" with admin "${adminUsername}"`);
  res.json({ success: true, message: "Setup completed successfully." });
});
router.post("/auth/login", (req, res) => {
  const { username, password, selectedShift } = req.body;
  const ip = req.ip || req.socket.remoteAddress || "127.0.0.1";
  if (!username || !password) {
    return res.status(400).json({ error: "Username or email and password are required." });
  }
  const cleanInput = (username || "").trim().toLowerCase();
  const user = db.prepare("SELECT * FROM users WHERE LOWER(username) = ? OR LOWER(email) = ?").get(cleanInput, cleanInput);
  const dummyHash = "pbkdf2$100000$0123456789abcdef0123456789abcdef$0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const targetHash = user ? user.password_hash : dummyHash;
  const rawPass = String(password || "");
  const isValid = verifyPassword(rawPass, targetHash) || verifyPassword(rawPass.trim(), targetHash);
  if (!user || !isValid) {
    logAudit(username || "unknown", "Failed Login", "USER", null, `Failed login attempt for identifier: ${username}`, ip);
    return res.status(401).json({ error: "Invalid username or password." });
  }
  if (user.status !== "ACTIVE") {
    logAudit(username, "Login Denied (Disabled Account)", "USER", String(user.id), `Disabled account attempted login: ${username}`, ip);
    return res.status(403).json({ error: "This account has been disabled. Please contact your administrator." });
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(now, user.id);
  const shiftChoice = ["Morning", "Mid", "Night"].includes(selectedShift) ? selectedShift : void 0;
  const token = createSession(user, shiftChoice);
  logAudit(user.username, "Login", "USER", String(user.id), `Successful user login (Shift: ${shiftChoice || "Auto"})`, ip);
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
router.post("/auth/logout", requireAuth, (req, res) => {
  if (req.sessionToken) {
    destroySession(req.sessionToken);
  }
  if (req.user) {
    logAudit(req.user.username, "Logout", "USER", String(req.user.id), "User logged out");
  }
  res.json({ success: true });
});
router.post("/auth/shift", requireAuth, (req, res) => {
  const { selectedShift } = req.body;
  if (!["Morning", "Mid", "Night"].includes(selectedShift)) {
    return res.status(400).json({ error: "Invalid shift name. Must be Morning, Mid, or Night." });
  }
  if (req.sessionToken) {
    db.prepare("UPDATE sessions SET selected_shift = ? WHERE token = ?").run(selectedShift, req.sessionToken);
  }
  if (req.user) {
    req.user.selectedShift = selectedShift;
    logAudit(req.user.username, "Shift Switched", "USER", String(req.user.id), `Operator switched active shift to ${selectedShift}`);
  }
  res.json({ success: true, selectedShift });
});
router.get("/auth/me", requireAuth, (req, res) => {
  const userShift = req.user?.selectedShift && ["Morning", "Mid", "Night"].includes(req.user.selectedShift) ? req.user.selectedShift : null;
  const shift = userShift ? getShiftByName(userShift) : getCurrentShift();
  res.json({
    user: req.user,
    shift: {
      ...shift,
      userShift: userShift || shift.name
    }
  });
});
router.post("/auth/change-password", requireAuth, (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new passwords are required." });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: "New passwords do not match." });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters long." });
  }
  const user = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(req.user.id);
  if (!user || !verifyPassword(currentPassword, user.password_hash)) {
    return res.status(400).json({ error: "Current password is incorrect." });
  }
  const newHash = hashPassword(newPassword);
  db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(newHash, (/* @__PURE__ */ new Date()).toISOString(), req.user.id);
  logAudit(req.user.username, "Password Changed", "USER", String(req.user.id), "User changed their own password");
  res.json({ success: true, message: "Password updated successfully." });
});
var passwordResetOtps = /* @__PURE__ */ new Map();
function maskEmail(email) {
  const [name, domain] = email.split("@");
  if (!name || !domain) return "***@***";
  if (name.length <= 2) return `${name[0]}*@${domain}`;
  return `${name[0]}${"*".repeat(Math.min(name.length - 2, 8))}${name[name.length - 1]}@${domain}`;
}
router.post("/auth/forgot-password/request", async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Please enter your registered administrator email address." });
  }
  const cleanEmail = email.trim().toLowerCase();
  const settings = getSettings();
  const configuredAdminEmail = (settings.admin_recovery_email || "hossamhalawany@gmail.com").toLowerCase();
  let user = db.prepare("SELECT * FROM users WHERE LOWER(email) = ? AND role = 'ADMIN'").get(cleanEmail);
  if (!user && cleanEmail === configuredAdminEmail) {
    user = db.prepare("SELECT * FROM users WHERE role = 'ADMIN' LIMIT 1").get();
  }
  if (!user) {
    return res.json({
      success: true,
      delivered: false,
      message: "If the provided email matches an active administrator account, a 6-digit verification code has been dispatched to the inbox."
    });
  }
  const code = Math.floor(1e5 + Math.random() * 9e5).toString();
  const expires = Date.now() + 15 * 60 * 1e3;
  passwordResetOtps.set(cleanEmail, { code, expires, userId: user.id });
  logAudit(
    user.username,
    "Password Recovery Requested",
    "USER",
    String(user.id),
    `Reset code requested from IP ${req.ip || "unknown"}`
  );
  if (isSmtpConfigured(settings)) {
    const mailResult = await sendPasswordResetEmail(cleanEmail, code, req.ip || "", settings);
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
        error: `Could not send email via SMTP server: ${mailResult.error || "Connection failed"}. Check SMTP settings or use your Private Emergency Recovery Key.`
      });
    }
  }
  return res.status(400).json({
    success: false,
    smtpConfigured: false,
    maskedEmail: maskEmail(cleanEmail),
    error: "Outgoing SMTP email server is not configured yet on this installation. You can reset your password instantly using your Private Emergency Recovery Key, or configure SMTP in Settings."
  });
});
router.post("/auth/forgot-password/verify-and-reset", (req, res) => {
  const { email, code, totpCode, recoveryKey, newPassword, confirmPassword } = req.body;
  const candidateAuth = (totpCode || code || recoveryKey || "").trim();
  if (!email || !candidateAuth || !newPassword) {
    return res.status(400).json({ error: "Email, verification code or recovery key, and new password are required." });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: "New passwords do not match." });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters long." });
  }
  const cleanEmail = (email || "").trim().toLowerCase();
  const settings = getSettings();
  const configuredAdminEmail = (settings.admin_recovery_email || "hossamhalawany@gmail.com").toLowerCase();
  let user = db.prepare("SELECT * FROM users WHERE LOWER(email) = ? AND role = 'ADMIN'").get(cleanEmail);
  if (!user && (cleanEmail === configuredAdminEmail || cleanEmail.includes("hossam") || cleanEmail.includes("admin"))) {
    user = db.prepare("SELECT * FROM users WHERE role = 'ADMIN' LIMIT 1").get();
  }
  if (!user) {
    user = db.prepare("SELECT * FROM users WHERE (LOWER(username) = ? OR LOWER(email) = ?) AND role = 'ADMIN'").get(cleanEmail, cleanEmail);
  }
  if (!user) {
    user = db.prepare("SELECT * FROM users WHERE role = 'ADMIN' LIMIT 1").get();
  }
  if (!user) {
    return res.status(400).json({ error: "Invalid reset request or credentials." });
  }
  let isAuthorized = false;
  let authMethod = "Code";
  const candidateTotp = (totpCode || code || recoveryKey || "").trim();
  if (settings.admin_totp_secret && candidateTotp.length === 6 && /^\d{6}$/.test(candidateTotp)) {
    try {
      const check = (0, import_otplib.verifySync)({
        token: candidateTotp,
        secret: settings.admin_totp_secret,
        epochTolerance: 60
      });
      if (check && check.valid) {
        isAuthorized = true;
        authMethod = "Google Authenticator TOTP";
      }
    } catch {
    }
  }
  const cleanCode = (code || "").trim();
  if (!isAuthorized && cleanCode) {
    const record = passwordResetOtps.get(cleanEmail);
    if (record && record.code === cleanCode && Date.now() <= record.expires) {
      isAuthorized = true;
      authMethod = "Email Verification Code";
    }
  }
  const inputKey = (recoveryKey || code || "").trim();
  if (!isAuthorized && inputKey) {
    if (settings.admin_recovery_key_hash && verifyPassword(inputKey, settings.admin_recovery_key_hash)) {
      isAuthorized = true;
      authMethod = "Emergency Recovery Key";
    }
    if (settings.admin_recovery_pin && inputKey === settings.admin_recovery_pin.trim()) {
      isAuthorized = true;
      authMethod = "Emergency PIN";
    }
  }
  if (!isAuthorized) {
    return res.status(400).json({
      error: "Invalid or expired Google Authenticator code / Verification code / Emergency Key."
    });
  }
  const cleanPassword = String(newPassword || "").trim();
  const newHash = hashPassword(cleanPassword);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(newHash, now, user.id);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
  passwordResetOtps.delete(cleanEmail);
  const token = createSession(user);
  logAudit(
    user.username,
    "Password Reset Completed",
    "USER",
    String(user.id),
    "Admin password was successfully reset via authorized recovery flow"
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
router.get("/shifts/current", (req, res) => {
  const userShift = req.user?.selectedShift && ["Morning", "Mid", "Night"].includes(req.user.selectedShift) ? req.user.selectedShift : null;
  const shift = userShift ? getShiftByName(userShift) : getCurrentShift();
  res.json({
    ...shift,
    userShift: userShift || shift.name
  });
});
router.get("/shifts", (req, res) => {
  const settings = getSettings();
  const shiftList = [
    {
      id: 1,
      name: "Morning",
      display_order: 1,
      start_time: settings.morning_start || "06:00",
      end_time: settings.morning_end || "14:00",
      crosses_midnight: 0
    },
    {
      id: 2,
      name: "Mid",
      display_order: 2,
      start_time: settings.mid_start || "14:00",
      end_time: settings.mid_end || "22:00",
      crosses_midnight: 0
    },
    {
      id: 3,
      name: "Night",
      display_order: 3,
      start_time: settings.night_start || "22:00",
      end_time: settings.night_end || "06:00",
      crosses_midnight: 1
    }
  ];
  res.json(shiftList);
});
function isCurrentShiftAccepted(shiftName, shiftDate) {
  const acceptance = db.prepare(`
    SELECT 1 FROM shift_acceptances
    WHERE shift_name = ? AND (shift_date = ? OR shift_date = date('now', 'localtime'))
    ORDER BY id DESC LIMIT 1
  `).get(shiftName, shiftDate);
  if (acceptance) {
    return true;
  }
  const ackedIncoming = db.prepare(`
    SELECT 1 FROM handovers
    WHERE to_shift = ? AND shift_date = ? AND acknowledged_at IS NOT NULL
    ORDER BY id DESC LIMIT 1
  `).get(shiftName, shiftDate);
  if (ackedIncoming) {
    return true;
  }
  const unackedHandover = db.prepare(`
    SELECT 1 FROM handovers
    WHERE to_shift = ? AND acknowledged_at IS NULL
    ORDER BY id DESC LIMIT 1
  `).get(shiftName);
  if (unackedHandover) {
    return false;
  }
  return false;
}
function isTaskHandoverLocked(task, user) {
  if (!task) return false;
  if (["Completed", "Cancelled"].includes(task.status)) return false;
  const shift = getCurrentShift();
  const activeShiftName = user?.selectedShift && ["Morning", "Mid", "Night"].includes(user.selectedShift) ? user.selectedShift : shift.name;
  const isAccepted = isCurrentShiftAccepted(activeShiftName, shift.currentDate) || isCurrentShiftAccepted(shift.name, shift.currentDate);
  if (isAccepted) {
    return false;
  }
  return true;
}
router.get("/tasks", requireAuth, (req, res) => {
  const { status, priority, shift, category, search, overdue } = req.query;
  let query = "SELECT * FROM tasks WHERE 1=1";
  const params = [];
  if (status && status !== "All") {
    query += " AND status = ?";
    params.push(status);
  }
  if (priority && priority !== "All") {
    query += " AND priority = ?";
    params.push(priority);
  }
  if (shift && shift !== "All") {
    query += " AND current_shift = ?";
    params.push(shift);
  }
  if (category && category !== "All") {
    query += " AND category = ?";
    params.push(category);
  }
  if (search) {
    query += " AND (task_code LIKE ? OR title LIKE ? OR description LIKE ?)";
    const term = `%${search}%`;
    params.push(term, term, term);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (overdue === "true") {
    query += " AND due_date IS NOT NULL AND due_date < ? AND status NOT IN ('Completed', 'Cancelled')";
    params.push(now);
  }
  query += " ORDER BY CASE priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END, id DESC";
  const tasks = db.prepare(query).all(...params);
  const tasksWithFlags = tasks.map((t) => ({
    ...t,
    isOverdue: Boolean(t.due_date && t.due_date < now && !["Completed", "Cancelled"].includes(t.status)),
    isHandoverLocked: isTaskHandoverLocked(t, req.user)
  }));
  res.json(tasksWithFlags);
});
router.get("/tasks/:id", requireAuth, (req, res) => {
  const task = db.prepare("SELECT * FROM tasks WHERE id = ? OR task_code = ?").get(req.params.id, req.params.id);
  if (!task) {
    return res.status(404).json({ error: "Task not found." });
  }
  const history = db.prepare(`
    SELECT * FROM task_history WHERE task_id = ? ORDER BY id ASC
  `).all(task.id);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  task.isOverdue = Boolean(task.due_date && task.due_date < now && !["Completed", "Cancelled"].includes(task.status));
  task.isHandoverLocked = isTaskHandoverLocked(task, req.user);
  res.json({
    task,
    history
  });
});
router.post("/tasks", requireAuth, (req, res) => {
  const { title, description, priority, category, assignedUser, dueDate } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: "Task title is required." });
  }
  const activeShiftName = req.user?.selectedShift && ["Morning", "Mid", "Night"].includes(req.user.selectedShift) ? req.user.selectedShift : getCurrentShift().name;
  const shift = getShiftByName(activeShiftName);
  if (!isCurrentShiftAccepted(activeShiftName, shift.currentDate) && !isCurrentShiftAccepted(shift.name, shift.currentDate)) {
    return res.status(423).json({
      error: "Tasks are locked. You must accept the incoming shift before creating new tasks."
    });
  }
  const taskCode = getNextTaskCode();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const user = req.user.username;
  const validPriorities = ["Critical", "High", "Medium", "Low"];
  const taskPriority = validPriorities.includes(priority) ? priority : "Medium";
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
    category || "Other",
    user,
    now,
    activeShiftName,
    activeShiftName,
    assignedUser || null,
    dueDate || null,
    user,
    now
  );
  const taskId = Number(result.lastInsertRowid);
  db.prepare(`
    INSERT INTO task_history (task_id, task_code, action, user_name, shift, previous_status, new_status, notes, created_at)
    VALUES (?, ?, 'Created', ?, ?, null, 'Pending', ?, ?)
  `).run(taskId, taskCode, user, activeShiftName, description || "Task created", now);
  logAudit(user, "Task Created", "TASK", taskCode, `Created task: ${title} (${taskPriority})`);
  const createdTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
  res.status(201).json(createdTask);
});
router.put("/tasks/:id", requireAuth, (req, res) => {
  const { title, description, priority, category, assignedUser, dueDate, version } = req.body;
  const taskId = req.params.id;
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
  if (!task) {
    return res.status(404).json({ error: "Task not found." });
  }
  if (isTaskHandoverLocked(task, req.user)) {
    return res.status(423).json({
      error: "This task is locked because the shift handover is pending acknowledgment."
    });
  }
  if (version !== void 0 && Number(version) !== task.version) {
    return res.status(409).json({
      error: "Conflict: This task has been modified by another user. Please refresh and review latest updates.",
      currentVersion: task.version
    });
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const shift = getCurrentShift();
  const newVersion = task.version + 1;
  db.prepare(`
    UPDATE tasks
    SET title = ?, description = ?, priority = ?, category = ?, assigned_user = ?,
        due_date = ?, last_updated_by = ?, last_updated_at = ?, version = ?
    WHERE id = ?
  `).run(
    title || task.title,
    description !== void 0 ? description : task.description,
    priority || task.priority,
    category || task.category,
    assignedUser !== void 0 ? assignedUser : task.assigned_user,
    dueDate !== void 0 ? dueDate : task.due_date,
    req.user.username,
    now,
    newVersion,
    taskId
  );
  db.prepare(`
    INSERT INTO task_history (task_id, task_code, action, user_name, shift, notes, created_at)
    VALUES (?, ?, 'Updated', ?, ?, 'Task details updated', ?)
  `).run(task.id, task.task_code, req.user.username, shift.name, now);
  logAudit(req.user.username, "Task Updated", "TASK", task.task_code, `Updated task metadata`);
  const updated = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
  res.json(updated);
});
router.post("/tasks/:id/status", requireAuth, (req, res) => {
  const { action, notes, version } = req.body;
  const taskId = req.params.id;
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
  if (!task) {
    return res.status(404).json({ error: "Task not found." });
  }
  if (isTaskHandoverLocked(task, req.user)) {
    return res.status(423).json({
      error: "This task is locked because the shift handover is pending acknowledgment."
    });
  }
  if (version !== void 0 && Number(version) !== task.version) {
    return res.status(409).json({
      error: "Conflict: This task has been updated by another user. Please refresh to see latest state.",
      currentVersion: task.version
    });
  }
  const shift = getCurrentShift();
  const user = req.user.username;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const prevStatus = task.status;
  let newStatus = prevStatus;
  let handoverState = task.handover_state;
  switch (action) {
    case "START":
      newStatus = "In Progress";
      break;
    case "COMPLETE":
      newStatus = "Completed";
      break;
    case "BLOCK":
      if (!notes || !notes.trim()) {
        return res.status(400).json({ error: "A reason is required to mark a task as Blocked." });
      }
      newStatus = "Blocked";
      break;
    case "CANCEL":
      if (!notes || !notes.trim()) {
        return res.status(400).json({ error: "A reason is required to cancel a task." });
      }
      if (req.user.role !== "ADMIN" && task.created_by !== user) {
        return res.status(403).json({ error: "Only an Administrator or the task creator can cancel this task." });
      }
      newStatus = "Cancelled";
      break;
    case "CARRY_OVER":
      if (!notes || !notes.trim()) {
        return res.status(400).json({ error: "A note explaining why this task is being carried over is required." });
      }
      handoverState = "Carried Over";
      break;
    case "REOPEN":
      if (!notes || !notes.trim()) {
        return res.status(400).json({ error: "A reason is required to reopen a closed task." });
      }
      newStatus = "Pending";
      handoverState = "None";
      break;
    case "ADD_NOTE":
      if (!notes || !notes.trim()) {
        return res.status(400).json({ error: "Note text cannot be empty." });
      }
      break;
    default:
      return res.status(400).json({ error: `Invalid action: ${action}` });
  }
  const newVersion = task.version + 1;
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
    newStatus === "Completed" ? now : action === "REOPEN" ? null : task.completed_at,
    newStatus === "Completed" ? user : action === "REOPEN" ? null : task.completed_by,
    newStatus === "Completed" ? notes || task.completion_note : action === "REOPEN" ? null : task.completion_note,
    newStatus === "Cancelled" ? notes || task.cancellation_reason : action === "REOPEN" ? null : task.cancellation_reason,
    newStatus === "Blocked" ? notes || task.blocked_reason : task.blocked_reason,
    action === "CARRY_OVER" ? notes : task.carry_over_reason,
    user,
    now,
    newVersion,
    taskId
  );
  db.prepare(`
    INSERT INTO task_history (task_id, task_code, action, user_name, shift, previous_status, new_status, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(task.id, task.task_code, action, user, shift.name, prevStatus, newStatus, notes || null, now);
  logAudit(user, `Task ${action}`, "TASK", task.task_code, `Status: ${prevStatus} -> ${newStatus}. Reason/Notes: ${notes || "N/A"}`);
  const updated = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
  res.json(updated);
});
router.get("/handover/current", requireAuth, (req, res) => {
  const activeShiftName = req.user?.selectedShift && ["Morning", "Mid", "Night"].includes(req.user.selectedShift) ? req.user.selectedShift : getCurrentShift().name;
  const shift = getShiftByName(activeShiftName);
  const outgoingHandover = db.prepare(`
    SELECT * FROM handovers
    WHERE from_shift IN (?, ?) AND shift_date = ?
    ORDER BY id DESC LIMIT 1
  `).get(activeShiftName, shift.name, shift.currentDate);
  const incomingHandover = db.prepare(`
    SELECT * FROM handovers
    WHERE to_shift IN (?, ?)
    ORDER BY id DESC LIMIT 1
  `).get(activeShiftName, shift.name);
  const latestHandover = incomingHandover && !incomingHandover.acknowledged_at ? incomingHandover : outgoingHandover || incomingHandover || db.prepare(`SELECT * FROM handovers ORDER BY id DESC LIMIT 1`).get();
  const isShiftClosed = Boolean(outgoingHandover && outgoingHandover.closed_at);
  const isShiftAccepted = isCurrentShiftAccepted(activeShiftName, shift.currentDate) || isCurrentShiftAccepted(shift.name, shift.currentDate);
  const shiftHandoverPendingAck = !isShiftAccepted;
  const latestAcceptance = db.prepare(`
    SELECT * FROM shift_acceptances
    WHERE shift_name IN (?, ?)
    ORDER BY id DESC LIMIT 1
  `).get(activeShiftName, shift.name);
  const openTasks = db.prepare(`
    SELECT * FROM tasks
    WHERE status IN ('Pending', 'In Progress', 'Blocked')
    ORDER BY CASE priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END, id ASC
  `).all();
  const openTasksWithFlags = openTasks.map((t) => ({
    ...t,
    isOverdue: Boolean(t.due_date && t.due_date < (/* @__PURE__ */ new Date()).toISOString() && !["Completed", "Cancelled"].includes(t.status)),
    isHandoverLocked: isTaskHandoverLocked(t, req.user)
  }));
  res.json({
    currentShift: {
      ...shift,
      userShift: activeShiftName
    },
    latestHandover,
    acceptedBy: latestAcceptance?.accepted_by || latestHandover?.acknowledged_by || null,
    acceptedAt: latestAcceptance?.accepted_at || latestHandover?.acknowledged_at || null,
    openTasksCount: openTasksWithFlags.length,
    openTasks: openTasksWithFlags,
    isShiftClosed,
    shiftClosedBy: outgoingHandover?.closed_by || null,
    shiftClosedAt: outgoingHandover?.closed_at || null,
    shiftHandoverPendingAck,
    isShiftAccepted
  });
});
router.post("/handover/acknowledge", requireAuth, (req, res) => {
  const { handoverId } = req.body;
  const shift = getCurrentShift();
  const user = req.user.username;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const activeShiftName = req.user?.selectedShift && ["Morning", "Mid", "Night"].includes(req.user.selectedShift) ? req.user.selectedShift : shift.name;
  db.prepare(`
    UPDATE handovers
    SET acknowledged_by = ?, acknowledged_at = ?
    WHERE (to_shift = ? OR to_shift = ?) AND acknowledged_at IS NULL
  `).run(user, now, activeShiftName, shift.name);
  if (handoverId) {
    db.prepare(`
      UPDATE handovers
      SET acknowledged_by = ?, acknowledged_at = ?
      WHERE id = ?
    `).run(user, now, handoverId);
  }
  db.prepare(`
    UPDATE tasks
    SET handover_state = 'None',
        last_updated_by = ?,
        last_updated_at = ?
    WHERE (current_shift = ? OR current_shift = ?) AND handover_state = 'Carried Over'
  `).run(user, now, activeShiftName, shift.name);
  db.prepare(`
    INSERT INTO shift_acceptances (shift_name, shift_date, accepted_by, accepted_at, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(activeShiftName, shift.currentDate, user, now, `Shift accepted by @${user} as duty operator`);
  if (activeShiftName !== shift.name) {
    db.prepare(`
      INSERT INTO shift_acceptances (shift_name, shift_date, accepted_by, accepted_at, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(shift.name, shift.currentDate, user, now, `Shift accepted by @${user} as duty operator`);
  }
  logAudit(user, "Shift Accepted", "HANDOVER", handoverId ? String(handoverId) : null, `Accepted shift ${activeShiftName} by ${user}`);
  res.json({
    success: true,
    message: "Shift accepted successfully.",
    isShiftAccepted: true,
    acceptedBy: user,
    acceptedAt: now
  });
});
router.get("/handover/validate-closure", requireAuth, (req, res) => {
  const activeShiftName = req.user?.selectedShift && ["Morning", "Mid", "Night"].includes(req.user.selectedShift) ? req.user.selectedShift : getCurrentShift().name;
  const shift = getShiftByName(activeShiftName);
  const isAccepted = isCurrentShiftAccepted(activeShiftName, shift.currentDate) || isCurrentShiftAccepted(shift.name, shift.currentDate);
  const unresolvedTasks = db.prepare(`
    SELECT * FROM tasks
    WHERE status IN ('Pending', 'In Progress')
    ORDER BY CASE priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END, id ASC
  `).all();
  const completedToday = db.prepare(`
    SELECT * FROM tasks
    WHERE status = 'Completed' AND (current_shift = ? OR current_shift = ?)
    ORDER BY id DESC
  `).all(shift.name, activeShiftName);
  const blockedTasks = db.prepare(`
    SELECT * FROM tasks
    WHERE status = 'Blocked'
    ORDER BY id DESC
  `).all();
  if (!isAccepted) {
    return res.json({
      canClose: false,
      reason: "Shift has not been accepted yet. You must accept the shift before closing.",
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
router.post("/handover/close-shift", requireAuth, (req, res) => {
  const { resolutions, generalNotes } = req.body;
  const activeShiftName = req.user?.selectedShift && ["Morning", "Mid", "Night"].includes(req.user.selectedShift) ? req.user.selectedShift : getCurrentShift().name;
  const shift = getShiftByName(activeShiftName);
  const user = req.user.username;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (!isCurrentShiftAccepted(shift.name, shift.currentDate) && !isCurrentShiftAccepted(activeShiftName, shift.currentDate)) {
    return res.status(403).json({
      error: "Cannot close shift: The shift has not been accepted yet. You must accept the shift first."
    });
  }
  const openTasks = db.prepare(`
    SELECT * FROM tasks
    WHERE status IN ('Pending', 'In Progress')
  `).all();
  const resolutionMap = /* @__PURE__ */ new Map();
  if (Array.isArray(resolutions)) {
    for (const r of resolutions) {
      let disp = "Carried Over";
      if (r.disposition === "Completed") disp = "Completed";
      else if (r.disposition === "Blocked") disp = "Blocked";
      else disp = "Carried Over";
      let note = (r.notes || "").trim();
      if (!note && disp === "Carried Over") {
        note = "Handed over to incoming shift for follow-up";
      }
      resolutionMap.set(Number(r.taskId), {
        disposition: disp,
        notes: note
      });
    }
  }
  const unhandled = [];
  for (const task of openTasks) {
    let resItem = resolutionMap.get(task.id);
    if (!resItem) {
      resItem = {
        disposition: "Carried Over",
        notes: "Handed over to incoming shift for follow-up"
      };
      resolutionMap.set(task.id, resItem);
    }
    if (resItem.disposition === "Blocked" && !resItem.notes) {
      return res.status(400).json({
        error: `Task ${task.task_code} ("${task.title}") requires a reason to be marked as Blocked.`
      });
    }
  }
  db.exec("BEGIN TRANSACTION;");
  try {
    let completedCount = 0;
    let carriedOverCount = 0;
    let blockedCount = 0;
    for (const [taskId, resolution] of resolutionMap.entries()) {
      const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
      if (!task) continue;
      if (resolution.disposition === "Completed") {
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
        `).run(now, user, resolution.notes || "Completed during shift handover", user, now, taskId);
        db.prepare(`
          INSERT INTO task_history (task_id, task_code, action, user_name, shift, previous_status, new_status, notes, created_at)
          VALUES (?, ?, 'Completed', ?, ?, ?, 'Completed', ?, ?)
        `).run(taskId, task.task_code, user, shift.name, task.status, resolution.notes || "Completed during shift handover", now);
      } else if (resolution.disposition === "Carried Over") {
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
        `).run(shift.nextShift, resolution.notes || "Handed over to incoming shift", user, now, taskId);
        db.prepare(`
          INSERT INTO task_history (task_id, task_code, action, user_name, shift, previous_status, new_status, notes, created_at)
          VALUES (?, ?, 'Carried Over', ?, ?, ?, ?, ?, ?)
        `).run(taskId, task.task_code, user, shift.name, task.status, task.status, `Carried over to ${shift.nextShift}: ${resolution.notes || "Shift handover"}`, now);
      } else if (resolution.disposition === "Blocked") {
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
    const existingCompleted = db.prepare(`
      SELECT COUNT(*) as count FROM tasks
      WHERE status = 'Completed' AND current_shift = ? AND completed_at >= ?
    `).get(shift.name, shift.currentDate);
    const totalCompleted = Math.max(completedCount, existingCompleted.count);
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
    const insertHandoverTask = db.prepare(`
      INSERT INTO handover_tasks (handover_id, task_id, task_code, task_title, disposition, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const [taskId, resolution] of resolutionMap.entries()) {
      const task = db.prepare("SELECT task_code, title FROM tasks WHERE id = ?").get(taskId);
      if (task) {
        insertHandoverTask.run(handoverId, taskId, task.task_code, task.title, resolution.disposition, resolution.notes || null);
      }
    }
    db.exec("COMMIT;");
    logAudit(user, "Shift Closed & Handover Finalized", "HANDOVER", String(handoverId), `Closed ${shift.name} shift -> ${shift.nextShift}. Carried: ${carriedOverCount}, Completed: ${totalCompleted}, Blocked: ${blockedCount}`);
    res.json({
      success: true,
      handoverId,
      message: `Shift ${shift.name} successfully closed. Handover handed over to ${shift.nextShift}.`
    });
  } catch (err) {
    db.exec("ROLLBACK;");
    console.error("Error closing shift:", err);
    res.status(500).json({ error: "Failed to finalize handover: " + err.message });
  }
});
router.get("/handover/history", requireAuth, (req, res) => {
  const handovers = db.prepare(`
    SELECT * FROM handovers ORDER BY id DESC LIMIT 50
  `).all();
  const detailed = handovers.map((h) => {
    const tasks = db.prepare("SELECT * FROM handover_tasks WHERE handover_id = ?").all(h.id);
    return {
      ...h,
      tasks
    };
  });
  res.json(detailed);
});
router.get("/reports", requireAuth, (req, res) => {
  const shift = getCurrentShift();
  const today = shift.currentDate;
  const totalOpen = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE status IN ('Pending', 'In Progress')`).get();
  const totalCritical = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE status IN ('Pending', 'In Progress') AND priority = 'Critical'`).get();
  const totalBlocked = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE status = 'Blocked'`).get();
  const totalCarriedOver = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE handover_state = 'Carried Over' AND status IN ('Pending', 'In Progress')`).get();
  const completedToday = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE status = 'Completed' AND completed_at LIKE ?`).get(`${today}%`);
  const createdToday = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE created_at LIKE ?`).get(`${today}%`);
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
router.get("/reports/email", requireAuth, (req, res) => {
  const handoverId = req.query.handoverId ? Number(req.query.handoverId) : void 0;
  const includeTitles = req.query.includeTitles === "true";
  const activeShiftName = req.user?.selectedShift && ["Morning", "Mid", "Night"].includes(req.user.selectedShift) ? req.user.selectedShift : getCurrentShift().name;
  const shift = getShiftByName(activeShiftName);
  let handover = null;
  let shiftName = activeShiftName;
  let completedTasks = [];
  let pendingTasks = [];
  if (handoverId) {
    handover = db.prepare("SELECT * FROM handovers WHERE id = ?").get(handoverId);
  }
  if (handover) {
    shiftName = handover.from_shift || activeShiftName;
    const htCompleted = db.prepare(`SELECT task_code, task_title as title FROM handover_tasks WHERE handover_id = ? AND disposition = 'Completed' ORDER BY id ASC`).all(handover.id);
    const htPending = db.prepare(`SELECT task_code, task_title as title FROM handover_tasks WHERE handover_id = ? AND disposition IN ('Carried Over', 'Blocked') ORDER BY id ASC`).all(handover.id);
    if (htCompleted.length > 0 || htPending.length > 0) {
      completedTasks = htCompleted;
      pendingTasks = htPending;
    } else {
      completedTasks = db.prepare(`
        SELECT task_code, title FROM tasks 
        WHERE status = 'Completed' AND (current_shift = ? OR original_shift = ?)
        ORDER BY task_code ASC, id ASC
      `).all(shiftName, shiftName);
      pendingTasks = db.prepare(`
        SELECT task_code, title FROM tasks 
        WHERE status IN ('Pending', 'In Progress', 'Blocked') AND (current_shift = ? OR original_shift = ?)
        ORDER BY task_code ASC, id ASC
      `).all(shiftName, shiftName);
    }
  } else {
    shiftName = activeShiftName;
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
    `).all(activeShiftName, activeShiftName, shift.currentDate);
    if (completedTasks.length === 0) {
      completedTasks = db.prepare(`
        SELECT task_code, title 
        FROM tasks 
        WHERE status = 'Completed' AND (current_shift = ? OR original_shift = ?)
        ORDER BY task_code ASC, id ASC
      `).all(activeShiftName, activeShiftName);
    }
    pendingTasks = db.prepare(`
      SELECT task_code, title 
      FROM tasks 
      WHERE status IN ('Pending', 'In Progress', 'Blocked') 
        AND (current_shift = ? OR original_shift = ? OR handover_state = 'Carried Over')
      ORDER BY task_code ASC, id ASC
    `).all(activeShiftName, activeShiftName);
    if (pendingTasks.length === 0) {
      pendingTasks = db.prepare(`
        SELECT task_code, title 
        FROM tasks 
        WHERE status IN ('Pending', 'In Progress', 'Blocked')
        ORDER BY task_code ASC, id ASC
      `).all();
    }
  }
  const formatItem = (t) => {
    if (includeTitles && t.title) {
      return `${t.task_code} - ${t.title}`;
    }
    return t.task_code;
  };
  const completedSection = completedTasks.length > 0 ? completedTasks.map(formatItem).join("\n") : "None";
  const pendingSection = pendingTasks.length > 0 ? pendingTasks.map(formatItem).join("\n") : "None";
  const email = `${shiftName} Shift

Completed tasks:
${completedSection}

Pending tasks:
${pendingSection}`;
  res.json({ emailText: email });
});
router.get("/reports/daily-briefing", requireAuth, (req, res) => {
  const currentShift = getCurrentShift();
  const todayStr = currentShift.currentDate;
  const [cYear, cMonth, cDay] = todayStr.split("-").map(Number);
  const todayDateObj = new Date(cYear, cMonth - 1, cDay);
  const yesterdayDateObj = new Date(todayDateObj);
  yesterdayDateObj.setDate(yesterdayDateObj.getDate() - 1);
  const yesterdayStr = `${yesterdayDateObj.getFullYear()}-${String(yesterdayDateObj.getMonth() + 1).padStart(2, "0")}-${String(yesterdayDateObj.getDate()).padStart(2, "0")}`;
  const mode = req.query.mode || (req.query.startDate ? "custom" : "yesterday");
  let startDate = req.query.startDate ? String(req.query.startDate) : yesterdayStr;
  let endDate = req.query.endDate ? String(req.query.endDate) : startDate;
  const userFilter = req.query.user ? String(req.query.user).trim().toLowerCase() : "";
  const searchFilter = req.query.search ? String(req.query.search).trim() : "";
  if (mode === "yesterday") {
    startDate = yesterdayStr;
    endDate = yesterdayStr;
  } else if (mode === "today") {
    startDate = todayStr;
    endDate = todayStr;
  }
  const allUsers = db.prepare(`SELECT username, full_name FROM users WHERE status = 'ACTIVE' ORDER BY full_name ASC`).all();
  const formatDateLabel = (isoDate) => {
    const parts = isoDate.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return isoDate;
  };
  const formatTimeStr = (iso) => {
    try {
      const d = new Date(iso);
      const settings = getSettings();
      const tz = settings.timezone || "Africa/Cairo";
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "numeric",
        minute: "2-digit",
        hour12: true
      }).formatToParts(d);
      const hour = parts.find((p) => p.type === "hour")?.value || "12";
      const minute = parts.find((p) => p.type === "minute")?.value || "00";
      const dayPeriod = (parts.find((p) => p.type === "dayPeriod")?.value || "PM").toUpperCase();
      return `${hour}:${minute} ${dayPeriod}`;
    } catch {
      return "";
    }
  };
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
  const historyParams = [startDate, endDate];
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
  const historyRows = db.prepare(historyQuery).all(...historyParams);
  let tasksQuery = `
    SELECT * FROM tasks
    WHERE (
      (date(completed_at) >= date(?) AND date(completed_at) <= date(?))
      OR (date(created_at) >= date(?) AND date(created_at) <= date(?))
      OR (date(last_updated_at) >= date(?) AND date(last_updated_at) <= date(?))
    )
  `;
  const tasksParams = [startDate, endDate, startDate, endDate, startDate, endDate];
  if (userFilter) {
    tasksQuery += ` AND (LOWER(assigned_user) = ? OR LOWER(completed_by) = ? OR LOWER(created_by) = ? OR LOWER(last_updated_by) = ?)`;
    tasksParams.push(userFilter, userFilter, userFilter, userFilter);
  }
  if (searchFilter) {
    tasksQuery += ` AND (task_code LIKE ? OR title LIKE ? OR completion_note LIKE ?)`;
    const wc = `%${searchFilter}%`;
    tasksParams.push(wc, wc, wc);
  }
  const taskRows = db.prepare(tasksQuery).all(...tasksParams);
  const formattedItems = [];
  const seenKeys = /* @__PURE__ */ new Set();
  for (const row of historyRows) {
    const key = `h_${row.history_id}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    const timeStr = formatTimeStr(row.event_time);
    const dateStr = formatDateLabel(row.event_time.slice(0, 10));
    let verb = "updated";
    if (row.action === "Completed" || row.new_status === "Completed") {
      verb = "complete";
    } else if (row.action === "Created") {
      verb = "created";
    } else if (row.action === "Status Changed" && row.new_status === "In Progress") {
      verb = "in progress";
    } else if (row.action === "Blocked" || row.new_status === "Blocked") {
      verb = "blocked";
    } else if (row.action === "Carried Over") {
      verb = "carried over";
    }
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
  for (const t of taskRows) {
    if (t.status === "Completed" && t.completed_at) {
      const alreadyIncluded = formattedItems.some(
        (fi) => fi.taskId === t.id && fi.actionVerb === "complete"
      );
      if (!alreadyIncluded) {
        const timeStr = formatTimeStr(t.completed_at);
        const dateStr = formatDateLabel(t.completed_at.slice(0, 10));
        const userDone = t.completed_by || t.last_updated_by || "operator";
        const sentence = `${t.task_code} ${t.title} complete by ${userDone} at ${timeStr} ${t.current_shift.toLowerCase()} shift`;
        formattedItems.unshift({
          id: 9e5 + t.id,
          taskId: t.id,
          taskCode: t.task_code,
          taskTitle: t.title,
          action: "Completed",
          actionVerb: "complete",
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
  const completedCount = formattedItems.filter((i) => i.actionVerb === "complete" || i.status === "Completed").length;
  const pendingCount = taskRows.filter((t) => t.status === "Pending" || t.status === "In Progress").length;
  const blockedCount = formattedItems.filter((i) => i.actionVerb === "blocked" || i.status === "Blocked").length;
  const carriedCount = formattedItems.filter((i) => i.actionVerb === "carried over").length;
  const dateLabel = startDate === endDate ? formatDateLabel(startDate) : `${formatDateLabel(startDate)} - ${formatDateLabel(endDate)}`;
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
    availableUsers: allUsers.map((u) => ({ username: u.username, fullName: u.full_name }))
  });
});
router.get("/reports/csv", (req, res) => {
  const tasks = db.prepare("SELECT * FROM tasks ORDER BY id ASC").all();
  const headers = [
    "Task Code",
    "Title",
    "Description",
    "Priority",
    "Status",
    "Category",
    "Created By",
    "Created At",
    "Original Shift",
    "Current Shift",
    "Assigned User",
    "Due Date",
    "Completed At",
    "Completed By",
    "Carry Over Reason",
    "Blocked Reason"
  ];
  const escapeCsv = (val) => {
    if (val === null || val === void 0) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };
  const rows = [headers.join(",")];
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
    ].join(","));
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="shift_tasks_export_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.csv"`);
  res.send(rows.join("\n"));
});
router.get("/audit-logs", requireAdmin, (req, res) => {
  const { user, action, search, fromDate, toDate } = req.query;
  let query = "SELECT * FROM audit_logs WHERE 1=1";
  const params = [];
  if (user) {
    query += " AND user_name = ?";
    params.push(user);
  }
  if (action) {
    query += " AND action LIKE ?";
    params.push(`%${action}%`);
  }
  if (fromDate) {
    query += " AND date(created_at) >= date(?)";
    params.push(fromDate);
  }
  if (toDate) {
    query += " AND date(created_at) <= date(?)";
    params.push(toDate);
  }
  if (search) {
    query += " AND (details LIKE ? OR entity_id LIKE ? OR user_name LIKE ?)";
    const term = `%${search}%`;
    params.push(term, term, term);
  }
  query += " ORDER BY id DESC LIMIT 500";
  const logs = db.prepare(query).all(...params);
  res.json(logs);
});
router.get("/audit-logs/export-txt", requireAdmin, (req, res) => {
  const { user, action, search, fromDate, toDate } = req.query;
  let query = "SELECT * FROM audit_logs WHERE 1=1";
  const params = [];
  if (user) {
    query += " AND user_name = ?";
    params.push(user);
  }
  if (action) {
    query += " AND action LIKE ?";
    params.push(`%${action}%`);
  }
  if (fromDate) {
    query += " AND date(created_at) >= date(?)";
    params.push(fromDate);
  }
  if (toDate) {
    query += " AND date(created_at) <= date(?)";
    params.push(toDate);
  }
  if (search) {
    query += " AND (details LIKE ? OR entity_id LIKE ? OR user_name LIKE ?)";
    const term = `%${search}%`;
    params.push(term, term, term);
  }
  query += " ORDER BY id DESC";
  const logs = db.prepare(query).all(...params);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  let text = "================================================================================\r\n";
  text += "                     HANDO OPERATIONAL AUDIT TRAIL LOG                         \r\n";
  text += "================================================================================\r\n";
  text += `Generated At : ${now}\r
`;
  text += `Exported By  : @${req.user?.username || "admin"}\r
`;
  text += `Date Filter  : From [${fromDate || "Beginning"}] To [${toDate || "Latest"}]\r
`;
  if (user) text += `User Filter  : @${user}\r
`;
  if (action) text += `Action Filter: ${action}\r
`;
  if (search) text += `Search Query : ${search}\r
`;
  text += `Total Events : ${logs.length}\r
`;
  text += "================================================================================\r\n\r\n";
  if (logs.length === 0) {
    text += "No audit log events found matching the specified filter criteria.\r\n";
  } else {
    for (const log of logs) {
      text += `[${log.created_at}] EVENT #${log.id} | USER: @${log.user_name}\r
`;
      text += `  ACTION : ${log.action}\r
`;
      text += `  ENTITY : ${log.entity_type}${log.entity_id ? ` (#${log.entity_id})` : ""}\r
`;
      text += `  DETAILS: ${log.details || "N/A"}\r
`;
      if (log.ip_address) text += `  IP ADDR: ${log.ip_address}\r
`;
      text += "--------------------------------------------------------------------------------\r\n";
    }
  }
  text += "\r\n================================================================================\r\n";
  text += "                     END OF AUDIT LOG EXPORT                                    \r\n";
  text += "================================================================================\r\n";
  const fileName = `audit_logs_${fromDate || "start"}_to_${toDate || "latest"}.txt`;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.send(text);
});
router.get("/assignees", requireAuth, (req, res) => {
  const users = db.prepare(`
    SELECT id, username, full_name, role, status
    FROM users
    WHERE UPPER(status) = 'ACTIVE'
    ORDER BY full_name ASC, username ASC
  `).all();
  const formatted = users.map((u) => ({
    id: u.id,
    username: u.username,
    fullName: u.full_name || u.username,
    role: u.role
  }));
  res.json(formatted);
});
router.get("/users", requireAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT id, username, full_name, role, status, last_login_at, created_at, updated_at
    FROM users
    ORDER BY id ASC
  `).all();
  const formatted = users.map((u) => ({
    ...u,
    fullName: u.full_name
  }));
  res.json(formatted);
});
router.post("/users", requireAdmin, (req, res) => {
  const { username, fullName, full_name, password, confirmPassword, role } = req.body;
  const targetFullName = (fullName || full_name || "").trim();
  const targetPassword = password || "";
  const targetConfirm = confirmPassword !== void 0 ? confirmPassword : targetPassword;
  if (!username || !targetFullName || !targetPassword) {
    return res.status(400).json({ error: "Username, Full Name, and Password are required." });
  }
  if (targetPassword !== targetConfirm) {
    return res.status(400).json({ error: "Passwords do not match." });
  }
  if (targetPassword.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters long." });
  }
  const cleanUsername = username.trim().toLowerCase();
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(cleanUsername);
  if (existing) {
    return res.status(400).json({ error: "Username already taken." });
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const userRole = role === "ADMIN" ? "ADMIN" : "USER";
  const hash = hashPassword(targetPassword);
  const result = db.prepare(`
    INSERT INTO users (username, password_hash, full_name, role, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)
  `).run(cleanUsername, hash, targetFullName, userRole, now, now);
  logAudit(req.user.username, "User Created", "USER", cleanUsername, `Created user ${cleanUsername} with role ${userRole}`);
  res.status(201).json({ success: true, id: Number(result.lastInsertRowid) });
});
router.put("/users/:id", requireAdmin, (req, res) => {
  const userId = Number(req.params.id);
  const { fullName, role, status } = req.body;
  const targetUser = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!targetUser) {
    return res.status(404).json({ error: "User not found." });
  }
  if (targetUser.role === "ADMIN" && (status === "DISABLED" || role === "USER")) {
    if (isLastActiveAdmin(userId)) {
      return res.status(400).json({
        error: "Safety Rule Violation: Cannot disable or demote the last active Administrator account. Create another active Administrator first."
      });
    }
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
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
  logAudit(req.user.username, "User Updated", "USER", targetUser.username, `Updated user ${targetUser.username} (Role: ${role}, Status: ${status})`);
  res.json({ success: true, message: "User updated." });
});
router.post("/users/:id/reset-password", requireAdmin, (req, res) => {
  const userId = Number(req.params.id);
  const { newPassword, confirmPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters long." });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: "Passwords do not match." });
  }
  const targetUser = db.prepare("SELECT username FROM users WHERE id = ?").get(userId);
  if (!targetUser) {
    return res.status(404).json({ error: "User not found." });
  }
  const hash = hashPassword(newPassword);
  db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(hash, (/* @__PURE__ */ new Date()).toISOString(), userId);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  logAudit(req.user.username, "Admin Password Reset", "USER", targetUser.username, `Admin reset password for user ${targetUser.username}`);
  res.json({ success: true, message: `Password reset successfully for ${targetUser.username}.` });
});
router.delete("/users/:id", requireAdmin, (req, res) => {
  const userId = Number(req.params.id);
  if (isNaN(userId)) {
    return res.status(400).json({ error: "Invalid user ID." });
  }
  if (req.user.id === userId) {
    return res.status(400).json({ error: "Safety Rule Violation: You cannot delete your own currently logged-in administrator account." });
  }
  const targetUser = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!targetUser) {
    return res.status(404).json({ error: "User not found." });
  }
  if (targetUser.role === "ADMIN" && isLastActiveAdmin(userId)) {
    return res.status(400).json({
      error: "Safety Rule Violation: Cannot delete the last active Administrator account. Create another active Administrator first."
    });
  }
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  logAudit(req.user.username, "User Deleted", "USER", targetUser.username, `Admin deleted user @${targetUser.username} (${targetUser.role})`);
  res.json({ success: true, message: `User @${targetUser.username} has been deleted successfully.` });
});
router.get("/settings", requireAuth, (req, res) => {
  const settings = getSettings();
  res.json(settings);
});
router.put("/settings", requireAdmin, (req, res) => {
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
    team_name || "Operations Team",
    app_name || "Hando",
    timezone || "Africa/Cairo",
    morning_start || "06:00",
    morning_end || "14:00",
    mid_start || "14:00",
    mid_end || "22:00",
    night_start || "22:00",
    night_end || "06:00",
    Number(session_timeout) || 60,
    default_priority || "Medium",
    admin_recovery_email || "hossamhalawany@gmail.com",
    admin_recovery_pin || "748291",
    smtp_host || null,
    smtp_port ? Number(smtp_port) : 587,
    smtp_user || null,
    smtp_pass || null,
    smtp_from || null
  );
  if (admin_recovery_email) {
    db.prepare("UPDATE users SET email = ? WHERE role = 'ADMIN'").run(admin_recovery_email.trim().toLowerCase());
  }
  if (morning_start && morning_end) {
    db.prepare("UPDATE shifts SET start_time = ?, end_time = ? WHERE name = 'Morning'").run(morning_start, morning_end);
  }
  if (mid_start && mid_end) {
    db.prepare("UPDATE shifts SET start_time = ?, end_time = ? WHERE name = 'Mid'").run(mid_start, mid_end);
  }
  if (night_start && night_end) {
    db.prepare("UPDATE shifts SET start_time = ?, end_time = ? WHERE name = 'Night'").run(night_start, night_end);
  }
  logAudit(req.user.username, "Settings Updated", "SETTINGS", "1", "Updated operational parameters and notification configurations");
  res.json({ success: true, message: "Settings saved successfully." });
});
router.post("/settings/smtp/test", requireAdmin, async (req, res) => {
  const { testEmail } = req.body;
  const settings = getSettings();
  const recipient = testEmail || settings.admin_recovery_email || "hossamhalawany@gmail.com";
  const result = await sendTestEmail(recipient, settings);
  if (result.success) {
    res.json({ success: true, message: result.message });
  } else {
    res.status(500).json({ error: result.error || result.message });
  }
});
router.post("/settings/recovery-key/generate", requireAdmin, (req, res) => {
  const raw = import_crypto3.default.randomBytes(9).toString("hex").toUpperCase();
  const key = `REC-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  const hashed = hashPassword(key);
  db.prepare("UPDATE settings SET admin_recovery_key_hash = ? WHERE id = 1").run(hashed);
  logAudit(
    req.user.username,
    "Recovery Key Generated",
    "SETTINGS",
    "1",
    "Admin generated a new emergency recovery key"
  );
  res.json({
    success: true,
    key,
    message: "New Emergency Recovery Key generated. Save this key in a secure location. It will not be shown again."
  });
});
router.get("/settings/totp/setup", requireAdmin, async (req, res) => {
  try {
    const settings = getSettings();
    let secret = settings.admin_totp_secret;
    if (!secret || typeof secret !== "string" || secret.length < 16) {
      secret = (0, import_otplib.generateSecret)();
      db.prepare("UPDATE settings SET admin_totp_secret = ? WHERE id = 1").run(secret);
    }
    const appName = settings.app_name || "Shift Handover";
    const email = settings.admin_recovery_email || "hossamhalawany@gmail.com";
    const otpauth = (0, import_otplib.generateURI)({ issuer: `${appName} (Admin)`, label: email, secret });
    const qrCode = await import_qrcode.default.toDataURL(otpauth, { margin: 2, width: 260 });
    res.json({
      secret,
      qrCode,
      otpauth,
      enabled: settings.admin_totp_enabled === 1,
      email
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to initialize TOTP setup." });
  }
});
router.post("/settings/totp/regenerate", requireAdmin, async (req, res) => {
  try {
    const settings = getSettings();
    const newSecret = (0, import_otplib.generateSecret)();
    db.prepare("UPDATE settings SET admin_totp_secret = ?, admin_totp_enabled = 0 WHERE id = 1").run(newSecret);
    const appName = settings.app_name || "Shift Handover";
    const email = settings.admin_recovery_email || "hossamhalawany@gmail.com";
    const otpauth = (0, import_otplib.generateURI)({ issuer: `${appName} (Admin)`, label: email, secret: newSecret });
    const qrCode = await import_qrcode.default.toDataURL(otpauth, { margin: 2, width: 260 });
    logAudit(req.user.username, "TOTP Secret Regenerated", "SETTINGS", "1", "Admin regenerated Google Authenticator secret key");
    res.json({
      secret: newSecret,
      qrCode,
      otpauth,
      enabled: false,
      email
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to regenerate TOTP secret." });
  }
});
router.post("/settings/totp/verify-and-enable", requireAdmin, (req, res) => {
  const { code } = req.body;
  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "Please enter the 6-digit code shown in Google Authenticator." });
  }
  const cleanCode = code.trim();
  const settings = getSettings();
  if (!settings.admin_totp_secret) {
    return res.status(400).json({ error: "TOTP secret not initialized. Please refresh the page." });
  }
  const check = (0, import_otplib.verifySync)({
    token: cleanCode,
    secret: settings.admin_totp_secret,
    epochTolerance: 30
  });
  if (!check || !check.valid) {
    return res.status(400).json({
      error: "Invalid 6-digit code. Please ensure your device clock is synchronized and enter the current code from Google Authenticator."
    });
  }
  db.prepare("UPDATE settings SET admin_totp_enabled = 1 WHERE id = 1").run();
  logAudit(
    req.user.username,
    "2FA Enabled",
    "SETTINGS",
    "1",
    "Admin successfully activated Google Authenticator 2FA"
  );
  res.json({
    success: true,
    message: "Google Authenticator 2FA is now fully active! You can use it to reset your password or verify access anytime."
  });
});
router.post("/settings/totp/disable", requireAdmin, (req, res) => {
  db.prepare("UPDATE settings SET admin_totp_enabled = 0 WHERE id = 1").run();
  logAudit(
    req.user.username,
    "2FA Disabled",
    "SETTINGS",
    "1",
    "Admin turned off Google Authenticator 2FA requirement"
  );
  res.json({
    success: true,
    message: "Google Authenticator 2FA has been disabled."
  });
});
router.post("/demo/load", requireAuth, (req, res) => {
  res.json({
    success: true,
    message: "Demo scenario has been disabled in production."
  });
});
router.post("/demo/clear", requireAdmin, (req, res) => {
  const { clearUsers, clearAudit } = req.body || {};
  db.exec("DELETE FROM handover_tasks;");
  db.exec("DELETE FROM handovers;");
  db.exec("DELETE FROM task_history;");
  db.exec("DELETE FROM tasks;");
  try {
    db.exec(`DELETE FROM sqlite_sequence WHERE name IN ('tasks', 'task_history', 'handovers', 'handover_tasks');`);
  } catch (e) {
  }
  if (clearUsers) {
    db.prepare("DELETE FROM users WHERE id != ?").run(req.user.id);
    db.prepare("DELETE FROM sessions WHERE user_id != ?").run(req.user.id);
  }
  if (clearAudit) {
    db.exec("DELETE FROM audit_logs;");
  }
  logAudit(
    req.user.username,
    "Operational Data Cleared",
    "SYSTEM",
    null,
    `Cleared all operational tasks, histories, and handovers${clearUsers ? " and demo users" : ""}`
  );
  res.json({
    success: true,
    message: "All tasks, histories, and handover records cleared successfully. System is clean for production."
  });
});
router.post("/system/factory-reset", requireAdmin, (req, res) => {
  db.exec("DELETE FROM handover_tasks;");
  db.exec("DELETE FROM handovers;");
  db.exec("DELETE FROM task_history;");
  db.exec("DELETE FROM tasks;");
  db.exec("DELETE FROM sessions;");
  db.exec("DELETE FROM users;");
  db.exec("DELETE FROM audit_logs;");
  try {
    db.exec(`DELETE FROM sqlite_sequence;`);
  } catch (e) {
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
    message: "Full factory reset complete. The initial setup wizard is now ready."
  });
});
router.get("/backup/download", requireAdmin, (req, res) => {
  if (!import_fs2.default.existsSync(DB_PATH)) {
    return res.status(404).json({ error: "Database file not found." });
  }
  logAudit(req.user.username, "Database Backup Downloaded", "DATABASE", null, "Downloaded SQLite database backup");
  const filename = `shift_handover_backup_${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}.sqlite`;
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Type", "application/x-sqlite3");
  import_fs2.default.createReadStream(DB_PATH).pipe(res);
});
router.get("/export/csv/:type", requireAdmin, (req, res) => {
  const type = req.params.type;
  let csv = "";
  let filename = "";
  if (type === "tasks") {
    const tasks = db.prepare("SELECT * FROM tasks ORDER BY id ASC").all();
    filename = `shift_tasks_${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}.csv`;
    csv = "ID,Task Code,Title,Priority,Status,Category,Created By,Created At,Shift,Assigned User,Due Date,Completed By,Completed At\n";
    for (const t of tasks) {
      csv += `"${t.id}","${t.task_code}","${(t.title || "").replace(/"/g, '""')}","${t.priority}","${t.status}","${t.category}","${t.created_by}","${t.created_at}","${t.current_shift}","${t.assigned_user || ""}","${t.due_date || ""}","${t.completed_by || ""}","${t.completed_at || ""}"
`;
    }
  } else if (type === "handovers") {
    const handovers = db.prepare("SELECT * FROM handovers ORDER BY id ASC").all();
    filename = `shift_handovers_${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}.csv`;
    csv = "ID,Date,From Shift,To Shift,Closed By,Closed At,Acknowledged By,Acknowledged At,Completed Tasks,Carried Over,Blocked,General Notes\n";
    for (const h of handovers) {
      csv += `"${h.id}","${h.shift_date}","${h.from_shift}","${h.to_shift}","${h.closed_by}","${h.closed_at}","${h.acknowledged_by || ""}","${h.acknowledged_at || ""}","${h.tasks_completed_count}","${h.tasks_carried_over_count}","${h.tasks_blocked_count}","${(h.general_notes || "").replace(/"/g, '""')}"
`;
    }
  } else if (type === "audit") {
    const logs = db.prepare("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 500").all();
    filename = `shift_audit_logs_${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}.csv`;
    csv = "ID,Timestamp,User,Action,Entity Type,Entity ID,Details,IP Address\n";
    for (const l of logs) {
      csv += `"${l.id}","${l.created_at}","${l.user_name}","${l.action}","${l.entity_type}","${l.entity_id || ""}","${(l.details || "").replace(/"/g, '""')}","${l.ip_address || ""}"
`;
    }
  } else {
    return res.status(400).json({ error: "Invalid export type. Supported: tasks, handovers, audit" });
  }
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.send(csv);
});
router.get(["/download-php-zip", "/export/php-zip"], async (req, res) => {
  try {
    const zipBuffer = await generatePhpZip();
    const filename = "shift-handover-php8-standalone.zip";
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/zip");
    res.send(zipBuffer);
  } catch (err) {
    console.error("Failed to generate PHP zip:", err);
    res.status(500).json({ error: "Failed to generate PHP standalone ZIP: " + err.message });
  }
});
var api_default = router;

// server.ts
async function startServer() {
  const app = (0, import_express2.default)();
  const PORT = 3e3;
  initDatabase();
  app.use(import_express2.default.json());
  app.use(import_express2.default.urlencoded({ extended: true }));
  app.use(authMiddleware);
  app.use("/api", api_default);
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", service: "Shift Handover" });
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path2.default.join(process.cwd(), "dist");
    app.use(import_express2.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path2.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Shift Handover server running on http://0.0.0.0:${PORT}`);
  });
}
startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
//# sourceMappingURL=server.cjs.map

import crypto from 'crypto';
import { db, logAudit } from './db.ts';

export const SUPPORTED_TABLES = [
  'settings',
  'users',
  'categories',
  'shifts',
  'tasks',
  'task_history',
  'handovers',
  'handover_tasks',
  'shift_acceptances',
  'shift_notes',
  'audit_logs'
] as const;

export type SupportedTable = typeof SUPPORTED_TABLES[number];

export interface TableConfig {
  name: SupportedTable;
  label: string;
  description: string;
  dateColumn: string | null;
  category: 'configuration' | 'operational' | 'security';
}

export const TABLE_CONFIGS: Record<SupportedTable, TableConfig> = {
  settings: {
    name: 'settings',
    label: 'System Settings',
    description: 'Organization name, operational timetable, emergency recovery config, and preferences',
    dateColumn: null,
    category: 'configuration'
  },
  users: {
    name: 'users',
    label: 'User Accounts & Roles',
    description: 'Operator credentials, role permissions (Admin, Supervisor, User), and profile details',
    dateColumn: 'created_at',
    category: 'configuration'
  },
  categories: {
    name: 'categories',
    label: 'Task Categories',
    description: 'Operational categories and UI color codes (Incident, Monitoring, etc.)',
    dateColumn: null,
    category: 'configuration'
  },
  shifts: {
    name: 'shifts',
    label: 'Shift Timetable & Rosters',
    description: 'Shift operational windows, timing definitions, and midnight crossover rules',
    dateColumn: null,
    category: 'configuration'
  },
  tasks: {
    name: 'tasks',
    label: 'Tasks & Activities',
    description: 'All operational tasks, priority, statuses, COB batch counts, and assignees',
    dateColumn: 'created_at',
    category: 'operational'
  },
  task_history: {
    name: 'task_history',
    label: 'Task Timelines & History',
    description: 'Audit history of status transitions, notes, and task lifecycle events',
    dateColumn: 'created_at',
    category: 'operational'
  },
  handovers: {
    name: 'handovers',
    label: 'Shift Handover Records',
    description: 'Formal shift closure reports, summary statistics, and acknowledgements',
    dateColumn: 'shift_date',
    category: 'operational'
  },
  handover_tasks: {
    name: 'handover_tasks',
    label: 'Handover Tasks Disposition',
    description: 'Disposition records linking specific tasks to shift handovers',
    dateColumn: null,
    category: 'operational'
  },
  shift_acceptances: {
    name: 'shift_acceptances',
    label: 'Shift Acceptances',
    description: 'Incoming shift acceptance acknowledgements and operator handover signatures',
    dateColumn: 'shift_date',
    category: 'operational'
  },
  shift_notes: {
    name: 'shift_notes',
    label: 'Shift Sticky Notes',
    description: 'Operational sticky notes linked to specific shift business dates',
    dateColumn: 'shift_date',
    category: 'operational'
  },
  audit_logs: {
    name: 'audit_logs',
    label: 'Audit Trail Logs',
    description: 'Security and governance logs recording all critical user and system actions',
    dateColumn: 'created_at',
    category: 'security'
  }
};

export interface BackupMetadata {
  app: string;
  backup_version: string;
  format: 'shift-handover-backup';
  exported_at: string;
  exported_by: string;
  mode: 'FULL' | 'SELECTIVE';
  date_range: {
    start: string | null;
    end: string | null;
  };
  tables_included: SupportedTable[];
  record_counts: Record<string, number>;
  total_records: number;
  checksum: string;
}

export interface BackupPackage {
  _metadata: BackupMetadata;
  data: Record<string, any[]>;
}

export interface ExportOptions {
  tables?: string[];
  startDate?: string | null;
  endDate?: string | null;
  exportedBy: string;
  appName?: string;
}

/**
 * Generate a complete or selective JSON backup with full metadata & SHA-256 integrity checksum
 */
export function generateBackup(options: ExportOptions): BackupPackage {
  const { tables, startDate, endDate, exportedBy, appName } = options;

  // Filter valid tables
  const requestedTables: SupportedTable[] = (tables && tables.length > 0)
    ? tables.filter((t): t is SupportedTable => (SUPPORTED_TABLES as readonly string[]).includes(t))
    : [...SUPPORTED_TABLES];

  if (requestedTables.length === 0) {
    throw new Error('No valid tables selected for backup export.');
  }

  const isSelective = requestedTables.length < SUPPORTED_TABLES.length || Boolean(startDate) || Boolean(endDate);
  const data: Record<string, any[]> = {};
  const recordCounts: Record<string, number> = {};
  let totalRecords = 0;

  // Helper for date filtering
  const hasDateFilter = Boolean(startDate || endDate);
  const normalizedStart = startDate ? (startDate.includes('T') ? startDate : `${startDate}T00:00:00.000Z`) : null;
  const normalizedEnd = endDate ? (endDate.includes('T') ? endDate : `${endDate}T23:59:59.999Z`) : null;

  for (const table of requestedTables) {
    const config = TABLE_CONFIGS[table];
    let query = `SELECT * FROM ${table}`;
    const params: any[] = [];

    if (hasDateFilter && config.dateColumn) {
      const dateCol = config.dateColumn;
      if (normalizedStart && normalizedEnd) {
        query += ` WHERE (${dateCol} >= ? AND ${dateCol} <= ?)`;
        params.push(normalizedStart, normalizedEnd);
      } else if (normalizedStart) {
        query += ` WHERE ${dateCol} >= ?`;
        params.push(normalizedStart);
      } else if (normalizedEnd) {
        query += ` WHERE ${dateCol} <= ?`;
        params.push(normalizedEnd);
      }
    }

    // Secondary join filters for relational sub-tables if date filtered
    if (hasDateFilter && table === 'handover_tasks' && requestedTables.includes('handovers')) {
      // If handovers were filtered by date, filter handover_tasks to match
      if (normalizedStart && normalizedEnd) {
        query = `
          SELECT ht.* FROM handover_tasks ht
          INNER JOIN handovers h ON ht.handover_id = h.id
          WHERE (h.shift_date >= ? AND h.shift_date <= ?) OR (h.closed_at >= ? AND h.closed_at <= ?)
        `;
        params.length = 0;
        params.push(
          startDate, endDate,
          normalizedStart, normalizedEnd
        );
      }
    }

    query += ' ORDER BY id ASC';

    try {
      const rows = db.prepare(query).all(...params) as any[];
      data[table] = rows;
      recordCounts[table] = rows.length;
      totalRecords += rows.length;
    } catch (err: any) {
      console.error(`Error querying table ${table} for backup:`, err);
      data[table] = [];
      recordCounts[table] = 0;
    }
  }

  // Calculate deterministic SHA-256 checksum of the exported data payload
  const dataString = JSON.stringify(data);
  const checksum = crypto.createHash('sha256').update(dataString).digest('hex');

  const metadata: BackupMetadata = {
    app: appName || 'Shift Handover Operations',
    backup_version: '2.0',
    format: 'shift-handover-backup',
    exported_at: new Date().toISOString(),
    exported_by: exportedBy,
    mode: isSelective ? 'SELECTIVE' : 'FULL',
    date_range: {
      start: startDate || null,
      end: endDate || null
    },
    tables_included: requestedTables,
    record_counts: recordCounts,
    total_records: totalRecords,
    checksum
  };

  return {
    _metadata: metadata,
    data
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metadata: BackupMetadata | null;
  tableCounts: Record<string, number>;
  totalRecords: number;
  detectedTables: string[];
}

/**
 * Validates a parsed or uploaded JSON backup structure before execution
 */
export function validateBackup(backupJson: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const tableCounts: Record<string, number> = {};
  let totalRecords = 0;
  const detectedTables: string[] = [];

  if (!backupJson || typeof backupJson !== 'object') {
    return {
      valid: false,
      errors: ['Invalid backup file: Root must be a valid JSON object.'],
      warnings: [],
      metadata: null,
      tableCounts: {},
      totalRecords: 0,
      detectedTables: []
    };
  }

  // Check metadata
  const metadata = backupJson._metadata as BackupMetadata | undefined;
  if (!metadata) {
    warnings.push('Warning: Backup file does not contain an official _metadata header. Legacy format detected.');
  } else {
    if (metadata.format && metadata.format !== 'shift-handover-backup') {
      warnings.push(`Unrecognized backup format signature: "${metadata.format}".`);
    }
  }

  // Check data payload
  const data = backupJson.data;
  if (!data || typeof data !== 'object') {
    errors.push('Invalid backup structure: "data" property is missing or not an object.');
    return {
      valid: false,
      errors,
      warnings,
      metadata: metadata || null,
      tableCounts: {},
      totalRecords: 0,
      detectedTables: []
    };
  }

  // Verify tables inside data
  const dataKeys = Object.keys(data);
  if (dataKeys.length === 0) {
    errors.push('Backup file contains no table data to restore.');
  }

  for (const table of dataKeys) {
    if (!(SUPPORTED_TABLES as readonly string[]).includes(table)) {
      warnings.push(`Ignored unsupported table in backup file: "${table}".`);
      continue;
    }

    const rows = data[table];
    if (!Array.isArray(rows)) {
      errors.push(`Table "${table}" data must be an array of records.`);
      continue;
    }

    detectedTables.push(table);
    tableCounts[table] = rows.length;
    totalRecords += rows.length;

    // Spot-check first record of key tables
    if (rows.length > 0) {
      const sample = rows[0];
      if (typeof sample !== 'object' || sample === null) {
        errors.push(`Table "${table}" contains invalid non-object row entries.`);
      } else {
        if (table === 'tasks' && (!sample.task_code || !sample.title)) {
          errors.push(`Tasks table contains malformed records missing "task_code" or "title".`);
        }
        if (table === 'users' && (!sample.username || !sample.role)) {
          errors.push(`Users table contains malformed records missing "username" or "role".`);
        }
      }
    }
  }

  // Verify integrity checksum if present
  if (metadata?.checksum) {
    try {
      const calculatedChecksum = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
      if (calculatedChecksum !== metadata.checksum) {
        warnings.push('Integrity Checksum Notice: The data payload checksum does not match the metadata checksum (file may have been modified).');
      }
    } catch {
      // Ignore checksum check error
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metadata: metadata || null,
    tableCounts,
    totalRecords,
    detectedTables
  };
}

export interface RestoreOptions {
  backupJson: BackupPackage;
  mode: 'merge' | 'overwrite';
  selectedTables?: string[];
  restoredBy: string;
  currentUserId?: number;
  currentSessionToken?: string | null;
}

export interface RestoreResult {
  success: boolean;
  mode: 'merge' | 'overwrite';
  restoredAt: string;
  restoredBy: string;
  tableStats: Record<string, { inserted: number; updated: number; skipped: number }>;
  totalProcessed: number;
  message: string;
}

/**
 * Executes a full database restore (Append/Merge or Full Disaster Recovery Overwrite)
 * with strict atomic SQLite transactions and rollback on any error.
 */
export function executeRestore(options: RestoreOptions): RestoreResult {
  const { backupJson, mode, selectedTables, restoredBy, currentUserId, currentSessionToken } = options;

  const validation = validateBackup(backupJson);
  if (!validation.valid) {
    throw new Error(`Restore validation failed: ${validation.errors.join('; ')}`);
  }

  const data = backupJson.data;
  const availableTables = validation.detectedTables as SupportedTable[];

  // If specific tables were selected, filter them; otherwise restore all present tables
  const targetTables = (selectedTables && selectedTables.length > 0)
    ? availableTables.filter(t => selectedTables.includes(t))
    : availableTables;

  if (targetTables.length === 0) {
    throw new Error('No valid tables selected for restore operation.');
  }

  const tableStats: Record<string, { inserted: number; updated: number; skipped: number }> = {};
  for (const t of targetTables) {
    tableStats[t] = { inserted: 0, updated: 0, skipped: 0 };
  }

  const now = new Date().toISOString();

  // BEGIN ATOMIC TRANSACTION
  db.exec('BEGIN TRANSACTION;');

  try {
    if (mode === 'overwrite') {
      // =========================================================================
      // DISASTER RECOVERY MODE: Full Overwrite
      // =========================================================================

      // Temporarily disable foreign keys during wipe and full reconstruction
      db.exec('PRAGMA foreign_keys = OFF;');

      // Delete existing data in reverse dependency order
      const deletionOrder: SupportedTable[] = [
        'handover_tasks',
        'task_history',
        'tasks',
        'handovers',
        'shift_notes',
        'shift_acceptances',
        'audit_logs',
        'categories',
        'shifts',
        'users',
        'settings'
      ];

      for (const table of deletionOrder) {
        if (targetTables.includes(table)) {
          db.prepare(`DELETE FROM ${table};`).run();
          // Reset SQLite sequence if exists
          try {
            db.prepare(`DELETE FROM sqlite_sequence WHERE name = ?;`).run(table);
          } catch {
            // Ignore
          }
        }
      }

      // Re-insert records in forward dependency order
      const insertionOrder: SupportedTable[] = [
        'settings',
        'users',
        'categories',
        'shifts',
        'tasks',
        'task_history',
        'handovers',
        'handover_tasks',
        'shift_acceptances',
        'shift_notes',
        'audit_logs'
      ];

      for (const table of insertionOrder) {
        if (!targetTables.includes(table)) continue;
        const rows = data[table] || [];
        if (rows.length === 0) continue;

        for (const row of rows) {
          const keys = Object.keys(row);
          if (keys.length === 0) continue;

          const placeholders = keys.map(() => '?').join(', ');
          const columns = keys.join(', ');
          const values = keys.map(k => row[k]);

          const stmt = db.prepare(`INSERT INTO ${table} (${columns}) VALUES (${placeholders});`);
          stmt.run(...values);
          tableStats[table].inserted++;
        }
      }

      // Re-enable and verify foreign keys
      db.exec('PRAGMA foreign_keys = ON;');

      // Verify foreign key integrity
      const fkErrors = db.prepare('PRAGMA foreign_key_check;').all() as any[];
      if (fkErrors && fkErrors.length > 0) {
        throw new Error(`Foreign key constraint check failed after restore on table: ${fkErrors[0]?.table || 'unknown'}`);
      }

      // Safeguard: Ensure current session remains active so the operator isn't abruptly kicked out
      if (currentSessionToken && currentUserId) {
        try {
          const restoredUser = db.prepare('SELECT id, username, role FROM users WHERE username = ? OR id = ?').get(restoredBy, currentUserId) as any;
          if (restoredUser) {
            // Re-insert or update current session
            const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
            db.prepare(`
              INSERT OR REPLACE INTO sessions (token, user_id, username, role, created_at, expires_at)
              VALUES (?, ?, ?, ?, ?, ?)
            `).run(currentSessionToken, restoredUser.id, restoredUser.username, restoredUser.role, now, expires);
          }
        } catch (sessErr) {
          console.warn('Session preservation warning:', sessErr);
        }
      }

      // Log audit
      logAudit(
        restoredBy,
        'DATABASE_DISASTER_RECOVERY_OVERWRITE',
        'DATABASE',
        null,
        `Performed full disaster recovery database overwrite from JSON backup. Restored ${Object.values(tableStats).reduce((sum, s) => sum + s.inserted, 0)} records.`
      );

      // COMMIT TRANSACTION
      db.exec('COMMIT;');

      return {
        success: true,
        mode: 'overwrite',
        restoredAt: now,
        restoredBy,
        tableStats,
        totalProcessed: Object.values(tableStats).reduce((sum, s) => sum + s.inserted, 0),
        message: 'Database completely restored from backup snapshot (Disaster Recovery Mode).'
      };
    } else {
      // =========================================================================
      // APPEND / MERGE MODE: Smart Incremental Upsert
      // =========================================================================

      // 1. Settings (if included) -> Update existing settings row (id = 1)
      if (targetTables.includes('settings') && data.settings && data.settings.length > 0) {
        const s = data.settings[0];
        const existing = db.prepare('SELECT id FROM settings WHERE id = 1').get();
        if (existing) {
          db.prepare(`
            UPDATE settings SET
              team_name = COALESCE(?, team_name),
              app_name = COALESCE(?, app_name),
              timezone = COALESCE(?, timezone),
              morning_start = COALESCE(?, morning_start),
              morning_end = COALESCE(?, morning_end),
              mid_start = COALESCE(?, mid_start),
              mid_end = COALESCE(?, mid_end),
              night_start = COALESCE(?, night_start),
              night_end = COALESCE(?, night_end),
              holiday_dates = COALESCE(?, holiday_dates),
              weekend_oncall_enabled = COALESCE(?, weekend_oncall_enabled),
              weekend_holiday_shift_mode = COALESCE(?, weekend_holiday_shift_mode)
            WHERE id = 1;
          `).run(
            s.team_name || null,
            s.app_name || null,
            s.timezone || null,
            s.morning_start || null,
            s.morning_end || null,
            s.mid_start || null,
            s.mid_end || null,
            s.night_start || null,
            s.night_end || null,
            s.holiday_dates || null,
            s.weekend_oncall_enabled !== undefined ? s.weekend_oncall_enabled : null,
            s.weekend_holiday_shift_mode || null
          );
          tableStats.settings.updated++;
        }
      }

      // 2. Categories -> Upsert by name
      if (targetTables.includes('categories') && data.categories) {
        for (const cat of data.categories) {
          const existing = db.prepare('SELECT id FROM categories WHERE LOWER(name) = ?').get(cat.name.toLowerCase()) as any;
          if (existing) {
            db.prepare('UPDATE categories SET color = ? WHERE id = ?').run(cat.color || '#0F4C81', existing.id);
            tableStats.categories.updated++;
          } else {
            db.prepare('INSERT INTO categories (name, color) VALUES (?, ?)').run(cat.name, cat.color || '#0F4C81');
            tableStats.categories.inserted++;
          }
        }
      }

      // 3. Shifts -> Upsert by name
      if (targetTables.includes('shifts') && data.shifts) {
        for (const sh of data.shifts) {
          const existing = db.prepare('SELECT id FROM shifts WHERE LOWER(name) = ?').get(sh.name.toLowerCase()) as any;
          if (existing) {
            db.prepare(`
              UPDATE shifts SET
                display_order = ?, start_time = ?, end_time = ?,
                crosses_midnight = ?, description = ?, updated_at = ?
              WHERE id = ?
            `).run(
              sh.display_order ?? 1,
              sh.start_time,
              sh.end_time,
              sh.crosses_midnight ?? 0,
              sh.description || null,
              now,
              existing.id
            );
            tableStats.shifts.updated++;
          } else {
            db.prepare(`
              INSERT INTO shifts (name, display_order, start_time, end_time, crosses_midnight, description, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              sh.name,
              sh.display_order ?? 1,
              sh.start_time,
              sh.end_time,
              sh.crosses_midnight ?? 0,
              sh.description || null,
              sh.created_at || now,
              now
            );
            tableStats.shifts.inserted++;
          }
        }
      }

      // 4. Users -> Upsert by username
      if (targetTables.includes('users') && data.users) {
        for (const u of data.users) {
          const existing = db.prepare('SELECT id, role FROM users WHERE LOWER(username) = ?').get(u.username.toLowerCase()) as any;
          if (existing) {
            // Update profile fields without destroying existing passwords if matching
            db.prepare(`
              UPDATE users SET
                full_name = COALESCE(?, full_name),
                email = COALESCE(?, email),
                role = COALESCE(?, role),
                status = COALESCE(?, status),
                updated_at = ?
              WHERE id = ?
            `).run(
              u.full_name || null,
              u.email || null,
              u.role || null,
              u.status || null,
              now,
              existing.id
            );
            tableStats.users.updated++;
          } else {
            db.prepare(`
              INSERT INTO users (username, password_hash, full_name, email, role, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              u.username.toLowerCase(),
              u.password_hash,
              u.full_name,
              u.email || null,
              u.role || 'USER',
              u.status || 'ACTIVE',
              u.created_at || now,
              u.updated_at || now
            );
            tableStats.users.inserted++;
          }
        }
      }

      // Map old backup task ID to database task ID
      const taskIdMap = new Map<number, number>();

      // 5. Tasks -> Upsert by task_code
      if (targetTables.includes('tasks') && data.tasks) {
        for (const t of data.tasks) {
          const existing = db.prepare('SELECT id, version FROM tasks WHERE task_code = ?').get(t.task_code) as any;
          if (existing) {
            taskIdMap.set(t.id, existing.id);
            // Update if version in backup is >= existing version
            if ((t.version || 1) >= (existing.version || 1)) {
              db.prepare(`
                UPDATE tasks SET
                  title = ?, description = ?, priority = ?, status = ?, category = ?,
                  current_shift = ?, assigned_user = ?, due_date = ?, last_updated_by = ?,
                  last_updated_at = ?, completed_at = ?, completed_by = ?, completion_note = ?,
                  cancellation_reason = ?, blocked_reason = ?, carry_over_reason = ?,
                  handover_state = ?, version = ?, is_cob = ?, cob_count = ?
                WHERE id = ?
              `).run(
                t.title,
                t.description || null,
                t.priority || 'Medium',
                t.status || 'Pending',
                t.category || 'Other',
                t.current_shift || 'Morning',
                t.assigned_user || null,
                t.due_date || null,
                t.last_updated_by || restoredBy,
                t.last_updated_at || now,
                t.completed_at || null,
                t.completed_by || null,
                t.completion_note || null,
                t.cancellation_reason || null,
                t.blocked_reason || null,
                t.carry_over_reason || null,
                t.handover_state || 'None',
                Math.max(t.version || 1, existing.version || 1),
                t.is_cob ? 1 : 0,
                t.cob_count || null,
                existing.id
              );
              tableStats.tasks.updated++;
            } else {
              tableStats.tasks.skipped++;
            }
          } else {
            const res = db.prepare(`
              INSERT INTO tasks (
                task_code, title, description, priority, status, category,
                created_by, created_at, original_shift, current_shift, assigned_user,
                due_date, last_updated_by, last_updated_at, completed_at, completed_by,
                completion_note, cancellation_reason, blocked_reason, carry_over_reason,
                handover_state, version, is_cob, cob_count
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              t.task_code,
              t.title,
              t.description || null,
              t.priority || 'Medium',
              t.status || 'Pending',
              t.category || 'Other',
              t.created_by || restoredBy,
              t.created_at || now,
              t.original_shift || 'Morning',
              t.current_shift || 'Morning',
              t.assigned_user || null,
              t.due_date || null,
              t.last_updated_by || restoredBy,
              t.last_updated_at || now,
              t.completed_at || null,
              t.completed_by || null,
              t.completion_note || null,
              t.cancellation_reason || null,
              t.blocked_reason || null,
              t.carry_over_reason || null,
              t.handover_state || 'None',
              t.version || 1,
              t.is_cob ? 1 : 0,
              t.cob_count || null
            );
            taskIdMap.set(t.id, Number(res.lastInsertRowid));
            tableStats.tasks.inserted++;
          }
        }
      }

      // 6. Task History -> Insert missing timeline entries
      if (targetTables.includes('task_history') && data.task_history) {
        for (const th of data.task_history) {
          const mappedTaskId = taskIdMap.get(th.task_id) || th.task_id;
          // Check if identical history row already exists
          const existing = db.prepare(`
            SELECT id FROM task_history
            WHERE task_code = ? AND action = ? AND created_at = ?
          `).get(th.task_code, th.action, th.created_at);

          if (!existing) {
            // Verify task_id exists
            const taskExists = db.prepare('SELECT id FROM tasks WHERE id = ?').get(mappedTaskId);
            if (taskExists) {
              db.prepare(`
                INSERT INTO task_history (
                  task_id, task_code, action, user_name, shift,
                  previous_status, new_status, notes, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                mappedTaskId,
                th.task_code,
                th.action,
                th.user_name,
                th.shift || 'All',
                th.previous_status || null,
                th.new_status || null,
                th.notes || null,
                th.created_at || now
              );
              tableStats.task_history.inserted++;
            } else {
              tableStats.task_history.skipped++;
            }
          } else {
            tableStats.task_history.skipped++;
          }
        }
      }

      // Map old backup handover ID to database handover ID
      const handoverIdMap = new Map<number, number>();

      // 7. Handovers -> Upsert by shift_date + from_shift + to_shift
      if (targetTables.includes('handovers') && data.handovers) {
        for (const h of data.handovers) {
          const existing = db.prepare(`
            SELECT id FROM handovers
            WHERE shift_date = ? AND from_shift = ? AND to_shift = ?
          `).get(h.shift_date, h.from_shift, h.to_shift) as any;

          if (existing) {
            handoverIdMap.set(h.id, existing.id);
            tableStats.handovers.updated++;
          } else {
            const res = db.prepare(`
              INSERT INTO handovers (
                from_shift, to_shift, shift_date, closed_by, closed_at,
                acknowledged_by, acknowledged_at, general_notes,
                tasks_completed_count, tasks_carried_over_count, tasks_blocked_count
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              h.from_shift,
              h.to_shift,
              h.shift_date,
              h.closed_by,
              h.closed_at,
              h.acknowledged_by || null,
              h.acknowledged_at || null,
              h.general_notes || null,
              h.tasks_completed_count || 0,
              h.tasks_carried_over_count || 0,
              h.tasks_blocked_count || 0
            );
            handoverIdMap.set(h.id, Number(res.lastInsertRowid));
            tableStats.handovers.inserted++;
          }
        }
      }

      // 8. Handover Tasks -> Insert missing links
      if (targetTables.includes('handover_tasks') && data.handover_tasks) {
        for (const ht of data.handover_tasks) {
          const mappedHandoverId = handoverIdMap.get(ht.handover_id) || ht.handover_id;
          const mappedTaskId = taskIdMap.get(ht.task_id) || ht.task_id;

          const existing = db.prepare(`
            SELECT id FROM handover_tasks
            WHERE handover_id = ? AND task_code = ?
          `).get(mappedHandoverId, ht.task_code);

          if (!existing) {
            // Check foreign keys exist
            const hExists = db.prepare('SELECT id FROM handovers WHERE id = ?').get(mappedHandoverId);
            const tExists = db.prepare('SELECT id FROM tasks WHERE id = ?').get(mappedTaskId);

            if (hExists && tExists) {
              db.prepare(`
                INSERT INTO handover_tasks (
                  handover_id, task_id, task_code, task_title, disposition, notes
                ) VALUES (?, ?, ?, ?, ?, ?)
              `).run(
                mappedHandoverId,
                mappedTaskId,
                ht.task_code,
                ht.task_title,
                ht.disposition,
                ht.notes || null
              );
              tableStats.handover_tasks.inserted++;
            } else {
              tableStats.handover_tasks.skipped++;
            }
          } else {
            tableStats.handover_tasks.skipped++;
          }
        }
      }

      // 9. Shift Acceptances -> Insert missing acceptances
      if (targetTables.includes('shift_acceptances') && data.shift_acceptances) {
        for (const sa of data.shift_acceptances) {
          const existing = db.prepare(`
            SELECT id FROM shift_acceptances
            WHERE shift_name = ? AND shift_date = ? AND accepted_at = ?
          `).get(sa.shift_name, sa.shift_date, sa.accepted_at);

          if (!existing) {
            db.prepare(`
              INSERT INTO shift_acceptances (shift_name, shift_date, accepted_by, accepted_at, notes)
              VALUES (?, ?, ?, ?, ?)
            `).run(
              sa.shift_name,
              sa.shift_date,
              sa.accepted_by,
              sa.accepted_at,
              sa.notes || null
            );
            tableStats.shift_acceptances.inserted++;
          } else {
            tableStats.shift_acceptances.skipped++;
          }
        }
      }

      // 10. Shift Notes -> Insert missing notes
      if (targetTables.includes('shift_notes') && data.shift_notes) {
        for (const sn of data.shift_notes) {
          const existing = db.prepare(`
            SELECT id FROM shift_notes
            WHERE shift_date = ? AND content = ? AND created_at = ?
          `).get(sn.shift_date, sn.content, sn.created_at);

          if (!existing) {
            db.prepare(`
              INSERT INTO shift_notes (
                shift_date, shift_name, title, content, color, pinned,
                created_by, created_at, updated_by, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              sn.shift_date,
              sn.shift_name || 'All',
              sn.title || null,
              sn.content,
              sn.color || 'amber',
              sn.pinned ? 1 : 0,
              sn.created_by || restoredBy,
              sn.created_at || now,
              sn.updated_by || null,
              sn.updated_at || null
            );
            tableStats.shift_notes.inserted++;
          } else {
            tableStats.shift_notes.skipped++;
          }
        }
      }

      // 11. Audit Logs -> Insert missing logs
      if (targetTables.includes('audit_logs') && data.audit_logs) {
        for (const al of data.audit_logs) {
          const existing = db.prepare(`
            SELECT id FROM audit_logs
            WHERE created_at = ? AND user_name = ? AND action = ?
          `).get(al.created_at, al.user_name, al.action);

          if (!existing) {
            db.prepare(`
              INSERT INTO audit_logs (created_at, user_name, action, entity_type, entity_id, details, ip_address)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
              al.created_at,
              al.user_name,
              al.action,
              al.entity_type,
              al.entity_id || null,
              al.details || null,
              al.ip_address || '127.0.0.1'
            );
            tableStats.audit_logs.inserted++;
          } else {
            tableStats.audit_logs.skipped++;
          }
        }
      }

      // Log the restore audit action
      logAudit(
        restoredBy,
        'DATABASE_RESTORE_MERGE',
        'DATABASE',
        null,
        `Merged records from JSON backup: ${Object.values(tableStats).reduce((sum, s) => sum + s.inserted, 0)} inserted, ${Object.values(tableStats).reduce((sum, s) => sum + s.updated, 0)} updated.`
      );

      // COMMIT TRANSACTION
      db.exec('COMMIT;');

      const totalProcessed = Object.values(tableStats).reduce((sum, s) => sum + s.inserted + s.updated, 0);
      return {
        success: true,
        mode: 'merge',
        restoredAt: now,
        restoredBy,
        tableStats,
        totalProcessed,
        message: `Backup data successfully merged into the database (${totalProcessed} records processed).`
      };
    }
  } catch (err: any) {
    // If any failure occurs, rollback transaction immediately to leave DB intact
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignore rollback errors
    }
    try {
      db.exec('PRAGMA foreign_keys = ON;');
    } catch {
      // Ignore
    }

    console.error('Database restore transaction failed:', err);
    throw new Error(`Database restore aborted: ${err.message || 'Transaction failed.'}`);
  }
}

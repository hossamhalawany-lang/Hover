export type UserRole = 'ADMIN' | 'SUPERVISOR' | 'USER';
export type UserStatus = 'ACTIVE' | 'DISABLED';

export interface User {
  id: number;
  username: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  email?: string | null;
  selectedShift?: ShiftName;
  lastLoginAt?: string;
  createdAt?: string;
}

export type ShiftName = 'Morning' | 'Mid' | 'Night' | '24H On-Call';

export interface ShiftInfo {
  name: ShiftName;
  userShift?: ShiftName;
  startTime: string;
  endTime: string;
  currentDate: string;
  businessDate?: string;
  calendarDate?: string;
  previousShiftBusinessDate?: string;
  timeRemainingSeconds: number;
  timeRemainingFormatted: string;
  approachingEnd: boolean;
  timezone: string;
  nextShift: ShiftName;
  previousShift: ShiftName;
  colorTheme: 'blue' | 'orange' | 'purple' | 'indigo';
  isOnCallDay?: boolean;
  dayType?: 'WEEKDAY' | 'WEEKEND_ONCALL' | 'HOLIDAY_ONCALL';
  dayName?: string;
  onCallReason?: string;
  weekendHolidayShiftMode?: 'SINGLE_OPERATOR_24H' | 'THREE_SHIFTS';
  isUnified24HActive?: boolean;
  crossesMidnight?: boolean;
  isNightCrossoverActive?: boolean;
}

export type TaskPriority = 'Critical' | 'High' | 'Medium' | 'Low';
export type TaskStatus = 'Pending' | 'In Progress' | 'Completed' | 'Blocked' | 'Cancelled';
export type HandoverState = 'None' | 'Pending Review' | 'Carried Over' | 'Blocked' | 'Completed';

export interface Task {
  id: number;
  task_code: string;
  title: string;
  description?: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  category: string;
  created_by: string;
  created_at: string;
  original_shift: ShiftName;
  current_shift: ShiftName;
  assigned_user?: string | null;
  assigned_user_full_name?: string | null;
  due_date?: string | null;
  last_updated_by: string;
  last_updated_at: string;
  completed_at?: string | null;
  completed_by?: string | null;
  completed_by_full_name?: string | null;
  completion_note?: string | null;
  cancellation_reason?: string | null;
  blocked_reason?: string | null;
  carry_over_reason?: string | null;
  handover_state: HandoverState;
  version: number;
  isOverdue?: boolean;
  isHandoverLocked?: boolean;
  is_cob?: number | boolean;
  cob_count?: number | null;
  completed_shift?: ShiftName | null;
}

export interface TaskHistoryItem {
  id: number;
  task_id: number;
  task_code: string;
  action: string;
  user_name: string;
  shift: ShiftName;
  previous_status?: string | null;
  new_status?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface Handover {
  id: number;
  from_shift: ShiftName;
  to_shift: ShiftName;
  shift_date: string;
  closed_by: string;
  closed_at: string;
  acknowledged_by?: string | null;
  acknowledged_at?: string | null;
  general_notes?: string | null;
  tasks_completed_count: number;
  tasks_carried_over_count: number;
  tasks_blocked_count: number;
  tasks?: Array<{
    id: number;
    handover_id: number;
    task_id: number;
    task_code: string;
    task_title: string;
    disposition: 'Completed' | 'Carried Over' | 'Blocked';
    notes?: string | null;
  }>;
}

export interface AuditLog {
  id: number;
  created_at: string;
  user_name: string;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  details?: string | null;
  ip_address?: string | null;
}

export interface SystemSettings {
  team_name: string;
  app_name: string;
  timezone: string;
  morning_start: string;
  morning_end: string;
  mid_start: string;
  mid_end: string;
  night_start: string;
  night_end: string;
  session_timeout: number;
  default_priority: TaskPriority;
  installed: number;
  handover_grace_minutes?: number;
  admin_recovery_email?: string;
  admin_recovery_pin?: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_user?: string;
  smtp_pass?: string;
  smtp_from?: string;
  admin_recovery_key_hash?: string;
  admin_totp_secret?: string;
  admin_totp_enabled?: number;
  weekend_oncall_enabled?: number;
  weekend_holiday_shift_mode?: 'SINGLE_OPERATOR_24H' | 'THREE_SHIFTS';
  holiday_dates?: string;
}

export type AppSettings = SystemSettings;

export interface ReportMetrics {
  metrics: {
    totalOpen: number;
    criticalOpen: number;
    blocked: number;
    carriedOver: number;
    completedToday: number;
    createdToday: number;
  };
  byShift: Array<{ shift: ShiftName; count: number }>;
  byStatus: Array<{ status: TaskStatus; count: number }>;
  byPriority: Array<{ priority: TaskPriority; count: number }>;
  currentShift: ShiftInfo;
}

export interface DailyBriefingItem {
  id: number;
  taskId: number;
  taskCode: string;
  taskTitle: string;
  action: string;
  actionVerb: string;
  userName: string;
  shift: ShiftName;
  formattedTime: string;
  formattedDate: string;
  status: TaskStatus;
  priority: TaskPriority;
  category: string;
  summarySentence: string;
  notes?: string | null;
  createdAt: string;
}

export interface DailyBriefingResponse {
  dateLabel: string;
  startDate: string;
  endDate: string;
  isYesterday: boolean;
  totalActivities: number;
  completedCount: number;
  pendingCount: number;
  blockedCount: number;
  carriedCount: number;
  items: DailyBriefingItem[];
  availableUsers: Array<{ username: string; fullName: string }>;
}

export interface TaskCategory {
  id: number;
  name: string;
  color: string;
}

export interface DaySummary {
  totalCompletedToday: number;
  completedByShift: Record<string, number>;
  completedByUsers: Array<{
    username: string;
    full_name: string;
    count: number;
  }>;
  previousShiftClosures: Array<{
    id: number;
    from_shift: string;
    to_shift: string;
    shift_date: string;
    closed_by: string;
    closed_at: string;
    general_notes: string | null;
    tasks_completed_count: number;
    tasks_carried_over_count: number;
    tasks_blocked_count: number;
  }>;
}

export interface CurrentHandoverResponse {
  currentShift: ShiftInfo;
  latestHandover?: Handover;
  acceptedBy?: string | null;
  acceptedAt?: string | null;
  openTasksCount: number;
  openTasks: Task[];
  completedTasksToday?: Task[];
  daySummary?: DaySummary;
  isShiftClosed?: boolean;
  shiftClosedBy?: string | null;
  shiftClosedAt?: string | null;
  shiftHandoverPendingAck?: boolean;
  isShiftAccepted?: boolean;
  precedingShiftClosed?: boolean;
}

export interface ShiftNote {
  id: number;
  shift_date: string;
  shift_name: string;
  title: string | null;
  content: string;
  color: 'amber' | 'blue' | 'emerald' | 'rose' | 'purple';
  pinned: number;
  created_by: string;
  created_at: string;
  updated_by?: string | null;
  updated_at?: string | null;
}

export interface BackupTableInfo {
  name: string;
  label: string;
  description: string;
  dateColumn: string | null;
  category: 'configuration' | 'operational' | 'security';
  currentCount: number;
}

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
  tables_included: string[];
  record_counts: Record<string, number>;
  total_records: number;
  checksum: string;
}

export interface BackupPackage {
  _metadata: BackupMetadata;
  data: Record<string, any[]>;
}

export interface BackupValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metadata: BackupMetadata | null;
  tableCounts: Record<string, number>;
  totalRecords: number;
  detectedTables: string[];
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



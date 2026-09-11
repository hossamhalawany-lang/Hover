export type UserRole = 'ADMIN' | 'USER';
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

export type ShiftName = 'Morning' | 'Mid' | 'Night';

export interface ShiftInfo {
  name: ShiftName;
  userShift?: ShiftName;
  startTime: string;
  endTime: string;
  currentDate: string;
  timeRemainingSeconds: number;
  timeRemainingFormatted: string;
  approachingEnd: boolean;
  timezone: string;
  nextShift: ShiftName;
  previousShift: ShiftName;
  colorTheme: 'blue' | 'orange' | 'purple';
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
  due_date?: string | null;
  last_updated_by: string;
  last_updated_at: string;
  completed_at?: string | null;
  completed_by?: string | null;
  completion_note?: string | null;
  cancellation_reason?: string | null;
  blocked_reason?: string | null;
  carry_over_reason?: string | null;
  handover_state: HandoverState;
  version: number;
  isOverdue?: boolean;
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

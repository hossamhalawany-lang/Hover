import {
  User,
  ShiftInfo,
  Task,
  TaskHistoryItem,
  Handover,
  AuditLog,
  SystemSettings,
  ReportMetrics,
  DailyBriefingResponse,
  TaskCategory,
  CurrentHandoverResponse,
  ShiftNote,
  BackupTableInfo,
  BackupPackage,
  BackupValidationResult,
  RestoreResult
} from './types';

const TOKEN_KEY = 'shift_handover_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeStoredToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(endpoint: string, options: RequestInit = {}, retries = 2): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  headers.set('Pragma', 'no-cache');

  const token = getStoredToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Cache-busting parameter for GET requests to guarantee fresh data
  let fetchUrl = endpoint;
  if (!options.method || options.method === 'GET') {
    const separator = fetchUrl.includes('?') ? '&' : '?';
    fetchUrl = `${fetchUrl}${separator}_t=${Date.now()}`;
  }

  try {
    const response = await fetch(fetchUrl, {
      ...options,
      cache: 'no-store',
      headers
    });

    if (!response.ok) {
      if (response.status === 401 && !endpoint.includes('/auth/login')) {
        removeStoredToken();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        }
      }
      let errorMsg = 'An unexpected error occurred';
      try {
        const text = await response.text();
        try {
          const data = JSON.parse(text);
          errorMsg = data.error || data.message || errorMsg;
        } catch {
          errorMsg = text && text.length < 200 ? text : (response.statusText || errorMsg);
        }
      } catch {
        errorMsg = response.statusText || errorMsg;
      }
      throw new Error(errorMsg);
    }

    return await response.json();
  } catch (err: any) {
    // If it's a network error (e.g. Failed to fetch or dev server restarting) and we have retries left
    const isNetworkError =
      err?.name === 'TypeError' ||
      (typeof err?.message === 'string' && (err.message.includes('fetch') || err.message.includes('NetworkError')));

    if (isNetworkError && retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 400 * (3 - retries)));
      return request<T>(endpoint, options, retries - 1);
    }

    throw err;
  }
}

export const api = {
  // Setup
  async getSetupStatus(): Promise<{ installed: boolean; appName: string; teamName: string }> {
    return request('/api/setup/status');
  },

  async getStatus(): Promise<{ initialized: boolean; settings?: any; appName?: string; teamName?: string }> {
    const s = await request<{ installed: boolean; appName: string; teamName: string; settings?: any }>('/api/setup/status');
    return {
      initialized: s.installed,
      settings: s.settings || { team_name: s.teamName, app_name: s.appName },
      appName: s.appName,
      teamName: s.teamName
    };
  },

  async initSetup(data: any): Promise<{ success: boolean; message: string }> {
    return request('/api/setup/init', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  // Auth
  async login(username: string, password: string, selectedShift?: string): Promise<{ token: string; user: User }> {
    const res = await request<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, selectedShift })
    });
    setStoredToken(res.token);
    return res;
  },

  async updateDutyShift(selectedShift: string): Promise<{ success: boolean; selectedShift: string }> {
    return request('/api/auth/shift', {
      method: 'POST',
      body: JSON.stringify({ selectedShift })
    });
  },

  async logout(): Promise<void> {
    try {
      await request('/api/auth/logout', { method: 'POST' });
    } finally {
      removeStoredToken();
    }
  },

  async getMe(): Promise<{ user: User; shift: ShiftInfo }> {
    const res = await request<{ user: any; shift: ShiftInfo }>('/api/auth/me');
    if (res?.user) {
      res.user.fullName = res.user.fullName || res.user.full_name || res.user.username;
    }
    return res;
  },

  async changePassword(currentPassword: string, newPassword: string, confirmPassword: string): Promise<{ success: boolean; message: string }> {
    return request('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
    });
  },

  async requestPasswordReset(email: string): Promise<{
    success: boolean;
    message: string;
    delivered?: boolean;
    smtpConfigured?: boolean;
    maskedEmail?: string;
  }> {
    return request('/api/auth/forgot-password/request', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  },

  async verifyAndResetPassword(data: {
    email: string;
    code?: string;
    recoveryKey?: string;
    totpCode?: string;
    newPassword: string;
    confirmPassword: string;
  }): Promise<{ success: boolean; message: string; token?: string; user?: any }> {
    const res = await request<{ success: boolean; message: string; token?: string; user?: any }>('/api/auth/forgot-password/verify-and-reset', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    if (res.token) {
      setStoredToken(res.token);
    }
    return res;
  },

  async getTotpSetup(): Promise<{
    secret: string;
    qrCode: string;
    otpauth: string;
    enabled: boolean;
    email: string;
  }> {
    return request('/api/settings/totp/setup');
  },

  async regenerateTotp(): Promise<{
    secret: string;
    qrCode: string;
    otpauth: string;
    enabled: boolean;
    email: string;
  }> {
    return request('/api/settings/totp/regenerate', { method: 'POST' });
  },

  async verifyAndEnableTotp(code: string): Promise<{ success: boolean; message: string }> {
    return request('/api/settings/totp/verify-and-enable', {
      method: 'POST',
      body: JSON.stringify({ code })
    });
  },

  async disableTotp(): Promise<{ success: boolean; message: string }> {
    return request('/api/settings/totp/disable', { method: 'POST' });
  },

  async testSmtp(testEmail?: string): Promise<{ success: boolean; message: string }> {
    return request('/api/settings/smtp/test', {
      method: 'POST',
      body: JSON.stringify({ testEmail })
    });
  },

  async generateRecoveryKey(): Promise<{ success: boolean; key: string; message: string }> {
    return request('/api/settings/recovery-key/generate', {
      method: 'POST'
    });
  },

  // Shift
  async getCurrentShift(): Promise<ShiftInfo> {
    return request('/api/shifts/current');
  },

  async getShifts(): Promise<any[]> {
    return request('/api/shifts');
  },

  // Tasks
  async getTasks(params: {
    status?: string;
    priority?: string;
    shift?: string;
    category?: string;
    search?: string;
    overdue?: boolean;
  } = {}): Promise<Task[]> {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.priority) query.set('priority', params.priority);
    if (params.shift) query.set('shift', params.shift);
    if (params.category) query.set('category', params.category);
    if (params.search) query.set('search', params.search);
    if (params.overdue) query.set('overdue', 'true');

    return request(`/api/tasks?${query.toString()}`);
  },

  async getTask(id: number | string): Promise<{ task: Task; history: TaskHistoryItem[] }> {
    return request(`/api/tasks/${id}`);
  },

  async getAssignees(): Promise<Array<{ id: number; username: string; fullName: string; role: string }>> {
    return request('/api/assignees');
  },

  async createTask(data: {
    title: string;
    description?: string;
    priority?: string;
    category?: string;
    assignedUser?: string;
    targetShift?: string;
    dueDate?: string;
    isCob?: boolean;
    cobCount?: number;
    is_cob?: number | boolean;
    cob_count?: number | null;
  }): Promise<Task> {
    return request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async createProductionCobTasks(): Promise<{ success: boolean; message: string; tasks: Task[] }> {
    return request('/api/tasks/create-production-cob-tasks', {
      method: 'POST'
    });
  },

  async updateTask(id: number, data: any): Promise<Task> {
    return request(`/api/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async updateTaskStatus(id: number, action: string, notes?: string, version?: number): Promise<Task> {
    return request(`/api/tasks/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ action, notes, version })
    });
  },

  // Handover
  async getCurrentHandover(): Promise<CurrentHandoverResponse> {
    return request('/api/handover/current');
  },

  async acknowledgeHandover(handoverId?: number): Promise<{ success: boolean; message: string; isShiftAccepted?: boolean; acceptedBy?: string; acceptedAt?: string }> {
    return request('/api/handover/acknowledge', {
      method: 'POST',
      body: JSON.stringify({ handoverId })
    });
  },

  async validateShiftClosure(): Promise<{
    canClose: boolean;
    unresolvedCount: number;
    unresolvedTasks: Task[];
    completedTasks: Task[];
    blockedTasks: Task[];
    shift: ShiftInfo;
  }> {
    return request('/api/handover/validate-closure');
  },

  async closeShift(resolutions: Array<{ taskId: number; disposition: string; notes?: string }>, generalNotes?: string): Promise<{
    success: boolean;
    handoverId: number;
    message: string;
  }> {
    return request('/api/handover/close-shift', {
      method: 'POST',
      body: JSON.stringify({ resolutions, generalNotes })
    });
  },

  async getHandoverHistory(): Promise<Handover[]> {
    return request('/api/handover/history');
  },

  // Reports
  async getReports(): Promise<ReportMetrics> {
    return request('/api/reports');
  },

  // Admin
  async getUsers(): Promise<User[]> {
    return request('/api/users');
  },

  async createUser(data: any): Promise<{ success: boolean; id: number }> {
    return request('/api/users', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updateUser(id: number, data: any): Promise<{ success: boolean; message: string }> {
    return request(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async deleteUser(id: number): Promise<{ success: boolean; message: string }> {
    return request(`/api/users/${id}`, {
      method: 'DELETE'
    });
  },

  async resetPassword(id: number, newPassword: string, confirmPassword: string): Promise<{ success: boolean; message: string }> {
    return request(`/api/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword, confirmPassword })
    });
  },

  async getSettings(): Promise<SystemSettings> {
    return request('/api/settings');
  },

  async updateSettings(data: Partial<SystemSettings>): Promise<{ success: boolean; message: string }> {
    return request('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async getAuditLogs(params: { user?: string; action?: string; search?: string; fromDate?: string; toDate?: string } = {}): Promise<AuditLog[]> {
    const query = new URLSearchParams();
    if (params.user) query.set('user', params.user);
    if (params.action) query.set('action', params.action);
    if (params.search) query.set('search', params.search);
    if (params.fromDate) query.set('fromDate', params.fromDate);
    if (params.toDate) query.set('toDate', params.toDate);
    return request(`/api/audit-logs?${query.toString()}`);
  },

  getAuditLogsExportTxtUrl(params: { user?: string; action?: string; search?: string; fromDate?: string; toDate?: string } = {}): string {
    const query = new URLSearchParams();
    if (params.user) query.set('user', params.user);
    if (params.action) query.set('action', params.action);
    if (params.search) query.set('search', params.search);
    if (params.fromDate) query.set('fromDate', params.fromDate);
    if (params.toDate) query.set('toDate', params.toDate);
    const token = getStoredToken();
    if (token) query.set('token', token);
    return `/api/audit-logs/export-txt?${query.toString()}`;
  },

  async downloadAuditLogsTxt(params: { user?: string; action?: string; search?: string; fromDate?: string; toDate?: string } = {}): Promise<void> {
    const query = new URLSearchParams();
    if (params.user) query.set('user', params.user);
    if (params.action) query.set('action', params.action);
    if (params.search) query.set('search', params.search);
    if (params.fromDate) query.set('fromDate', params.fromDate);
    if (params.toDate) query.set('toDate', params.toDate);
    const token = getStoredToken();
    if (token) query.set('token', token);

    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['x-session-token'] = token;
    }

    const res = await fetch(`/api/audit-logs/export-txt?${query.toString()}`, {
      method: 'GET',
      headers
    });

    if (!res.ok) {
      let errMessage = `Export failed with status: ${res.statusText || res.status}`;
      try {
        const errJson = await res.json();
        if (errJson?.error) errMessage = errJson.error;
      } catch {}
      throw new Error(errMessage);
    }

    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `audit_logs_${params.fromDate || 'start'}_to_${params.toDate || 'latest'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
  },

  async generateHandoverEmail(handoverId?: number, includeTitles?: boolean): Promise<{ emailText: string }> {
    const params = new URLSearchParams();
    if (handoverId) params.set('handoverId', String(handoverId));
    if (includeTitles) params.set('includeTitles', 'true');
    const q = params.toString() ? `?${params.toString()}` : '';
    return request(`/api/reports/email${q}`);
  },

  async getDailyBriefing(params: {
    startDate?: string;
    endDate?: string;
    user?: string;
    search?: string;
    mode?: 'yesterday' | 'today' | 'custom';
  } = {}): Promise<DailyBriefingResponse> {
    const query = new URLSearchParams();
    if (params.startDate) query.set('startDate', params.startDate);
    if (params.endDate) query.set('endDate', params.endDate);
    if (params.user) query.set('user', params.user);
    if (params.search) query.set('search', params.search);
    if (params.mode) query.set('mode', params.mode);
    return request(`/api/reports/daily-briefing?${query.toString()}`);
  },

  // Demo
  async loadDemoScenario(): Promise<{ success: boolean; message: string }> {
    return request('/api/demo/load', { method: 'POST' });
  },

  async resetDemo(): Promise<{ success: boolean; message: string }> {
    return request('/api/demo/load', { method: 'POST' });
  },

  async clearDemoData(options?: { clearUsers?: boolean; clearAudit?: boolean }): Promise<{ success: boolean; message: string }> {
    return request('/api/demo/clear', {
      method: 'POST',
      body: JSON.stringify(options || {})
    });
  },

  async factoryReset(): Promise<{ success: boolean; message: string }> {
    return request('/api/system/factory-reset', { method: 'POST' });
  },

  // Categories API
  async getCategories(): Promise<TaskCategory[]> {
    return request('/api/categories');
  },

  async createCategory(name: string, color?: string): Promise<TaskCategory> {
    return request('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name, color })
    });
  },

  async deleteCategory(id: number): Promise<{ success: boolean; message: string }> {
    return request(`/api/categories/${id}`, {
      method: 'DELETE'
    });
  },

  // Shift Sticky Notes API (Operational Shift-Date Scoped)
  async getShiftNotes(shiftDate?: string): Promise<ShiftNote[]> {
    const query = shiftDate ? `?shift_date=${encodeURIComponent(shiftDate)}` : '';
    return request(`/api/shift-notes${query}`);
  },

  async createShiftNote(data: {
    title?: string;
    content: string;
    color?: string;
    shift_name?: string;
    shift_date?: string;
    pinned?: number;
  }): Promise<ShiftNote> {
    return request('/api/shift-notes', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updateShiftNote(
    id: number,
    data: {
      title?: string;
      content?: string;
      color?: string;
      pinned?: number;
    }
  ): Promise<ShiftNote> {
    return request(`/api/shift-notes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async deleteShiftNote(id: number): Promise<{ success: boolean }> {
    return request(`/api/shift-notes/${id}`, {
      method: 'DELETE'
    });
  },

  // COB Task Rollover API
  async cobRollover(
    taskId: number,
    data: {
      completedCount: number;
      remainingCount: number;
      nextShift?: string;
      notes?: string;
      version?: number;
    }
  ): Promise<{ completedTask: Task; newTask: Task }> {
    return request(`/api/tasks/${taskId}/cob-rollover`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  // Backup & Restore API
  async getBackupTables(): Promise<{ tables: BackupTableInfo[] }> {
    return request('/api/backup/tables');
  },

  async exportBackup(options?: {
    tables?: string[];
    startDate?: string;
    endDate?: string;
    download?: boolean;
  }): Promise<BackupPackage> {
    return request('/api/backup/export', {
      method: 'POST',
      body: JSON.stringify({
        ...options,
        download: false
      })
    });
  },

  async downloadBackupFile(options?: {
    tables?: string[];
    startDate?: string;
    endDate?: string;
  }): Promise<void> {
    const token = getStoredToken();
    const response = await fetch('/api/backup/export', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        ...options,
        download: true
      })
    });

    if (!response.ok) {
      let errMsg = 'Export failed';
      try {
        const errJson = await response.json();
        errMsg = errJson.error || errMsg;
      } catch {
        errMsg = response.statusText || errMsg;
      }
      throw new Error(errMsg);
    }

    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition');
    let filename = `shift_handover_backup_${new Date().toISOString().slice(0, 10)}.json`;
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename="?([^";]+)"?/);
      if (match?.[1]) filename = match[1];
    }

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 200);
  },

  async validateBackup(backupJson: any): Promise<BackupValidationResult> {
    return request('/api/backup/validate', {
      method: 'POST',
      body: JSON.stringify({ backupJson })
    });
  },

  async restoreBackup(options: {
    backupJson: any;
    mode: 'merge' | 'overwrite';
    selectedTables?: string[];
  }): Promise<RestoreResult> {
    return request('/api/backup/restore', {
      method: 'POST',
      body: JSON.stringify(options)
    });
  }
};



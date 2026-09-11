import {
  User,
  ShiftInfo,
  Task,
  TaskHistoryItem,
  Handover,
  AuditLog,
  SystemSettings,
  ReportMetrics
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

  const token = getStoredToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  try {
    const response = await fetch(endpoint, {
      ...options,
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

  async getStatus(): Promise<{ initialized: boolean; settings?: any }> {
    const s = await request<{ installed: boolean; appName: string; teamName: string }>('/api/setup/status');
    return { initialized: s.installed };
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

  async createTask(data: {
    title: string;
    description?: string;
    priority?: string;
    category?: string;
    assignedUser?: string;
    targetShift?: string;
    dueDate?: string;
  }): Promise<Task> {
    return request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(data)
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
  async getCurrentHandover(): Promise<{
    currentShift: ShiftInfo;
    latestHandover?: Handover;
    openTasksCount: number;
    openTasks: Task[];
  }> {
    return request('/api/handover/current');
  },

  async acknowledgeHandover(handoverId?: number): Promise<{ success: boolean; message: string }> {
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

  async getAuditLogs(params: { user?: string; action?: string; search?: string } = {}): Promise<AuditLog[]> {
    const query = new URLSearchParams();
    if (params.user) query.set('user', params.user);
    if (params.action) query.set('action', params.action);
    if (params.search) query.set('search', params.search);
    return request(`/api/audit-logs?${query.toString()}`);
  },

  async generateHandoverEmail(handoverId?: number): Promise<{ emailText: string }> {
    const q = handoverId ? `?handoverId=${handoverId}` : '';
    return request(`/api/reports/email${q}`);
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
  }
};

import React, { useState, useEffect } from 'react';
import {
  Users,
  Clock,
  Settings as SettingsIcon,
  Shield,
  Download,
  RotateCcw,
  Plus,
  Lock,
  CheckCircle2,
  AlertCircle,
  FileArchive,
  Database,
  Trash2,
  Edit2,
  Key,
  X,
  AlertTriangle,
  ShieldCheck,
  Mail,
  Copy,
  Check,
  Smartphone,
  QrCode
} from 'lucide-react';
import { User as UserType, AppSettings, AuditLog } from '../types';
import { api } from '../api';

interface SettingsViewProps {
  currentUser: UserType;
  onSettingsSaved: () => void;
  onResetDemo: () => void;
  onClearData?: () => void;
  onFactoryReset?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  currentUser,
  onSettingsSaved,
  onResetDemo,
  onClearData,
  onFactoryReset
}) => {
  const [subTab, setSubTab] = useState<'general' | 'totp' | 'email' | 'users' | 'shifts' | 'audit' | 'deployment'>('general');
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [users, setUsers] = useState<UserType[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Google Authenticator (TOTP) state
  const [totpSetup, setTotpSetup] = useState<{
    secret: string;
    qrCode: string;
    otpauth: string;
    enabled: boolean;
    email: string;
  } | null>(null);
  const [loadingTotp, setLoadingTotp] = useState(false);
  const [totpCodeInput, setTotpCodeInput] = useState('');
  const [verifyingTotp, setVerifyingTotp] = useState(false);
  const [totpActionSuccess, setTotpActionSuccess] = useState<string | null>(null);
  const [totpActionError, setTotpActionError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const loadTotpSetup = async () => {
    setLoadingTotp(true);
    setTotpActionError(null);
    try {
      const data = await api.getTotpSetup();
      setTotpSetup(data);
    } catch (err: any) {
      setTotpActionError(err.message || 'Failed to load Google Authenticator setup');
    } finally {
      setLoadingTotp(false);
    }
  };

  const handleRegenerateTotp = async () => {
    setLoadingTotp(true);
    setTotpActionError(null);
    setTotpActionSuccess(null);
    try {
      const data = await api.regenerateTotp();
      setTotpSetup(data);
      setTotpActionSuccess('New secret key generated. Scan the new QR code in Google Authenticator.');
    } catch (err: any) {
      setTotpActionError(err.message || 'Failed to regenerate secret key.');
    } finally {
      setLoadingTotp(false);
    }
  };

  const handleVerifyAndEnableTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpCodeInput || totpCodeInput.trim().length !== 6) {
      setTotpActionError('Please enter the 6-digit code shown in Google Authenticator.');
      return;
    }
    setVerifyingTotp(true);
    setTotpActionError(null);
    setTotpActionSuccess(null);
    try {
      const res = await api.verifyAndEnableTotp(totpCodeInput.trim());
      setTotpActionSuccess(res.message);
      setTotpCodeInput('');
      if (totpSetup) {
        setTotpSetup({ ...totpSetup, enabled: true });
      }
    } catch (err: any) {
      setTotpActionError(err.message || 'Invalid 6-digit code.');
    } finally {
      setVerifyingTotp(false);
    }
  };

  const handleDisableTotp = async () => {
    setVerifyingTotp(true);
    setTotpActionError(null);
    setTotpActionSuccess(null);
    try {
      const res = await api.disableTotp();
      setTotpActionSuccess(res.message);
      if (totpSetup) {
        setTotpSetup({ ...totpSetup, enabled: false });
      }
    } catch (err: any) {
      setTotpActionError(err.message || 'Failed to disable 2FA.');
    } finally {
      setVerifyingTotp(false);
    }
  };

  const handleCopyKey = () => {
    if (!totpSetup?.secret) return;
    navigator.clipboard.writeText(totpSetup.secret);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2500);
  };

  // New user form state
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newConfirmPassword, setNewConfirmPassword] = useState('');
  const [newRole, setNewRole] = useState<'ADMIN' | 'OPERATOR' | 'VIEWER'>('OPERATOR');
  const [userModalOpen, setUserModalOpen] = useState(false);

  // Edit user modal state
  const [editUserModalOpen, setEditUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editRole, setEditRole] = useState<'ADMIN' | 'USER'>('USER');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'DISABLED'>('ACTIVE');
  const [isEditingUser, setIsEditingUser] = useState(false);

  // Reset password modal state
  const [resetPwdModalOpen, setResetPwdModalOpen] = useState(false);
  const [resettingUser, setResettingUser] = useState<UserType | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [isResettingPwd, setIsResettingPwd] = useState(false);

  // Delete user modal state
  const [deleteUserModalOpen, setDeleteUserModalOpen] = useState(false);
  const [deletingUser, setDeletingUser] = useState<UserType | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  // Operational Data Clear Modal state (in-app dialog, never window.confirm)
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [clearUsersOption, setClearUsersOption] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Full Factory Reset Modal state
  const [factoryResetModalOpen, setFactoryResetModalOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // SMTP and Emergency Recovery Key state
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleTestSmtp = async () => {
    setTestingSmtp(true);
    setSmtpTestResult(null);
    try {
      if (settings) {
        await api.updateSettings(settings);
      }
      const res = await api.testSmtp(settings?.admin_recovery_email || 'hossamhalawany@gmail.com');
      setSmtpTestResult({ success: true, message: res.message });
    } catch (err: any) {
      setSmtpTestResult({ success: false, message: err.message || 'SMTP Connection test failed' });
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleGenerateKey = async () => {
    setGeneratingKey(true);
    try {
      const res = await api.generateRecoveryKey();
      setGeneratedKey(res.key);
      setSuccess('New Emergency Recovery Key generated. Save this key in a secure location!');
    } catch (err: any) {
      setError(err.message || 'Failed to generate key.');
    } finally {
      setGeneratingKey(false);
    }
  };

  useEffect(() => {
    loadAllSettings();
  }, []);

  const loadAllSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sRes, uRes, shRes, aRes] = await Promise.all([
        api.getSettings(),
        api.getUsers(),
        api.getShifts(),
        api.getAuditLogs()
      ]);
      setSettings(sRes);
      setUsers(uRes);
      setShifts(shRes);
      setAuditLogs(aRes);
    } catch (err: any) {
      setError(err.message || 'Failed to load settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setError(null);
    setSuccess(null);
    try {
      await api.updateSettings(settings);
      setSuccess('General settings saved successfully.');
      onSettingsSaved();
    } catch (err: any) {
      setError(err.message || 'Failed to save settings.');
    }
  };

  const [savingShifts, setSavingShifts] = useState(false);

  const handleSaveShifts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setError(null);
    setSuccess(null);
    setSavingShifts(true);
    try {
      await api.updateSettings(settings);
      setSuccess('Shift schedules and operational timings updated successfully.');
      onSettingsSaved();
      const [sRes, shRes] = await Promise.all([api.getSettings(), api.getShifts()]);
      setSettings(sRes);
      setShifts(shRes);
    } catch (err: any) {
      setError(err.message || 'Failed to update shift timings.');
    } finally {
      setSavingShifts(false);
    }
  };

  const applyShiftPreset = (preset: 'standard' | 'corporate' | 'industrial') => {
    if (!settings) return;
    if (preset === 'standard') {
      setSettings({
        ...settings,
        morning_start: '06:00',
        morning_end: '14:00',
        mid_start: '14:00',
        mid_end: '22:00',
        night_start: '22:00',
        night_end: '06:00'
      });
    } else if (preset === 'corporate') {
      setSettings({
        ...settings,
        morning_start: '08:00',
        morning_end: '16:00',
        mid_start: '16:00',
        mid_end: '00:00',
        night_start: '00:00',
        night_end: '08:00'
      });
    } else if (preset === 'industrial') {
      setSettings({
        ...settings,
        morning_start: '07:00',
        morning_end: '15:00',
        mid_start: '15:00',
        mid_end: '23:00',
        night_start: '23:00',
        night_end: '07:00'
      });
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== newConfirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      await api.createUser({
        username: newUsername.trim(),
        fullName: newFullName.trim(),
        full_name: newFullName.trim(),
        password: newPassword,
        confirmPassword: newConfirmPassword,
        role: newRole === 'ADMIN' ? 'ADMIN' : 'USER'
      });
      setUserModalOpen(false);
      setNewUsername('');
      setNewFullName('');
      setNewPassword('');
      setNewConfirmPassword('');
      setSuccess(`User ${newUsername} created successfully.`);
      const updatedUsers = await api.getUsers();
      setUsers(updatedUsers);
    } catch (err: any) {
      setError(err.message || 'Failed to create user.');
    }
  };

  const handleOpenEditUser = (u: UserType) => {
    setEditingUser(u);
    setEditFullName(u.fullName || (u as any).full_name || '');
    setEditRole(u.role === 'ADMIN' ? 'ADMIN' : 'USER');
    setEditStatus((u.status as any) || 'ACTIVE');
    setEditUserModalOpen(true);
    setError(null);
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setIsEditingUser(true);
    setError(null);
    try {
      await api.updateUser(editingUser.id, {
        fullName: editFullName.trim(),
        full_name: editFullName.trim(),
        role: editRole,
        status: editStatus
      });
      setEditUserModalOpen(false);
      setSuccess(`User @${editingUser.username} updated successfully.`);
      const updatedUsers = await api.getUsers();
      setUsers(updatedUsers);
    } catch (err: any) {
      setError(err.message || 'Failed to update user.');
    } finally {
      setIsEditingUser(false);
    }
  };

  const handleOpenResetPwd = (u: UserType) => {
    setResettingUser(u);
    setResetNewPassword('');
    setResetConfirmPassword('');
    setResetPwdModalOpen(true);
    setError(null);
  };

  const handleSaveResetPwd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingUser) return;
    if (resetNewPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsResettingPwd(true);
    setError(null);
    try {
      await api.resetPassword(resettingUser.id, resetNewPassword, resetConfirmPassword);
      setResetPwdModalOpen(false);
      setSuccess(`Password for @${resettingUser.username} reset successfully.`);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password.');
    } finally {
      setIsResettingPwd(false);
    }
  };

  const handleOpenDeleteUser = (u: UserType) => {
    setDeletingUser(u);
    setDeleteUserModalOpen(true);
    setError(null);
  };

  const handleConfirmDeleteUser = async () => {
    if (!deletingUser) return;
    setIsDeletingUser(true);
    setError(null);
    try {
      await api.deleteUser(deletingUser.id);
      setDeleteUserModalOpen(false);
      setSuccess(`User @${deletingUser.username} deleted successfully.`);
      const updatedUsers = await api.getUsers();
      setUsers(updatedUsers);
    } catch (err: any) {
      setError(err.message || 'Failed to delete user.');
    } finally {
      setIsDeletingUser(false);
    }
  };

  const handleConfirmClear = async () => {
    setIsClearing(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.clearDemoData({ clearUsers: clearUsersOption });
      setClearModalOpen(false);
      setSuccess(res.message || 'All operational tasks, histories, and handover records cleared successfully.');
      if (clearUsersOption) {
        const updatedUsers = await api.getUsers();
        setUsers(updatedUsers);
      }
      onClearData?.();
      onSettingsSaved();
    } catch (err: any) {
      setError(err.message || 'Failed to clear operational data.');
    } finally {
      setIsClearing(false);
    }
  };

  const handleConfirmFactoryReset = async () => {
    setIsResetting(true);
    setError(null);
    try {
      await api.factoryReset();
      setFactoryResetModalOpen(false);
      if (onFactoryReset) {
        onFactoryReset();
      } else {
        window.location.reload();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to perform factory reset.');
      setIsResetting(false);
    }
  };

  const handleDownloadPhpZip = () => {
    window.location.href = '/api/export/php-zip';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          System Administration &amp; Settings
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Operational shifts, RBAC user privileges, compliance policies, and deployment packaging
        </p>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Sub Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        {[
          { id: 'general', label: 'General & Organization', icon: SettingsIcon },
          { id: 'totp', label: 'Google Authenticator (2FA)', icon: Smartphone },
          { id: 'email', label: 'Email & SMTP Recovery', icon: Mail },
          { id: 'users', label: 'User Management (RBAC)', icon: Users },
          { id: 'shifts', label: 'Shift Timetable', icon: Clock },
          { id: 'audit', label: 'Audit Trail Logs', icon: Shield },
          { id: 'deployment', label: 'PHP Packager & Reset', icon: FileArchive }
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setSubTab(tab.id as any);
                if (tab.id === 'totp' && !totpSetup) {
                  loadTotpSetup();
                }
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                subTab === tab.id
                  ? 'bg-[#0F4C81] text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: GENERAL SETTINGS */}
      {subTab === 'general' && settings && (
        <form onSubmit={handleSaveGeneral} className="max-w-2xl bg-white dark:bg-[#16324F] p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Team / Organization Name
            </label>
            <input
              type="text"
              value={settings.team_name}
              onChange={e => setSettings({ ...settings, team_name: e.target.value })}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Operational Time Zone
              </label>
              <input
                type="text"
                value={settings.timezone}
                onChange={e => setSettings({ ...settings, timezone: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Handover Warning (Minutes)
              </label>
              <input
                type="number"
                value={settings.handover_grace_minutes}
                onChange={e => setSettings({ ...settings, handover_grace_minutes: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* Admin Password Recovery & Real SMTP Callout in General */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-700/70">
            <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                    Email Notifications &amp; SMTP Password Recovery
                  </h4>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                    Configure your Gmail SMTP server (<code>smtp.gmail.com</code>) or emergency recovery keys.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSubTab('email')}
                className="px-3.5 py-1.5 rounded-lg bg-[#0F4C81] hover:bg-[#16324F] text-white text-xs font-bold transition-colors cursor-pointer shrink-0"
              >
                Open Email Settings &rarr;
              </button>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-[#0F4C81] hover:bg-[#16324F] text-white text-xs font-bold transition-colors cursor-pointer"
            >
              Save General Settings
            </button>
          </div>
        </form>
      )}

      {/* TAB: GOOGLE AUTHENTICATOR (TOTP 2FA) */}
      {subTab === 'totp' && (
        <div className="max-w-4xl bg-white dark:bg-[#16324F] p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-700">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-[#0F4C81] dark:text-blue-400" />
                Google Authenticator (2FA &amp; Instant Offline Recovery)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Link with Google Authenticator to generate time-based 6-digit verification codes and instantly recover the administrator account offline without SMTP delays.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-3 py-1 rounded-full font-bold flex items-center gap-1.5 ${
                totpSetup?.enabled
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
              }`}>
                {totpSetup?.enabled ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>2FA Active (Verified)</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    <span>Not Activated Yet</span>
                  </>
                )}
              </span>
            </div>
          </div>

          {totpActionSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{totpActionSuccess}</span>
            </div>
          )}

          {totpActionError && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{totpActionError}</span>
            </div>
          )}

          {loadingTotp && !totpSetup ? (
            <div className="py-12 text-center text-xs text-slate-500 space-y-2">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#0F4C81] border-t-transparent"></div>
              <div>Loading Google Authenticator setup...</div>
            </div>
          ) : totpSetup ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Method 1: Scan QR Code */}
                <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex flex-col items-center text-center space-y-3">
                  <div className="flex items-center gap-2 font-bold text-xs text-slate-800 dark:text-slate-200">
                    <QrCode className="w-4 h-4 text-[#0F4C81] dark:text-blue-400" />
                    <span>Step 1 (A): Scan QR Code</span>
                  </div>

                  <div className="p-3 bg-white rounded-xl shadow-xs border border-slate-200 dark:border-slate-600">
                    {totpSetup.qrCode ? (
                      <img
                        src={totpSetup.qrCode}
                        alt="Google Authenticator QR Code"
                        className="w-48 h-48 object-contain"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-48 h-48 flex items-center justify-center text-slate-400 text-xs">
                        QR Code Unavailable
                      </div>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-500 leading-relaxed max-w-xs">
                    Open the <strong>Google Authenticator</strong> app on your phone &larr; tap <strong>(+)</strong> &larr; select <strong>Scan a QR code</strong>.
                  </p>
                </div>

                {/* Method 2: Manual Setup Key */}
                <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center gap-2 font-bold text-xs text-slate-800 dark:text-slate-200 mb-2">
                      <Key className="w-4 h-4 text-[#0F4C81] dark:text-blue-400" />
                      <span>Step 1 (B): Manual Setup Key</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mb-3">
                      If you prefer manual entry in Google Authenticator (Enter a setup key), use the following configuration:
                    </p>

                    <div className="space-y-2.5 text-xs">
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-slate-400">Account Name:</span>
                        <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-slate-800 dark:text-slate-200">
                          Shift Handover ({totpSetup.email || 'admin'})
                        </div>
                      </div>

                      <div>
                        <span className="block text-[10px] uppercase font-bold text-slate-400">Your Setup Key:</span>
                        <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
                          <span className="font-mono font-bold text-slate-900 dark:text-white tracking-widest text-xs break-all select-all">
                            {totpSetup.secret}
                          </span>
                          <button
                            type="button"
                            onClick={handleCopyKey}
                            className="px-2.5 py-1.5 rounded-md bg-[#0F4C81] hover:bg-[#16324F] text-white text-[11px] font-semibold flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
                          >
                            {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{copiedKey ? 'Copied!' : 'Copy Key'}</span>
                          </button>
                        </div>
                      </div>

                      <div>
                        <span className="block text-[10px] uppercase font-bold text-slate-400">Type of Key:</span>
                        <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-slate-600 dark:text-slate-300 text-[11px]">
                          Time-based (TOTP)
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-[11px] text-blue-800 dark:text-blue-300 flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>Works 100% offline. Codes refresh automatically every 30 seconds on your phone without internet access.</span>
                  </div>
                </div>
              </div>

              {/* Step 2: Verification and Activation Form */}
              <div className="p-5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="font-bold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Step 2: Verify &amp; Activate Google Authenticator</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Enter the active 6-digit code currently shown in your Google Authenticator app to confirm synchronization and activate protection:
                </p>

                <form onSubmit={handleVerifyAndEnableTotp} className="flex flex-wrap items-center gap-3">
                  <div className="relative w-44">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={totpCodeInput}
                      onChange={e => setTotpCodeInput(e.target.value.replace(/\D/g, ''))}
                      placeholder="000000"
                      className="w-full px-3 py-2 text-center text-lg font-mono font-bold tracking-widest rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#0F4C81] outline-hidden"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={verifyingTotp || totpCodeInput.length !== 6}
                    className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                  >
                    <Check className="w-4 h-4" />
                    <span>{verifyingTotp ? 'Verifying...' : 'Verify & Activate 2FA'}</span>
                  </button>

                  {totpSetup.enabled && (
                    <button
                      type="button"
                      onClick={handleDisableTotp}
                      disabled={verifyingTotp}
                      className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Disable Two-Factor Authentication
                    </button>
                  )}
                </form>
              </div>

              {/* Maintenance Actions */}
              <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 border-t border-slate-200 dark:border-slate-700">
                <span>Need to reset or link a new device?</span>
                <button
                  type="button"
                  onClick={handleRegenerateTotp}
                  disabled={loadingTotp}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer transition-colors border border-slate-300 dark:border-slate-600 flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Regenerate Secret Key</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-rose-500">
              Failed to load Authenticator configuration. Please refresh the page.
            </div>
          )}
        </div>
      )}

      {/* TAB: EMAIL & SMTP RECOVERY SETTINGS */}
      {subTab === 'email' && settings && (
        <form onSubmit={handleSaveGeneral} className="max-w-3xl bg-white dark:bg-[#16324F] p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Mail className="w-5 h-5 text-[#0F4C81] dark:text-blue-400" />
                Email (SMTP) &amp; Password Recovery Configuration
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Outgoing SMTP email server configuration to dispatch real password recovery emails and notifications.
              </p>
            </div>
            <span className={`text-[11px] px-2.5 py-1 rounded-full font-bold ${
              settings.smtp_host && settings.smtp_user
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
            }`}>
              {settings.smtp_host && settings.smtp_user ? 'SMTP Active' : 'SMTP Not Configured'}
            </span>
          </div>

          {/* Admin Email */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Administrator Linked Gmail Address
            </label>
            <input
              type="email"
              value={settings.admin_recovery_email || ''}
              onChange={e => setSettings({ ...settings, admin_recovery_email: e.target.value })}
              placeholder="hossamhalawany@gmail.com"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-[#0F4C81] outline-hidden"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Verified administrator email address. Protected and never disclosed to unauthenticated users.
            </p>
          </div>

          {/* SMTP Server Details */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-4">
            <div>
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <SettingsIcon className="w-3.5 h-3.5 text-[#0F4C81] dark:text-blue-400" />
                Outgoing SMTP Server Details
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Configure your SMTP server credentials to enable real email dispatch:
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  1. SMTP Host
                </label>
                <input
                  type="text"
                  value={settings.smtp_host || ''}
                  onChange={e => setSettings({ ...settings, smtp_host: e.target.value })}
                  placeholder="smtp.gmail.com"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                />
                <span className="text-[10px] text-slate-400">For Gmail use: <code>smtp.gmail.com</code></span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  2. SMTP Port
                </label>
                <input
                  type="number"
                  value={settings.smtp_port || 587}
                  onChange={e => setSettings({ ...settings, smtp_port: Number(e.target.value) })}
                  placeholder="587"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                />
                <span className="text-[10px] text-slate-400">Standard port is: <code>587</code></span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  3. SMTP Username
                </label>
                <input
                  type="text"
                  value={settings.smtp_user || ''}
                  onChange={e => setSettings({ ...settings, smtp_user: e.target.value })}
                  placeholder="hossamhalawany@gmail.com"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
                <span className="text-[10px] text-slate-400">Your Gmail or sender email address</span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  4. Google App Password
                </label>
                <input
                  type="password"
                  value={settings.smtp_pass || ''}
                  onChange={e => setSettings({ ...settings, smtp_pass: e.target.value })}
                  placeholder="xxxx xxxx xxxx xxxx"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                />
                <span className="text-[10px] text-slate-400">16-character application password from your Google account</span>
              </div>
            </div>

            {/* Step-by-step Gmail Guide */}
            <div className="p-3 rounded-lg bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/70 dark:border-blue-900/40 text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
              <div className="font-bold text-[#0F4C81] dark:text-blue-300">
                How to generate a Google App Password?
              </div>
              <ol className="list-decimal list-inside space-y-0.5 text-[11px]">
                <li>Open your Google Account &larr; navigate to <strong>Security</strong>.</li>
                <li>Ensure <strong>2-Step Verification</strong> is enabled.</li>
                <li>Search for <strong>App Passwords</strong>.</li>
                <li>Create a new app password named <em>Shift Handover</em>, copy the 16 characters and paste them above.</li>
              </ol>
            </div>

            {/* Test Connection Button */}
            <div className="pt-1 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleTestSmtp}
                disabled={testingSmtp || !settings.smtp_host || !settings.smtp_user}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white dark:bg-slate-700 dark:hover:bg-slate-600 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Mail className="w-3.5 h-3.5" />
                {testingSmtp ? 'Sending Test Email...' : 'Send Test Email Now'}
              </button>
              {smtpTestResult && (
                <span className={`text-xs font-semibold ${smtpTestResult.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {smtpTestResult.message}
                </span>
              )}
            </div>
          </div>

          {/* Emergency Recovery Key (Failsafe) */}
          <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                <span className="text-xs font-bold text-amber-900 dark:text-amber-200">
                  Private Emergency Recovery Key / PIN
                </span>
              </div>
              <button
                type="button"
                onClick={handleGenerateKey}
                disabled={generatingKey}
                className="px-2.5 py-1 rounded bg-amber-200 dark:bg-amber-900/60 hover:bg-amber-300 dark:hover:bg-amber-800 text-amber-900 dark:text-amber-100 text-[11px] font-bold cursor-pointer transition-colors"
              >
                {generatingKey ? 'Generating...' : 'Generate New Key'}
              </button>
            </div>

            <p className="text-[11px] text-amber-800 dark:text-amber-300/90 leading-relaxed">
              This key enables instant emergency account recovery directly from the login screen without requiring an email server.
              Current active emergency master PIN: <strong className="font-mono font-bold text-slate-900 dark:text-white bg-white/80 dark:bg-slate-900 px-1.5 py-0.5 rounded border border-amber-300">{settings.admin_recovery_pin || '748291'}</strong>
            </p>

            {generatedKey && (
              <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border-2 border-dashed border-amber-400 text-center space-y-1">
                <div className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-400 tracking-wider">
                  Copy your new emergency recovery key and store it in a safe place:
                </div>
                <div className="font-mono text-base font-extrabold text-slate-900 dark:text-white tracking-widest select-all">
                  {generatedKey}
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 flex items-center gap-3">
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-[#0F4C81] hover:bg-[#16324F] text-white text-xs font-bold transition-colors shadow-xs cursor-pointer"
            >
              Save Email &amp; SMTP Settings
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: USER MANAGEMENT */}
      {subTab === 'users' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Active System Operators</h3>
            <button
              onClick={() => setUserModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F4C81] text-white text-xs font-bold hover:bg-[#16324F]"
            >
              <Plus className="w-3.5 h-3.5" />
              Add User
            </button>
          </div>

          <div className="bg-white dark:bg-[#16324F] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-semibold uppercase text-[11px]">
                <tr>
                  <th className="py-2.5 px-4">Username</th>
                  <th className="py-2.5 px-4">Full Name</th>
                  <th className="py-2.5 px-4">Role</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Created At</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
                      @{u.username}
                      {currentUser?.username === u.username && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 font-normal">
                          You
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-200">{u.fullName || (u as any).full_name}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                        u.role === 'ADMIN' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300' : 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded font-medium text-[10px] ${
                        (u.status as any) === 'ACTIVE'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                          : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                      }`}>
                        {u.status || 'ACTIVE'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-400 text-[11px]">{new Date(u.createdAt || (u as any).created_at || Date.now()).toLocaleDateString()}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenEditUser(u)}
                          title="Edit User Details / Role / Status"
                          className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-[#0F4C81] dark:hover:text-blue-400 transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenResetPwd(u)}
                          title="Reset User Password"
                          className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer"
                        >
                          <Key className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenDeleteUser(u)}
                          disabled={currentUser?.id === u.id}
                          title={currentUser?.id === u.id ? "Cannot delete your own account" : "Delete User"}
                          className={`p-1.5 rounded transition-colors ${
                            currentUser?.id === u.id
                              ? 'opacity-25 cursor-not-allowed text-slate-400'
                              : 'hover:bg-rose-50 dark:hover:bg-rose-950/50 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer'
                          }`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add User Modal */}
          {userModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
              <div className="w-full max-w-md bg-white dark:bg-[#16324F] p-6 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
                <h4 className="font-bold text-base text-slate-900 dark:text-white">Add System User</h4>
                <form onSubmit={handleCreateUser} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Username</label>
                    <input
                      type="text"
                      value={newUsername}
                      onChange={e => setNewUsername(e.target.value)}
                      required
                      placeholder="e.g. tarek"
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
                    <input
                      type="text"
                      value={newFullName}
                      onChange={e => setNewFullName(e.target.value)}
                      required
                      placeholder="e.g. Tarek Mansour"
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      required
                      minLength={8}
                      placeholder="Min 8 characters"
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Confirm Password</label>
                    <input
                      type="password"
                      value={newConfirmPassword}
                      onChange={e => setNewConfirmPassword(e.target.value)}
                      required
                      minLength={8}
                      placeholder="Re-enter password"
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Role</label>
                    <select
                      value={newRole}
                      onChange={e => setNewRole(e.target.value as any)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    >
                      <option value="OPERATOR">OPERATOR (Create, update tasks & close shifts)</option>
                      <option value="ADMIN">ADMIN (Full administrative access)</option>
                    </select>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setUserModalOpen(false)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-lg bg-[#0F4C81] text-white text-xs font-bold hover:bg-[#16324F] cursor-pointer"
                    >
                      Create User
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Edit User Modal */}
          {editUserModalOpen && editingUser && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
              <div className="w-full max-w-md bg-white dark:bg-[#16324F] p-6 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Edit2 className="w-4 h-4 text-[#0F4C81] dark:text-blue-400" />
                    <h4 className="font-bold text-base text-slate-900 dark:text-white">
                      Edit User: @{editingUser.username}
                    </h4>
                  </div>
                  <button
                    onClick={() => setEditUserModalOpen(false)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleSaveEditUser} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={editFullName}
                      onChange={e => setEditFullName(e.target.value)}
                      required
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Role
                    </label>
                    <select
                      value={editRole}
                      onChange={e => setEditRole(e.target.value as any)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    >
                      <option value="USER">USER (Operator - Tasks & Shift Handover)</option>
                      <option value="ADMIN">ADMIN (Full administrative access & settings)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Account Status
                    </label>
                    <select
                      value={editStatus}
                      onChange={e => setEditStatus(e.target.value as any)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    >
                      <option value="ACTIVE">ACTIVE (Can log in and operate)</option>
                      <option value="DISABLED">DISABLED (Login blocked)</option>
                    </select>
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setEditUserModalOpen(false)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isEditingUser}
                      className="px-4 py-1.5 rounded-lg bg-[#0F4C81] text-white text-xs font-bold hover:bg-[#16324F] cursor-pointer flex items-center gap-1.5"
                    >
                      {isEditingUser ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Reset Password Modal */}
          {resetPwdModalOpen && resettingUser && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
              <div className="w-full max-w-md bg-white dark:bg-[#16324F] p-6 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <h4 className="font-bold text-base text-slate-900 dark:text-white">
                      Reset Password: @{resettingUser.username}
                    </h4>
                  </div>
                  <button
                    onClick={() => setResetPwdModalOpen(false)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Set a new password for <span className="font-bold text-slate-800 dark:text-slate-200">@{resettingUser.username}</span>. Any active sessions for this user will be invalidated immediately.
                </p>

                <form onSubmit={handleSaveResetPwd} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      New Password (min 8 chars)
                    </label>
                    <input
                      type="password"
                      value={resetNewPassword}
                      onChange={e => setResetNewPassword(e.target.value)}
                      required
                      minLength={8}
                      placeholder="Enter new password"
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={resetConfirmPassword}
                      onChange={e => setResetConfirmPassword(e.target.value)}
                      required
                      minLength={8}
                      placeholder="Re-enter new password"
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setResetPwdModalOpen(false)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isResettingPwd}
                      className="px-4 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 cursor-pointer flex items-center gap-1.5"
                    >
                      {isResettingPwd ? 'Resetting...' : 'Update Password'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Delete User Confirmation Modal */}
          {deleteUserModalOpen && deletingUser && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
              <div className="w-full max-w-md bg-white dark:bg-[#16324F] p-6 rounded-2xl shadow-xl border border-rose-200 dark:border-rose-900/50 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-base text-slate-900 dark:text-white">Delete User Account</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Permanently remove user from the system</p>
                  </div>
                </div>

                <div className="p-3 bg-rose-50 dark:bg-rose-950/30 rounded-lg border border-rose-200 dark:border-rose-900/50 text-xs text-rose-800 dark:text-rose-300 space-y-1">
                  <p>
                    Are you sure you want to permanently delete user <strong className="font-mono font-bold">@{deletingUser.username}</strong> ({deletingUser.fullName || (deletingUser as any).full_name})?
                  </p>
                  <p className="text-[11px] text-rose-700 dark:text-rose-400">
                    This will immediately terminate all active sessions for this user. Task history and audit logs created by this user will be preserved for accountability.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setDeleteUserModalOpen(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDeleteUser}
                    disabled={isDeletingUser}
                    className="px-4 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {isDeletingUser ? 'Deleting...' : 'Yes, Delete User'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SHIFTS & SCHEDULES */}
      {subTab === 'shifts' && (
        <div className="space-y-6">
          {/* Shift Timing Configuration Form */}
          <div className="bg-white dark:bg-[#16324F] p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#0F4C81] dark:text-blue-400" />
                  Operational Shift Timings &amp; Schedules
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Configure daily operational shift start and end times. Shifts cover the continuous 24-hour cycle.
                </p>
              </div>

              {currentUser.role === 'ADMIN' ? (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-400 hidden sm:inline">Presets:</span>
                  <button
                    type="button"
                    onClick={() => applyShiftPreset('standard')}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    Standard (06-14-22)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyShiftPreset('corporate')}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    Corporate (08-16-00)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyShiftPreset('industrial')}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    Industrial (07-15-23)
                  </button>
                </div>
              ) : (
                <span className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs font-semibold border border-amber-200 dark:border-amber-800">
                  Read-Only Mode (Admin required to edit)
                </span>
              )}
            </div>

            {settings && (
              <form onSubmit={handleSaveShifts} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {/* Morning Shift Card */}
                  <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                        <span>☀️</span> Morning Shift
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300 uppercase">
                        Order 1
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Start Time
                        </label>
                        <input
                          type="time"
                          disabled={currentUser.role !== 'ADMIN'}
                          value={settings.morning_start}
                          onChange={e => setSettings({ ...settings, morning_start: e.target.value })}
                          required
                          className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          End Time
                        </label>
                        <input
                          type="time"
                          disabled={currentUser.role !== 'ADMIN'}
                          value={settings.morning_end}
                          onChange={e => setSettings({ ...settings, morning_end: e.target.value, mid_start: e.target.value })}
                          required
                          className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Mid Shift Card */}
                  <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                        <span>🌤️</span> Mid Shift
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300 uppercase">
                        Order 2
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Start Time
                        </label>
                        <input
                          type="time"
                          disabled={currentUser.role !== 'ADMIN'}
                          value={settings.mid_start}
                          onChange={e => setSettings({ ...settings, mid_start: e.target.value })}
                          required
                          className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          End Time
                        </label>
                        <input
                          type="time"
                          disabled={currentUser.role !== 'ADMIN'}
                          value={settings.mid_end}
                          onChange={e => setSettings({ ...settings, mid_end: e.target.value, night_start: e.target.value })}
                          required
                          className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Night Shift Card */}
                  <div className="p-4 rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/40 dark:bg-purple-950/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-purple-900 dark:text-purple-200 flex items-center gap-1.5">
                        <span>🌙</span> Night Shift
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-300 uppercase">
                        Order 3
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Start Time
                        </label>
                        <input
                          type="time"
                          disabled={currentUser.role !== 'ADMIN'}
                          value={settings.night_start}
                          onChange={e => setSettings({ ...settings, night_start: e.target.value })}
                          required
                          className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          End Time
                        </label>
                        <input
                          type="time"
                          disabled={currentUser.role !== 'ADMIN'}
                          value={settings.night_end}
                          onChange={e => setSettings({ ...settings, night_end: e.target.value })}
                          required
                          className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                    <div className="text-[10px] text-purple-700 dark:text-purple-300 font-medium">
                      &bull; Crosses midnight boundary into next calendar day
                    </div>
                  </div>
                </div>

                {currentUser.role === 'ADMIN' && (
                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={savingShifts}
                      className="px-5 py-2.5 rounded-xl bg-[#0F4C81] hover:bg-[#16324F] text-white text-xs font-bold shadow-md transition-all cursor-pointer flex items-center gap-2"
                    >
                      <Clock className="w-4 h-4" />
                      {savingShifts ? 'Saving Shift Timings...' : 'Save Shift Timings'}
                    </button>
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: AUDIT LOGS */}
      {subTab === 'audit' && (
        <div className="bg-white dark:bg-[#16324F] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">Tamper-Evident Audit Trail (Section 44)</h3>
            <span className="text-xs text-slate-400">{auditLogs.length} events recorded</span>
          </div>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-semibold uppercase text-[10px] sticky top-0">
                <tr>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">User</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Entity</th>
                  <th className="py-2.5 px-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {auditLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                    <td className="py-2 px-3 font-mono text-[11px] text-slate-400">
                      {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-200">@{log.user_name}</td>
                    <td className="py-2 px-3 font-mono font-bold text-[10px] text-[#0F4C81] dark:text-blue-300">{log.action}</td>
                    <td className="py-2 px-3 text-slate-500">{log.entity_type} #{log.entity_id}</td>
                    <td className="py-2 px-3 text-slate-600 dark:text-slate-300 max-w-sm truncate">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: DEPLOYMENT & RESET */}
      {subTab === 'deployment' && (
        <div className="space-y-6">
          {/* Standalone PHP Packager (Section 48-50) */}
          <div className="p-6 rounded-2xl bg-white dark:bg-[#16324F] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">
                  Shared Hosting &bull; Zero External Dependencies
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                  Standalone PHP 8.1+ ZIP Packager (Section 48-50)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl leading-relaxed">
                  Generate a single deployable ZIP containing the complete operational system written in pure PHP with SQLite PDO. Runs out-of-the-box on cPanel, Apache, Nginx, or any standard shared Linux hosting without Node.js or composer.
                </p>
              </div>
              <FileArchive className="w-8 h-8 text-[#0F4C81] shrink-0" />
            </div>

            <button
              id="btn-download-php-zip"
              onClick={handleDownloadPhpZip}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0F4C81] hover:bg-[#16324F] text-white text-xs font-bold shadow-md transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Download Standalone PHP 8.1+ Package (.ZIP)
            </button>
          </div>

          {/* Reset Demonstration Scenario (Section 68 & 69) */}
          <div className="p-6 rounded-2xl bg-white dark:bg-[#16324F] border border-amber-200 dark:border-amber-800/80 bg-amber-50/20 shadow-xs space-y-3">
            <h3 className="text-base font-bold text-amber-900 dark:text-amber-200">
              Reset Demonstration Scenario (Morning &rarr; Mid Shift Handover)
            </h3>
            <p className="text-xs text-amber-800 dark:text-amber-300 max-w-xl leading-relaxed">
              Resets the database to the official demo scenario (Section 68-69): Morning shift creates 5 tasks; Mid shift completes tasks 1, 2, 3, 5 while keeping Task 4 (<code>TASK-000004: Verify backup status</code>) pending to demonstrate the shift closure validation lock.
            </p>
            <button
              id="btn-reset-demo-scenario"
              onClick={onResetDemo}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Reload Demonstration Scenario
            </button>
          </div>

          {/* Clear Operational Data for Production (Start Clean) */}
          <div className="p-6 rounded-2xl bg-white dark:bg-[#16324F] border border-rose-200 dark:border-rose-800/80 bg-rose-50/20 shadow-xs space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-rose-900 dark:text-rose-200">
                  Clear Operational Data
                </h3>
                <p className="text-xs text-rose-800 dark:text-rose-300 max-w-xl leading-relaxed mt-1">
                  Deletes all tasks, histories, and shift handover records to begin fresh in a live production environment. Your admin account, operator accounts, and timetable settings will be safely kept.
                </p>
              </div>
              <Trash2 className="w-6 h-6 text-rose-500 shrink-0" />
            </div>
            <button
              id="btn-clear-operational-data"
              onClick={() => setClearModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              Clear Tasks &amp; Handover Logs
            </button>
          </div>

          {/* Full Factory Reset (Complete System Wipe) */}
          <div className="p-6 rounded-2xl bg-white dark:bg-[#16324F] border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/20 shadow-xs space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Full Factory Reset
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 max-w-xl leading-relaxed mt-1">
                  Wipes everything completely: tasks, handovers, users, sessions, and settings. The system will return to the initial First-Time Setup Wizard.
                </p>
              </div>
              <RotateCcw className="w-6 h-6 text-slate-400 shrink-0" />
            </div>
            <button
              id="btn-factory-reset"
              onClick={() => setFactoryResetModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Reset System to Setup Wizard
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Clearing Operational Data */}
      {clearModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#16324F] rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-5">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-rose-100 dark:bg-rose-900/40 rounded-xl text-rose-600 dark:text-rose-400 shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Confirm Operational Data Wipe
                </h3>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Permanent removal of operational records
                </p>
              </div>
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-2 bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                The following actions will be performed:
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400">
                <li>Delete all active and completed tasks and their historical timelines.</li>
                <li>Clear all shift handover logs and acknowledgement signatures.</li>
                <li>Reset the task auto-increment counter to TASK-000001.</li>
                <li>Preserve user accounts and configured shift schedules.</li>
              </ul>
            </div>

            <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={clearUsersOption}
                onChange={e => setClearUsersOption(e.target.checked)}
                className="w-4 h-4 rounded-sm border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
              />
              <span>Remove demo operators and keep only my admin account</span>
            </label>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setClearModalOpen(false)}
                disabled={isClearing}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-wipe-data"
                onClick={handleConfirmClear}
                disabled={isClearing}
                className="flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isClearing ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Wiping Data...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Yes, Wipe Operational Data</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Factory Reset */}
      {factoryResetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#16324F] rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-5">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-rose-100 dark:bg-rose-900/40 rounded-xl text-rose-600 dark:text-rose-400 shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Confirm Full Factory Reset
                </h3>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Full Factory System Reset
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-rose-50/50 dark:bg-rose-950/30 p-3.5 rounded-xl border border-rose-200 dark:border-rose-900/50">
              Warning: This will completely delete the database including all accounts, settings, tasks, and historical logs, and return to the initial First-Time Setup Wizard.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setFactoryResetModalOpen(false)}
                disabled={isResetting}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-factory-reset"
                onClick={handleConfirmFactoryReset}
                disabled={isResetting}
                className="flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isResetting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Resetting System...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>Perform Factory Reset</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

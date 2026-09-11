import React, { useState } from 'react';
import { X, Mail, KeyRound, Lock, CheckCircle2, AlertCircle, ArrowRight, ShieldCheck, Key, HelpCircle, Smartphone } from 'lucide-react';
import { api } from '../api';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newPassword: string, user?: any) => void;
}

type RecoveryMethod = 'totp' | 'email_otp' | 'recovery_key';

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [method, setMethod] = useState<RecoveryMethod>('totp');
  const [step, setStep] = useState<'request' | 'verify' | 'success'>('verify');
  const [email, setEmail] = useState('hossamhalawany@gmail.com');
  const [code, setCode] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [resetUser, setResetUser] = useState<any>(null);

  if (!isOpen) return null;

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusNotice(null);
    setLoading(true);

    try {
      const res = await api.requestPasswordReset(email.trim());
      setStatusNotice(res.message);
      setStep('verify');
    } catch (err: any) {
      setError(err.message || 'Unable to process recovery request. Check the email or use your Private Emergency Recovery Key or Google Authenticator.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedPass = newPassword.trim();
    const trimmedConfirm = confirmPassword.trim();

    if (trimmedPass !== trimmedConfirm) {
      setError('Passwords do not match.');
      return;
    }

    if (trimmedPass.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }

    setLoading(true);

    try {
      const res = await api.verifyAndResetPassword({
        email: email.trim(),
        totpCode: method === 'totp' ? totpCode.trim() : undefined,
        code: method === 'totp' ? totpCode.trim() : (method === 'email_otp' ? code.trim() : undefined),
        recoveryKey: method === 'recovery_key' ? recoveryKey.trim() : undefined,
        newPassword: trimmedPass,
        confirmPassword: trimmedConfirm
      });

      if (res.user) {
        setResetUser(res.user);
      }
      setStep('success');
    } catch (err: any) {
      setError(err.message || 'Invalid verification code or recovery key.');
    } finally {
      setLoading(false);
    }
  };

  const handleDone = () => {
    onSuccess(newPassword.trim(), resetUser);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-md bg-white dark:bg-[#16324F] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-[#0F4C81] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center text-white">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm tracking-tight">Admin Password Recovery</h3>
              <p className="text-[11px] text-white/80">Secure offline &amp; 2FA recovery</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Method Switcher */}
        {step !== 'success' && (
          <div className="grid grid-cols-3 p-1.5 bg-slate-100 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => {
                setMethod('totp');
                setStep('verify');
                setError(null);
              }}
              className={`py-2 px-2 rounded-lg font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer text-center text-[11px] ${
                method === 'totp'
                  ? 'bg-white dark:bg-[#16324F] text-[#0F4C81] dark:text-blue-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 shrink-0" />
              <span>Authenticator</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMethod('recovery_key');
                setStep('verify');
                setError(null);
              }}
              className={`py-2 px-2 rounded-lg font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer text-center text-[11px] ${
                method === 'recovery_key'
                  ? 'bg-white dark:bg-[#16324F] text-[#0F4C81] dark:text-blue-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Key className="w-3.5 h-3.5 shrink-0" />
              <span>Recovery Key</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMethod('email_otp');
                setStep('request');
                setError(null);
              }}
              className={`py-2 px-2 rounded-lg font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer text-center text-[11px] ${
                method === 'email_otp'
                  ? 'bg-white dark:bg-[#16324F] text-[#0F4C81] dark:text-blue-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Mail className="w-3.5 h-3.5 shrink-0" />
              <span>Email SMTP</span>
            </button>
          </div>
        )}

        {/* Body Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300 space-y-2">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
              {error.includes('Emergency Recovery Key') && (
                <div className="pt-1 pl-6">
                  <button
                    type="button"
                    onClick={() => {
                      setMethod('recovery_key');
                      setStep('verify');
                      setError(null);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-[11px] shadow-xs cursor-pointer transition-colors"
                  >
                    <Key className="w-3.5 h-3.5" />
                    <span>Switch to Emergency Recovery Key (Reset Now)</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {statusNotice && (
            <div className="mb-4 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 flex items-start gap-2 text-xs text-blue-800 dark:text-blue-300">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
              <span>{statusNotice}</span>
            </div>
          )}

          {/* STEP: Request Email OTP */}
          {method === 'email_otp' && step === 'request' && (
            <form onSubmit={handleRequestCode} className="space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Enter your registered administrator email. A secure 6-digit verification code will be dispatched directly to your inbox.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Admin Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    id="recovery-email-input"
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#0F4C81] outline-hidden"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setMethod('recovery_key');
                    setStep('verify');
                    setError(null);
                  }}
                  className="text-xs font-medium text-[#0F4C81] dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-1"
                >
                  <Key className="w-3 h-3" />
                  <span>Use Emergency Recovery Key</span>
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  className="py-2 px-4 rounded-xl bg-[#0F4C81] hover:bg-[#16324F] text-white font-semibold text-xs shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Sending Email...</span>
                    </>
                  ) : (
                    <>
                      <span>Send Verification Code</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* STEP: Verify Code / Recovery Key & Set New Password */}
          {step === 'verify' && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Admin Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    id="recovery-verify-email"
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Enter your admin email"
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#0F4C81] outline-hidden"
                  />
                </div>
              </div>

              {method === 'totp' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                    <span>Google Authenticator 6-Digit Code</span>
                    <span className="text-[10px] text-emerald-600 font-bold">Offline &amp; Instant</span>
                  </label>
                  <div className="relative">
                    <Smartphone className="w-4 h-4 text-[#0F4C81] dark:text-blue-400 absolute left-3 top-3" />
                    <input
                      id="recovery-totp-input"
                      type="text"
                      inputMode="numeric"
                      required
                      value={totpCode}
                      onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="000000"
                      maxLength={6}
                      className="w-full pl-9 pr-3 py-2 text-base rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono tracking-widest font-bold focus:ring-2 focus:ring-[#0F4C81] outline-hidden"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Open Google Authenticator on your phone and enter the active 6-digit verification code.
                  </p>
                </div>
              ) : method === 'email_otp' ? (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      6-Digit Code from Email Inbox
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setStep('request');
                        setError(null);
                      }}
                      className="text-[11px] text-[#0F4C81] dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      Resend Code
                    </button>
                  </div>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      id="recovery-code-input"
                      type="text"
                      required
                      value={code}
                      onChange={e => setCode(e.target.value)}
                      placeholder="Enter 6-digit code received by email"
                      maxLength={6}
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono tracking-widest font-bold focus:ring-2 focus:ring-[#0F4C81] outline-hidden"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Check your inbox and spam folder. The code is never displayed here for security.
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Private Emergency Recovery Key
                  </label>
                  <div className="relative">
                    <Key className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      id="recovery-key-input"
                      type="password"
                      required
                      value={recoveryKey}
                      onChange={e => setRecoveryKey(e.target.value)}
                      placeholder="e.g. REC-XXXX-XXXX-XXXX or Master PIN"
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono tracking-wider focus:ring-2 focus:ring-[#0F4C81] outline-hidden"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Enter the secret key generated in your Admin Settings. Only you know this key.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  New Admin Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    id="recovery-new-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    minLength={8}
                    className="w-full pl-9 pr-16 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#0F4C81] outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-2.5 text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    id="recovery-confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    minLength={8}
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#0F4C81] outline-hidden"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="py-2.5 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Update Password</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* STEP: Success */}
          {step === 'success' && (
            <div className="text-center py-4 space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-base text-slate-900 dark:text-white">
                  Password Reset Successfully!
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                  Your administrator password has been updated. All operational records, shift logs, and tasks remain 100% intact.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDone}
                className="w-full py-2.5 px-4 rounded-xl bg-[#0F4C81] hover:bg-[#16324F] text-white font-semibold text-xs shadow-xs transition-colors cursor-pointer"
              >
                Sign In With New Password
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

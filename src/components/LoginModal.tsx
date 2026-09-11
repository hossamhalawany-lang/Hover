import React, { useState, useEffect } from 'react';
import { ArrowRightLeft, Lock, User, AlertCircle, LogIn, Sparkles, Sun, SunMedium, Moon, Clock, Check, KeyRound, Eye, EyeOff } from 'lucide-react';
import { api } from '../api';
import { User as UserType, ShiftName } from '../types';
import { ForgotPasswordModal } from './ForgotPasswordModal';

interface LoginModalProps {
  onLoginSuccess: (user: UserType) => void;
}

interface ShiftOption {
  id: ShiftName;
  name: string;
  hours: string;
  icon: typeof Sun;
  themeColor: string;
  badgeBg: string;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedShift, setSelectedShift] = useState<ShiftName>('Morning');
  const [detectedShift, setDetectedShift] = useState<ShiftName>('Morning');
  const [shiftTimings, setShiftTimings] = useState<Record<ShiftName, string>>({
    Morning: '06:00 - 14:00',
    Mid: '14:00 - 22:00',
    Night: '22:00 - 06:00'
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [resetSuccessToast, setResetSuccessToast] = useState<string | null>(null);

  // Auto-detect current shift from backend timings
  useEffect(() => {
    const detectShift = async () => {
      try {
        const [currRes, listRes] = await Promise.all([
          api.getCurrentShift().catch(() => null),
          api.getShifts().catch(() => null)
        ]);

        if (listRes && Array.isArray(listRes) && listRes.length > 0) {
          const timingMap: Record<ShiftName, string> = { ...shiftTimings };
          for (const s of listRes) {
            if (s.name in timingMap) {
              timingMap[s.name as ShiftName] = `${s.start_time} - ${s.end_time}`;
            }
          }
          setShiftTimings(timingMap);
        }

        if (currRes && currRes.name) {
          setDetectedShift(currRes.name as ShiftName);
          setSelectedShift(currRes.name as ShiftName);
        } else {
          // Client-side fallback based on local hour
          const h = new Date().getHours();
          let fallback: ShiftName = 'Morning';
          if (h >= 6 && h < 14) fallback = 'Morning';
          else if (h >= 14 && h < 22) fallback = 'Mid';
          else fallback = 'Night';
          setDetectedShift(fallback);
          setSelectedShift(fallback);
        }
      } catch {
        // Safe fallback
      }
    };

    detectShift();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await api.login(username, password, selectedShift);
      onLoginSuccess(res.user);
    } catch (err: any) {
      setError(err.message || 'Invalid username or password.');
    } finally {
      setLoading(false);
    }
  };

  const fillCredentials = (u: string, p: string, suggestedShift?: ShiftName) => {
    setUsername(u);
    setPassword(p);
    if (suggestedShift) {
      setSelectedShift(suggestedShift);
    }
    setError(null);
  };

  const shiftOptions: ShiftOption[] = [
    {
      id: 'Morning',
      name: 'Morning Shift',
      hours: shiftTimings.Morning,
      icon: Sun,
      themeColor: 'border-blue-500 bg-blue-50/70 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-700',
      badgeBg: 'bg-blue-600 text-white'
    },
    {
      id: 'Mid',
      name: 'Mid Shift',
      hours: shiftTimings.Mid,
      icon: SunMedium,
      themeColor: 'border-amber-500 bg-amber-50/70 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-700',
      badgeBg: 'bg-amber-600 text-white'
    },
    {
      id: 'Night',
      name: 'Night Shift',
      hours: shiftTimings.Night,
      icon: Moon,
      themeColor: 'border-purple-500 bg-purple-50/70 text-purple-900 dark:bg-purple-950/40 dark:text-purple-200 dark:border-purple-700',
      badgeBg: 'bg-purple-600 text-white'
    }
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#F5F7FA] dark:bg-[#0c1c2e]">
      <div className="w-full max-w-lg bg-white dark:bg-[#16324F] rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="bg-[#0F4C81] px-8 pt-7 pb-6 text-white text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-white/10 mb-3 border border-white/20 shadow-xs">
            <ArrowRightLeft className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Hando</h1>
          <p className="text-xs text-blue-100 mt-1 font-medium">
            Shift Handover &amp; Operations Management
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-7 space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Shift Selection Cards */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Operating Duty Shift
              </label>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3 text-[#0F4C81] dark:text-blue-400" />
                Auto-detected: <strong className="font-semibold text-slate-800 dark:text-slate-200">{detectedShift}</strong>
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {shiftOptions.map(opt => {
                const Icon = opt.icon;
                const isSelected = selectedShift === opt.id;
                const isCurrentTime = detectedShift === opt.id;

                return (
                  <button
                    key={opt.id}
                    type="button"
                    id={`shift-select-${opt.id.toLowerCase()}`}
                    onClick={() => setSelectedShift(opt.id)}
                    className={`relative p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between min-h-[90px] ${
                      isSelected
                        ? `${opt.themeColor} ring-2 ring-offset-1 ring-[#0F4C81] shadow-xs`
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-slate-50/50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <Icon className={`w-4 h-4 ${isSelected ? 'text-current' : 'text-slate-400'}`} />
                        {isSelected ? (
                          <span className="w-4 h-4 rounded-full bg-[#0F4C81] text-white flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </span>
                        ) : isCurrentTime ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            Now
                          </span>
                        ) : null}
                      </div>
                      <div className="font-bold text-xs mt-2 text-slate-900 dark:text-white">
                        {opt.name}
                      </div>
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-1">
                      {opt.hours}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
              You will enter as <strong className="text-[#0F4C81] dark:text-blue-300 font-semibold">{selectedShift} Shift</strong> operator. Only carried-over and assigned items for this shift will be prioritized.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                Username or Email
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  id="login-username"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Enter username or email"
                  required
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#0F4C81] outline-hidden"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Password
                </label>
                <button
                  type="button"
                  id="btn-forgot-password-trigger"
                  onClick={() => setForgotModalOpen(true)}
                  className="text-[11px] font-semibold text-[#0F4C81] dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <KeyRound className="w-3 h-3" />
                  <span>Forgot Password?</span>
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full pl-9 pr-10 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#0F4C81] outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer p-0.5"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {resetSuccessToast && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{resetSuccessToast}</span>
            </div>
          )}

          <button
            id="login-submit-btn"
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-[#0F4C81] hover:bg-[#16324F] text-white font-semibold text-sm shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
          >
            <LogIn className="w-4 h-4" />
            {loading ? 'Authenticating...' : `Sign In to ${selectedShift} Shift`}
          </button>

          {/* Quick Demo Credentials Panel */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-700/60">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              <span>Quick Test Operators:</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                id="btn-demo-admin"
                onClick={() => fillCredentials('admin', 'Admin@123456')}
                className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 text-left cursor-pointer"
              >
                <div className="font-semibold text-slate-800 dark:text-slate-200">Admin</div>
                <div className="text-[10px] text-slate-500">Default Password (or Reset)</div>
              </button>
              <button
                type="button"
                id="btn-demo-mohamed"
                onClick={() => fillCredentials('mohamed', 'Mohamed@123456', 'Mid')}
                className="px-2.5 py-1.5 rounded border border-amber-200 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-left cursor-pointer"
              >
                <div className="font-semibold text-amber-900 dark:text-amber-200">Mid Op (Mohamed)</div>
                <div className="text-[10px] text-amber-700 dark:text-amber-400">Incoming Handover Active</div>
              </button>
              <button
                type="button"
                id="btn-demo-ahmed"
                onClick={() => fillCredentials('ahmed', 'Ahmed@123456', 'Morning')}
                className="px-2.5 py-1.5 rounded border border-blue-200 dark:border-blue-800/60 bg-blue-50/50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-left cursor-pointer"
              >
                <div className="font-semibold text-blue-900 dark:text-blue-200">Morning Op (Ahmed)</div>
                <div className="text-[10px] text-blue-700 dark:text-blue-400">Section Handover Ready</div>
              </button>
              <button
                type="button"
                id="btn-demo-karim"
                onClick={() => fillCredentials('karim', 'Karim@123456', 'Night')}
                className="px-2.5 py-1.5 rounded border border-purple-200 dark:border-purple-800/60 bg-purple-50/50 dark:bg-purple-950/30 hover:bg-purple-100 dark:hover:bg-purple-900/40 text-left cursor-pointer"
              >
                <div className="font-semibold text-purple-900 dark:text-purple-200">Night Op (Karim)</div>
                <div className="text-[10px] text-purple-700 dark:text-purple-400">Night Shift Operator</div>
              </button>
            </div>
          </div>
        </form>

        <div className="bg-slate-50 dark:bg-[#11273e] px-8 py-3 text-center border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
          Operational Handover System &bull; Secure Multi-Shift Continuity
        </div>
      </div>

      {/* Forgot Password Self-Service Recovery Modal */}
      <ForgotPasswordModal
        isOpen={forgotModalOpen}
        onClose={() => setForgotModalOpen(false)}
        onSuccess={(newPass, user) => {
          if (user) {
            onLoginSuccess(user);
          } else {
            setUsername('admin');
            setPassword(newPass);
            setResetSuccessToast('Password updated! You can now log in directly with your new password.');
          }
        }}
      />
    </div>
  );
};

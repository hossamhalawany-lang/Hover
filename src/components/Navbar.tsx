import React, { useState, useEffect, useRef } from 'react';
import {
  Clock,
  AlertTriangle,
  Shield,
  LayoutDashboard,
  CheckSquare,
  ArrowRightLeft,
  BarChart3,
  Settings,
  User as UserIcon,
  LogOut,
  Key,
  Flame,
  Moon,
  Sun,
  Info,
  Sparkles,
  PhoneForwarded,
  Sliders,
  ScrollText
} from 'lucide-react';
import { User, ShiftInfo } from '../types';
import { AboutModal } from './AboutModal';

export interface NavbarProps {
  currentUser?: User | null;
  user?: User | null;
  shift: ShiftInfo | null;
  activeTab: string;
  onSelectTab?: (tab: any) => void;
  setActiveTab?: (tab: any) => void;
  unresolvedCount: number;
  criticalCount: number;
  teamName?: string;
  onLogout: () => void;
  onChangePassword?: () => void;
  darkMode: boolean;
  onToggleDarkMode?: () => void;
  setDarkMode?: (val: boolean) => void;
  onSwitchShift?: (shiftName: any) => void;
}

const formatCompactName = (fullName?: string, username?: string): string => {
  const raw = (fullName && fullName.trim()) ? fullName.trim() : (username || 'Operator');
  const parts = raw.split(/\s+/);
  let formatted = '';
  if (parts.length > 1) {
    formatted = `${parts[0]} ${parts[1].charAt(0).toUpperCase()}.`;
  } else {
    formatted = parts[0];
  }
  if (formatted.length > 11) {
    return formatted.slice(0, 10) + '…';
  }
  return formatted;
};

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  user: propUser,
  shift,
  activeTab,
  onSelectTab,
  setActiveTab: propSetActiveTab,
  unresolvedCount,
  criticalCount,
  teamName,
  onLogout,
  onChangePassword,
  darkMode,
  onToggleDarkMode,
  setDarkMode: propSetDarkMode,
  onSwitchShift
}) => {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [aboutModalOpen, setAboutModalOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const user = currentUser || propUser;

  // Close user dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [userMenuOpen]);

  const activeDutyShift = user?.selectedShift || shift?.userShift || shift?.name || 'Morning';

  // Real-time ticking countdown state for timeRemainingSeconds
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => shift?.timeRemainingSeconds ?? 0);

  // Sync with shift updates from server
  useEffect(() => {
    if (shift) {
      setSecondsRemaining(shift.timeRemainingSeconds);
    }
  }, [shift?.timeRemainingSeconds, shift?.name]);

  // Decrement seconds every 1000ms actively
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Format the ticking seconds remaining into HH:MM:SS
  const formatSeconds = (totalSecs: number) => {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const displayTimeRemaining = formatSeconds(secondsRemaining);
  const isApproachingEnd = secondsRemaining > 0 && secondsRemaining <= 30 * 60;

  const handleSelectTab = (tab: any) => {
    if (onSelectTab) {
      onSelectTab(tab);
    } else if (propSetActiveTab) {
      propSetActiveTab(tab);
    }
  };

  const handleToggleDarkMode = () => {
    if (onToggleDarkMode) {
      onToggleDarkMode();
    } else if (propSetDarkMode) {
      propSetDarkMode(!darkMode);
    }
  };

  // Prominent Shift visual indicator colors
  const getShiftBadgeStyle = (shiftName?: string) => {
    switch (shiftName) {
      case 'Morning':
        return {
          badge: 'bg-blue-600 text-white shadow-xs border border-blue-500',
          pill: 'bg-blue-50 text-blue-900 border-blue-200 dark:bg-blue-950/60 dark:text-blue-200 dark:border-blue-800',
          dot: 'bg-blue-400'
        };
      case 'Mid':
        return {
          badge: 'bg-amber-500 text-white shadow-xs border border-amber-400',
          pill: 'bg-amber-50 text-amber-950 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-700',
          dot: 'bg-amber-300'
        };
      case 'Night':
        return {
          badge: 'bg-purple-600 text-white shadow-xs border border-purple-500',
          pill: 'bg-purple-50 text-purple-950 border-purple-300 dark:bg-purple-950/60 dark:text-purple-200 dark:border-purple-700',
          dot: 'bg-purple-300'
        };
      case '24H On-Call':
        return {
          badge: 'bg-emerald-600 text-white shadow-xs border border-emerald-500',
          pill: 'bg-emerald-50 text-emerald-950 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-700',
          dot: 'bg-emerald-400'
        };
      default:
        return {
          badge: 'bg-slate-700 text-white border border-slate-600',
          pill: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
          dot: 'bg-slate-400'
        };
    }
  };

  const currentStyles = getShiftBadgeStyle(activeDutyShift);

  return (
    <header className="bg-white dark:bg-[#16324F] border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 shadow-xs select-none max-w-full overflow-x-clip">
      <div className="w-full max-w-full px-3 sm:px-4 lg:px-6">
        <div className="flex items-center justify-between h-16 gap-2 xl:gap-3 max-w-full">
          {/* Brand Logo & Title */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0">
            <div
              id="brand-logo"
              onClick={() => handleSelectTab('dashboard')}
              className="flex items-center gap-2 cursor-pointer group shrink-0"
            >
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-[#0F4C81] text-white flex items-center justify-center font-bold shadow-sm transition-transform group-hover:scale-105 shrink-0">
                <ArrowRightLeft className="w-5 h-5 shrink-0" />
              </div>
              <div className="shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-lg sm:text-xl text-slate-900 dark:text-white tracking-tight">
                    Hando
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden 2xl:block font-medium truncate max-w-[140px]">
                  {teamName || 'Zero Forgotten Tasks'}
                </p>
              </div>
            </div>

            {/* Shift Indicator & Switcher */}
            {shift && (
              <div className="relative shrink-0">
                <div
                  id="shift-indicator-pill"
                  className={`hidden sm:flex items-center gap-1.5 lg:gap-2 px-2.5 py-1 sm:py-1.5 rounded-xl border transition-all select-none ${currentStyles.pill} shadow-xs shrink-0 whitespace-nowrap`}
                  title={shift.isOnCallDay ? `Full-Day On-Call Duty (${shift.dayName}): ${shift.onCallReason || 'Weekend/Holiday Single-Person Coverage'}` : `Operating Duty Shift: ${activeDutyShift} Shift (Assigned at Login)`}
                >
                  <div className={`px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-black uppercase tracking-wider ${currentStyles.badge} shrink-0`}>
                    {activeDutyShift} SHIFT
                  </div>

                  {shift.isOnCallDay && (
                    <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-600 text-white tracking-wide uppercase shadow-xs shrink-0 whitespace-nowrap">
                      <PhoneForwarded className="w-3 h-3 shrink-0" />
                      <span className="hidden 2xl:inline">On-Call 24H</span>
                    </span>
                  )}

                  <div className="hidden 2xl:flex items-center gap-1.5 text-xs font-medium shrink-0 whitespace-nowrap">
                    <Clock className="w-3.5 h-3.5 opacity-70 shrink-0" />
                    <span className="font-mono">{shift.startTime} &rarr; {shift.endTime}</span>
                  </div>

                  <div className="hidden 2xl:block h-3 w-px bg-current opacity-20 shrink-0" />

                  <span className="text-[10px] sm:text-[11px] font-mono opacity-80 shrink-0 whitespace-nowrap">
                    {displayTimeRemaining} left
                  </span>

                  {isApproachingEnd && (
                    <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500 text-white animate-bounce shrink-0 whitespace-nowrap">
                      <AlertTriangle className="w-3 h-3 shrink-0" /> <span className="hidden 2xl:inline">Ends Soon</span>
                    </span>
                  )}
                </div>

                {/* Mobile version */}
                <div
                  id="shift-indicator-mobile"
                  className={`flex sm:hidden items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-bold ${currentStyles.pill} shrink-0 whitespace-nowrap`}
                  title={shift.isOnCallDay ? `On-Call 24H (${shift.dayName})` : `Operating Duty Shift: ${activeDutyShift} Shift`}
                >
                  <span className={`w-2 h-2 rounded-full animate-pulse ${currentStyles.dot} shrink-0`} />
                  <span>{activeDutyShift}</span>
                  {shift.isOnCallDay && (
                    <span className="text-[9px] font-bold px-1 rounded bg-emerald-600 text-white shrink-0 whitespace-nowrap">
                      ON-CALL
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Navigation Links */}
          <nav className="hidden lg:flex items-center gap-0.5 xl:gap-1.5 shrink-0">
            <button
              id="nav-tab-dashboard"
              onClick={() => handleSelectTab('dashboard')}
              className={`flex items-center gap-1.5 px-2 xl:px-2.5 py-1.5 rounded-lg text-xs xl:text-sm font-medium transition-colors shrink-0 whitespace-nowrap cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-slate-100 dark:bg-slate-800 text-[#0F4C81] dark:text-blue-400 font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 shrink-0" />
              <span>Dashboard</span>
            </button>

            <button
              id="nav-tab-briefing"
              onClick={() => handleSelectTab('briefing')}
              className={`flex items-center gap-1.5 px-2 xl:px-2.5 py-1.5 rounded-lg text-xs xl:text-sm font-medium transition-colors shrink-0 whitespace-nowrap cursor-pointer ${
                activeTab === 'briefing'
                  ? 'bg-slate-100 dark:bg-slate-800 text-[#0F4C81] dark:text-blue-400 font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="hidden 2xl:inline">Daily Briefing</span>
              <span className="inline 2xl:hidden">Briefing</span>
            </button>

            <button
              id="nav-tab-tasks"
              onClick={() => handleSelectTab('tasks')}
              className={`flex items-center gap-1.5 px-2 xl:px-2.5 py-1.5 rounded-lg text-xs xl:text-sm font-medium transition-colors shrink-0 whitespace-nowrap cursor-pointer ${
                activeTab === 'tasks'
                  ? 'bg-slate-100 dark:bg-slate-800 text-[#0F4C81] dark:text-blue-400 font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <CheckSquare className="w-4 h-4 shrink-0" />
              <span>Tasks</span>
              {criticalCount > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] xl:text-[11px] font-bold bg-rose-600 text-white rounded-full shrink-0 whitespace-nowrap">
                  {criticalCount}
                </span>
              )}
            </button>

            <button
              id="nav-tab-handover"
              onClick={() => handleSelectTab('handover')}
              className={`flex items-center gap-1.5 px-2 xl:px-2.5 py-1.5 rounded-lg text-xs xl:text-sm font-medium transition-colors shrink-0 whitespace-nowrap cursor-pointer ${
                activeTab === 'handover'
                  ? 'bg-slate-100 dark:bg-slate-800 text-[#0F4C81] dark:text-blue-400 font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <ArrowRightLeft className="w-4 h-4 shrink-0" />
              <span className="hidden 2xl:inline">Handover &amp; Closure</span>
              <span className="inline 2xl:hidden">Handover</span>
              {unresolvedCount > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] xl:text-[11px] font-bold bg-amber-500 text-white rounded-full shrink-0 whitespace-nowrap">
                  {unresolvedCount}
                </span>
              )}
            </button>

            <button
              id="nav-tab-reports"
              onClick={() => handleSelectTab('reports')}
              className={`flex items-center gap-1.5 px-2 xl:px-2.5 py-1.5 rounded-lg text-xs xl:text-sm font-medium transition-colors shrink-0 whitespace-nowrap cursor-pointer ${
                activeTab === 'reports'
                  ? 'bg-slate-100 dark:bg-slate-800 text-[#0F4C81] dark:text-blue-400 font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <BarChart3 className="w-4 h-4 shrink-0" />
              <span>Reports</span>
            </button>

            {user?.role === 'ADMIN' && (
              <button
                id="nav-tab-admin"
                onClick={() => handleSelectTab('settings')}
                className={`flex items-center gap-1.5 px-2 xl:px-2.5 py-1.5 rounded-lg text-xs xl:text-sm font-medium transition-colors shrink-0 whitespace-nowrap cursor-pointer ${
                  activeTab === 'settings' || activeTab === 'admin'
                    ? 'bg-slate-100 dark:bg-slate-800 text-[#0F4C81] dark:text-blue-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <Shield className="w-4 h-4 shrink-0 text-indigo-500 dark:text-indigo-400" />
                <span>Admin</span>
              </button>
            )}

            {user?.role === 'SUPERVISOR' && (
              <button
                id="nav-tab-options"
                onClick={() => handleSelectTab('settings')}
                className={`flex items-center gap-1.5 px-2 xl:px-2.5 py-1.5 rounded-lg text-xs xl:text-sm font-medium transition-colors shrink-0 whitespace-nowrap cursor-pointer ${
                  activeTab === 'settings' || activeTab === 'options' || activeTab === 'admin'
                    ? 'bg-slate-100 dark:bg-slate-800 text-[#0F4C81] dark:text-blue-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <Sliders className="w-4 h-4 shrink-0 text-cyan-600 dark:text-cyan-400" />
                <span>Options</span>
              </button>
            )}

            {(user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'SUPERVISOR') && (
              <button
                id="nav-tab-audit-logs"
                onClick={() => handleSelectTab('audit')}
                className={`flex items-center gap-1.5 px-2 xl:px-2.5 py-1.5 rounded-lg text-xs xl:text-sm font-medium transition-colors shrink-0 whitespace-nowrap cursor-pointer ${
                  activeTab === 'audit' || activeTab === 'logs'
                    ? 'bg-slate-100 dark:bg-slate-800 text-[#0F4C81] dark:text-blue-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <ScrollText className="w-4 h-4 shrink-0 text-teal-600 dark:text-teal-400" />
                <span>Audit Logs</span>
              </button>
            )}
          </nav>

          {/* Action Center & User Menu */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 whitespace-nowrap pl-2.5 sm:pl-3 border-l border-slate-200 dark:border-slate-800">
            {/* Dark Mode Toggle */}
            <button
              type="button"
              id="btn-theme-toggle"
              onClick={handleToggleDarkMode}
              className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 transition-colors cursor-pointer shrink-0"
              title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {darkMode ? (
                <Sun className="w-4 h-4 text-amber-500 shrink-0" />
              ) : (
                <Moon className="w-4 h-4 text-slate-600 dark:text-slate-300 shrink-0" />
              )}
            </button>

            {/* User Dropdown */}
            <div className="relative shrink-0" ref={userMenuRef}>
              <button
                type="button"
                id="user-profile-menu-button"
                onClick={() => setUserMenuOpen(prev => !prev)}
                aria-expanded={userMenuOpen}
                aria-haspopup="true"
                title={user?.fullName ? `${user.fullName} (@${user?.username}) - ${user?.role}` : `@${user?.username || 'user'} - ${user?.role}`}
                className="flex items-center gap-1.5 sm:gap-2 p-1 sm:p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-all cursor-pointer select-none shrink-0 max-w-[125px] xl:max-w-[155px] overflow-hidden"
              >
                <div className="w-8 h-8 rounded-full bg-[#0F4C81] text-white flex items-center justify-center font-bold text-xs uppercase shadow-xs shrink-0 ring-2 ring-transparent group-hover:ring-blue-300">
                  {user?.username ? user.username.slice(0, 2) : 'OP'}
                </div>
                <div className="hidden xl:block text-left text-xs leading-tight min-w-0 max-w-[72px] xl:max-w-[95px] overflow-hidden">
                  <div
                    className="font-semibold text-slate-900 dark:text-white truncate block whitespace-nowrap"
                    title={user?.fullName || user?.username || 'Operator'}
                  >
                    {formatCompactName(user?.fullName, user?.username)}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 text-[10px] flex items-center gap-1 min-w-0 overflow-hidden">
                    <span
                      className="truncate max-w-[40px] xl:max-w-[55px] inline-block font-mono whitespace-nowrap"
                      title={`@${user?.username || 'user'}`}
                    >
                      @{user?.username || 'user'}
                    </span>
                    <span className="shrink-0 text-slate-300 dark:text-slate-600">&bull;</span>
                    <span className="font-semibold text-[#0F4C81] dark:text-blue-400 shrink-0 text-[9px] uppercase">
                      {user?.role || 'OPERATOR'}
                    </span>
                  </div>
                </div>
              </button>

              {userMenuOpen && (
                <div
                  id="user-dropdown-menu"
                  className="absolute right-0 top-full mt-2 w-56 sm:w-60 bg-white dark:bg-[#16324F] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 py-1.5 z-50 text-sm animate-in fade-in zoom-in-95 duration-100"
                >
                  <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 rounded-t-2xl">
                    <p
                      className="font-bold text-slate-900 dark:text-white truncate text-xs"
                      title={user?.fullName || user?.username || 'Operator'}
                    >
                      {user?.fullName || user?.username || 'Operator'}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Role: <span className="font-bold text-[#0F4C81] dark:text-blue-400">{user?.role || 'OPERATOR'}</span>
                    </p>
                    {user?.email && (
                      <p className="text-[10px] text-slate-400 truncate mt-0.5" title={user.email}>
                        {user.email}
                      </p>
                    )}
                  </div>

                  <div className="py-1">
                    {user?.role === 'ADMIN' && (
                      <button
                        type="button"
                        id="menu-btn-admin-panel"
                        onClick={() => {
                          setUserMenuOpen(false);
                          handleSelectTab('settings');
                        }}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-left text-xs font-medium cursor-pointer transition-colors"
                      >
                        <Shield className="w-4 h-4 text-indigo-500 shrink-0" />
                        <span>Admin Console</span>
                      </button>
                    )}

                    {user?.role === 'SUPERVISOR' && (
                      <button
                        type="button"
                        id="menu-btn-supervisor-options"
                        onClick={() => {
                          setUserMenuOpen(false);
                          handleSelectTab('settings');
                        }}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-left text-xs font-medium cursor-pointer transition-colors"
                      >
                        <Sliders className="w-4 h-4 text-cyan-600 shrink-0" />
                        <span>Operations Options</span>
                      </button>
                    )}

                    {(user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'SUPERVISOR') && (
                      <button
                        type="button"
                        id="menu-btn-audit-logs"
                        onClick={() => {
                          setUserMenuOpen(false);
                          handleSelectTab('audit');
                        }}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-left text-xs font-medium cursor-pointer transition-colors"
                      >
                        <ScrollText className="w-4 h-4 text-teal-600 shrink-0" />
                        <span>Audit Trail Logs</span>
                      </button>
                    )}

                    {onChangePassword && (
                      <button
                        type="button"
                        id="menu-btn-change-password"
                        onClick={() => {
                          setUserMenuOpen(false);
                          onChangePassword();
                        }}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-left text-xs font-medium cursor-pointer transition-colors"
                      >
                        <Key className="w-4 h-4 text-slate-400 shrink-0" />
                        <span>Change Password</span>
                      </button>
                    )}

                    <button
                      type="button"
                      id="menu-btn-about"
                      onClick={() => {
                        setUserMenuOpen(false);
                        setAboutModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-left text-xs font-medium cursor-pointer transition-colors"
                    >
                      <Info className="w-4 h-4 text-blue-500 shrink-0" />
                      <span>About Hando</span>
                    </button>
                  </div>

                  <div className="border-t border-slate-100 dark:border-slate-800 my-1" />

                  <div className="px-1.5 pb-0.5">
                    <button
                      type="button"
                      id="menu-btn-logout"
                      onClick={() => {
                        setUserMenuOpen(false);
                        onLogout();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl text-left text-xs font-semibold cursor-pointer transition-colors"
                    >
                      <LogOut className="w-4 h-4 shrink-0" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Bar */}
      <div className="lg:hidden flex border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#11273e] px-2 py-1.5 justify-around text-xs">
        <button
          onClick={() => handleSelectTab('dashboard')}
          className={`flex flex-col items-center py-1 px-2 rounded ${
            activeTab === 'dashboard' ? 'text-[#0F4C81] dark:text-blue-400 font-bold' : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Dashboard</span>
        </button>
        <button
          onClick={() => handleSelectTab('briefing')}
          className={`flex flex-col items-center py-1 px-2 rounded ${
            activeTab === 'briefing' ? 'text-[#0F4C81] dark:text-blue-400 font-bold' : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-500" />
          <span>Briefing</span>
        </button>
        <button
          onClick={() => handleSelectTab('tasks')}
          className={`flex flex-col items-center py-1 px-2 rounded relative ${
            activeTab === 'tasks' ? 'text-[#0F4C81] dark:text-blue-400 font-bold' : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <CheckSquare className="w-4 h-4" />
          <span>Tasks</span>
          {criticalCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-600 text-white text-[10px] flex items-center justify-center font-bold">
              {criticalCount}
            </span>
          )}
        </button>
        <button
          onClick={() => handleSelectTab('handover')}
          className={`flex flex-col items-center py-1 px-2 rounded relative ${
            activeTab === 'handover' ? 'text-[#0F4C81] dark:text-blue-400 font-bold' : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <ArrowRightLeft className="w-4 h-4" />
          <span>Handover</span>
          {unresolvedCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center font-bold">
              {unresolvedCount}
            </span>
          )}
        </button>
        <button
          onClick={() => handleSelectTab('reports')}
          className={`flex flex-col items-center py-1 px-2 rounded ${
            activeTab === 'reports' ? 'text-[#0F4C81] dark:text-blue-400 font-bold' : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Reports</span>
        </button>
        {user?.role === 'ADMIN' && (
          <button
            onClick={() => handleSelectTab('settings')}
            className={`flex flex-col items-center py-1 px-2 rounded ${
              activeTab === 'settings' || activeTab === 'admin' ? 'text-[#0F4C81] dark:text-blue-400 font-bold' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Admin</span>
          </button>
        )}
        {user?.role === 'SUPERVISOR' && (
          <button
            onClick={() => handleSelectTab('settings')}
            className={`flex flex-col items-center py-1 px-2 rounded ${
              activeTab === 'settings' || activeTab === 'options' ? 'text-[#0F4C81] dark:text-blue-400 font-bold' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Options</span>
          </button>
        )}
        {user?.role === 'MANAGER' && (
          <button
            onClick={() => handleSelectTab('audit')}
            className={`flex flex-col items-center py-1 px-2 rounded ${
              activeTab === 'audit' || activeTab === 'logs' ? 'text-[#0F4C81] dark:text-blue-400 font-bold' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <ScrollText className="w-4 h-4" />
            <span>Audit Logs</span>
          </button>
        )}
      </div>

      {/* About Hando Modal */}
      <AboutModal
        isOpen={aboutModalOpen}
        onClose={() => setAboutModalOpen(false)}
        appName="Hando"
        teamName={teamName}
        currentUserEmail={user?.email || 'hossamhalawany@gmail.com'}
      />
    </header>
  );
};

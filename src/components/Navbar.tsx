import React, { useState } from 'react';
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
  Sparkles
} from 'lucide-react';
import { User, ShiftInfo } from '../types';

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
  onLoadDemo?: () => void;
  darkMode: boolean;
  onToggleDarkMode?: () => void;
  setDarkMode?: (val: boolean) => void;
  onSwitchShift?: (shiftName: any) => void;
}

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
  onLoadDemo,
  darkMode,
  onToggleDarkMode,
  setDarkMode: propSetDarkMode,
  onSwitchShift
}) => {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [shiftMenuOpen, setShiftMenuOpen] = useState(false);
  const user = currentUser || propUser;

  const activeDutyShift = user?.selectedShift || shift?.userShift || shift?.name || 'Morning';

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
    <header className="bg-white dark:bg-[#16324F] border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Title */}
          <div className="flex items-center gap-6">
            <div
              id="brand-logo"
              onClick={() => handleSelectTab('dashboard')}
              className="flex items-center gap-3 cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-lg bg-[#0F4C81] text-white flex items-center justify-center font-bold shadow-sm transition-transform group-hover:scale-105">
                <ArrowRightLeft className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xl text-slate-900 dark:text-white tracking-tight">
                    Hando
                  </span>
                  <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    SSOT v1.0
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
                  {teamName || 'Zero Forgotten Tasks'}
                </p>
              </div>
            </div>

            {/* Shift Indicator & Switcher */}
            {shift && (
              <div className="relative">
                <div
                  id="shift-indicator-pill"
                  onClick={() => setShiftMenuOpen(!shiftMenuOpen)}
                  className={`hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-xl border transition-all cursor-pointer select-none ${currentStyles.pill} hover:shadow-xs`}
                  title="Click to view or switch operating duty shift"
                >
                  <div className={`px-2 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wider ${currentStyles.badge}`}>
                    {activeDutyShift} SHIFT
                  </div>

                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <Clock className="w-3.5 h-3.5 opacity-70" />
                    <span className="font-mono">{shift.startTime} &rarr; {shift.endTime}</span>
                  </div>

                  <div className="h-3 w-px bg-current opacity-20" />

                  <span className="text-[11px] font-mono opacity-80">
                    {shift.timeRemainingFormatted} left
                  </span>

                  {shift.approachingEnd && (
                    <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500 text-white animate-bounce">
                      <AlertTriangle className="w-3 h-3" /> Ends Soon
                    </span>
                  )}
                </div>

                {/* Mobile version */}
                <div
                  id="shift-indicator-mobile"
                  onClick={() => setShiftMenuOpen(!shiftMenuOpen)}
                  className={`flex sm:hidden items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold ${currentStyles.pill}`}
                >
                  <span className={`w-2 h-2 rounded-full animate-pulse ${currentStyles.dot}`} />
                  <span>{activeDutyShift}</span>
                </div>

                {/* Dropdown to switch shift */}
                {shiftMenuOpen && (
                  <div className="absolute left-0 mt-2 w-64 bg-white dark:bg-[#16324F] rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 p-2 z-50 animate-in fade-in slide-in-from-top-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1">
                      Operating Duty Shift
                    </div>
                    {(['Morning', 'Mid', 'Night'] as const).map(sName => {
                      const isSelected = activeDutyShift === sName;
                      return (
                        <button
                          key={sName}
                          type="button"
                          onClick={() => {
                            if (onSwitchShift) onSwitchShift(sName);
                            setShiftMenuOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-blue-50 text-blue-900 dark:bg-blue-950/60 dark:text-blue-300'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                sName === 'Morning' ? 'bg-blue-500' : sName === 'Mid' ? 'bg-amber-500' : 'bg-purple-500'
                              }`}
                            />
                            <span>{sName} Shift</span>
                          </div>
                          {isSelected && <span className="text-[10px] font-bold uppercase text-[#0F4C81] dark:text-blue-400">Active</span>}
                        </button>
                      );
                    })}
                    <div className="mt-1 pt-1.5 border-t border-slate-100 dark:border-slate-800 px-2 text-[10px] text-slate-400">
                      System Time: {shift.timezone}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1">
            <button
              id="nav-tab-dashboard"
              onClick={() => handleSelectTab('dashboard')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'dashboard'
                  ? 'bg-slate-100 dark:bg-slate-800 text-[#0F4C81] dark:text-blue-400 font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </button>

            <button
              id="nav-tab-tasks"
              onClick={() => handleSelectTab('tasks')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'tasks'
                  ? 'bg-slate-100 dark:bg-slate-800 text-[#0F4C81] dark:text-blue-400 font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <CheckSquare className="w-4 h-4" />
              Tasks
              {criticalCount > 0 && (
                <span className="px-1.5 py-0.2 text-[11px] font-bold bg-rose-600 text-white rounded-full">
                  {criticalCount}
                </span>
              )}
            </button>

            <button
              id="nav-tab-handover"
              onClick={() => handleSelectTab('handover')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'handover'
                  ? 'bg-slate-100 dark:bg-slate-800 text-[#0F4C81] dark:text-blue-400 font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <ArrowRightLeft className="w-4 h-4" />
              Handover &amp; Closure
              {unresolvedCount > 0 && (
                <span className="px-1.5 py-0.2 text-[11px] font-bold bg-amber-500 text-white rounded-full">
                  {unresolvedCount}
                </span>
              )}
            </button>

            <button
              id="nav-tab-reports"
              onClick={() => handleSelectTab('reports')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'reports'
                  ? 'bg-slate-100 dark:bg-slate-800 text-[#0F4C81] dark:text-blue-400 font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Reports
            </button>

            {user?.role === 'ADMIN' && (
              <button
                id="nav-tab-admin"
                onClick={() => handleSelectTab('settings')}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'settings' || activeTab === 'admin'
                    ? 'bg-slate-100 dark:bg-slate-800 text-[#0F4C81] dark:text-blue-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <Shield className="w-4 h-4" />
                Admin
              </button>
            )}
          </nav>

          {/* Action Center & User Menu */}
          <div className="flex items-center gap-3">
            {/* Quick Demo Scenario Trigger (Section 69) */}
            {onLoadDemo && (
              <button
                id="btn-load-demo-scenario"
                onClick={onLoadDemo}
                title="Load the Morning -> Mid Demonstration Scenario (Section 69)"
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Demo Scenario</span>
              </button>
            )}

            {/* Dark Mode Toggle */}
            <button
              id="btn-theme-toggle"
              onClick={handleToggleDarkMode}
              className="p-2 rounded-md text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* User Dropdown */}
            <div className="relative">
              <button
                id="user-profile-menu-button"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-[#0F4C81] text-white flex items-center justify-center font-bold text-xs uppercase">
                  {user?.username ? user.username.slice(0, 2) : 'OP'}
                </div>
                <div className="hidden sm:block text-left text-xs leading-tight">
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {user?.fullName || user?.username || 'Operator'}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400">
                    @{user?.username || 'user'} &bull;{' '}
                    <span className="font-medium text-[#0F4C81] dark:text-blue-400">
                      {user?.role || 'OPERATOR'}
                    </span>
                  </div>
                </div>
              </button>

              {userMenuOpen && (
                <div
                  id="user-dropdown-menu"
                  className="absolute right-0 mt-2 w-56 bg-white dark:bg-[#16324F] rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1.5 z-50 text-sm"
                >
                  <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800">
                    <p className="font-semibold text-slate-900 dark:text-white truncate">
                      {user?.fullName || user?.username || 'Operator'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Role: <span className="font-medium">{user?.role || 'OPERATOR'}</span>
                    </p>
                  </div>

                  {onChangePassword && (
                    <button
                      id="menu-btn-change-password"
                      onClick={() => {
                        setUserMenuOpen(false);
                        onChangePassword();
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-left"
                    >
                      <Key className="w-4 h-4 text-slate-400" />
                      Change Password
                    </button>
                  )}

                  <div className="border-t border-slate-100 dark:border-slate-800 my-1" />

                  <button
                    id="menu-btn-logout"
                    onClick={() => {
                      setUserMenuOpen(false);
                      onLogout();
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-left"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
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
      </div>
    </header>
  );
};

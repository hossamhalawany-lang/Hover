import React, { useState, useEffect } from 'react';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRightLeft,
  Plus,
  Search,
  CheckSquare,
  Shield,
  Layers,
  ChevronRight,
  Flame,
  Calendar,
  Sparkles,
  Lock,
  UserCheck,
  CalendarDays,
  ExternalLink,
  Filter,
  Moon
} from 'lucide-react';
import { ShiftInfo, Task, User as UserType, DailyBriefingResponse } from '../types';
import { DailyBriefingSection } from './DailyBriefingSection';
import { api } from '../api';

interface DashboardViewProps {
  currentUser: UserType;
  shift: ShiftInfo | null;
  tasks: Task[];
  unresolvedCount: number;
  criticalCount: number;
  onOpenTask: (taskId: number) => void;
  onNewTask: () => void;
  onNavigateTab: (tab: string) => void;
  onAcknowledgeHandover: () => void;
  handoverAcknowledged: boolean;
  previousShiftNotes?: string | null;
  onSwitchShift?: (shiftName: any) => void;
  teamName?: string;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentUser,
  shift,
  tasks,
  unresolvedCount,
  criticalCount,
  onOpenTask,
  onNewTask,
  onNavigateTab,
  onAcknowledgeHandover,
  handoverAcknowledged,
  previousShiftNotes,
  onSwitchShift,
  teamName
}) => {
  const activeDutyShift = currentUser?.selectedShift || shift?.userShift || shift?.name || 'Morning';

  // Operational dates: An operational day inside the application is defined by the completion of its 3 shifts.
  // When night shift crosses midnight (00:00 - 06:00), the operational day remains yesterday's business date!
  const todayStr = shift?.businessDate || shift?.currentDate || new Date().toLocaleDateString('en-CA');
  const yesterdayStr = shift?.previousShiftBusinessDate || (() => {
    const d = new Date(todayStr);
    d.setDate(d.getDate() - 1);
    return d.toLocaleDateString('en-CA');
  })();

  const [completedDateFilter, setCompletedDateFilter] = useState<string>(todayStr);
  const [completedDateMode, setCompletedDateMode] = useState<'TODAY' | 'YESTERDAY' | 'CUSTOM' | 'ALL'>('TODAY');
  const [completedSearch, setCompletedSearch] = useState<string>('');

  // Keep completedDateFilter in sync when operational date changes
  useEffect(() => {
    if (completedDateMode === 'TODAY') {
      setCompletedDateFilter(todayStr);
    } else if (completedDateMode === 'YESTERDAY') {
      setCompletedDateFilter(yesterdayStr);
    }
  }, [todayStr, yesterdayStr, completedDateMode]);

  const isDateMatching = (completedAt: string | undefined, filterDate: string) => {
    if (!completedAt) return true; // Recently completed item
    const rawDate = completedAt.slice(0, 10);
    if (rawDate === filterDate) return true;
    try {
      const localDate = new Date(completedAt).toLocaleDateString('en-CA');
      if (localDate === filterDate) return true;
    } catch {}
    return false;
  };

  // Calculate metrics
  const inProgressCount = tasks.filter(t => t.status === 'In Progress').length;
  const completedTodayCount = tasks.filter(t => {
    if (t.status !== 'Completed') return false;
    return isDateMatching(t.completed_at, todayStr);
  }).length;
  const carriedOverCount = tasks.filter(t => (t.handover_state === 'Carried Over' || !!t.carry_over_reason) && t.status !== 'Completed').length;
  const blockedCount = tasks.filter(t => t.status === 'Blocked').length;

  // Default to CARRIED_OVER if there are carried over tasks to fulfill the user's specific request
  const [filter, setFilter] = useState<'CARRIED_OVER' | 'ACTIVE' | 'PENDING' | 'IN_PROGRESS' | 'CRITICAL' | 'BLOCKED' | 'COMPLETED' | 'ALL'>(
    carriedOverCount > 0 ? 'CARRIED_OVER' : 'ACTIVE'
  );
  const [search, setSearch] = useState('');
  const [dashboardMode, setDashboardMode] = useState<'TASKS' | 'BRIEFING'>('TASKS');
  const [yesterdayBriefing, setYesterdayBriefing] = useState<DailyBriefingResponse | null>(null);

  useEffect(() => {
    let isMounted = true;
    api.getDailyBriefing({ mode: 'yesterday' })
      .then(res => {
        if (isMounted) setYesterdayBriefing(res);
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, []);

  // Filter tasks
  const filteredTasks = tasks.filter(t => {
    // Status filter
    if (filter === 'ACTIVE' && (t.status === 'Completed' || t.status === 'Cancelled')) return false;
    if (filter === 'PENDING' && t.status !== 'Pending') return false;
    if (filter === 'IN_PROGRESS' && t.status !== 'In Progress') return false;
    if (filter === 'CRITICAL' && t.priority !== 'Critical') return false;
    if (filter === 'BLOCKED' && t.status !== 'Blocked') return false;
    if (filter === 'CARRIED_OVER' && (t.handover_state !== 'Carried Over' && !t.carry_over_reason)) return false;
    if (filter === 'COMPLETED' && t.status !== 'Completed') return false;

    // Search query
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        t.task_code.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Dedicated historical ledger of completed tasks with date filtering (Default: TODAY)
  const allCompletedTasks = tasks.filter(t => t.status === 'Completed');

  const displayedCompletedTasks = allCompletedTasks.filter(t => {
    // Date filter
    if (completedDateMode !== 'ALL' && completedDateFilter) {
      if (!isDateMatching(t.completed_at, completedDateFilter)) return false;
    }

    // Search query
    if (completedSearch.trim()) {
      const q = completedSearch.toLowerCase();
      const codeMatch = t.task_code?.toLowerCase().includes(q);
      const titleMatch = t.title?.toLowerCase().includes(q);
      const catMatch = t.category?.toLowerCase().includes(q);
      const userMatch = (t.completed_by || '').toLowerCase().includes(q) || (t.completed_by_full_name || '').toLowerCase().includes(q);
      const noteMatch = (t.completion_note || '').toLowerCase().includes(q);
      return Boolean(codeMatch || titleMatch || catMatch || userMatch || noteMatch);
    }
    return true;
  });

  const getDutyTheme = () => {
    switch (activeDutyShift) {
      case 'Morning':
        return {
          icon: '☀️',
          name: 'Morning Shift',
          hours: shift?.name === 'Morning' ? `${shift.startTime} - ${shift.endTime}` : '06:00 - 14:00',
          gradient: 'from-blue-600 to-sky-700',
          badgeBg: 'bg-blue-500/30 text-white border-blue-300/40',
          chipBg: 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200'
        };
      case 'Mid':
        return {
          icon: '🌤️',
          name: 'Mid Shift',
          hours: shift?.name === 'Mid' ? `${shift.startTime} - ${shift.endTime}` : '14:00 - 22:00',
          gradient: 'from-amber-600 to-orange-700',
          badgeBg: 'bg-amber-500/30 text-white border-amber-300/40',
          chipBg: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
        };
      case 'Night':
        return {
          icon: '🌙',
          name: 'Night Shift',
          hours: shift?.name === 'Night' ? `${shift.startTime} - ${shift.endTime}` : '22:00 - 06:00',
          gradient: 'from-purple-700 to-indigo-800',
          badgeBg: 'bg-purple-500/30 text-white border-purple-300/40',
          chipBg: 'bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-200'
        };
      case '24H On-Call':
        return {
          icon: '🛡️',
          name: '24H On-Call Duty',
          hours: shift?.startTime && shift?.endTime ? `${shift.startTime} - ${shift.endTime}` : '06:00 - 06:00 (+1d)',
          gradient: 'from-emerald-700 to-teal-800',
          badgeBg: 'bg-emerald-500/30 text-white border-emerald-300/40',
          chipBg: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
        };
      default:
        return {
          icon: '⏱️',
          name: `${activeDutyShift} Shift`,
          hours: '08:00 - 16:00',
          gradient: 'from-slate-700 to-slate-800',
          badgeBg: 'bg-slate-600 text-white border-slate-500',
          chipBg: 'bg-slate-100 text-slate-900'
        };
    }
  };

  const dutyTheme = getDutyTheme();

  return (
    <div className="space-y-6">
      {/* HIGHLY PROMINENT DUTY SHIFT HERO BANNER */}
      <div
        id="active-duty-shift-hero"
        className={`relative overflow-hidden rounded-2xl p-6 text-white bg-gradient-to-r ${dutyTheme.gradient} shadow-md border border-white/10`}
      >
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-2xl" role="img" aria-label="shift icon">
                {dutyTheme.icon}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-widest bg-white/20 backdrop-blur-xs border border-white/30">
                ACTIVE ON DUTY
              </span>
              <span className="text-xs text-white/80 font-medium">
                {dutyTheme.hours}
              </span>
              {teamName && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/20 backdrop-blur-xs border border-white/30 text-white">
                  {teamName}
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-baseline gap-2">
              <span>{dutyTheme.name}</span>
            </h1>

            <p className="text-xs text-white/90 max-w-xl">
              Operator: <strong className="font-semibold text-white">{currentUser.fullName || currentUser.username}</strong>
              {' '}&bull;{' '}
              {carriedOverCount > 0 ? (
                <span>
                  <strong className="underline decoration-amber-300 font-bold">{carriedOverCount} task(s)</strong> carried over to your shift for immediate handling
                </span>
              ) : (
                <span>All inherited tasks are currently resolved. Ready for new duty items.</span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            {/* Active Duty Shift Lock Indicator */}
            <div className="flex items-center gap-2 bg-black/25 backdrop-blur-xs px-3.5 py-2 rounded-xl border border-white/20 text-white shadow-xs">
              <span className="text-xs">
                {activeDutyShift === 'Morning' ? '☀️' : activeDutyShift === 'Mid' ? '🌤️' : activeDutyShift === 'Night' ? '🌙' : '🛡️'}
              </span>
              <span className="text-xs font-bold tracking-wide uppercase">
                {activeDutyShift === '24H On-Call' ? '24H On-Call Locked' : `${activeDutyShift} Shift Locked`}
              </span>
              <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-medium text-white/90">
                Login Session
              </span>
            </div>

            {/* Filter Carried Over Shortcut */}
            <button
              type="button"
              onClick={() => setFilter('CARRIED_OVER')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                filter === 'CARRIED_OVER'
                  ? 'bg-amber-400 text-slate-950 shadow-md font-extrabold'
                  : 'bg-white/15 text-white hover:bg-white/25 border border-white/20'
              }`}
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>Carried Over ({carriedOverCount})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Operational Day & Night Cross-Over Information Banner */}
      {shift?.isNightCrossoverActive && (
        <div className="p-3.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 flex items-start gap-3 text-purple-950 dark:text-purple-100 shadow-xs">
          <Moon className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-0.5">
            <div className="font-bold flex items-center gap-2">
              <span>Operational Day: {shift.businessDate} (Active Night Shift Cross-Over)</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-purple-200 font-mono font-semibold">
                Post-Midnight Hours
              </span>
            </div>
            <p className="text-purple-800/90 dark:text-purple-300/90">
              Calendar date is {shift.calendarDate}, but in accordance with the 3-shift operational cycle rule, the active business day remains <strong>{shift.businessDate}</strong> until the Night Shift is completed and handed over at {shift.endTime} (or closed manually).
            </p>
          </div>
        </div>
      )}

      {/* View Mode Toggle: Active Shift Operations vs Daily Briefing & History */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#16324F] p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            id="tab-btn-active-tasks"
            onClick={() => setDashboardMode('TASKS')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              dashboardMode === 'TASKS'
                ? 'bg-[#0F4C81] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            Active Shift Tasks ({tasks.length})
          </button>
          <button
            type="button"
            id="tab-btn-daily-briefing"
            onClick={() => setDashboardMode('BRIEFING')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              dashboardMode === 'BRIEFING'
                ? 'bg-[#0F4C81] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            Previous Day Briefing & History
          </button>
        </div>

        {dashboardMode === 'TASKS' && (
          <button
            type="button"
            onClick={() => setDashboardMode('BRIEFING')}
            className="text-xs text-[#0F4C81] dark:text-blue-400 font-semibold hover:underline flex items-center gap-1 self-end sm:self-center pr-2 cursor-pointer"
          >
            <Calendar className="w-3.5 h-3.5" />
            Morning Shift: View Yesterday's Briefing &rarr;
          </button>
        )}
      </div>

      {dashboardMode === 'BRIEFING' ? (
        <DailyBriefingSection onOpenTask={onOpenTask} defaultMode="yesterday" />
      ) : (
        <>
      {/* Shift End Warning Banner (Section 58) */}
      {shift?.approachingEnd && (
        <div
          id="shift-end-warning-banner"
          className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/80 flex items-center justify-between gap-4 text-amber-900 dark:text-amber-200 animate-pulse"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="text-xs">
              <strong className="font-bold">Shift Approaching Scheduled End:</strong> Current {shift.name} shift ends in{' '}
              <span className="font-mono font-bold">{shift.timeRemainingFormatted}</span>. Please review all unresolved tasks before closure.
            </div>
          </div>
          <button
            onClick={() => onNavigateTab('handover')}
            className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 shrink-0"
          >
            Review Handover &rarr;
          </button>
        </div>
      )}

      {/* Critical Tasks Alert Bar (Section 59) */}
      {criticalCount > 0 && (
        <div
          id="critical-tasks-alert-bar"
          onClick={() => setFilter('CRITICAL')}
          className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-center justify-between text-rose-800 dark:text-rose-200 text-xs font-semibold cursor-pointer hover:bg-rose-100/70 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-rose-600 animate-bounce" />
            <span>
              <strong>{criticalCount} Critical Task{criticalCount > 1 ? 's' : ''} Open:</strong> Urgent operational items require immediate attention.
            </span>
          </div>
          <span className="underline hover:text-rose-950 dark:hover:text-white">
            Filter Critical &rarr;
          </span>
        </div>
      )}

      {/* Inherited Handover Review Banner (Section 26 & 27) */}
      <div className="p-5 rounded-2xl bg-white dark:bg-[#16324F] border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#0F4C81] dark:text-blue-400">
                Operational Handover
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                From {shift?.previousShift} &rarr; {shift?.name}
              </span>
            </div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
              Inherited Handover Status
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {!handoverAcknowledged ? (
              <button
                id="btn-quick-acknowledge"
                onClick={onAcknowledgeHandover}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Accept Shift &amp; Unlock Tickets
              </button>
            ) : (
              <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Shift Accepted
              </span>
            )}

            {handoverAcknowledged ? (
              <button
                onClick={() => onNavigateTab('handover')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F4C81] hover:bg-[#16324F] text-white text-xs font-bold transition-colors cursor-pointer"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                Close Shift / Handover
              </button>
            ) : (
              <button
                disabled
                title="You must accept the shift before closing it."
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-400 text-xs font-semibold cursor-not-allowed border border-slate-300 dark:border-slate-700"
              >
                <Lock className="w-3.5 h-3.5" />
                Close Shift (Locked)
              </button>
            )}
          </div>
        </div>

        {previousShiftNotes && (
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs">
            <span className="font-bold text-slate-800 dark:text-slate-200">
              Notes from {shift?.previousShift} Shift:
            </span>{' '}
            <span className="text-slate-600 dark:text-slate-300">{previousShiftNotes}</span>
          </div>
        )}
      </div>

      {/* Morning Shift: Previous Day Condensed Briefing (As explicitly requested by user) */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50/80 to-indigo-50/80 dark:from-[#16324F] dark:to-slate-900 border border-blue-200/90 dark:border-blue-900/60 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950 text-[#0F4C81] dark:text-blue-400">
              <Sparkles className="w-4 h-4" />
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Previous Day Operations Briefing
                </h3>
                <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-[#0F4C81] dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  {yesterdayBriefing?.dateLabel || '12/09/2026'}
                </span>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  Morning Review
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Summary of operations, batch runs, and completions performed during the previous day.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDashboardMode('BRIEFING')}
            className="text-xs font-bold text-[#0F4C81] dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer self-start sm:self-auto shrink-0"
          >
            <Search className="w-3.5 h-3.5" />
            Multi-Criteria Search &amp; Date Range &rarr;
          </button>
        </div>

        {/* Quick items list in exact requested format */}
        {yesterdayBriefing && yesterdayBriefing.items.length > 0 ? (
          <div className="space-y-1.5 pt-1">
            {yesterdayBriefing.items.slice(0, 3).map(item => (
              <div
                key={item.id}
                onClick={() => onOpenTask(item.taskId)}
                className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 hover:border-[#0F4C81] dark:hover:border-blue-500 hover:shadow-xs transition-all cursor-pointer group text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate font-mono sm:font-sans">
                    {item.summarySentence}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-[11px] text-slate-400">
                  <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium border border-slate-200/60 dark:border-slate-700">
                    {item.shift} Shift
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 group-hover:text-[#0F4C81] transition-colors" />
                </div>
              </div>
            ))}
            {yesterdayBriefing.items.length > 3 && (
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => setDashboardMode('BRIEFING')}
                  className="text-xs font-semibold text-[#0F4C81] dark:text-blue-400 hover:underline cursor-pointer"
                >
                  + View all {yesterdayBriefing.items.length} logged items from yesterday &rarr;
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-slate-500 dark:text-slate-400 py-1.5 px-3 rounded-lg bg-white/60 dark:bg-slate-900/60">
            No historical activities recorded for yesterday.
          </div>
        )}
      </div>

      {/* Summary Metric Cards (Section 33) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div
          onClick={() => setFilter('ACTIVE')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            filter === 'ACTIVE'
              ? 'border-[#0F4C81] bg-blue-50/40 dark:bg-blue-950/20 shadow-xs'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#16324F] hover:border-slate-300'
          }`}
        >
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase">
            Open Tasks
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {unresolvedCount}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Active workload</div>
        </div>

        <div
          onClick={() => setFilter('IN_PROGRESS')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            filter === 'IN_PROGRESS'
              ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/20 shadow-xs'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#16324F] hover:border-slate-300'
          }`}
        >
          <div className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 uppercase">
            In Progress
          </div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
            {inProgressCount}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Being worked</div>
        </div>

        <div
          onClick={() => setFilter('COMPLETED')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            filter === 'COMPLETED'
              ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-xs'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#16324F] hover:border-slate-300'
          }`}
        >
          <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase">
            Completed
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {completedTodayCount}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Finished items</div>
        </div>

        <div
          onClick={() => setFilter('CARRIED_OVER')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            filter === 'CARRIED_OVER'
              ? 'border-purple-500 bg-purple-50/40 dark:bg-purple-950/20'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#16324F] hover:border-slate-300'
          }`}
        >
          <div className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 uppercase">
            Carried Over
          </div>
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">
            {carriedOverCount}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">From past shift</div>
        </div>

        <div
          onClick={() => setFilter('BLOCKED')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            filter === 'BLOCKED'
              ? 'border-amber-500 bg-amber-50/40 dark:bg-amber-950/20'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#16324F] hover:border-slate-300'
          }`}
        >
          <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 uppercase">
            Blocked
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
            {blockedCount}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Awaiting help</div>
        </div>

        <div
          onClick={() => setFilter('CRITICAL')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            filter === 'CRITICAL'
              ? 'border-rose-500 bg-rose-50/40 dark:bg-rose-950/20'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#16324F] hover:border-slate-300'
          }`}
        >
          <div className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 uppercase">
            Critical
          </div>
          <div className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">
            {criticalCount}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">High severity</div>
        </div>
      </div>

      {/* Active Tasks Management Section (Section 33 & 34) */}
      <div className="p-6 rounded-2xl bg-white dark:bg-[#16324F] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              Shift Operational Tasks
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tasks cannot be removed without explicit completion, carry-over, or cancellation reason
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search tasks..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#0F4C81] outline-hidden w-44 sm:w-56"
              />
            </div>

            {currentUser?.role !== 'MANAGER' && (
              handoverAcknowledged ? (
                <button
                  id="btn-create-task-dashboard"
                  onClick={onNewTask}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F4C81] hover:bg-[#16324F] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Task
                </button>
              ) : (
                <button
                  disabled
                  title="Shift must be accepted before creating new tasks"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-400 text-xs font-semibold cursor-not-allowed border border-slate-300 dark:border-slate-700"
                >
                  <Lock className="w-3.5 h-3.5" />
                  New Task (Locked)
                </button>
              )
            )}
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs border-b border-slate-100 dark:border-slate-800 pb-3">
          {[
            { id: 'ACTIVE', label: `Active Workload (${unresolvedCount})` },
            { id: 'PENDING', label: 'Pending' },
            { id: 'IN_PROGRESS', label: 'In Progress' },
            { id: 'CARRIED_OVER', label: `Carried Over (${carriedOverCount})` },
            { id: 'CRITICAL', label: 'Critical' },
            { id: 'BLOCKED', label: 'Blocked' },
            { id: 'COMPLETED', label: `Completed Archive (${completedTodayCount})` },
            { id: 'ALL', label: `All Records (${tasks.length})` }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id as any)}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                filter === f.id
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Desktop Table (Section 33, 77) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase tracking-wider text-[11px] font-semibold">
              <tr>
                <th className="py-2.5 px-3">ID</th>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Task Title</th>
                <th className="py-2.5 px-3">Priority</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Shift</th>
                <th className="py-2.5 px-3">Assigned</th>
                <th className="py-2.5 px-3">Last Updated</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-400">
                    No tasks found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredTasks.map(task => (
                  <tr
                    key={task.id}
                    onClick={() => onOpenTask(task.id)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-3 font-mono font-bold text-[#0F4C81] dark:text-blue-300">
                      {task.task_code}
                    </td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-300 text-[11px] whitespace-nowrap">
                      {task.status === 'Completed' && task.completed_at ? (
                        <div className="flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                          <Calendar className="w-3 h-3 shrink-0" />
                          <span>
                            {new Date(task.completed_at).toLocaleDateString()}
                          </span>
                        </div>
                      ) : task.due_date ? (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 shrink-0 text-slate-400" />
                          <span className={task.isOverdue ? 'text-rose-600 font-bold' : 'text-slate-600 dark:text-slate-400'}>
                            {new Date(task.due_date).toLocaleDateString()}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-slate-400">
                          <Calendar className="w-3 h-3 shrink-0" />
                          <span>{new Date(task.created_at).toLocaleDateString()}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {task.title}
                        </span>
                        {task.isHandoverLocked && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-300 dark:border-amber-800">
                            <Lock className="w-2.5 h-2.5 text-amber-600" />
                            Locked
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                        <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-[10px]">
                          {task.category}
                        </span>
                        {task.handover_state === 'Carried Over' && (
                          <span className="text-purple-600 dark:text-purple-400 font-medium">
                            Carried Over: {task.carry_over_reason || 'Shift handover'}
                          </span>
                        )}
                        {task.blocked_reason && (
                          <span className="text-amber-600 dark:text-amber-400 font-medium">
                            Blocked: {task.blocked_reason}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${
                          task.priority === 'Critical'
                            ? 'bg-rose-600 text-white'
                            : task.priority === 'High'
                            ? 'bg-amber-500 text-white'
                            : task.priority === 'Medium'
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-400 text-white'
                        }`}
                      >
                        {task.priority}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded font-semibold text-[11px] ${
                          task.status === 'Completed'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : task.status === 'In Progress'
                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                            : task.status === 'Blocked'
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {task.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                      {task.current_shift}
                    </td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                      {task.assigned_user ? `@${task.assigned_user}` : '-'}
                    </td>
                    <td className="py-3 px-3 text-slate-400 text-[11px]">
                      {new Date(task.last_updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="text-[#0F4C81] dark:text-blue-400 font-semibold hover:underline">
                        View &rarr;
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards (Section 33 & 77) */}
        <div className="md:hidden space-y-3">
          {filteredTasks.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">No tasks found.</div>
          ) : (
            filteredTasks.map(task => (
              <div
                key={task.id}
                onClick={() => onOpenTask(task.id)}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 shadow-xs space-y-2 cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-xs text-[#0F4C81] dark:text-blue-300">
                    {task.task_code}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {task.isHandoverLocked && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-300 dark:border-amber-800">
                        <Lock className="w-2.5 h-2.5 text-amber-600" />
                        Locked
                      </span>
                    )}
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        task.priority === 'Critical'
                          ? 'bg-rose-600 text-white'
                          : task.priority === 'High'
                          ? 'bg-amber-500 text-white'
                          : 'bg-blue-600 text-white'
                      }`}
                    >
                      {task.priority}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 font-medium">
                      {task.status}
                    </span>
                  </div>
                </div>

                <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                  {task.title}
                </h4>

                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-700/60">
                  <span>Shift: {task.current_shift}</span>
                  <span>
                    {task.status === 'Completed' && task.completed_at
                      ? `Completed: ${new Date(task.completed_at).toLocaleDateString()}`
                      : task.due_date
                      ? `Due: ${new Date(task.due_date).toLocaleDateString()}`
                      : `Created: ${new Date(task.created_at).toLocaleDateString()}`}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* =========================================================================
          DEDICATED COMPLETED TASKS & HISTORICAL DAILY ARCHIVE (Section 2 of prompt)
          ========================================================================= */}
      <div id="completed-tasks-archive-section" className="p-6 rounded-2xl bg-white dark:bg-[#16324F] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        {/* Header & Filter Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800/80 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                  <span>Completed Tasks &amp; Daily Archive</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Separated ledger of fulfilled tasks with date stamp and executor accountability.
                  {completedDateMode === 'TODAY' && ' Showing today\'s completions by default.'}
                  {completedDateMode === 'YESTERDAY' && ' Showing yesterday\'s completions.'}
                  {completedDateMode === 'CUSTOM' && ` Showing records for ${completedDateFilter}.`}
                  {completedDateMode === 'ALL' && ' Showing all recorded completions across all dates.'}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Date Presets & Date Picker */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Quick Mode Switcher */}
            <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold">
              <button
                type="button"
                id="btn-filter-completed-today"
                onClick={() => {
                  setCompletedDateMode('TODAY');
                  setCompletedDateFilter(todayStr);
                }}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  completedDateMode === 'TODAY'
                    ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                id="btn-filter-completed-yesterday"
                onClick={() => {
                  setCompletedDateMode('YESTERDAY');
                  setCompletedDateFilter(yesterdayStr);
                }}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  completedDateMode === 'YESTERDAY'
                    ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Yesterday
              </button>
              <button
                type="button"
                id="btn-filter-completed-all"
                onClick={() => {
                  setCompletedDateMode('ALL');
                  setCompletedDateFilter('');
                }}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  completedDateMode === 'ALL'
                    ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                All History
              </button>
            </div>

            {/* Custom Date Picker Tool */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300">
              <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <label htmlFor="completed-tasks-date-picker" className="text-[11px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                Select Date:
              </label>
              <input
                id="completed-tasks-date-picker"
                type="date"
                value={completedDateFilter}
                onChange={e => {
                  setCompletedDateFilter(e.target.value);
                  setCompletedDateMode('CUSTOM');
                }}
                className="bg-transparent border-none outline-hidden text-xs font-bold text-slate-900 dark:text-white cursor-pointer"
              />
            </div>

            {/* Search Filter */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={completedSearch}
                onChange={e => setCompletedSearch(e.target.value)}
                placeholder="Search completed..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-1 focus:ring-emerald-500 outline-hidden w-36 sm:w-44"
              />
            </div>
          </div>
        </div>

        {/* Status banner with count and current date */}
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <span className="font-semibold">Showing:</span>
            <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-bold text-[11px]">
              {displayedCompletedTasks.length} Completed Task{displayedCompletedTasks.length === 1 ? '' : 's'}
            </span>
            {completedDateMode !== 'ALL' && (
              <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                for date: <strong>{completedDateFilter || todayStr}</strong>
              </span>
            )}
          </div>

          <div className="text-[11px] text-slate-400">
            Total historical completed: {allCompletedTasks.length}
          </div>
        </div>

        {/* Desktop Table for Completed Tasks */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase tracking-wider text-[11px] font-semibold border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="py-3 px-3">Task ID</th>
                <th className="py-3 px-3">Completion Date</th>
                <th className="py-3 px-3">Task Title &amp; Category</th>
                <th className="py-3 px-3">Priority</th>
                <th className="py-3 px-3">Shift</th>
                <th className="py-3 px-3">Completed By</th>
                <th className="py-3 px-3">Resolution Note</th>
                <th className="py-3 px-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {displayedCompletedTasks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <CheckCircle2 className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                      <p className="text-xs font-medium">
                        No completed tasks found for {completedDateMode === 'ALL' ? 'the selected criteria' : `date: ${completedDateFilter || todayStr}`}.
                      </p>
                      {completedDateMode !== 'TODAY' && (
                        <button
                          type="button"
                          onClick={() => {
                            setCompletedDateMode('TODAY');
                            setCompletedDateFilter(todayStr);
                          }}
                          className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-semibold hover:underline cursor-pointer"
                        >
                          &larr; Switch back to Today's Completed Tasks
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                displayedCompletedTasks.map(task => (
                  <tr
                    key={task.id}
                    onClick={() => onOpenTask(task.id)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-3 font-mono font-bold text-emerald-700 dark:text-emerald-400">
                      {task.task_code}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-slate-900 dark:text-white font-semibold">
                        <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>
                          {task.completed_at
                            ? new Date(task.completed_at).toLocaleDateString()
                            : '-'}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        <span>
                          {task.completed_at
                            ? new Date(task.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : ''}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {task.title}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800">
                          {task.category}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${
                          task.priority === 'Critical'
                            ? 'bg-rose-600 text-white'
                            : task.priority === 'High'
                            ? 'bg-amber-500 text-white'
                            : task.priority === 'Medium'
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-400 text-white'
                        }`}
                      >
                        {task.priority}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-medium">
                        {task.current_shift || task.original_shift}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-900 dark:text-white text-xs">
                        {task.completed_by_full_name || `@${task.completed_by || 'Unknown'}`}
                      </div>
                      {task.completed_by_full_name && task.completed_by && (
                        <div className="text-[10px] text-slate-400">
                          @{task.completed_by}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 max-w-xs truncate text-slate-600 dark:text-slate-300 text-[11px]">
                      {task.completion_note || <span className="text-slate-400 italic">No notes provided</span>}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="text-emerald-700 dark:text-emerald-400 font-semibold hover:underline flex items-center justify-end gap-1">
                        Review <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View for Completed Tasks */}
        <div className="md:hidden space-y-3">
          {displayedCompletedTasks.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              No completed tasks for this date.
            </div>
          ) : (
            displayedCompletedTasks.map(task => (
              <div
                key={task.id}
                onClick={() => onOpenTask(task.id)}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 shadow-xs space-y-2 cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                    {task.task_code}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold">
                      Completed
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700">
                      {task.current_shift}
                    </span>
                  </div>
                </div>

                <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                  {task.title}
                </h4>

                <div className="text-xs text-slate-600 dark:text-slate-300">
                  <strong>Executed by:</strong> {task.completed_by_full_name || `@${task.completed_by || 'Unknown'}`}
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-700/60">
                  <span>
                    Date: {task.completed_at ? new Date(task.completed_at).toLocaleDateString() : '-'}
                  </span>
                  <span>
                    Time: {task.completed_at ? new Date(task.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
        </>
      )}
    </div>
  );
};

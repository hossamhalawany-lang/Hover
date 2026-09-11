import React, { useState } from 'react';
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
  Sparkles
} from 'lucide-react';
import { ShiftInfo, Task, User as UserType } from '../types';

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
  onSwitchShift
}) => {
  const activeDutyShift = currentUser?.selectedShift || shift?.userShift || shift?.name || 'Morning';

  // Calculate metrics
  const inProgressCount = tasks.filter(t => t.status === 'In Progress').length;
  const completedTodayCount = tasks.filter(t => t.status === 'Completed').length;
  const carriedOverCount = tasks.filter(t => (t.handover_state === 'Carried Over' || !!t.carry_over_reason) && t.status !== 'Completed').length;
  const blockedCount = tasks.filter(t => t.status === 'Blocked').length;

  // Default to CARRIED_OVER if there are carried over tasks to fulfill the user's specific request
  const [filter, setFilter] = useState<'CARRIED_OVER' | 'ACTIVE' | 'PENDING' | 'IN_PROGRESS' | 'CRITICAL' | 'BLOCKED' | 'COMPLETED' | 'ALL'>(
    carriedOverCount > 0 ? 'CARRIED_OVER' : 'ACTIVE'
  );
  const [search, setSearch] = useState('');

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
            {/* Quick Switch Shift Pills */}
            <div className="flex items-center bg-black/20 backdrop-blur-xs p-1 rounded-xl border border-white/15">
              {(['Morning', 'Mid', 'Night'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSwitchShift && onSwitchShift(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeDutyShift === s
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`}
                  title={`Switch active view to ${s} Shift`}
                >
                  {s === 'Morning' ? '☀️ Morning' : s === 'Mid' ? '🌤️ Mid' : '🌙 Night'}
                </button>
              ))}
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Acknowledge Handover
              </button>
            ) : (
              <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Handover Acknowledged
              </span>
            )}

            <button
              onClick={() => onNavigateTab('handover')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F4C81] hover:bg-[#16324F] text-white text-xs font-bold transition-colors"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              Close Shift / Handover
            </button>
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

            <button
              id="btn-create-task-dashboard"
              onClick={onNewTask}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F4C81] hover:bg-[#16324F] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              New Task
            </button>
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
                  <td colSpan={8} className="py-10 text-center text-slate-400">
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
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {task.title}
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
                  <span>Updated: {new Date(task.last_updated_at).toLocaleTimeString()}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

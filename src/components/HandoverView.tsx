import React, { useState, useEffect } from 'react';
import {
  ArrowRightLeft,
  CheckCircle2,
  AlertTriangle,
  Clock,
  User,
  FileText,
  ShieldCheck,
  AlertCircle,
  Copy,
  ChevronRight,
  ListFilter,
  Check,
  Ban,
  ArrowRight,
  Lock,
  Mail,
  PhoneForwarded,
  Calendar,
  Search,
  StickyNote
} from 'lucide-react';
import { ShiftInfo, Task, Handover, User as UserType, CurrentHandoverResponse } from '../types';
import { api } from '../api';
import { ShiftStickyNotes } from './ShiftStickyNotes';


interface HandoverViewProps {
  currentUser: UserType;
  shift: ShiftInfo | null;
  onOpenTask: (taskId: number) => void;
  onOpenEmailModal: (handoverData?: any) => void;
  onShiftClosed: () => void;
  handoverAcknowledged?: boolean;
  onAcknowledgeHandover?: () => Promise<void>;
}

interface ResolutionItem {
  taskId: number;
  taskCode: string;
  taskTitle: string;
  disposition: 'Completed' | 'Carried Over' | 'Blocked';
  notes: string;
}

export const HandoverView: React.FC<HandoverViewProps> = ({
  currentUser,
  shift,
  onOpenTask,
  onOpenEmailModal,
  onShiftClosed,
  handoverAcknowledged = true,
  onAcknowledgeHandover
}) => {
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Handover state
  const [currentHandover, setCurrentHandover] = useState<CurrentHandoverResponse | null>(null);
  const [completedShiftFilter, setCompletedShiftFilter] = useState<'ALL' | 'Morning' | 'Mid' | 'Night'>('ALL');
  const [completedSearch, setCompletedSearch] = useState('');

  const [handoverHistory, setHandoverHistory] = useState<Handover[]>([]);
  const [acknowledging, setAcknowledging] = useState(false);

  // Shift closure wizard state (Section 28-30)
  const [closureWizardOpen, setClosureWizardOpen] = useState(false);
  const [unresolvedTasks, setUnresolvedTasks] = useState<Task[]>([]);
  const [resolutions, setResolutions] = useState<Record<number, { disposition: 'Completed' | 'Carried Over' | 'Blocked'; notes: string }>>({});
  const [generalNotes, setGeneralNotes] = useState('');
  const [closureStep, setClosureStep] = useState<1 | 2 | 3>(1); // 1: Resolve Tasks, 2: General Notes, 3: Review & Confirm
  const [closureSubmitting, setClosureSubmitting] = useState(false);

  useEffect(() => {
    loadData();
    const handleRefresh = () => {
      loadData();
    };
    const handleOpenClosure = () => {
      if (handoverAcknowledged) {
        handleStartClosure();
      }
    };
    window.addEventListener('task:updated', handleRefresh);
    window.addEventListener('operational:refresh', handleRefresh);
    window.addEventListener('handover:open-closure', handleOpenClosure);
    return () => {
      window.removeEventListener('task:updated', handleRefresh);
      window.removeEventListener('operational:refresh', handleRefresh);
      window.removeEventListener('handover:open-closure', handleOpenClosure);
    };
  }, [handoverAcknowledged]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [handoverRes, historyRes] = await Promise.all([
        api.getCurrentHandover(),
        api.getHandoverHistory()
      ]);
      setCurrentHandover(handoverRes);
      setHandoverHistory(historyRes);
    } catch (err: any) {
      setError(err.message || 'Failed to load handover details.');
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledge = async () => {
    setError(null);
    setAcknowledging(true);
    try {
      // Optimistic update so the banner immediately transforms into "Shift Accepted"
      if (currentHandover) {
        setCurrentHandover({
          ...currentHandover,
          isShiftAccepted: true,
          shiftHandoverPendingAck: false,
          acceptedBy: currentUser.username,
          acceptedAt: new Date().toISOString()
        });
      }
      const handoverId = currentHandover?.latestHandover?.id;
      await api.acknowledgeHandover(handoverId);
      setSuccessMsg('Shift acknowledged and accepted. You are now officially accountable for this operational shift.');
      if (onAcknowledgeHandover) {
        await onAcknowledgeHandover();
      }
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to acknowledge shift.');
      await loadData();
    } finally {
      setAcknowledging(false);
    }
  };

  const handleStartClosure = async () => {
    setError(null);
    setSuccessMsg(null);
    const isAccepted = Boolean(currentHandover?.isShiftAccepted || handoverAcknowledged);
    if (!isAccepted) {
      setError('Shift Closure Locked: You cannot close the shift because it has not been accepted yet. Please accept the shift first.');
      return;
    }
    try {
      const validation = await api.validateShiftClosure();
      setUnresolvedTasks(validation.unresolvedTasks);

      // Pre-initialize resolutions with helpful defaults
      const initialResolutions: Record<number, { disposition: 'Completed' | 'Carried Over' | 'Blocked'; notes: string }> = {};
      for (const t of validation.unresolvedTasks) {
        initialResolutions[t.id] = {
          disposition: 'Carried Over',
          notes: 'Handed over to incoming shift for follow-up'
        };
      }
      setResolutions(initialResolutions);
      setClosureStep(1);
      setClosureWizardOpen(true);
    } catch (err: any) {
      setError(err.message || 'Failed to validate shift closure.');
    }
  };

  const handleSetAllDisposition = (disposition: 'Completed' | 'Carried Over') => {
    const updated: Record<number, { disposition: 'Completed' | 'Carried Over' | 'Blocked'; notes: string }> = {};
    for (const t of unresolvedTasks) {
      updated[t.id] = {
        disposition,
        notes: disposition === 'Carried Over' ? 'Handed over to incoming shift for follow-up' : 'Completed during operational shift'
      };
    }
    setResolutions(updated);
  };

  const handleResolutionChange = (taskId: number, disposition: 'Completed' | 'Carried Over' | 'Blocked', notes: string) => {
    let finalNotes = notes;
    if (!finalNotes) {
      if (disposition === 'Carried Over') finalNotes = 'Handed over to incoming shift for follow-up';
      else if (disposition === 'Blocked') finalNotes = 'Awaiting vendor or external dependency resolution';
    }
    setResolutions(prev => ({
      ...prev,
      [taskId]: {
        disposition,
        notes: finalNotes
      }
    }));
  };

  // Validate step 1: every unresolved task must have disposition
  const validateStep1 = () => {
    const updated = { ...resolutions };
    let hasChanges = false;
    for (const task of unresolvedTasks) {
      const res = updated[task.id];
      if (!res) {
        updated[task.id] = { disposition: 'Carried Over', notes: 'Handed over to incoming shift for follow-up' };
        hasChanges = true;
      } else if (res.disposition !== 'Completed' && !res.notes.trim()) {
        updated[task.id] = {
          ...res,
          notes: res.disposition === 'Carried Over' ? 'Handed over to incoming shift for follow-up' : 'Awaiting dependency resolution'
        };
        hasChanges = true;
      }
    }
    if (hasChanges) {
      setResolutions(updated);
    }
    setError(null);
    return true;
  };

  const handleConfirmCloseShift = async () => {
    setClosureSubmitting(true);
    setError(null);
    try {
      const resolutionList = Object.entries(resolutions).map(([taskId, r]: [string, { disposition: string; notes: string }]) => ({
        taskId: Number(taskId),
        disposition: (r.disposition === 'Completed' ? 'Completed' : r.disposition === 'Blocked' ? 'Blocked' : 'Carried Over') as 'Completed' | 'Carried Over' | 'Blocked',
        notes: r.notes || (r.disposition === 'Carried Over' ? 'Handed over to incoming shift for follow-up' : '')
      }));

      const res = await api.closeShift(resolutionList, generalNotes);
      setClosureWizardOpen(false);
      setSuccessMsg(res?.message || `Shift successfully closed and handed over to ${shift?.nextShift}!`);
      await loadData();
      onShiftClosed();
    } catch (err: any) {
      setError(err.message || 'Failed to close shift.');
    } finally {
      setClosureSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* View Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('current')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'current'
                ? 'bg-[#0F4C81] text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Current Shift Handover
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'history'
                ? 'bg-[#0F4C81] text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Handover History ({handoverHistory.length})
          </button>
        </div>

        <button
          onClick={() => onOpenEmailModal(undefined)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
          title="Generate email with current live shift tasks"
        >
          <Mail className="w-3.5 h-3.5 text-[#0F4C81] dark:text-blue-400" />
          <span>Simplified Handover Email (Live)</span>
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-sm flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-sm flex items-start gap-2.5">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {activeTab === 'current' ? (
        <div className="space-y-6">
          {/* Weekend / Holiday On-Call Information Banner */}
          {shift?.isOnCallDay && (
            <div className="p-4 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/60 text-indigo-950 dark:text-indigo-200 flex items-start gap-3 shadow-xs">
              <PhoneForwarded className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[10px] font-black uppercase tracking-wider">
                    {shift.dayType === 'HOLIDAY_ONCALL' ? 'Official Holiday On-Call' : `${shift.dayName} Weekend On-Call`}
                  </span>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                    Full-Day Single-Operator Duty Active
                  </h4>
                </div>
                <p className="text-xs text-indigo-900 dark:text-indigo-300">
                  {shift.onCallReason || 'This day is designated as a 24-hour single-operator on-call shift.'}{' '}
                  As the on-call engineer, you handle any incoming tasks or urgent incidents during the entire day, and carry over or handover duties to tomorrow&apos;s on-call colleague.
                </p>
              </div>
            </div>
          )}

          {/* Transforming Shift Acceptance Banner */}
          {!currentHandover?.isShiftAccepted && !handoverAcknowledged ? (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-start gap-3">
                <Lock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm">Shift Handover Awaiting Acceptance ({shift?.name || 'Active'} Shift)</h4>
                  <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                    Ticket operations and shift closure are locked until you officially accept and take operational custody of this shift.
                  </p>
                </div>
              </div>
              <button
                id="btn-acknowledge-handover"
                onClick={handleAcknowledge}
                disabled={acknowledging}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shrink-0 transition-colors shadow-xs cursor-pointer flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                {acknowledging ? 'Accepting...' : 'Accept Shift Now'}
              </button>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-950 dark:text-emerald-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider">
                      Shift Accepted
                    </span>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                      Shift Accepted &amp; Operational Custody Active
                    </h4>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                    Accepted by <strong className="text-emerald-700 dark:text-emerald-400">@{currentHandover?.acceptedBy || currentHandover?.latestHandover?.acknowledged_by || currentUser.username}</strong>
                    {currentHandover?.acceptedAt && (
                      <span> on {new Date(currentHandover.acceptedAt).toLocaleDateString()} at {new Date(currentHandover.acceptedAt).toLocaleTimeString()}</span>
                    )}
                    {' '}&bull; All ticket actions and shift closure operations are unlocked.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 text-xs font-bold shrink-0 border border-emerald-300 dark:border-emerald-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Custody Active</span>
              </div>
            </div>
          )}

          {/* Shift Closed Banner */}
          {currentHandover?.isShiftClosed && (
            <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-900 dark:text-blue-200 flex items-start gap-3 shadow-xs">
              <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-sm">Current Shift Handover Closed &amp; Finalized</h4>
                <p className="text-xs text-blue-800 dark:text-blue-300 mt-0.5">
                  Shift was closed by @{currentHandover.shiftClosedBy} at {new Date(currentHandover.shiftClosedAt || '').toLocaleTimeString()}. Carried-over and active tasks are locked until acknowledged by the incoming {shift?.nextShift} Shift.
                </p>
              </div>
            </div>
          )}

          {/* Section 26 & 27: Inherited Handover Card */}
          <div className="p-6 rounded-2xl bg-white dark:bg-[#16324F] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#0F4C81] dark:text-blue-400">
                  Operational Continuity
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 mt-0.5">
                  Handover: {shift?.previousShift || 'Previous'} Shift &rarr; {shift?.name || 'Current'} Shift
                </h2>
              </div>

              {/* Status indicator in card header */}
              {currentHandover?.isShiftAccepted || handoverAcknowledged || currentHandover?.latestHandover?.acknowledged_by ? (
                <div className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    Accepted by @{currentHandover?.acceptedBy || currentHandover?.latestHandover?.acknowledged_by || currentUser.username}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-800">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Pending Acceptance</span>
                </div>
              )}
            </div>

            {/* Handover Details */}
            {currentHandover?.latestHandover ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60">
                  <div className="text-slate-400">Closed By / Timestamp</div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200 mt-1">
                    @{currentHandover.latestHandover.closed_by} &bull;{' '}
                    {new Date(currentHandover.latestHandover.closed_at).toLocaleString()}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60">
                  <div className="text-slate-400">Tasks Carried Over / Inherited</div>
                  <div className="font-semibold text-purple-700 dark:text-purple-300 mt-1">
                    {currentHandover.latestHandover.tasks_carried_over_count} tasks inherited
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60">
                  <div className="text-slate-400">Tasks Completed in Previous Shift</div>
                  <div className="font-semibold text-emerald-700 dark:text-emerald-300 mt-1">
                    {currentHandover.latestHandover.tasks_completed_count} tasks completed
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-xs text-slate-500">
                No previous recorded handover found. Operating fresh shift cycle.
              </div>
            )}

            {currentHandover?.latestHandover?.general_notes && (
              <div className="p-3.5 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60">
                <div className="text-[11px] font-bold text-amber-900 dark:text-amber-200 uppercase">
                  Notes from {shift?.previousShift} Shift:
                </div>
                <div className="text-xs text-amber-800 dark:text-amber-300 mt-1 whitespace-pre-line">
                  {currentHandover.latestHandover.general_notes}
                </div>
              </div>
            )}
          </div>

          {/* Shift Sticky Notes (Linked strictly to Shift Date) */}
          <ShiftStickyNotes
            shiftDate={shift?.businessDate || shift?.currentDate}
            shiftName={shift?.name}
            currentUser={currentUser}
          />

          {/* Section 3: Completed Tasks in Today's Cycle (Distinct from Pending Tasks) */}

          <div id="handover-completed-today-section" className="p-6 rounded-2xl bg-white dark:bg-[#16324F] border border-emerald-200/80 dark:border-emerald-900/50 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 shrink-0 mt-0.5">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      Completed Workload &bull; Operational Handover
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200">
                      {currentHandover?.completedTasksToday?.length || 0} Finished Today
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base mt-0.5">
                    Completed Tasks Today
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Visible to incoming shifts ({shift?.name} Shift) to prevent duplicated effort and audit exact who/when completions.
                  </p>
                </div>
              </div>

              {/* Shift Breakdown Badges & Filter */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setCompletedShiftFilter('ALL')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      completedShiftFilter === 'ALL'
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    All Shifts ({currentHandover?.completedTasksToday?.length || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompletedShiftFilter('Morning')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      completedShiftFilter === 'Morning'
                        ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-xs font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    Morning ({currentHandover?.daySummary?.completedByShift?.Morning || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompletedShiftFilter('Mid')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      completedShiftFilter === 'Mid'
                        ? 'bg-white dark:bg-slate-700 text-amber-700 dark:text-amber-300 shadow-xs font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    Mid ({currentHandover?.daySummary?.completedByShift?.Mid || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompletedShiftFilter('Night')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      completedShiftFilter === 'Night'
                        ? 'bg-white dark:bg-slate-700 text-purple-700 dark:text-purple-300 shadow-xs font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    Night ({currentHandover?.daySummary?.completedByShift?.Night || 0})
                  </button>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={completedSearch}
                    onChange={e => setCompletedSearch(e.target.value)}
                    placeholder="Search finished..."
                    className="pl-8 pr-3 py-1 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-1 focus:ring-emerald-500 outline-hidden w-36"
                  />
                </div>
              </div>
            </div>

            {/* Shift Closures Summary Card if available */}
            {currentHandover?.daySummary?.previousShiftClosures && currentHandover.daySummary.previousShiftClosures.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-xs">
                {currentHandover.daySummary.previousShiftClosures.map((closure, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {closure.from_shift} Shift Closure
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(closure.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Closed by: <strong className="text-slate-700 dark:text-slate-300">@{closure.closed_by}</strong>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-500 font-medium pt-1 border-t border-slate-200/60 dark:border-slate-700/40">
                      <span className="text-emerald-600 dark:text-emerald-400">{closure.tasks_completed_count} completed</span>
                      <span>&bull;</span>
                      <span className="text-purple-600 dark:text-purple-400">{closure.tasks_carried_over_count} carried over</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* List of Completed Tasks for Today */}
            {((currentHandover?.completedTasksToday || []).filter(task => {
              const effectiveShift = task.completed_shift || task.current_shift || task.original_shift || 'Morning';
              if (completedShiftFilter !== 'ALL' && effectiveShift !== completedShiftFilter) {
                return false;
              }
              if (completedSearch.trim()) {
                const q = completedSearch.toLowerCase();
                const codeMatch = task.task_code?.toLowerCase().includes(q);
                const titleMatch = task.title?.toLowerCase().includes(q);
                const userMatch = (task.completed_by || '').toLowerCase().includes(q) || (task.completed_by_full_name || '').toLowerCase().includes(q);
                const noteMatch = (task.completion_note || '').toLowerCase().includes(q);
                return Boolean(codeMatch || titleMatch || userMatch || noteMatch);
              }
              return true;
            })).length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-emerald-50/50 dark:bg-emerald-950/20 text-slate-500 uppercase tracking-wider text-[11px] font-semibold border-b border-emerald-100 dark:border-emerald-900/40">
                    <tr>
                      <th className="py-2.5 px-3">Task ID</th>
                      <th className="py-2.5 px-3">Task Title &amp; Details</th>
                      <th className="py-2.5 px-3">Shift</th>
                      <th className="py-2.5 px-3">Completed By</th>
                      <th className="py-2.5 px-3">Completion Time</th>
                      <th className="py-2.5 px-3">Completion Notes</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(currentHandover?.completedTasksToday || []).filter(task => {
                      const effectiveShift = task.completed_shift || task.current_shift || task.original_shift || 'Morning';
                      if (completedShiftFilter !== 'ALL' && effectiveShift !== completedShiftFilter) {
                        return false;
                      }
                      if (completedSearch.trim()) {
                        const q = completedSearch.toLowerCase();
                        const codeMatch = task.task_code?.toLowerCase().includes(q);
                        const titleMatch = task.title?.toLowerCase().includes(q);
                        const userMatch = (task.completed_by || '').toLowerCase().includes(q) || (task.completed_by_full_name || '').toLowerCase().includes(q);
                        const noteMatch = (task.completion_note || '').toLowerCase().includes(q);
                        return Boolean(codeMatch || titleMatch || userMatch || noteMatch);
                      }
                      return true;
                    }).map(task => {
                      const effectiveShift = task.completed_shift || task.current_shift || task.original_shift || 'Morning';
                      return (
                      <tr
                        key={task.id}
                        onClick={() => onOpenTask(task.id)}
                        className="hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-3 font-mono font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                          {task.task_code}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {task.title}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                            <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800">
                              {task.category}
                            </span>
                            <span
                              className={`font-bold px-1.5 py-0.2 rounded-full text-[9px] ${
                                task.priority === 'Critical'
                                  ? 'bg-rose-600 text-white'
                                  : task.priority === 'High'
                                  ? 'bg-amber-500 text-white'
                                  : 'bg-blue-600 text-white'
                              }`}
                            >
                              {task.priority}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                            effectiveShift === 'Morning'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                              : effectiveShift === 'Mid'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300'
                              : 'bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300'
                          }`}>
                            {effectiveShift} Shift
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
                        <td className="py-3 px-3 whitespace-nowrap text-slate-600 dark:text-slate-300 text-[11px]">
                          <div className="flex items-center gap-1 font-mono">
                            <Clock className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span>
                              {task.completed_at
                                ? new Date(task.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                : '-'}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3 max-w-xs truncate text-slate-600 dark:text-slate-300 text-[11px]">
                          {task.completion_note || <span className="text-slate-400 italic">No notes recorded</span>}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold hover:underline flex items-center justify-end gap-1">
                            View <ChevronRight className="w-3.5 h-3.5" />
                          </span>
                        </td>
                      </tr>
                    );})}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center text-slate-400 text-xs bg-slate-50/50 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                No completed tasks recorded for today yet. Active pending workload is listed below.
              </div>
            )}
          </div>

          {/* Active Inherited & Open Tasks Table (Section 26) */}
          <div className="p-6 rounded-2xl bg-white dark:bg-[#16324F] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Active Inherited &amp; Open Tasks ({currentHandover?.openTasks?.length || 0})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tasks requiring operational resolution before shift closure can proceed
                </p>
              </div>

              {/* Initiate Close Shift Trigger */}
              {currentHandover?.isShiftClosed ? (
                <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Shift Closed &bull; Pending {shift?.nextShift} Receipt</span>
                </div>
              ) : (currentHandover?.isShiftAccepted || handoverAcknowledged) ? (
                <button
                  id="btn-initiate-shift-closure"
                  onClick={handleStartClosure}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F4C81] hover:bg-[#16324F] text-white text-xs font-bold shadow-md transition-colors cursor-pointer"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  Close Shift / Handover (Section 28)
                </button>
              ) : (
                <button
                  disabled
                  title="Shift must be accepted before it can be closed."
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-400 text-xs font-bold border border-slate-300 dark:border-slate-700 cursor-not-allowed"
                >
                  <Lock className="w-4 h-4" />
                  Close Shift (Locked - Acceptance Required)
                </button>
              )}
            </div>

            {currentHandover?.openTasks && currentHandover.openTasks.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {currentHandover.openTasks.map(task => (
                  <div
                    key={task.id}
                    onClick={() => onOpenTask(task.id)}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 p-2 rounded-xl transition-colors cursor-pointer"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[#0F4C81] dark:text-blue-300">
                          {task.task_code}
                        </span>
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
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {task.title}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-3">
                        <span>Original: {task.original_shift}</span>
                        <span>&bull;</span>
                        <span>Created by: @{task.created_by}</span>
                        {task.carry_over_reason && (
                          <span className="text-purple-600 dark:text-purple-400 font-medium">
                            &bull; Carried over: {task.carry_over_reason}
                          </span>
                        )}
                        {task.blocked_reason && (
                          <span className="text-amber-600 dark:text-amber-400 font-medium">
                            &bull; Blocked: {task.blocked_reason}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      {task.isHandoverLocked && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-800">
                          <Lock className="w-3 h-3 text-amber-600" />
                          Locked
                        </span>
                      )}
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-semibold ${
                          task.status === 'In Progress'
                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                            : task.status === 'Blocked'
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {task.status}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400 text-xs">
                No active open tasks. Shift is ready for closure.
              </div>
            )}
          </div>
        </div>
      ) : (
        /* History Tab */
        <div className="space-y-4">
          {handoverHistory.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs bg-white dark:bg-[#16324F] rounded-2xl border border-slate-200 dark:border-slate-800">
              No historical handovers recorded yet.
            </div>
          ) : (
            handoverHistory.map(h => (
              <div
                key={h.id}
                className="p-5 rounded-xl bg-white dark:bg-[#16324F] border border-slate-200 dark:border-slate-800 shadow-xs space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900 dark:text-white">
                      {h.from_shift} Shift &rarr; {h.to_shift} Shift
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      Date: {h.shift_date}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Closed by <strong className="text-slate-700 dark:text-slate-200">@{h.closed_by}</strong> at{' '}
                      {new Date(h.closed_at).toLocaleTimeString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenEmailModal(h.id)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[11px] font-semibold text-[#0F4C81] dark:text-blue-300 transition-colors cursor-pointer"
                      title="View or copy handover email for this record"
                    >
                      <Mail className="w-3 h-3" />
                      <span>Email</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 rounded bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300">
                    <div className="font-bold text-sm">{h.tasks_completed_count}</div>
                    <div className="text-[11px]">Completed</div>
                  </div>
                  <div className="p-2 rounded bg-purple-50/60 dark:bg-purple-950/20 text-purple-800 dark:text-purple-300">
                    <div className="font-bold text-sm">{h.tasks_carried_over_count}</div>
                    <div className="text-[11px]">Carried Over</div>
                  </div>
                  <div className="p-2 rounded bg-amber-50/60 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300">
                    <div className="font-bold text-sm">{h.tasks_blocked_count}</div>
                    <div className="text-[11px]">Blocked</div>
                  </div>
                </div>

                {h.general_notes && (
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-700 dark:text-slate-300">
                    <strong>General Handover Notes:</strong> {h.general_notes}
                  </div>
                )}

                {/* Handover Task Items */}
                {h.tasks && h.tasks.length > 0 && (
                  <div className="mt-2 space-y-1 text-xs">
                    <div className="text-[11px] font-semibold text-slate-400">Tasks Handled:</div>
                    {h.tasks.map(t => (
                      <div key={t.id} className="flex items-center justify-between py-1 px-2 rounded bg-slate-50 dark:bg-slate-800/40">
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          {t.task_code} - {t.task_title}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            t.disposition === 'Completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : t.disposition === 'Carry Over'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {t.disposition}
                          {t.notes && `: ${t.notes}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* =========================================================================
          THE MANDATORY SHIFT CLOSURE VALIDATION MODAL (SECTION 28 - 30)
          NO BYPASS! If unresolved tasks exist, user MUST choose:
          Completed OR Carry Over (requires note) OR Blocked (requires reason)
         ========================================================================= */}
      {closureWizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-3xl bg-white dark:bg-[#16324F] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="bg-[#0F4C81] px-6 py-4 text-white flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-blue-200 uppercase tracking-wider">
                  Shift Closure &bull; Handover Finalization
                </span>
                <h2 className="text-lg font-bold">
                  Closing {shift?.name} Shift &rarr; Handing Over to {shift?.nextShift}
                </h2>
              </div>
              <button
                onClick={() => setClosureWizardOpen(false)}
                className="text-white/80 hover:text-white p-1"
              >
                &times;
              </button>
            </div>

            {/* Step Indicator */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-xs font-semibold">
              <div
                className={`flex-1 py-2.5 px-4 text-center ${
                  closureStep === 1
                    ? 'border-b-2 border-[#0F4C81] text-[#0F4C81] dark:text-blue-400 font-bold bg-white dark:bg-slate-800'
                    : 'text-slate-500'
                }`}
              >
                Step 1: Unresolved Tasks ({unresolvedTasks.length})
              </div>
              <div
                className={`flex-1 py-2.5 px-4 text-center ${
                  closureStep === 2
                    ? 'border-b-2 border-[#0F4C81] text-[#0F4C81] dark:text-blue-400 font-bold bg-white dark:bg-slate-800'
                    : 'text-slate-500'
                }`}
              >
                Step 2: General Handover Notes
              </div>
              <div
                className={`flex-1 py-2.5 px-4 text-center ${
                  closureStep === 3
                    ? 'border-b-2 border-[#0F4C81] text-[#0F4C81] dark:text-blue-400 font-bold bg-white dark:bg-slate-800'
                    : 'text-slate-500'
                }`}
              >
                Step 3: Review &amp; Confirm Handover
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-5">
              {/* In-Modal Error Display */}
              {error && (
                <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{error}</span>
                </div>
              )}

              {/* STEP 1: RESOLVE UNRESOLVED TASKS */}
              {closureStep === 1 && (
                <div className="space-y-4">
                  {unresolvedTasks.length > 0 ? (
                    <>
                      {/* Simplified Action Banner */}
                      <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 text-blue-900 dark:text-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 font-bold text-sm text-blue-950 dark:text-blue-100">
                            <ArrowRightLeft className="w-4 h-4 text-[#0F4C81] dark:text-blue-400 shrink-0" />
                            {unresolvedTasks.length} Open Task(s) to Hand Over
                          </div>
                          <p className="text-xs text-blue-800/80 dark:text-blue-300">
                            Quickly mark all tasks to carry over to the next shift, or adjust individually.
                          </p>
                        </div>

                        {/* 1-Click Quick Batch Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleSetAllDisposition('Carried Over')}
                            className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
                            title="Quickly set all open tasks to Carry Over"
                          >
                            <span>&rarr;</span>
                            <span>Carry Over All ({unresolvedTasks.length})</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetAllDisposition('Completed')}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
                            title="Mark all open tasks as Completed"
                          >
                            <span>✓</span>
                            <span>Complete All</span>
                          </button>
                        </div>
                      </div>

                      {/* Unresolved Tasks List */}
                      <div className="space-y-4">
                        {unresolvedTasks.map(task => {
                          const res = resolutions[task.id] || { disposition: 'Carried Over', notes: '' };
                          return (
                            <div
                              key={task.id}
                              className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 shadow-xs space-y-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-[#0F4C81] dark:text-blue-300">
                                      {task.task_code}
                                    </span>
                                    <span
                                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                        task.priority === 'Critical'
                                          ? 'bg-rose-600 text-white'
                                          : 'bg-amber-500 text-white'
                                      }`}
                                    >
                                      {task.priority}
                                    </span>
                                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                                      {task.title}
                                    </h4>
                                  </div>
                                  {task.description && (
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                      {task.description}
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Disposition Choice Radio/Buttons (Section 28) */}
                              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                                  Select Handover Disposition:
                                </label>
                                <div className="grid grid-cols-3 gap-2 text-xs">
                                  <button
                                    type="button"
                                    onClick={() => handleResolutionChange(task.id, 'Completed', res.notes)}
                                    className={`py-2 px-3 rounded-lg border font-semibold text-center transition-all cursor-pointer ${
                                      res.disposition === 'Completed'
                                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                                    }`}
                                  >
                                    ✓ Completed
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleResolutionChange(task.id, 'Carried Over', res.notes)}
                                    className={`py-2 px-3 rounded-lg border font-semibold text-center transition-all cursor-pointer ${
                                      res.disposition === 'Carried Over'
                                        ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                                    }`}
                                  >
                                    &rarr; Carry Over
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleResolutionChange(task.id, 'Blocked', res.notes)}
                                    className={`py-2 px-3 rounded-lg border font-semibold text-center transition-all cursor-pointer ${
                                      res.disposition === 'Blocked'
                                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                                    }`}
                                  >
                                    ⚠ Blocked
                                  </button>
                                </div>

                                {/* Mandatory Note Input for Carry Over & Blocked */}
                                {res.disposition === 'Carried Over' && (
                                  <div className="mt-2 space-y-1">
                                    <label className="block text-[11px] font-semibold text-purple-900 dark:text-purple-300">
                                      Carry Over Note for {shift?.nextShift} Shift (Mandatory):
                                    </label>
                                    <input
                                      type="text"
                                      value={res.notes}
                                      onChange={e => handleResolutionChange(task.id, 'Carried Over', e.target.value)}
                                      placeholder="e.g. Not completed during Mid shift. Please verify backup during Night."
                                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-purple-300 dark:border-purple-700 bg-purple-50/40 dark:bg-purple-950/20 text-slate-900 dark:text-white"
                                    />
                                  </div>
                                )}

                                {res.disposition === 'Blocked' && (
                                  <div className="mt-2 space-y-1">
                                    <label className="block text-[11px] font-semibold text-amber-900 dark:text-amber-300">
                                      Block Reason (Mandatory):
                                    </label>
                                    <input
                                      type="text"
                                      value={res.notes}
                                      onChange={e => handleResolutionChange(task.id, 'Blocked', e.target.value)}
                                      placeholder="e.g. Waiting for application owner approval"
                                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/20 text-slate-900 dark:text-white"
                                    />
                                  </div>
                                )}

                                {res.disposition === 'Completed' && (
                                  <div className="mt-2 space-y-1">
                                    <label className="block text-[11px] font-semibold text-emerald-900 dark:text-emerald-300">
                                      Completion Verification Note (Optional):
                                    </label>
                                    <input
                                      type="text"
                                      value={res.notes}
                                      onChange={e => handleResolutionChange(task.id, 'Completed', e.target.value)}
                                      placeholder="e.g. Verified and all checks passed"
                                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50/40 dark:bg-emerald-950/20 text-slate-900 dark:text-white"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="p-8 text-center text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800 space-y-2">
                      <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-600" />
                      <h4 className="font-bold text-base">All Tasks Already Resolved!</h4>
                      <p className="text-xs">No pending or in-progress tasks remain unhandled in this shift.</p>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 2: GENERAL HANDOVER NOTES (SECTION 31) */}
              {closureStep === 2 && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300">
                    Provide general operational handover notes for the incoming <strong>{shift?.nextShift}</strong> shift operators (e.g. ongoing incident investigations, scheduled maintenance windows, or vendor ticket numbers).
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                      General Handover Notes (Attributed to @{currentUser.username}):
                    </label>
                    <textarea
                      id="handover-general-notes"
                      rows={5}
                      value={generalNotes}
                      onChange={e => setGeneralNotes(e.target.value)}
                      placeholder="e.g. Server monitoring alert remains under investigation. Vendor team is expected to respond tomorrow morning."
                      className="w-full p-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#0F4C81] outline-hidden"
                    />
                  </div>
                </div>
              )}

              {/* STEP 3: SUMMARY REVIEW & CONFIRMATION (SECTION 30) */}
              {closureStep === 3 && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-3">
                    <div className="font-bold text-sm text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2">
                      SHIFT HANDOVER SUMMARY (Section 30)
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400">Date:</span>
                        <div className="font-semibold text-slate-800 dark:text-slate-200">{shift?.currentDate}</div>
                      </div>
                      <div>
                        <span className="text-slate-400">Closing Shift:</span>
                        <div className="font-semibold text-slate-800 dark:text-slate-200">{shift?.name} Shift</div>
                      </div>
                      <div>
                        <span className="text-slate-400">Next Shift:</span>
                        <div className="font-semibold text-slate-800 dark:text-slate-200">{shift?.nextShift} Shift</div>
                      </div>
                      <div>
                        <span className="text-slate-400">Operator:</span>
                        <div className="font-semibold text-slate-800 dark:text-slate-200">@{currentUser.username}</div>
                      </div>
                    </div>
                  </div>

                  {/* Dispositions Breakdown */}
                  <div className="space-y-2 text-xs">
                    <div className="font-bold text-slate-700 dark:text-slate-300">Task Dispositions:</div>
                    {Object.entries(resolutions).map(([taskId, r]: [string, { disposition: string; notes: string }]) => {
                      const t = unresolvedTasks.find(x => x.id === Number(taskId));
                      if (!t) return null;
                      return (
                        <div key={taskId} className="flex items-start justify-between p-2 rounded bg-slate-50 dark:bg-slate-800/40">
                          <div>
                            <span className="font-mono font-bold mr-2 text-[#0F4C81] dark:text-blue-300">{t.task_code}</span>
                            <span className="font-medium text-slate-800 dark:text-slate-200">{t.title}</span>
                            {r.notes && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Note: {r.notes}</p>}
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded font-bold ${
                              r.disposition === 'Completed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : r.disposition === 'Carried Over' || r.disposition === 'Carry Over'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {r.disposition}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {generalNotes && (
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 text-xs">
                      <strong>General Notes:</strong> {generalNotes}
                    </div>
                  )}

                  <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-blue-900 dark:text-blue-200">
                    <ShieldCheck className="w-4 h-4 inline mr-1 text-blue-600" />
                    Upon confirmation, all carried-over tasks will automatically appear in the {shift?.nextShift} shift dashboard. Operational history and audit logs will be permanently committed.
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer Controls */}
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  if (closureStep === 1) setClosureWizardOpen(false);
                  else setClosureStep((closureStep - 1) as any);
                }}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100"
              >
                {closureStep === 1 ? 'Cancel' : 'Back'}
              </button>

              {closureStep < 3 ? (
                <button
                  type="button"
                  id="btn-next-closure-step"
                  onClick={() => {
                    if (closureStep === 1) {
                      if (validateStep1()) setClosureStep(2);
                    } else if (closureStep === 2) {
                      setClosureStep(3);
                    }
                  }}
                  className="px-5 py-2 rounded-lg bg-[#0F4C81] hover:bg-[#16324F] text-white text-xs font-bold transition-colors flex items-center gap-1.5"
                >
                  Continue
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  id="btn-confirm-handover"
                  onClick={handleConfirmCloseShift}
                  disabled={closureSubmitting}
                  className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {closureSubmitting ? 'Finalizing Handover...' : 'Confirm Handover & Close Shift'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  X,
  Clock,
  User,
  Shield,
  CheckCircle2,
  AlertTriangle,
  ArrowRightLeft,
  Ban,
  RotateCcw,
  MessageSquare,
  History,
  Calendar,
  Layers,
  Send,
  Lock
} from 'lucide-react';
import { Task, TaskHistoryItem, User as UserType } from '../types';
import { api } from '../api';

interface TaskDetailModalProps {
  taskId: number | null;
  onClose: () => void;
  onTaskUpdated: () => void;
  currentUser: UserType;
}

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  taskId,
  onClose,
  onTaskUpdated,
  currentUser
}) => {
  const [task, setTask] = useState<Task | null>(null);
  const [history, setHistory] = useState<TaskHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Action dialogs state
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [confirmComplete, setConfirmComplete] = useState(false);

  useEffect(() => {
    if (!taskId) return;
    loadTaskDetails();
  }, [taskId]);

  const loadTaskDetails = async () => {
    if (!taskId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getTask(taskId);
      setTask(res.task);
      setHistory(res.history);
    } catch (err: any) {
      setError(err.message || 'Failed to load task details.');
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteAction = async (action: string) => {
    if (!task) return;
    setError(null);

    // Validation
    if (['BLOCK', 'CANCEL', 'CARRY_OVER', 'REOPEN', 'ADD_NOTE'].includes(action) && !actionNotes.trim()) {
      setError('Please provide a reason or explanatory note.');
      return;
    }

    if (action === 'COMPLETE' && !confirmComplete) {
      setError('Please explicitly confirm task completion.');
      return;
    }

    setActionLoading(true);
    try {
      // Pass task.version for Optimistic Concurrency Check (Section 36)
      await api.updateTaskStatus(task.id, action, actionNotes, task.version);
      setActiveAction(null);
      setActionNotes('');
      setConfirmComplete(false);
      await loadTaskDetails();
      onTaskUpdated();
    } catch (err: any) {
      setError(err.message || 'Action failed.');
    } finally {
      setActionLoading(false);
    }
  };

  if (!taskId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-3xl bg-white dark:bg-[#16324F] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-bold px-2.5 py-1 rounded bg-[#0F4C81] text-white">
              {task?.task_code || 'Loading...'}
            </span>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Revision / Version: <span className="font-semibold text-slate-700 dark:text-slate-200">v{task?.version || 1}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {error && (
            <div className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-sm flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p>{error}</p>
                {error.includes('Conflict') && (
                  <button
                    onClick={loadTaskDetails}
                    className="mt-2 text-xs font-semibold underline hover:text-rose-900"
                  >
                    Click here to reload latest version
                  </button>
                )}
              </div>
            </div>
          )}

          {loading ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              Loading task details &amp; timeline...
            </div>
          ) : task ? (
            <>
              {/* Title & Primary Status Badges */}
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {/* Status Badge */}
                  <span
                    className={`text-xs font-bold px-2.5 py-0.5 rounded-full uppercase ${
                      task.status === 'Completed'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                        : task.status === 'In Progress'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300'
                        : task.status === 'Blocked'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                        : task.status === 'Cancelled'
                        ? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                        : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300'
                    }`}
                  >
                    {task.status}
                  </span>

                  {/* Priority Badge */}
                  <span
                    className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                      task.priority === 'Critical'
                        ? 'bg-rose-600 text-white'
                        : task.priority === 'High'
                        ? 'bg-amber-500 text-white'
                        : task.priority === 'Medium'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-400 text-white'
                    }`}
                  >
                    {task.priority} Priority
                  </span>

                  {/* Category */}
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    {task.category}
                  </span>

                  {/* Handover State (Section 17) */}
                  {task.handover_state !== 'None' && (
                    <span className="text-xs px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 flex items-center gap-1 font-medium">
                      <ArrowRightLeft className="w-3 h-3" />
                      Handover: {task.handover_state}
                    </span>
                  )}

                  {task.isOverdue && (
                    <span className="text-xs px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 font-bold animate-pulse">
                      OVERDUE
                    </span>
                  )}
                </div>

                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  {task.title}
                </h2>
                {task.description && (
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                    {task.description}
                  </p>
                )}
              </div>

              {/* Task Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 text-xs">
                <div>
                  <div className="text-slate-400">Created By / Shift</div>
                  <div className="font-semibold text-slate-700 dark:text-slate-200 mt-0.5">
                    @{task.created_by} ({task.original_shift})
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Current Shift</div>
                  <div className="font-semibold text-slate-700 dark:text-slate-200 mt-0.5">
                    {task.current_shift} Shift
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Assigned User</div>
                  <div className="font-semibold text-slate-700 dark:text-slate-200 mt-0.5">
                    {task.assigned_user ? `@${task.assigned_user}` : 'Unassigned (Shift-wide)'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Due Date/Time</div>
                  <div className={`font-semibold mt-0.5 ${task.isOverdue ? 'text-rose-600' : 'text-slate-700 dark:text-slate-200'}`}>
                    {task.due_date ? new Date(task.due_date).toLocaleString() : 'None scheduled'}
                  </div>
                </div>
              </div>

              {/* Action Prompt Form (if user selected an action) */}
              {activeAction && (
                <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-indigo-900 dark:text-indigo-200">
                      Action: {activeAction.replace('_', ' ')}
                    </span>
                    <button
                      onClick={() => setActiveAction(null)}
                      className="text-xs text-slate-400 hover:text-slate-600"
                    >
                      Cancel
                    </button>
                  </div>

                  {activeAction === 'COMPLETE' && (
                    <div className="space-y-2">
                      <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold">Confirmation Required (Section 22)</p>
                          <p>Are you sure this task has actually been completed and verified?</p>
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer text-slate-800 dark:text-slate-200">
                        <input
                          type="checkbox"
                          checked={confirmComplete}
                          onChange={e => setConfirmComplete(e.target.checked)}
                          className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        Yes, I explicitly confirm this task is 100% completed.
                      </label>
                      <input
                        type="text"
                        value={actionNotes}
                        onChange={e => setActionNotes(e.target.value)}
                        placeholder="Optional completion note (e.g. Logs checked, SLA met)"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </div>
                  )}

                  {activeAction === 'CARRY_OVER' && (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-purple-900 dark:text-purple-200">
                        Carry Over Reason / Handover Note (Mandatory - Section 23):
                      </label>
                      <textarea
                        value={actionNotes}
                        onChange={e => setActionNotes(e.target.value)}
                        placeholder="e.g. Waiting for vendor response or backup window"
                        rows={2}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </div>
                  )}

                  {activeAction === 'BLOCK' && (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-amber-900 dark:text-amber-200">
                        Block Reason (Mandatory - Section 24):
                      </label>
                      <textarea
                        value={actionNotes}
                        onChange={e => setActionNotes(e.target.value)}
                        placeholder="e.g. Blocked waiting for application owner approval"
                        rows={2}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </div>
                  )}

                  {activeAction === 'CANCEL' && (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-rose-900 dark:text-rose-200">
                        Cancellation Reason (Mandatory - Section 25):
                      </label>
                      <textarea
                        value={actionNotes}
                        onChange={e => setActionNotes(e.target.value)}
                        placeholder="Why is this task cancelled?"
                        rows={2}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </div>
                  )}

                  {activeAction === 'REOPEN' && (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-blue-900 dark:text-blue-200">
                        Reopen Reason (Section 66):
                      </label>
                      <textarea
                        value={actionNotes}
                        onChange={e => setActionNotes(e.target.value)}
                        placeholder="Why is this task being reopened?"
                        rows={2}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </div>
                  )}

                  {activeAction === 'ADD_NOTE' && (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                        Add Progress Note:
                      </label>
                      <textarea
                        value={actionNotes}
                        onChange={e => setActionNotes(e.target.value)}
                        placeholder="Enter progress update or observation..."
                        rows={2}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </div>
                  )}

                  <button
                    onClick={() => handleExecuteAction(activeAction)}
                    disabled={actionLoading}
                    className="px-4 py-2 rounded-lg bg-[#0F4C81] text-white text-xs font-semibold hover:bg-[#16324F] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {actionLoading ? 'Saving...' : 'Confirm & Save'}
                  </button>
                </div>
              )}

              {/* Action Buttons Bar */}
              {!activeAction && (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  {task.status === 'Pending' && (
                    <button
                      onClick={() => handleExecuteAction('START')}
                      disabled={actionLoading}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
                    >
                      Start Working
                    </button>
                  )}

                  {['Pending', 'In Progress'].includes(task.status) && (
                    <>
                      <button
                        onClick={() => {
                          setActiveAction('COMPLETE');
                          setConfirmComplete(false);
                          setActionNotes('');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Mark Completed
                      </button>

                      <button
                        onClick={() => {
                          setActiveAction('CARRY_OVER');
                          setActionNotes('');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 transition-colors flex items-center gap-1.5"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        Carry Over to Next Shift
                      </button>

                      <button
                        onClick={() => {
                          setActiveAction('BLOCK');
                          setActionNotes('');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition-colors flex items-center gap-1.5"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Mark Blocked
                      </button>
                    </>
                  )}

                  {task.status === 'Blocked' && (
                    <>
                      <button
                        onClick={() => handleExecuteAction('START')}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
                      >
                        Unblock / Resume Work
                      </button>
                      <button
                        onClick={() => {
                          setActiveAction('CARRY_OVER');
                          setActionNotes('');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 transition-colors flex items-center gap-1.5"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        Carry Over
                      </button>
                    </>
                  )}

                  {['Completed', 'Cancelled'].includes(task.status) && (
                    <button
                      onClick={() => {
                        setActiveAction('REOPEN');
                        setActionNotes('');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reopen Task
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setActiveAction('ADD_NOTE');
                      setActionNotes('');
                    }}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Add Note
                  </button>

                  {(currentUser?.role === 'ADMIN' || currentUser?.username === task.created_by) &&
                    !['Completed', 'Cancelled'].includes(task.status) && (
                      <button
                        onClick={() => {
                          setActiveAction('CANCEL');
                          setActionNotes('');
                        }}
                        className="px-3 py-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-semibold transition-colors flex items-center gap-1.5 ml-auto"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        Cancel Task
                      </button>
                    )}
                </div>
              )}

              {/* Section 21: Full Immutable Timeline History */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white mb-3">
                  <History className="w-4 h-4 text-[#0F4C81]" />
                  Task Lifecycle &amp; Shift History Timeline
                </div>

                <div className="space-y-3 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
                  {history.map((h, i) => (
                    <div key={h.id || i} className="relative pl-7 text-xs">
                      <div className="absolute left-2 top-1.5 w-2.5 h-2.5 rounded-full bg-[#0F4C81] ring-4 ring-white dark:ring-[#16324F]" />
                      <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                        <div className="flex items-center justify-between font-semibold">
                          <span className="text-slate-900 dark:text-white">
                            {h.action}
                            {h.previous_status && h.new_status && (
                              <span className="font-normal text-slate-500 ml-1">
                                ({h.previous_status} &rarr; {h.new_status})
                              </span>
                            )}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {new Date(h.created_at).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          By <span className="font-semibold text-slate-700 dark:text-slate-200">@{h.user_name}</span> &bull; {h.shift} Shift
                        </div>
                        {h.notes && (
                          <div className="mt-1.5 p-2 rounded bg-white dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                            {h.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

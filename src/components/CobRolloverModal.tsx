import React, { useState, useEffect, useRef } from 'react';
import { X, AlertCircle, ArrowRight, CheckCircle2, RotateCw, Sparkles, Layers } from 'lucide-react';
import { Task, ShiftInfo } from '../types';
import { extractCobCount } from '../utils/cobUtils';
import { api } from '../api';

interface CobRolloverModalProps {
  task: Task;
  shift: ShiftInfo | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmCompleted: () => void;
  onRolloverSuccess: (completedTask: Task, newTask: Task) => void;
}

export const CobRolloverModal: React.FC<CobRolloverModalProps> = ({
  task,
  shift,
  isOpen,
  onClose,
  onConfirmCompleted,
  onRolloverSuccess
}) => {
  const [stage, setStage] = useState<'ASK' | 'ROLLOVER'>('ASK');
  const [totalCobs, setTotalCobs] = useState<number>(0);
  const [remainingCobs, setRemainingCobs] = useState<number>(1);
  const [nextShiftName, setNextShiftName] = useState<string>('Night');
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prevIsOpenRef = useRef(false);
  const currentTaskIdRef = useRef<number | null>(null);

  // Initialize modal state only when transitioning from closed to open,
  // or if opened for a different task ID. Avoid resetting while the user is actively typing/recording!
  useEffect(() => {
    const isNewlyOpened = isOpen && !prevIsOpenRef.current;
    const isTaskChanged = isOpen && currentTaskIdRef.current !== (task ? task.id : null);

    if (isNewlyOpened || isTaskChanged) {
      setStage('ASK');
      setError(null);
      const count = (task?.cob_count && task.cob_count > 0) ? task.cob_count : (task ? extractCobCount(task) : 1);
      const initialTotal = count > 0 ? count : 1;
      setTotalCobs(initialTotal);
      setRemainingCobs(1);
      setNextShiftName(shift?.nextShift || 'Night');
      setNotes('');
      currentTaskIdRef.current = task ? task.id : null;
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, task?.id]);

  if (!isOpen || !task) return null;

  const completedCobs = Math.max(0, totalCobs - remainingCobs);

  const handleExecuteRollover = async () => {
    setError(null);
    if (remainingCobs <= 0) {
      setError('Remaining COBs must be at least 1. If 0 remain, choose "Yes" to complete normally.');
      return;
    }

    setLoading(true);
    try {
      const result = await api.cobRollover(task.id, {
        completedCount: completedCobs,
        remainingCount: remainingCobs,
        nextShift: nextShiftName,
        notes: notes.trim(),
        version: task.version
      });

      onRolloverSuccess(result.completedTask, result.newTask);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to roll over COB task.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white dark:bg-[#16324F] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-amber-50/70 dark:bg-amber-950/30">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500 text-white shadow-xs">
              <RotateCw className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                COB Task Closure Validation
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {task.task_code} &bull; {task.title}
              </p>
            </div>
          </div>
          <button
            id="cob-modal-close-btn"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {stage === 'ASK' ? (
            <div className="space-y-4 text-center py-2">
              <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center">
                <Layers className="w-6 h-6" />
              </div>

              <div className="space-y-1">
                <h4 className="text-base font-bold text-slate-900 dark:text-white">
                  Did the COBs finished?
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  Registered Number of COBs: <strong className="text-amber-600 dark:text-amber-400 font-mono font-bold">{totalCobs}</strong>. Confirm whether all {totalCobs} COB{totalCobs > 1 ? 's' : ''} were completed, or if remaining COBs must be transferred to the incoming shift.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3">
                <button
                  type="button"
                  id="cob-confirm-finished-btn"
                  onClick={() => onConfirmCompleted()}
                  className="p-3.5 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 font-semibold text-xs flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs"
                >
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  <span>Yes, Finished (100%)</span>
                  <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">All {totalCobs} COB{totalCobs > 1 ? 's' : ''} completed</span>
                </button>

                <button
                  type="button"
                  id="cob-rollover-toggle-btn"
                  onClick={() => setStage('ROLLOVER')}
                  className="p-3.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-200 font-semibold text-xs flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs"
                >
                  <RotateCw className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  <span>No, Remaining COBs</span>
                  <span className="text-[10px] font-normal text-amber-600 dark:text-amber-400">Specify remaining &amp; auto-rollover</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200">
                <p className="font-semibold flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                  Automatic Next-Shift Rollover Safeguard
                </p>
                <p className="text-[11px] mt-0.5 text-amber-700 dark:text-amber-300">
                  Direct ticket closure is prevented. Specify the remaining COB count so an automatic continuation ticket is created for the upcoming shift, ensuring no counts are lost or forgotten.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cob-total-input" className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Total In Task:
                  </label>
                  <input
                    id="cob-total-input"
                    type="number"
                    min="1"
                    value={totalCobs}
                    onChange={e => setTotalCobs(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold"
                  />
                </div>

                <div>
                  <label htmlFor="cob-remaining-input" className="block text-[11px] font-semibold text-amber-700 dark:text-amber-300 mb-1">
                    Remaining COBs (To Rollover):
                  </label>
                  <input
                    id="cob-remaining-input"
                    type="number"
                    min="1"
                    max={totalCobs}
                    value={remainingCobs}
                    onChange={e => setRemainingCobs(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 font-mono font-bold text-amber-600 dark:text-amber-400 ring-2 ring-amber-400/20"
                  />
                </div>
              </div>

              {/* Summary Calculation Pill */}
              <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">
                  Executed This Shift: <strong className="text-emerald-600 dark:text-emerald-400 font-mono">{completedCobs}</strong>
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-500 dark:text-slate-400">
                  Transfer to Next Shift: <strong className="text-amber-600 dark:text-amber-400 font-mono">{remainingCobs}</strong>
                </span>
              </div>

              {/* Target Shift */}
              <div>
                <label htmlFor="cob-next-shift-select" className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Target Upcoming Shift:
                </label>
                <select
                  id="cob-next-shift-select"
                  value={nextShiftName}
                  onChange={e => setNextShiftName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-medium"
                >
                  <option value="Morning">Morning Shift</option>
                  <option value="Mid">Mid Shift</option>
                  <option value="Night">Night Shift</option>
                  <option value="24H On-Call">24H On-Call</option>
                </select>
              </div>

              {/* Rollover Notes */}
              <div>
                <label htmlFor="cob-rollover-notes-input" className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Handover Notes for Incoming Operator (Optional):
                </label>
                <textarea
                  id="cob-rollover-notes-input"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Batches 1-3 completed successfully. Resume batch 4 after file drop from core banking."
                  rows={2}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  id="cob-rollover-back-btn"
                  onClick={() => setStage('ASK')}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                >
                  Back
                </button>

                <button
                  type="button"
                  id="cob-rollover-submit-btn"
                  onClick={handleExecuteRollover}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  {loading ? 'Creating Rollover Task...' : `Create Rollover Task (${remainingCobs} COBs) & Complete Current`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

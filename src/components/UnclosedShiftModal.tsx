import React from 'react';
import { AlertTriangle, ArrowRightLeft, LogOut, X, Clock, ShieldAlert } from 'lucide-react';

interface UnclosedShiftModalProps {
  isOpen: boolean;
  shiftName?: string;
  nextShiftName?: string;
  unresolvedCount?: number;
  onCloseShiftFirst: () => void;
  onConfirmLogout: () => void;
  onCancel: () => void;
}

export const UnclosedShiftModal: React.FC<UnclosedShiftModalProps> = ({
  isOpen,
  shiftName = 'Active',
  nextShiftName = 'Incoming',
  unresolvedCount = 0,
  onCloseShiftFirst,
  onConfirmLogout,
  onCancel
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="unclosed-shift-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onCancel}
    >
      <div
        id="unclosed-shift-modal-container"
        className="relative w-full max-w-lg bg-white dark:bg-[#112236] rounded-2xl border border-amber-200 dark:border-amber-800/60 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Amber accent top bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 via-orange-500 to-amber-500" />

        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="w-6 h-6 shrink-0" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Shift Not Closed Yet
                </h3>
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium mt-0.5">
                  Active Duty Shift Reminder ({shiftName} Shift)
                </p>
              </div>
            </div>
            <button
              id="btn-close-unclosed-shift-modal"
              onClick={onCancel}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close window"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body Content */}
          <div className="mt-4 space-y-3.5">
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              You are about to sign out, but your current duty shift (<span className="font-semibold text-slate-900 dark:text-white">{shiftName} Shift</span>) is still active and has not been officially closed and handed over.
            </p>

            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300">
                <Clock className="w-4 h-4 shrink-0" />
                <span>Handover Recommended Before Signing Out</span>
              </div>
              <p className="text-amber-800/90 dark:text-amber-300/90 leading-normal pl-6">
                Completing the shift closure finalizes operational logs and transfers active items to the incoming <span className="font-bold">{nextShiftName} Shift</span> team.
              </p>
            </div>

            {unresolvedCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800/80 text-xs text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                <ShieldAlert className="w-4 h-4 text-orange-500 shrink-0" />
                <span>
                  <strong className="text-slate-900 dark:text-white">{unresolvedCount}</strong> active {unresolvedCount === 1 ? 'task requires' : 'tasks require'} handover or resolution.
                </span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-end gap-2.5">
            <button
              id="btn-cancel-logout"
              type="button"
              onClick={onCancel}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer text-center"
            >
              Stay Signed In
            </button>

            <button
              id="btn-confirm-logout-anyway"
              type="button"
              onClick={onConfirmLogout}
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800/80 transition-colors cursor-pointer text-center"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out Anyway</span>
            </button>

            <button
              id="btn-goto-close-shift"
              type="button"
              onClick={onCloseShiftFirst}
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-[#0F4C81] hover:bg-[#0c3c66] shadow-sm transition-all cursor-pointer text-center"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>Close Shift First</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

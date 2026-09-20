import React from 'react';
import { ArrowRightLeft, ShieldCheck, X, UserCheck, Layers, Sparkles, Mail, CheckCircle2 } from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  appName?: string;
  teamName?: string;
  currentUserEmail?: string;
}

export const AboutModal: React.FC<AboutModalProps> = ({
  isOpen,
  onClose,
  appName = 'Hando',
  teamName = 'Operations Team',
  currentUserEmail = 'hossamhalawany@gmail.com'
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="about-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="about-modal-content"
        className="relative w-full max-w-lg bg-white dark:bg-[#16324F] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700/80 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header Ribbon */}
        <div className="bg-gradient-to-r from-[#0F4C81] via-[#16324F] to-[#1E3A8A] text-white p-6 relative">
          <button
            type="button"
            id="btn-close-about-modal"
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3.5 mb-2">
            <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center shadow-xs">
              <ArrowRightLeft className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-black tracking-tight">{appName}</h2>
                <span className="px-2 py-0.5 text-[11px] font-extrabold uppercase rounded-md bg-white/20 text-white border border-white/30 tracking-wider">
                  v1.0.0
                </span>
              </div>
              <p className="text-xs text-blue-100 font-medium">
                Operations Shift Handover &amp; Duty Management System
              </p>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 text-slate-700 dark:text-slate-300 text-sm">
          {/* Creator & Lead Card */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#0F4C81]/10 dark:bg-blue-950/60 text-[#0F4C81] dark:text-blue-300 flex items-center justify-center font-bold text-sm shrink-0">
                HH
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 dark:text-white text-base">
                    Hossam Halawany
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-[#0F4C81] dark:text-blue-300 font-semibold uppercase">
                    Admin &amp; Lead
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>{currentUserEmail}</span>
                </div>
              </div>
            </div>

            <div className="text-right hidden sm:block">
              <div className="text-xs font-semibold text-slate-900 dark:text-white">{teamName}</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Operations Control</div>
            </div>
          </div>

          {/* System Architecture Highlights */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              System Specifications
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#11273e] flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">Multi-Shift Relay</div>
                  <div className="text-slate-500 dark:text-slate-400 text-[11px]">Morning, Mid, &amp; Night cycles with duty acknowledgement</div>
                </div>
              </div>

              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#11273e] flex items-start gap-2.5">
                <ArrowRightLeft className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">Zero Forgotten Tasks</div>
                  <div className="text-slate-500 dark:text-slate-400 text-[11px]">Automatic task carry-over and shift closure locks</div>
                </div>
              </div>

              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#11273e] flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">Security &amp; 2FA</div>
                  <div className="text-slate-500 dark:text-slate-400 text-[11px]">Google Authenticator &amp; Emergency Recovery Pin</div>
                </div>
              </div>

              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#11273e] flex items-start gap-2.5">
                <Layers className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">Single Source of Truth</div>
                  <div className="text-slate-500 dark:text-slate-400 text-[11px]">SQLite database engine with immutable audit trail</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 dark:bg-[#11273e] px-6 py-3.5 border-t border-slate-200 dark:border-slate-700/60 flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400">
            {appName} &bull; Enterprise Handover Portal
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#0F4C81] text-white font-semibold text-xs hover:bg-[#16324F] transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

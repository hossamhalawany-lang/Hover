import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Mail, FileText, RotateCw } from 'lucide-react';
import { api } from '../api';

interface HandoverEmailModalProps {
  handoverId?: number;
  onClose: () => void;
}

export const HandoverEmailModal: React.FC<HandoverEmailModalProps> = ({
  handoverId,
  onClose
}) => {
  const [loading, setLoading] = useState(true);
  const [emailText, setEmailText] = useState('');
  const [copied, setCopied] = useState(false);
  const [includeTitles, setIncludeTitles] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadEmail();
  }, [handoverId, includeTitles]);

  const loadEmail = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.generateHandoverEmail(handoverId, includeTitles);
      setEmailText(res.emailText);
    } catch (err: any) {
      setError(err.message || 'Failed to generate email.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(emailText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-xl bg-white dark:bg-[#16324F] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-[#0F4C81] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Mail className="w-5 h-5" />
            <div>
              <h3 className="font-bold text-base leading-tight">Simplified Handover Email</h3>
              <span className="text-[11px] text-blue-200 font-medium">
                {handoverId ? `Historical Record (Handover #${handoverId})` : 'Live Shift Tasks (Real-time)'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadEmail}
              disabled={loading}
              title="Refresh with latest tasks"
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="p-1 text-white/80 hover:text-white cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Clean, concise text without unnecessary boilerplate — ready to copy into your email or chat.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeTitles}
                  onChange={e => setIncludeTitles(e.target.checked)}
                  className="rounded text-[#0F4C81] focus:ring-[#0F4C81] cursor-pointer"
                />
                Include Titles
              </label>
            </div>
          </div>

          {loading ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              Loading clean email text...
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-50 text-rose-700 text-xs">{error}</div>
          ) : (
            <div className="relative">
              <pre className="p-4 rounded-xl bg-slate-900 text-emerald-300 font-mono text-sm overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-96 selection:bg-emerald-800 border border-slate-800">
                {emailText}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
          >
            Close
          </button>

          <button
            id="btn-copy-handover-email"
            onClick={handleCopy}
            disabled={loading || !emailText}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#0F4C81] hover:bg-[#16324F] text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-300" />
                Copied to Clipboard!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy to Clipboard
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Mail, FileText } from 'lucide-react';
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadEmail();
  }, [handoverId]);

  const loadEmail = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.generateHandoverEmail(handoverId);
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
      <div className="w-full max-w-2xl bg-white dark:bg-[#16324F] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-[#0F4C81] text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            <h3 className="font-bold text-base">Generate Handover Email (Section 32)</h3>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Formatted operational text ready to be pasted directly into Outlook, Gmail, Teams, or Slack shift channels.
          </div>

          {loading ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              Compiling shift metrics and task records...
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-50 text-rose-700 text-xs">{error}</div>
          ) : (
            <div className="relative">
              <pre className="p-4 rounded-xl bg-slate-900 text-emerald-300 font-mono text-xs overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-96 selection:bg-emerald-800">
                {emailText}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100"
          >
            Close
          </button>

          <button
            id="btn-copy-handover-email"
            onClick={handleCopy}
            disabled={loading || !emailText}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#0F4C81] hover:bg-[#16324F] text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
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

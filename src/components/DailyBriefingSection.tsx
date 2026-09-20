import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  User,
  Search,
  CheckCircle2,
  AlertTriangle,
  ArrowRightLeft,
  Copy,
  Check,
  RefreshCw,
  ChevronRight,
  Filter,
  Layers,
  Sparkles
} from 'lucide-react';
import { api } from '../api';
import { DailyBriefingItem, DailyBriefingResponse } from '../types';

interface DailyBriefingSectionProps {
  onOpenTask: (taskId: number) => void;
  defaultMode?: 'yesterday' | 'today' | 'custom';
}

export const DailyBriefingSection: React.FC<DailyBriefingSectionProps> = ({
  onOpenTask,
  defaultMode = 'yesterday'
}) => {
  const [mode, setMode] = useState<'yesterday' | 'today' | 'custom'>(defaultMode);
  const [startDate, setStartDate] = useState<string>('2026-09-12');
  const [endDate, setEndDate] = useState<string>('2026-09-12');
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [briefingData, setBriefingData] = useState<DailyBriefingResponse | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBriefing = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getDailyBriefing({
        mode,
        startDate: mode === 'custom' ? startDate : undefined,
        endDate: mode === 'custom' ? endDate : undefined,
        user: selectedUser || undefined,
        search: searchKeyword || undefined
      });
      setBriefingData(res);
      if (mode !== 'custom') {
        setStartDate(res.startDate);
        setEndDate(res.endDate);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load daily briefing.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBriefing();
    const handleRefresh = () => {
      fetchBriefing();
    };
    window.addEventListener('task:updated', handleRefresh);
    window.addEventListener('operational:refresh', handleRefresh);
    return () => {
      window.removeEventListener('task:updated', handleRefresh);
      window.removeEventListener('operational:refresh', handleRefresh);
    };
  }, [mode, selectedUser]);

  const handleCustomDateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMode('custom');
    fetchBriefing();
  };

  const handleCopySummary = () => {
    if (!briefingData || briefingData.items.length === 0) return;
    const text = briefingData.items.map(i => i.summarySentence).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Format shift label styling
  const getShiftBadge = (shift: string) => {
    switch (shift?.toLowerCase()) {
      case 'morning':
        return 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border-amber-300';
      case 'mid':
        return 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 border-blue-300';
      case 'night':
        return 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200 border-indigo-300';
      default:
        return 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-300';
    }
  };

  return (
    <section className="bg-white dark:bg-[#16324F] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-5">
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-[#0F4C81] dark:text-blue-400">
              <Sparkles className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                Daily Operations Briefing & History
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Morning shift summary of previous day tasks, date range inquiry, and multi-criteria operator search
              </p>
            </div>
          </div>
        </div>

        {/* Quick Date Mode Switcher */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl self-start md:self-auto">
          <button
            type="button"
            onClick={() => setMode('yesterday')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              mode === 'yesterday'
                ? 'bg-white dark:bg-[#0F4C81] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Yesterday (Previous Day)
          </button>
          <button
            type="button"
            onClick={() => setMode('today')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              mode === 'today'
                ? 'bg-white dark:bg-[#0F4C81] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setMode('custom')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              mode === 'custom'
                ? 'bg-white dark:bg-[#0F4C81] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Custom Range
          </button>
        </div>
      </div>

      {/* Multi-Criteria Filters Bar (Person, Date From/To, Keyword) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-200/60 dark:border-slate-800">
        {/* Date From */}
        <div className="lg:col-span-3">
          <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
            From Date
          </label>
          <div className="relative">
            <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="date"
              value={startDate}
              onChange={e => {
                setStartDate(e.target.value);
                setMode('custom');
              }}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#0F4C81]"
            />
          </div>
        </div>

        {/* Date To */}
        <div className="lg:col-span-3">
          <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
            To Date
          </label>
          <div className="relative">
            <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="date"
              value={endDate}
              onChange={e => {
                setEndDate(e.target.value);
                setMode('custom');
              }}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#0F4C81]"
            />
          </div>
        </div>

        {/* User / Operator Filter */}
        <div className="lg:col-span-3">
          <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
            Operator / Person
          </label>
          <div className="relative">
            <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <select
              value={selectedUser}
              onChange={e => setSelectedUser(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#0F4C81] cursor-pointer"
            >
              <option value="">All Operators</option>
              {briefingData?.availableUsers?.map(u => (
                <option key={u.username} value={u.username}>
                  @{u.username} ({u.fullName})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Keyword Search & Apply */}
        <div className="lg:col-span-3 flex items-end gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Task code, COB, etc..."
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') fetchBriefing();
              }}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#0F4C81]"
            />
          </div>
          <button
            type="button"
            onClick={() => fetchBriefing()}
            className="px-3.5 py-1.5 bg-[#0F4C81] hover:bg-[#16324F] text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
            title="Search"
          >
            <Filter className="w-3.5 h-3.5" />
            Apply
          </button>
        </div>
      </div>

      {/* Date Header & Action Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
          <Calendar className="w-4 h-4 text-[#0F4C81]" />
          <span className="font-semibold">Showing Activity for:</span>
          <span className="px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/40 text-[#0F4C81] dark:text-blue-300 font-bold border border-blue-200 dark:border-blue-800">
            {briefingData?.dateLabel || `${startDate} - ${endDate}`}
          </span>
          {selectedUser && (
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 font-semibold border border-emerald-200 dark:border-emerald-800">
              User: @{selectedUser}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopySummary}
            disabled={!briefingData || briefingData.items.length === 0}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-40"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy Briefing
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => fetchBriefing()}
            className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Quick Count Indicators */}
      {briefingData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Total Logged Items</span>
            <div className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
              {briefingData.totalActivities}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60">
            <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">Completed Tasks</span>
            <div className="text-xl font-bold text-emerald-800 dark:text-emerald-300 mt-0.5">
              {briefingData.completedCount}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60">
            <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">Pending / In Progress</span>
            <div className="text-xl font-bold text-amber-800 dark:text-amber-300 mt-0.5">
              {briefingData.pendingCount}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60">
            <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-400">Blocked / Carried</span>
            <div className="text-xl font-bold text-rose-800 dark:text-rose-300 mt-0.5">
              {briefingData.blockedCount + briefingData.carriedCount}
            </div>
          </div>
        </div>
      )}

      {/* Main Items Stream */}
      {loading ? (
        <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-[#0F4C81]" />
          Loading historical operational items...
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-rose-50 text-rose-700 text-xs">{error}</div>
      ) : !briefingData || briefingData.items.length === 0 ? (
        <div className="py-10 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
          <p className="text-xs">No tasks or operations recorded for the selected date range and criteria.</p>
          <p className="text-[11px] text-slate-400 mt-1">Try expanding the date range or clearing operator filters.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {briefingData.items.map(item => (
            <div
              key={item.id}
              onClick={() => onOpenTask(item.taskId)}
              className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-[#0F4C81] dark:hover:border-blue-500 hover:shadow-xs transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
            >
              <div className="space-y-1.5 flex-1 min-w-0">
                {/* Sentence as explicitly required by user:
                    Task01 Run COB in 4.200 complete by youssef at 6:PM mid shift */}
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 shrink-0">
                    {item.actionVerb === 'complete' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : item.actionVerb === 'blocked' ? (
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                    ) : (
                      <Clock className="w-4 h-4 text-blue-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white leading-snug font-mono sm:font-sans">
                      {item.summarySentence}
                    </p>
                    {item.notes && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1 italic">
                        "{item.notes}"
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Badges & Meta */}
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${getShiftBadge(item.shift)}`}>
                  {item.shift} Shift
                </span>
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                  {item.formattedDate}
                </span>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-[#0F4C81] transition-colors" />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Filter,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Info,
  FileSpreadsheet,
  FileText,
  Copy,
  Check,
  X,
  Lock,
  Layers,
  Settings,
  ShieldCheck,
  Eye,
  RotateCcw,
  Calendar,
  ArrowRightLeft
} from 'lucide-react';
import { api } from '../api';
import { AuditLog, AuditSeverity, AuditCategory, AuditStats, User as UserType } from '../types';

interface AuditLogsViewProps {
  currentUser?: UserType | null;
}

type DatePreset = 'all' | 'today' | '7days' | '30days' | 'custom';

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({ currentUser }) => {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [isExportingTxt, setIsExportingTxt] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  // Stats
  const [stats, setStats] = useState<AuditStats | null>(null);

  // Filters State
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [auditFromDate, setAuditFromDate] = useState('');
  const [auditToDate, setAuditToDate] = useState('');
  const [auditUserFilter, setAuditUserFilter] = useState('');
  const [auditSearchTerm, setAuditSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Assignees for filtering
  const [assignees, setAssignees] = useState<Array<{ id: number; username: string; fullName: string; role: string }>>([]);

  // Selected Log Modal for detailed inspection
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchStats = async () => {
    try {
      const data = await api.getAuditStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to load audit stats:', err);
    }
  };

  const loadFilteredAuditLogs = useCallback(async (overrideParams?: {
    fromDate?: string;
    toDate?: string;
    user?: string;
    search?: string;
    severity?: string;
    category?: string;
  }) => {
    setAuditLoading(true);
    try {
      const from = overrideParams?.fromDate !== undefined ? overrideParams.fromDate : auditFromDate;
      const to = overrideParams?.toDate !== undefined ? overrideParams.toDate : auditToDate;
      const u = overrideParams?.user !== undefined ? overrideParams.user : auditUserFilter;
      const s = overrideParams?.search !== undefined ? overrideParams.search : auditSearchTerm;
      const sev = overrideParams?.severity !== undefined ? overrideParams.severity : severityFilter;
      const cat = overrideParams?.category !== undefined ? overrideParams.category : categoryFilter;

      const logs = await api.getAuditLogs({
        fromDate: from || undefined,
        toDate: to || undefined,
        user: u || undefined,
        search: s || undefined,
        severity: sev !== 'ALL' ? sev : undefined,
        category: cat !== 'ALL' ? cat : undefined
      });
      setAuditLogs(Array.isArray(logs) ? logs : []);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setAuditLoading(false);
    }
  }, [auditFromDate, auditToDate, auditUserFilter, auditSearchTerm, severityFilter, categoryFilter]);

  // Initial load
  useEffect(() => {
    loadFilteredAuditLogs({
      fromDate: '',
      toDate: '',
      user: '',
      search: '',
      severity: 'ALL',
      category: 'ALL'
    });
    fetchStats();
    api.getAssignees()
      .then(list => setAssignees(list || []))
      .catch(() => {});
  }, []);

  // Complete reset to show all logs unconditionally
  const handleResetAllFilters = () => {
    setDatePreset('all');
    setAuditFromDate('');
    setAuditToDate('');
    setAuditUserFilter('');
    setAuditSearchTerm('');
    setSeverityFilter('ALL');
    setCategoryFilter('ALL');
    loadFilteredAuditLogs({
      fromDate: '',
      toDate: '',
      user: '',
      search: '',
      severity: 'ALL',
      category: 'ALL'
    });
    fetchStats();
  };

  // Date preset selector handler
  const handleSelectDatePreset = (preset: DatePreset) => {
    setDatePreset(preset);
    if (preset === 'all') {
      setAuditFromDate('');
      setAuditToDate('');
      loadFilteredAuditLogs({ fromDate: '', toDate: '' });
    } else if (preset === 'today') {
      const today = new Date().toISOString().split('T')[0];
      setAuditFromDate(today);
      setAuditToDate(today);
      loadFilteredAuditLogs({ fromDate: today, toDate: today });
    } else if (preset === '7days') {
      const to = new Date().toISOString().split('T')[0];
      const d = new Date();
      d.setDate(d.getDate() - 7);
      const from = d.toISOString().split('T')[0];
      setAuditFromDate(from);
      setAuditToDate(to);
      loadFilteredAuditLogs({ fromDate: from, toDate: to });
    } else if (preset === '30days') {
      const to = new Date().toISOString().split('T')[0];
      const d = new Date();
      d.setDate(d.getDate() - 30);
      const from = d.toISOString().split('T')[0];
      setAuditFromDate(from);
      setAuditToDate(to);
      loadFilteredAuditLogs({ fromDate: from, toDate: to });
    }
  };

  const handleExportTxt = async () => {
    try {
      setIsExportingTxt(true);
      await api.downloadAuditLogsTxt({
        fromDate: auditFromDate || undefined,
        toDate: auditToDate || undefined,
        user: auditUserFilter || undefined,
        search: auditSearchTerm || undefined,
        severity: severityFilter !== 'ALL' ? severityFilter : undefined,
        category: categoryFilter !== 'ALL' ? categoryFilter : undefined
      });
    } catch (err: any) {
      console.error('Failed to download audit logs TXT:', err);
      const url = api.getAuditLogsExportTxtUrl({
        fromDate: auditFromDate || undefined,
        toDate: auditToDate || undefined,
        user: auditUserFilter || undefined,
        search: auditSearchTerm || undefined,
        severity: severityFilter !== 'ALL' ? severityFilter : undefined,
        category: categoryFilter !== 'ALL' ? categoryFilter : undefined
      });
      window.location.href = url;
    } finally {
      setIsExportingTxt(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      setIsExportingCsv(true);
      await api.downloadAuditLogsCsv({
        fromDate: auditFromDate || undefined,
        toDate: auditToDate || undefined,
        user: auditUserFilter || undefined,
        search: auditSearchTerm || undefined,
        severity: severityFilter !== 'ALL' ? severityFilter : undefined,
        category: categoryFilter !== 'ALL' ? categoryFilter : undefined
      });
    } catch (err: any) {
      console.error('Failed to download audit logs CSV:', err);
      const url = api.getAuditLogsExportCsvUrl({
        fromDate: auditFromDate || undefined,
        toDate: auditToDate || undefined,
        user: auditUserFilter || undefined,
        search: auditSearchTerm || undefined,
        severity: severityFilter !== 'ALL' ? severityFilter : undefined,
        category: categoryFilter !== 'ALL' ? categoryFilter : undefined
      });
      window.location.href = url;
    } finally {
      setIsExportingCsv(false);
    }
  };

  const copyDetailsToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getSeverityBadge = (sev?: AuditSeverity | string) => {
    const s = sev?.toUpperCase();
    if (s === 'CRITICAL') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[10px] bg-red-100 text-red-700 dark:bg-red-950/80 dark:text-red-300 border border-red-200 dark:border-red-900/60 shadow-xs">
          <AlertOctagon className="w-3 h-3 text-red-600 dark:text-red-400 shrink-0" />
          <span>CRITICAL</span>
        </span>
      );
    }
    if (s === 'WARNING') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60 shadow-xs">
          <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>WARNING</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold text-[10px] bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-900/60 shadow-xs">
        <Info className="w-3 h-3 text-blue-600 dark:text-blue-400 shrink-0" />
        <span>INFO</span>
      </span>
    );
  };

  const getCategoryBadge = (cat?: AuditCategory | string) => {
    const c = cat?.toUpperCase();
    switch (c) {
      case 'SECURITY':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            <Lock className="w-2.5 h-2.5 text-purple-600 dark:text-purple-400" />
            <span>Security</span>
          </span>
        );
      case 'SHIFTS':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <ArrowRightLeft className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
            <span>Shifts</span>
          </span>
        );
      case 'SYSTEM':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold text-[10px] bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
            <Settings className="w-2.5 h-2.5 text-slate-600 dark:text-slate-400" />
            <span>System</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold text-[10px] bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
            <Layers className="w-2.5 h-2.5 text-sky-600 dark:text-sky-400" />
            <span>Tasks</span>
          </span>
        );
    }
  };

  // Determine if any filters are actively narrowing the logs
  const isAnyFilterActive =
    severityFilter !== 'ALL' ||
    categoryFilter !== 'ALL' ||
    Boolean(auditFromDate) ||
    Boolean(auditToDate) ||
    Boolean(auditUserFilter) ||
    Boolean(auditSearchTerm.trim());

  return (
    <div className="max-w-6xl mx-auto w-full space-y-5 px-1 sm:px-2">
      {/* Top Banner / Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#16324F] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 shrink-0">
            <Shield className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Enterprise Audit Trail Logs
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
              Tamper-evident activity ledger tracking security, shift handovers, and task lifecycles.
            </p>
          </div>
        </div>

        {/* Action Controls: Show All, CSV & TXT Export */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {isAnyFilterActive && (
            <button
              id="btn-audit-show-all-top"
              type="button"
              onClick={handleResetAllFilters}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold shadow-xs transition-colors cursor-pointer"
              title="Reset all filters and display all audit records"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#0F4C81] dark:text-blue-400" />
              <span>Show All</span>
            </button>
          )}

          <button
            id="btn-export-audit-csv"
            type="button"
            disabled={isExportingCsv}
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
            title="Download audit trail as a spreadsheet-compatible .CSV file"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{isExportingCsv ? 'Exporting...' : 'Export as .CSV'}</span>
          </button>

          <button
            id="btn-export-audit-txt"
            type="button"
            disabled={isExportingTxt}
            onClick={handleExportTxt}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0F4C81] hover:bg-[#16324F] disabled:opacity-50 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
            title="Download audit trail as a formatted .TXT text file"
          >
            <FileText className="w-4 h-4" />
            <span>{isExportingTxt ? 'Exporting...' : 'Export as .TXT'}</span>
          </button>
        </div>
      </div>

      {/* Audit Intelligence Metrics Cards (Clickable Quick Filters) */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Total Logs Card: Interactive - Click to Reset & Show All Logs */}
          <div
            id="card-audit-total-logs"
            onClick={handleResetAllFilters}
            className={`p-3.5 rounded-xl border shadow-xs flex items-center justify-between cursor-pointer transition-all duration-150 ${
              !isAnyFilterActive
                ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-400 dark:border-blue-700 ring-2 ring-blue-500/20'
                : 'bg-white dark:bg-[#16324F] border-slate-200 dark:border-slate-800 hover:border-blue-400 hover:shadow-sm'
            }`}
            title="Click to reset all filters and show all logs"
          >
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Total Logs
                </p>
                {!isAnyFilterActive && (
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
                    Active
                  </span>
                )}
              </div>
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white mt-0.5">
                {stats.total.toLocaleString()}
              </h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                <span>{stats.todayCount} recorded today</span>
                <span className="text-[#0F4C81] dark:text-blue-400 font-semibold">&bull; Show all</span>
              </p>
            </div>
            <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
              <Shield className="w-4 h-4 text-slate-600 dark:text-slate-300" />
            </div>
          </div>

          {/* Critical Events Card */}
          <div
            id="card-audit-critical"
            onClick={() => {
              setSeverityFilter('CRITICAL');
              loadFilteredAuditLogs({ severity: 'CRITICAL' });
            }}
            className={`p-3.5 rounded-xl border shadow-xs flex items-center justify-between cursor-pointer transition-all duration-150 ${
              severityFilter === 'CRITICAL'
                ? 'bg-red-50/80 dark:bg-red-950/40 border-red-500 dark:border-red-600 ring-2 ring-red-500/20'
                : 'bg-white dark:bg-[#16324F] border-red-200 dark:border-red-900/50 hover:border-red-400 hover:shadow-sm'
            }`}
            title="Click to filter by Critical severity"
          >
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                  Critical Events
                </p>
                {severityFilter === 'CRITICAL' && (
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-200">
                    Active
                  </span>
                )}
              </div>
              <h3 className="text-lg font-extrabold text-red-700 dark:text-red-300 mt-0.5">
                {stats.criticalCount.toLocaleString()}
              </h3>
              <p className="text-[10px] text-red-500 dark:text-red-400 mt-0.5">
                Failed logins &amp; deletions
              </p>
            </div>
            <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 shrink-0">
              <AlertOctagon className="w-4 h-4" />
            </div>
          </div>

          {/* Warnings Card */}
          <div
            id="card-audit-warning"
            onClick={() => {
              setSeverityFilter('WARNING');
              loadFilteredAuditLogs({ severity: 'WARNING' });
            }}
            className={`p-3.5 rounded-xl border shadow-xs flex items-center justify-between cursor-pointer transition-all duration-150 ${
              severityFilter === 'WARNING'
                ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-500 dark:border-amber-600 ring-2 ring-amber-500/20'
                : 'bg-white dark:bg-[#16324F] border-amber-200 dark:border-amber-900/50 hover:border-amber-400 hover:shadow-sm'
            }`}
            title="Click to filter by Warning severity"
          >
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Warnings
                </p>
                {severityFilter === 'WARNING' && (
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                    Active
                  </span>
                )}
              </div>
              <h3 className="text-lg font-extrabold text-amber-700 dark:text-amber-300 mt-0.5">
                {stats.warningCount.toLocaleString()}
              </h3>
              <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                Blocked tasks &amp; overrides
              </p>
            </div>
            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>

          {/* Security Card */}
          <div
            id="card-audit-security"
            onClick={() => {
              setCategoryFilter('SECURITY');
              loadFilteredAuditLogs({ category: 'SECURITY' });
            }}
            className={`p-3.5 rounded-xl border shadow-xs flex items-center justify-between cursor-pointer transition-all duration-150 ${
              categoryFilter === 'SECURITY'
                ? 'bg-purple-50/80 dark:bg-purple-950/40 border-purple-500 dark:border-purple-600 ring-2 ring-purple-500/20'
                : 'bg-white dark:bg-[#16324F] border-purple-200 dark:border-purple-900/50 hover:border-purple-400 hover:shadow-sm'
            }`}
            title="Click to filter by Security & Auth category"
          >
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                  Security &amp; Auth
                </p>
                {categoryFilter === 'SECURITY' && (
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-purple-200 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                    Active
                  </span>
                )}
              </div>
              <h3 className="text-lg font-extrabold text-purple-700 dark:text-purple-300 mt-0.5">
                {stats.securityCount.toLocaleString()}
              </h3>
              <p className="text-[10px] text-purple-500 dark:text-purple-400 mt-0.5">
                Logins, logouts &amp; resets
              </p>
            </div>
            <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 shrink-0">
              <Lock className="w-4 h-4" />
            </div>
          </div>
        </div>
      )}

      {/* Main Container Card */}
      <div className="bg-white dark:bg-[#16324F] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* Category Filter Tabs */}
        <div className="flex items-center gap-1 px-4 pt-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850/40 overflow-x-auto">
          {[
            { id: 'ALL', label: 'All Events', icon: Layers },
            { id: 'SECURITY', label: 'Security & Auth', icon: Lock },
            { id: 'TASKS', label: 'Tasks & Tickets', icon: CheckCircle2 },
            { id: 'SHIFTS', label: 'Shift Operations', icon: ArrowRightLeft },
            { id: 'SYSTEM', label: 'System & Config', icon: Settings }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = categoryFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setCategoryFilter(tab.id);
                  loadFilteredAuditLogs({ category: tab.id });
                }}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-xl border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'border-[#0F4C81] text-[#0F4C81] dark:text-blue-400 bg-white dark:bg-[#16324F]'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Date & User Filtering Panel */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/40 space-y-3">
          {/* Quick Range Presets & Reset Control */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <Calendar className="w-3.5 h-3.5 text-[#0F4C81] dark:text-blue-400" />
              <span className="font-semibold uppercase tracking-wider text-[10px]">Filter Presets:</span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {/* All Time Preset */}
              <button
                type="button"
                onClick={() => handleSelectDatePreset('all')}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  datePreset === 'all' && !auditFromDate && !auditToDate
                    ? 'bg-[#0F4C81] text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                All Time
              </button>

              {/* Today Preset */}
              <button
                type="button"
                onClick={() => handleSelectDatePreset('today')}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  datePreset === 'today'
                    ? 'bg-[#0F4C81] text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                Today
              </button>

              {/* Last 7 Days Preset */}
              <button
                type="button"
                onClick={() => handleSelectDatePreset('7days')}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  datePreset === '7days'
                    ? 'bg-[#0F4C81] text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                Last 7 Days
              </button>

              {/* Last 30 Days Preset */}
              <button
                type="button"
                onClick={() => handleSelectDatePreset('30days')}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  datePreset === '30days'
                    ? 'bg-[#0F4C81] text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                Last 30 Days
              </button>

              {/* Prominent Reset All Filters / Show All Button */}
              {isAnyFilterActive && (
                <button
                  type="button"
                  onClick={handleResetAllFilters}
                  className="flex items-center gap-1 px-3 py-1 rounded-lg text-[11px] font-bold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 transition-colors cursor-pointer"
                  title="Reset all filters and return to all logs"
                >
                  <RotateCcw className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                  <span>Reset All Filters</span>
                </button>
              )}
            </div>
          </div>

          {/* Filter Inputs Grid (Severity, From Date, To Date, User, Search) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-1">
            {/* Severity Select */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                Severity:
              </label>
              <select
                id="audit-filter-severity"
                value={severityFilter}
                onChange={e => {
                  const val = e.target.value;
                  setSeverityFilter(val);
                  loadFilteredAuditLogs({ severity: val });
                }}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-[#0F4C81] outline-hidden cursor-pointer"
              >
                <option value="ALL">All Severities</option>
                <option value="CRITICAL">Critical Only</option>
                <option value="WARNING">Warning</option>
                <option value="INFO">Info</option>
              </select>
            </div>

            {/* From Date Input */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                From Date:
              </label>
              <input
                id="audit-filter-from-date"
                type="date"
                value={auditFromDate}
                onChange={e => {
                  const val = e.target.value;
                  setAuditFromDate(val);
                  setDatePreset('custom');
                  loadFilteredAuditLogs({ fromDate: val });
                }}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-[#0F4C81] outline-hidden"
              />
            </div>

            {/* To Date Input */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                To Date:
              </label>
              <input
                id="audit-filter-to-date"
                type="date"
                value={auditToDate}
                onChange={e => {
                  const val = e.target.value;
                  setAuditToDate(val);
                  setDatePreset('custom');
                  loadFilteredAuditLogs({ toDate: val });
                }}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-[#0F4C81] outline-hidden"
              />
            </div>

            {/* User Select */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                Operator / User:
              </label>
              <select
                id="audit-filter-user"
                value={auditUserFilter}
                onChange={e => {
                  const val = e.target.value;
                  setAuditUserFilter(val);
                  loadFilteredAuditLogs({ user: val });
                }}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-[#0F4C81] outline-hidden cursor-pointer"
              >
                <option value="">All Users</option>
                {assignees.map(u => (
                  <option key={u.id} value={u.username}>
                    @{u.username} ({u.fullName})
                  </option>
                ))}
              </select>
            </div>

            {/* Search Input */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                Search Activity:
              </label>
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <input
                    id="audit-filter-search"
                    type="text"
                    placeholder="Search logs..."
                    value={auditSearchTerm}
                    onChange={e => {
                      const val = e.target.value;
                      setAuditSearchTerm(val);
                      if (val === '') {
                        loadFilteredAuditLogs({ search: '' });
                      }
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        loadFilteredAuditLogs();
                      }
                    }}
                    className="w-full pl-7 pr-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-[#0F4C81] outline-hidden"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" />
                </div>
                <button
                  type="button"
                  onClick={() => loadFilteredAuditLogs()}
                  disabled={auditLoading}
                  className="px-3 py-1.5 rounded-lg bg-[#0F4C81] hover:bg-[#16324F] text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1 shrink-0 shadow-xs"
                >
                  <Filter className="w-3.5 h-3.5" />
                  <span>{auditLoading ? '...' : 'Filter'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Active Filter Chips Bar */}
          {isAnyFilterActive && (
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-200 dark:border-slate-700 text-xs">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Active Filters:
              </span>

              {severityFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 text-[11px] font-medium border border-red-200 dark:border-red-900">
                  Severity: {severityFilter}
                  <button
                    type="button"
                    onClick={() => {
                      setSeverityFilter('ALL');
                      loadFilteredAuditLogs({ severity: 'ALL' });
                    }}
                    className="hover:text-red-900 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {categoryFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 text-[11px] font-medium border border-purple-200 dark:border-purple-900">
                  Category: {categoryFilter}
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryFilter('ALL');
                      loadFilteredAuditLogs({ category: 'ALL' });
                    }}
                    className="hover:text-purple-900 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {auditFromDate && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[11px] font-medium border border-blue-200 dark:border-blue-900">
                  From: {auditFromDate}
                  <button
                    type="button"
                    onClick={() => {
                      setAuditFromDate('');
                      setDatePreset('all');
                      loadFilteredAuditLogs({ fromDate: '' });
                    }}
                    className="hover:text-blue-900 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {auditToDate && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[11px] font-medium border border-blue-200 dark:border-blue-900">
                  To: {auditToDate}
                  <button
                    type="button"
                    onClick={() => {
                      setAuditToDate('');
                      setDatePreset('all');
                      loadFilteredAuditLogs({ toDate: '' });
                    }}
                    className="hover:text-blue-900 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {auditUserFilter && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-medium">
                  User: @{auditUserFilter}
                  <button
                    type="button"
                    onClick={() => {
                      setAuditUserFilter('');
                      loadFilteredAuditLogs({ user: '' });
                    }}
                    className="hover:text-slate-900 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {auditSearchTerm.trim() && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-medium">
                  Search: "{auditSearchTerm}"
                  <button
                    type="button"
                    onClick={() => {
                      setAuditSearchTerm('');
                      loadFilteredAuditLogs({ search: '' });
                    }}
                    className="hover:text-slate-900 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              <button
                type="button"
                onClick={handleResetAllFilters}
                className="text-xs font-bold text-[#0F4C81] dark:text-blue-400 hover:underline cursor-pointer ml-1"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          {auditLoading ? (
            <div className="py-20 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-[#0F4C81]" />
              <span>Filtering audit log events...</span>
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-xs flex flex-col items-center gap-3">
              <div className="p-3 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400">
                <Shield className="w-8 h-8 text-slate-400 dark:text-slate-500" />
              </div>
              <div className="space-y-1">
                <p className="font-bold text-slate-700 dark:text-slate-300 text-sm">
                  No audit records match the current filters
                </p>
                <p className="text-slate-500 dark:text-slate-400 text-xs">
                  {isAnyFilterActive
                    ? 'Try clearing your active filters or expanding the date range.'
                    : 'No audit records have been logged in the system yet.'}
                </p>
              </div>
              {isAnyFilterActive && (
                <button
                  type="button"
                  id="btn-empty-state-reset-all"
                  onClick={handleResetAllFilters}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0F4C81] hover:bg-[#16324F] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer mt-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Show All Audit Logs</span>
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-semibold uppercase text-[10px] sticky top-0 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Timestamp (UTC)</th>
                  <th className="py-2.5 px-3">User</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Entity</th>
                  <th className="py-2.5 px-3">Activity Details</th>
                  <th className="py-2.5 px-3">IP Address</th>
                  <th className="py-2.5 px-3 text-center">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {auditLogs.map(log => (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors cursor-pointer group"
                    onClick={() => setSelectedLog(log)}
                  >
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {getSeverityBadge(log.severity)}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {getCategoryBadge(log.category)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString([], {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                      @{log.user_name}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-[10px] text-[#0F4C81] dark:text-blue-300 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/60">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{log.entity_type}</span>{' '}
                      {log.entity_id ? (
                        <span className="text-[11px] text-slate-400 font-mono">#{log.entity_id}</span>
                      ) : null}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 max-w-sm truncate" title={log.details || ''}>
                      {log.details || 'N/A'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                      {log.ip_address || '127.0.0.1'}
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setSelectedLog(log);
                        }}
                        className="p-1 rounded-md text-slate-400 hover:text-[#0F4C81] dark:hover:text-blue-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        title="Inspect full event details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Detail Inspection Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#16324F] rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                  <ShieldCheck className="w-5 h-5 text-[#0F4C81] dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">
                    Audit Log Event #{selectedLog.id}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Recorded at {new Date(selectedLog.created_at).toUTCString()}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Severity &amp; Category</span>
                <div className="flex items-center gap-2">
                  {getSeverityBadge(selectedLog.severity)}
                  {getCategoryBadge(selectedLog.category)}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Operator User</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">@{selectedLog.user_name}</span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Action Name</span>
                <span className="font-mono font-semibold text-[#0F4C81] dark:text-blue-300">{selectedLog.action}</span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Target Entity</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {selectedLog.entity_type} {selectedLog.entity_id ? `(#${selectedLog.entity_id})` : ''}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 col-span-2">
                <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Network Source (IP Address)</span>
                <span className="font-mono text-slate-600 dark:text-slate-300">{selectedLog.ip_address || '127.0.0.1'}</span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1.5">
                Full Activity Details &amp; Change Diffs:
              </span>
              <p className="text-xs text-slate-700 dark:text-slate-200 font-mono whitespace-pre-wrap break-words leading-relaxed max-h-40 overflow-y-auto">
                {selectedLog.details || 'No additional activity details provided.'}
              </p>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => copyDetailsToClipboard(JSON.stringify(selectedLog, null, 2))}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied JSON' : 'Copy JSON'}</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 rounded-lg bg-[#0F4C81] hover:bg-[#16324F] text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

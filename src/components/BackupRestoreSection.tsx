import React, { useState, useEffect, useRef } from 'react';
import {
  Database,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  FileText,
  Calendar,
  Layers,
  ShieldAlert,
  ArrowRight,
  Check,
  HardDrive,
  Info,
  Clock,
  Filter,
  Sliders,
  FileCheck2,
  RotateCcw
} from 'lucide-react';
import {
  BackupTableInfo,
  BackupPackage,
  BackupValidationResult,
  RestoreResult,
  User as UserType
} from '../types';
import { api } from '../api';

interface BackupRestoreSectionProps {
  currentUser: UserType;
  onRefreshAll?: () => void;
}

export const BackupRestoreSection: React.FC<BackupRestoreSectionProps> = ({
  currentUser,
  onRefreshAll
}) => {
  // Active sub-view: 'export' | 'restore'
  const [activeTab, setActiveTab] = useState<'export' | 'restore'>('export');

  // Table information
  const [tables, setTables] = useState<BackupTableInfo[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);

  // Export state
  const [exportMode, setExportMode] = useState<'FULL' | 'SELECTIVE'>('FULL');
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [dateFilterMode, setDateFilterMode] = useState<'ALL' | 'RANGE'>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // Restore state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parsedJson, setParsedJson] = useState<BackupPackage | null>(null);
  const [validationResult, setValidationResult] = useState<BackupValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [restoreMode, setRestoreMode] = useState<'merge' | 'overwrite'>('merge');
  const [restoreSelectedTables, setRestoreSelectedTables] = useState<string[]>([]);
  const [confirmKeyword, setConfirmKeyword] = useState('');
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load tables on mount
  useEffect(() => {
    loadTables();
  }, []);

  const loadTables = async () => {
    setLoadingTables(true);
    setTableError(null);
    try {
      const res = await api.getBackupTables();
      setTables(res.tables || []);
      // Default all tables selected
      setSelectedTables((res.tables || []).map(t => t.name));
    } catch (err: any) {
      setTableError(err.message || 'Failed to fetch table list.');
    } finally {
      setLoadingTables(false);
    }
  };

  // Quick selection helpers
  const handleSelectAllTables = () => {
    setSelectedTables(tables.map(t => t.name));
  };

  const handleDeselectAllTables = () => {
    setSelectedTables([]);
  };

  const handleSelectCategory = (category: 'configuration' | 'operational' | 'security') => {
    const catTables = tables.filter(t => t.category === category).map(t => t.name);
    const existing = new Set(selectedTables);
    const allInCatSelected = catTables.every(name => existing.has(name));

    if (allInCatSelected) {
      setSelectedTables(selectedTables.filter(name => !catTables.includes(name)));
    } else {
      setSelectedTables(Array.from(new Set([...selectedTables, ...catTables])));
    }
  };

  const toggleTableSelection = (tableName: string) => {
    if (selectedTables.includes(tableName)) {
      setSelectedTables(selectedTables.filter(t => t !== tableName));
    } else {
      setSelectedTables([...selectedTables, tableName]);
    }
  };

  // Date range presets
  const applyDatePreset = (preset: 'today' | '7days' | '30days' | 'thisMonth') => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    setDateFilterMode('RANGE');
    setEndDate(toYMD(now));

    if (preset === 'today') {
      setStartDate(toYMD(now));
    } else if (preset === '7days') {
      const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      setStartDate(toYMD(past));
    } else if (preset === '30days') {
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      setStartDate(toYMD(past));
    } else if (preset === 'thisMonth') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(toYMD(firstDay));
    }
  };

  // Trigger Backup Export Download
  const handleExportBackup = async () => {
    setIsExporting(true);
    setExportError(null);
    setExportSuccess(null);

    try {
      if (exportMode === 'SELECTIVE' && selectedTables.length === 0) {
        throw new Error('Please select at least one table to export.');
      }

      if (dateFilterMode === 'RANGE' && startDate && endDate && startDate > endDate) {
        throw new Error('Start date cannot be after end date.');
      }

      const options = {
        tables: exportMode === 'SELECTIVE' ? selectedTables : undefined,
        startDate: dateFilterMode === 'RANGE' && startDate ? startDate : undefined,
        endDate: dateFilterMode === 'RANGE' && endDate ? endDate : undefined
      };

      await api.downloadBackupFile(options);
      setExportSuccess('Backup JSON archive exported and downloaded successfully.');
    } catch (err: any) {
      setExportError(err.message || 'Failed to export backup.');
    } finally {
      setIsExporting(false);
    }
  };

  // Handle File Selection for Restore
  const handleFileSelect = (file: File) => {
    setUploadedFile(file);
    setParsedJson(null);
    setValidationResult(null);
    setRestoreError(null);
    setRestoreResult(null);
    setConfirmKeyword('');

    if (!file.name.endsWith('.json')) {
      setRestoreError('Selected file must be a valid JSON file (.json).');
      return;
    }

    setIsValidating(true);
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const text = e.target?.result as string;
        const json = JSON.parse(text);
        setParsedJson(json);

        // Pre-validate via API
        const valRes = await api.validateBackup(json);
        setValidationResult(valRes);
        if (valRes.valid && valRes.detectedTables) {
          setRestoreSelectedTables(valRes.detectedTables);
        }
      } catch (err: any) {
        setRestoreError(`Failed to parse backup JSON file: ${err.message}`);
      } finally {
        setIsValidating(false);
      }
    };
    reader.onerror = () => {
      setRestoreError('Failed to read uploaded file.');
      setIsValidating(false);
    };
    reader.readAsText(file);
  };

  // Execute Restore
  const handleExecuteRestore = async () => {
    if (!parsedJson) return;

    if (restoreMode === 'overwrite' && confirmKeyword !== 'RESTORE') {
      setRestoreError('Please type "RESTORE" to confirm disaster recovery overwrite.');
      return;
    }

    setIsRestoring(true);
    setRestoreError(null);
    setRestoreResult(null);
    setConfirmModalOpen(false);

    try {
      const res = await api.restoreBackup({
        backupJson: parsedJson,
        mode: restoreMode,
        selectedTables: restoreSelectedTables.length > 0 ? restoreSelectedTables : undefined
      });

      setRestoreResult(res);
      // Reload table stats and trigger parent sync
      loadTables();
      if (onRefreshAll) {
        onRefreshAll();
      }
    } catch (err: any) {
      setRestoreError(err.message || 'Database restore failed.');
    } finally {
      setIsRestoring(false);
    }
  };

  const totalSelectedRecords = tables
    .filter(t => (exportMode === 'FULL' || selectedTables.includes(t.name)))
    .reduce((sum, t) => sum + t.currentCount, 0);

  return (
    <div className="space-y-6">
      {/* Top Banner & Mode Tabs */}
      <div className="bg-white dark:bg-[#16324F] p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-700/80">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 bg-[#0F4C81]/10 dark:bg-[#0F4C81]/30 rounded-xl text-[#0F4C81] dark:text-blue-400 shrink-0">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Database Backup &amp; Disaster Recovery
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Export complete or selective JSON snapshots, filter historical date ranges, and restore database state with atomic transaction safety.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 self-start md:self-auto">
            <button
              onClick={() => setActiveTab('export')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'export'
                  ? 'bg-[#0F4C81] text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              Backup (Export)
            </button>
            <button
              onClick={() => setActiveTab('restore')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'restore'
                  ? 'bg-[#0F4C81] text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              Restore (Import)
            </button>
          </div>
        </div>

        {/* Quick System Health Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 block">
              Storage Engine
            </span>
            <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              SQLite WAL Mode
            </span>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 block">
              Registered Tables
            </span>
            <span className="text-xs font-bold text-slate-900 dark:text-white mt-0.5 block">
              {tables.length} System Collections
            </span>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 block">
              Total Database Records
            </span>
            <span className="text-xs font-bold text-slate-900 dark:text-white mt-0.5 block">
              {tables.reduce((sum, t) => sum + t.currentCount, 0).toLocaleString()} Rows
            </span>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 block">
              Operator Accountability
            </span>
            <span className="text-xs font-bold text-slate-900 dark:text-white mt-0.5 block">
              @{currentUser.username} ({currentUser.role})
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: BACKUP EXECUTION (EXPORT JSON) */}
      {/* ========================================================================= */}
      {activeTab === 'export' && (
        <div className="space-y-6">
          {/* Feedback banners */}
          {exportSuccess && (
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{exportSuccess}</span>
              </div>
              <button
                onClick={() => setExportSuccess(null)}
                className="text-emerald-700 dark:text-emerald-400 hover:opacity-80 text-xs font-bold cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {exportError && (
            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{exportError}</span>
              </div>
              <button
                onClick={() => setExportError(null)}
                className="text-rose-700 dark:text-rose-400 hover:opacity-80 text-xs font-bold cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Export Mode Card */}
          <div className="bg-white dark:bg-[#16324F] p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#0F4C81] dark:text-blue-400" />
                1. Select Export Scope
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Choose between a complete system snapshot or a tailored selective extraction.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label
                onClick={() => {
                  setExportMode('FULL');
                  handleSelectAllTables();
                }}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3.5 ${
                  exportMode === 'FULL'
                    ? 'border-[#0F4C81] bg-blue-50/40 dark:bg-blue-950/20'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <input
                  type="radio"
                  name="exportMode"
                  checked={exportMode === 'FULL'}
                  onChange={() => {}}
                  className="mt-0.5 text-[#0F4C81]"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">
                    Full System Snapshot (Recommended)
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block leading-relaxed">
                    Exports all {tables.length} tables, complete operational timelines, operator accounts, shift timetables, and audit history.
                  </span>
                  <span className="inline-block mt-2 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">
                    All Tables Included
                  </span>
                </div>
              </label>

              <label
                onClick={() => setExportMode('SELECTIVE')}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3.5 ${
                  exportMode === 'SELECTIVE'
                    ? 'border-[#0F4C81] bg-blue-50/40 dark:bg-blue-950/20'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <input
                  type="radio"
                  name="exportMode"
                  checked={exportMode === 'SELECTIVE'}
                  onChange={() => {}}
                  className="mt-0.5 text-[#0F4C81]"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">
                    Selective Custom Backup
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block leading-relaxed">
                    Selectively pick specific tables (e.g. only Tasks &amp; Handovers, or only Configuration) according to your archiving needs.
                  </span>
                  <span className="inline-block mt-2 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    Custom Selection
                  </span>
                </div>
              </label>
            </div>

            {/* Table Selection Grid (when selective mode is chosen or for inspection) */}
            {exportMode === 'SELECTIVE' && (
              <div className="pt-4 border-t border-slate-200 dark:border-slate-700/80 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Choose Tables to Include ({selectedTables.length} / {tables.length} selected):
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllTables}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={handleDeselectAllTables}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectCategory('operational')}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 cursor-pointer"
                    >
                      Operational Only
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectCategory('configuration')}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100 cursor-pointer"
                    >
                      Config Only
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {tables.map(table => {
                    const isSelected = selectedTables.includes(table.name);
                    return (
                      <div
                        key={table.name}
                        onClick={() => toggleTableSelection(table.name)}
                        className={`p-3 rounded-xl border cursor-pointer select-none transition-all flex items-start gap-3 ${
                          isSelected
                            ? 'bg-blue-50/50 dark:bg-blue-950/30 border-[#0F4C81]/40'
                            : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-60 hover:opacity-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="mt-0.5 rounded-sm text-[#0F4C81]"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {table.label}
                            </span>
                            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 shrink-0">
                              {table.currentCount} rows
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5 leading-snug">
                            {table.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Date Range Filter Card */}
          <div className="bg-white dark:bg-[#16324F] p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#0F4C81] dark:text-blue-400" />
                2. Historical Date Range Filter
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Apply date restrictions to operational records (Tasks, Shift Handovers, Sticky Notes, Audit Logs).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                <input
                  type="radio"
                  name="dateFilterMode"
                  checked={dateFilterMode === 'ALL'}
                  onChange={() => setDateFilterMode('ALL')}
                  className="text-[#0F4C81]"
                />
                <span>Full History (All Time)</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                <input
                  type="radio"
                  name="dateFilterMode"
                  checked={dateFilterMode === 'RANGE'}
                  onChange={() => setDateFilterMode('RANGE')}
                  className="text-[#0F4C81]"
                />
                <span>Specific Date Range Filter</span>
              </label>
            </div>

            {dateFilterMode === 'RANGE' && (
              <div className="pt-2 space-y-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/80">
                <div className="flex flex-wrap items-center gap-2 pb-2">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    Quick Presets:
                  </span>
                  <button
                    type="button"
                    onClick={() => applyDatePreset('today')}
                    className="px-2 py-0.5 text-[11px] rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDatePreset('7days')}
                    className="px-2 py-0.5 text-[11px] rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
                  >
                    Last 7 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDatePreset('30days')}
                    className="px-2 py-0.5 text-[11px] rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
                  >
                    Last 30 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDatePreset('thisMonth')}
                    className="px-2 py-0.5 text-[11px] rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
                  >
                    This Month
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      From Date (Start)
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      To Date (End)
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Card */}
          <div className="bg-white dark:bg-[#16324F] p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                Export Package Summary
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {exportMode === 'FULL' ? 'All 11 collections' : `${selectedTables.length} selected collections`} &bull;{' '}
                {dateFilterMode === 'RANGE' ? `Date filter: ${startDate || 'beginning'} to ${endDate || 'present'}` : 'Full history'} &bull;{' '}
                Est. {totalSelectedRecords} records with SHA-256 integrity hash.
              </p>
            </div>

            <button
              id="btn-download-json-backup"
              type="button"
              onClick={handleExportBackup}
              disabled={isExporting}
              className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-[#0F4C81] hover:bg-[#16324F] text-white text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50 shrink-0"
            >
              {isExporting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Generating Backup...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Download JSON Backup</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: RESTORE EXECUTION (IMPORT JSON) */}
      {/* ========================================================================= */}
      {activeTab === 'restore' && (
        <div className="space-y-6">
          {/* Feedback banners */}
          {restoreResult && (
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
                <span>{restoreResult.message}</span>
              </div>
              <p className="text-xs text-emerald-700 dark:text-emerald-400">
                Mode: <strong className="uppercase">{restoreResult.mode}</strong> &bull; Total records processed:{' '}
                <strong>{restoreResult.totalProcessed}</strong> &bull; Timestamp: {restoreResult.restoredAt}
              </p>
              {/* Table stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-2 border-t border-emerald-200 dark:border-emerald-800">
                {Object.entries(restoreResult.tableStats).map(([tName, stat]: [string, any]) => (
                  <div key={tName} className="p-2 bg-white/60 dark:bg-slate-900/50 rounded-lg text-[11px]">
                    <span className="font-semibold text-slate-800 dark:text-slate-200 block truncate">{tName}</span>
                    <span className="text-slate-600 dark:text-slate-400 text-[10px]">
                      +{stat?.inserted ?? 0} inserted, {stat?.updated ?? 0} updated
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {restoreError && (
            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{restoreError}</span>
              </div>
              <button
                onClick={() => setRestoreError(null)}
                className="text-rose-700 dark:text-rose-400 hover:opacity-80 text-xs font-bold cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* File Upload Box */}
          <div className="bg-white dark:bg-[#16324F] p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Upload className="w-4 h-4 text-[#0F4C81] dark:text-blue-400" />
                1. Upload JSON Backup Archive
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Select a previously generated JSON backup file. The file will be pre-validated for structural integrity before applying any changes.
              </p>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              accept=".json,application/json"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
              className="hidden"
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) handleFileSelect(file);
              }}
              className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-[#0F4C81] dark:hover:border-blue-400 rounded-2xl p-8 text-center cursor-pointer transition-all bg-slate-50/50 dark:bg-slate-800/20"
            >
              <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                {uploadedFile ? uploadedFile.name : 'Click to select or drag and drop your .json backup file'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                JSON format, maximum file size 50 MB
              </p>
            </div>
          </div>

          {/* File Pre-Validation Inspection Card */}
          {isValidating && (
            <div className="p-6 bg-white dark:bg-[#16324F] rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-center gap-3">
              <RefreshCw className="w-5 h-5 text-[#0F4C81] animate-spin" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Validating JSON structure and checking table schemas...
              </span>
            </div>
          )}

          {validationResult && (
            <div className="bg-white dark:bg-[#16324F] p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-700">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <FileCheck2 className="w-4 h-4 text-emerald-600" />
                    2. Backup File Inspection &amp; Integrity Analysis
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Verified archive containing {validationResult.totalRecords.toLocaleString()} records across{' '}
                    {validationResult.detectedTables.length} tables.
                  </p>
                </div>

                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                    validationResult.valid
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                  }`}
                >
                  {validationResult.valid ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Valid JSON Structure
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                      Invalid Schema
                    </>
                  )}
                </span>
              </div>

              {/* Metadata Details */}
              {validationResult.metadata && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-xl text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Backup Date</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {new Date(validationResult.metadata.exported_at).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Created By</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      @{validationResult.metadata.exported_by}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Archive Mode</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {validationResult.metadata.mode} Snapshot
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Format Version</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      v{validationResult.metadata.backup_version}
                    </span>
                  </div>
                </div>
              )}

              {/* Warnings if any */}
              {validationResult.warnings.length > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    <span>Inspection Notices</span>
                  </div>
                  <ul className="list-disc list-inside text-[11px] text-amber-800 dark:text-amber-300 space-y-0.5">
                    {validationResult.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Detected Tables Chips */}
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-2">
                  Collections Contained in File:
                </span>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(validationResult.tableCounts).map(([tName, count]) => (
                    <span
                      key={tName}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-mono flex items-center gap-1.5"
                    >
                      <span>{tName}</span>
                      <strong className="text-blue-600 dark:text-blue-400">({count})</strong>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Restore Execution Mode Selection Card */}
          {validationResult && validationResult.valid && (
            <div className="bg-white dark:bg-[#16324F] p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-[#0F4C81] dark:text-blue-400" />
                  3. Choose Restore Mode &amp; Strategy
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Select how incoming snapshot records should be merged or applied to the current database.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Mode A: Append / Merge */}
                <label
                  onClick={() => setRestoreMode('merge')}
                  className={`p-5 rounded-2xl border-2 cursor-pointer transition-all flex items-start gap-4 ${
                    restoreMode === 'merge'
                      ? 'border-[#0F4C81] bg-blue-50/40 dark:bg-blue-950/20 shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="restoreMode"
                    checked={restoreMode === 'merge'}
                    onChange={() => {}}
                    className="mt-1 text-[#0F4C81]"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        Append / Merge Mode
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        Safe &amp; Non-Destructive
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                      Inserts missing records and updates matching records. Unaffected existing operational records and logs will remain untouched. Recommended for synchronizing data or adding historical logs.
                    </p>
                  </div>
                </label>

                {/* Mode B: Full Overwrite */}
                <label
                  onClick={() => setRestoreMode('overwrite')}
                  className={`p-5 rounded-2xl border-2 cursor-pointer transition-all flex items-start gap-4 ${
                    restoreMode === 'overwrite'
                      ? 'border-rose-500 bg-rose-50/30 dark:bg-rose-950/20 shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="restoreMode"
                    checked={restoreMode === 'overwrite'}
                    onChange={() => {}}
                    className="mt-1 text-rose-600"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        Disaster Recovery Mode
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                        Full Overwrite
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                      Wipes the database and reconstructs the system exactly 100% as it existed at the time of the backup. Uses atomic rollback if any error occurs.
                    </p>
                  </div>
                </label>
              </div>

              {/* Warnings and Confirmation Button */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {restoreMode === 'merge' ? (
                    <span>Ready to merge {validationResult.totalRecords} records safely into the database.</span>
                  ) : (
                    <span className="text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      Warning: Disaster Recovery will wipe existing records before restoring.
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  id="btn-trigger-restore"
                  onClick={() => setConfirmModalOpen(true)}
                  disabled={isRestoring}
                  className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white shadow-xs transition-all cursor-pointer ${
                    restoreMode === 'overwrite'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-[#0F4C81] hover:bg-[#16324F]'
                  }`}
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>
                    {restoreMode === 'overwrite' ? 'Execute Disaster Recovery' : 'Execute Merge Restore'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Modal for Restore Confirmation */}
          {confirmModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
              <div className="bg-white dark:bg-[#16324F] rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-5">
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2.5 rounded-xl shrink-0 ${
                      restoreMode === 'overwrite'
                        ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-600'
                        : 'bg-blue-100 dark:bg-blue-900/40 text-[#0F4C81]'
                    }`}
                  >
                    {restoreMode === 'overwrite' ? (
                      <AlertTriangle className="w-6 h-6" />
                    ) : (
                      <Database className="w-6 h-6" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {restoreMode === 'overwrite'
                        ? 'Confirm Disaster Recovery Overwrite'
                        : 'Confirm Database Merge Restore'}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Target user: @{currentUser.username} &bull; Mode:{' '}
                      <strong className="uppercase">{restoreMode}</strong>
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-xs space-y-2 text-slate-700 dark:text-slate-300">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {restoreMode === 'overwrite'
                      ? 'The following irreversible actions will be executed:'
                      : 'The following merge actions will be executed:'}
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400">
                    {restoreMode === 'overwrite' ? (
                      <>
                        <li>Wipe current tables in SQLite.</li>
                        <li>Re-insert all {validationResult?.totalRecords} records from the JSON backup.</li>
                        <li>Verify foreign key constraints with PRAGMA foreign_key_check.</li>
                        <li>Preserve your active admin session token.</li>
                        <li>Roll back automatically if any query fails.</li>
                      </>
                    ) : (
                      <>
                        <li>Upsert {validationResult?.totalRecords} records from backup.</li>
                        <li>Preserve existing unreferenced operational tasks.</li>
                        <li>Update matching configurations and categories.</li>
                      </>
                    )}
                  </ul>
                </div>

                {restoreMode === 'overwrite' && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-rose-800 dark:text-rose-300">
                      Type "RESTORE" below to unlock disaster recovery:
                    </label>
                    <input
                      type="text"
                      placeholder="RESTORE"
                      value={confirmKeyword}
                      onChange={e => setConfirmKeyword(e.target.value.trim().toUpperCase())}
                      className="w-full px-3 py-2 text-xs font-mono font-bold rounded-lg border border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setConfirmModalOpen(false)}
                    disabled={isRestoring}
                    className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    id="btn-confirm-execute-restore"
                    onClick={handleExecuteRestore}
                    disabled={
                      isRestoring ||
                      (restoreMode === 'overwrite' && confirmKeyword !== 'RESTORE')
                    }
                    className={`flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-xl text-white shadow-xs transition-all cursor-pointer disabled:opacity-50 ${
                      restoreMode === 'overwrite'
                        ? 'bg-rose-600 hover:bg-rose-700'
                        : 'bg-[#0F4C81] hover:bg-[#16324F]'
                    }`}
                  >
                    {isRestoring ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Applying Restore...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Confirm &amp; Execute Restore</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

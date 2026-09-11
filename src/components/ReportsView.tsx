import React, { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  Calendar,
  Filter,
  CheckCircle2,
  Clock,
  ArrowRightLeft,
  AlertTriangle,
  TrendingUp,
  ShieldCheck
} from 'lucide-react';
import { api } from '../api';
import { Handover } from '../types';

export const ReportsView: React.FC = () => {
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [loading, setLoading] = useState(true);
  const [shiftFilter, setShiftFilter] = useState('All');

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    setLoading(true);
    try {
      const res = await api.getHandoverHistory();
      setHandovers(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // KPI calculations
  const totalHandovers = handovers.length;
  const acknowledgedCount = handovers.filter(h => !!h.acknowledged_by).length;
  const ackRate = totalHandovers > 0 ? Math.round((acknowledgedCount / totalHandovers) * 100) : 100;
  const totalCompleted = handovers.reduce((acc, h) => acc + (h.tasks_completed_count || 0), 0);
  const totalCarried = handovers.reduce((acc, h) => acc + (h.tasks_carried_over_count || 0), 0);
  const avgCarriedOver = totalHandovers > 0 ? (totalCarried / totalHandovers).toFixed(1) : '0.0';

  const filteredHandovers = handovers.filter(h => {
    if (shiftFilter !== 'All' && h.from_shift !== shiftFilter) return false;
    return true;
  });

  const handleExportCSV = () => {
    window.location.href = '/api/reports/csv';
  };

  return (
    <div className="space-y-6">
      {/* Header & Export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Operational Reports &amp; Compliance Audit
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Shift metrics, accountability audit records, and handover completion compliance
          </p>
        </div>

        <button
          id="btn-export-csv"
          onClick={handleExportCSV}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F4C81] hover:bg-[#16324F] text-white text-xs font-bold shadow-md transition-colors cursor-pointer"
        >
          <Download className="w-4 h-4" />
          Export All Tasks to CSV (Section 39)
        </button>
      </div>

      {/* KPI Cards (Section 40) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-[#16324F] border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">
              Handover Compliance
            </span>
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
            {ackRate}%
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {acknowledgedCount} of {totalHandovers} acknowledged
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#16324F] border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">
              Tasks Completed
            </span>
            <CheckCircle2 className="w-5 h-5 text-[#0F4C81]" />
          </div>
          <div className="text-2xl font-bold text-[#0F4C81] dark:text-blue-400 mt-2">
            {totalCompleted}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Across recorded handovers
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#16324F] border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">
              Avg Carry-Over / Shift
            </span>
            <ArrowRightLeft className="w-5 h-5 text-purple-600" />
          </div>
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-2">
            {avgCarriedOver}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Tasks transferred per cycle
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#16324F] border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">
              Total Recorded Shifts
            </span>
            <Calendar className="w-5 h-5 text-slate-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
            {totalHandovers}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Logged in single-source database
          </div>
        </div>
      </div>

      {/* Handover Logs Table */}
      <div className="p-6 rounded-2xl bg-white dark:bg-[#16324F] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="font-bold text-base text-slate-900 dark:text-white">
            Shift Handover Log Archive
          </h3>
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={shiftFilter}
              onChange={e => setShiftFilter(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="All">All Shifts</option>
              <option value="Morning">Morning Shift</option>
              <option value="Mid">Mid Shift</option>
              <option value="Night">Night Shift</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase tracking-wider text-[11px] font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Shift Transition</th>
                <th className="py-3 px-4">Operational Date</th>
                <th className="py-3 px-4">Closed By</th>
                <th className="py-3 px-4">Closed At</th>
                <th className="py-3 px-4">Tasks Breakdown</th>
                <th className="py-3 px-4">Acknowledged By</th>
                <th className="py-3 px-4">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredHandovers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No historical handover records found.
                  </td>
                </tr>
              ) : (
                filteredHandovers.map(h => (
                  <tr key={h.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                      {h.from_shift} &rarr; {h.to_shift}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                      {h.shift_date}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">
                      @{h.closed_by}
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {new Date(h.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                          {h.tasks_completed_count} done
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px] font-bold">
                          {h.tasks_carried_over_count} carried
                        </span>
                        {h.tasks_blocked_count > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                            {h.tasks_blocked_count} blocked
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {h.acknowledged_by ? (
                        <span className="text-emerald-700 dark:text-emerald-300 font-semibold">
                          @{h.acknowledged_by}
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 italic">
                          Pending Acknowledgment
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300 max-w-xs truncate">
                      {h.general_notes || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

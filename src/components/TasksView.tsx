import React, { useState } from 'react';
import {
  Plus,
  Search,
  Filter,
  AlertTriangle,
  Clock,
  User,
  ArrowRightLeft,
  CheckCircle2,
  Calendar,
  X,
  Flame,
  Check
} from 'lucide-react';
import { Task, ShiftInfo, User as UserType } from '../types';
import { api } from '../api';

interface TasksViewProps {
  tasks: Task[];
  shift: ShiftInfo | null;
  currentUser: UserType;
  onOpenTask: (taskId: number) => void;
  onTaskCreated: () => void;
}

export const TasksView: React.FC<TasksViewProps> = ({
  tasks,
  shift,
  currentUser,
  onOpenTask,
  onTaskCreated
}) => {
  const [viewMode, setViewMode] = useState<'ACTIVE' | 'CURRENT_SHIFT' | 'CARRIED_OVER' | 'COMPLETED' | 'ALL'>('ACTIVE');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [shiftFilter, setShiftFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [overdueOnly, setOverdueOnly] = useState(false);

  // Quick workload counts
  const activeCount = tasks.filter(t => t.status !== 'Completed' && t.status !== 'Cancelled').length;
  const currentShiftCount = shift ? tasks.filter(t => t.current_shift === shift.name && t.status !== 'Completed').length : 0;
  const carriedCount = tasks.filter(t => t.handover_state === 'Carried Over' && t.status !== 'Completed').length;
  const completedCount = tasks.filter(t => t.status === 'Completed').length;

  // New task modal
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [category, setCategory] = useState('Monitoring');
  const [assignedUser, setAssignedUser] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setCreateError('Task title is required.');
      return;
    }
    setSubmitting(true);
    setCreateError(null);

    try {
      await api.createTask({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        category,
        assignedUser: assignedUser.trim() || undefined,
        dueDate: dueDate || undefined
      });
      setTitle('');
      setDescription('');
      setPriority('Medium');
      setCategory('Monitoring');
      setAssignedUser('');
      setDueDate('');
      setModalOpen(false);
      onTaskCreated();
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create task.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredTasks = tasks.filter(t => {
    // Primary view mode
    if (viewMode === 'ACTIVE' && (t.status === 'Completed' || t.status === 'Cancelled')) return false;
    if (viewMode === 'CURRENT_SHIFT' && shift && t.current_shift !== shift.name) return false;
    if (viewMode === 'CARRIED_OVER' && t.handover_state !== 'Carried Over') return false;
    if (viewMode === 'COMPLETED' && t.status !== 'Completed') return false;

    if (statusFilter !== 'All' && t.status !== statusFilter) return false;
    if (priorityFilter !== 'All' && t.priority !== priorityFilter) return false;
    if (shiftFilter !== 'All' && t.current_shift !== shiftFilter) return false;
    if (categoryFilter !== 'All' && t.category !== categoryFilter) return false;
    if (overdueOnly && !t.isOverdue) return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        t.task_code.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Operational Task Registry
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {viewMode === 'ACTIVE'
              ? 'Showing active operational workload. Finished tasks are safely kept in the historical archive.'
              : viewMode === 'COMPLETED'
              ? 'Historical archive of completed operational tasks.'
              : 'Every task is tracked through its complete operational shift lifecycle'}
          </p>
        </div>

        <button
          id="btn-open-new-task-modal"
          onClick={() => setModalOpen(true)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F4C81] hover:bg-[#16324F] text-white text-xs font-bold shadow-md transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Create New Task
        </button>
      </div>

      {/* Primary View Mode Tabs */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-200/60 dark:bg-slate-800/80 p-1.5 rounded-xl text-xs font-semibold">
        <button
          onClick={() => setViewMode('ACTIVE')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
            viewMode === 'ACTIVE'
              ? 'bg-white dark:bg-[#16324F] text-[#0F4C81] dark:text-blue-300 shadow-xs font-bold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <span>⚡ Active Workload</span>
          <span className="px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 text-[11px]">
            {activeCount}
          </span>
        </button>

        {shift && (
          <button
            onClick={() => setViewMode('CURRENT_SHIFT')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
              viewMode === 'CURRENT_SHIFT'
                ? 'bg-white dark:bg-[#16324F] text-[#0F4C81] dark:text-blue-300 shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span>☀️ Current Shift ({shift.name})</span>
            <span className="px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[11px]">
              {currentShiftCount}
            </span>
          </button>
        )}

        <button
          onClick={() => setViewMode('CARRIED_OVER')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
            viewMode === 'CARRIED_OVER'
              ? 'bg-white dark:bg-[#16324F] text-purple-700 dark:text-purple-300 shadow-xs font-bold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <span>🔄 Carried Over</span>
          <span className="px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 text-[11px]">
            {carriedCount}
          </span>
        </button>

        <button
          onClick={() => setViewMode('COMPLETED')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
            viewMode === 'COMPLETED'
              ? 'bg-white dark:bg-[#16324F] text-emerald-700 dark:text-emerald-300 shadow-xs font-bold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <span>📁 Completed Archive</span>
          <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[11px]">
            {completedCount}
          </span>
        </button>

        <button
          onClick={() => setViewMode('ALL')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
            viewMode === 'ALL'
              ? 'bg-white dark:bg-[#16324F] text-slate-900 dark:text-white shadow-xs font-bold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <span>📋 All Records</span>
          <span className="px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px]">
            {tasks.length}
          </span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#16324F] border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search code, title, details..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-hidden"
            />
          </div>

          {/* Status */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
          >
            <option value="All">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
            <option value="Blocked">Blocked</option>
            <option value="Cancelled">Cancelled</option>
          </select>

          {/* Priority */}
          <select
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
          >
            <option value="All">All Priorities</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>

          {/* Shift */}
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

          {/* Category */}
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
          >
            <option value="All">All Categories</option>
            <option value="Incident">Incident</option>
            <option value="Monitoring">Monitoring</option>
            <option value="Application">Application</option>
            <option value="Infrastructure">Infrastructure</option>
            <option value="Database">Database</option>
            <option value="Request">Request</option>
            <option value="Other">Other</option>
          </select>
        </div>

        {/* Overdue Toggle & Counter */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={e => setOverdueOnly(e.target.checked)}
              className="rounded text-rose-600 focus:ring-rose-500"
            />
            <span>Show Overdue Only</span>
          </label>
          <span className="text-slate-500 dark:text-slate-400">
            Showing <strong>{filteredTasks.length}</strong> of <strong>{tasks.length}</strong> total tasks
          </span>
        </div>
      </div>

      {/* Task List Table (Desktop) */}
      <div className="hidden md:block bg-white dark:bg-[#16324F] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase tracking-wider text-[11px] font-semibold border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="py-3 px-4">Task ID</th>
              <th className="py-3 px-4">Title &amp; Category</th>
              <th className="py-3 px-4">Priority</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Shift</th>
              <th className="py-3 px-4">Assigned User</th>
              <th className="py-3 px-4">Due Date</th>
              <th className="py-3 px-4 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredTasks.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400">
                  No operational tasks match the filter criteria.
                </td>
              </tr>
            ) : (
              filteredTasks.map(task => (
                <tr
                  key={task.id}
                  onClick={() => onOpenTask(task.id)}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4 font-mono font-bold text-[#0F4C81] dark:text-blue-300">
                    {task.task_code}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {task.title}
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                      <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-[10px]">
                        {task.category}
                      </span>
                      {task.handover_state === 'Carried Over' && (
                        <span className="text-purple-600 dark:text-purple-400 font-medium">
                          &bull; Carried Over
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${
                        task.priority === 'Critical'
                          ? 'bg-rose-600 text-white'
                          : task.priority === 'High'
                          ? 'bg-amber-500 text-white'
                          : task.priority === 'Medium'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-400 text-white'
                      }`}
                    >
                      {task.priority}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 rounded font-semibold text-[11px] ${
                        task.status === 'Completed'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : task.status === 'In Progress'
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                          : task.status === 'Blocked'
                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {task.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                    {task.current_shift}
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                    {task.assigned_user ? `@${task.assigned_user}` : 'Unassigned'}
                  </td>
                  <td className="py-3 px-4 text-slate-500 text-[11px]">
                    {task.due_date ? (
                      <span className={task.isOverdue ? 'text-rose-600 font-bold' : ''}>
                        {new Date(task.due_date).toLocaleDateString()}
                        {task.isOverdue && ' (OVERDUE)'}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-[#0F4C81] dark:text-blue-400 font-bold hover:underline">
                      Review &rarr;
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Task Cards */}
      <div className="md:hidden space-y-3">
        {filteredTasks.map(task => (
          <div
            key={task.id}
            onClick={() => onOpenTask(task.id)}
            className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 shadow-xs space-y-2 cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-xs text-[#0F4C81] dark:text-blue-300">
                {task.task_code}
              </span>
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    task.priority === 'Critical' ? 'bg-rose-600 text-white' : 'bg-blue-600 text-white'
                  }`}
                >
                  {task.priority}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 font-semibold">
                  {task.status}
                </span>
              </div>
            </div>

            <h4 className="font-bold text-sm text-slate-900 dark:text-white">{task.title}</h4>

            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-700">
              <span>Shift: {task.current_shift}</span>
              <span>By: @{task.created_by}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Task Creation Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-lg bg-white dark:bg-[#16324F] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-6 py-4 bg-[#0F4C81] text-white flex items-center justify-between">
              <h3 className="font-bold text-base">Create Operational Task</h3>
              <button onClick={() => setModalOpen(false)} className="text-white/80 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="p-6 space-y-4">
              {createError && (
                <div className="p-3 rounded-lg bg-rose-50 text-rose-700 text-xs border border-rose-200">
                  {createError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Task Title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Verify overnight database backup replication"
                  required
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Description / Operational Details (Optional)
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Provide context, server hostnames, ticket references, or SLA notes..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={e => setPriority(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="Critical">Critical (P1 Alert)</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="Incident">Incident</option>
                    <option value="Monitoring">Monitoring</option>
                    <option value="Application">Application</option>
                    <option value="Infrastructure">Infrastructure</option>
                    <option value="Database">Database</option>
                    <option value="Request">Request</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Assigned User (Optional)
                  </label>
                  <input
                    type="text"
                    value={assignedUser}
                    onChange={e => setAssignedUser(e.target.value)}
                    placeholder="e.g. mohamed (optional)"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Due Date / Time (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-[#0F4C81] hover:bg-[#16324F] text-white text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import {
  StickyNote,
  Plus,
  Pin,
  Trash2,
  Edit2,
  Check,
  X,
  Calendar,
  Clock,
  User as UserIcon,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { ShiftNote, User } from '../types';
import { api } from '../api';

interface ShiftStickyNotesProps {
  shiftDate?: string;
  shiftName?: string;
  currentUser: User;
  className?: string;
  compact?: boolean;
}

const COLOR_STYLES: Record<string, { bg: string; border: string; text: string; header: string; badge: string }> = {
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    border: 'border-amber-300 dark:border-amber-800',
    text: 'text-amber-950 dark:text-amber-100',
    header: 'bg-amber-200/60 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
  },
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    border: 'border-blue-300 dark:border-blue-800',
    text: 'text-blue-950 dark:text-blue-100',
    header: 'bg-blue-200/60 dark:bg-blue-900/60 text-blue-900 dark:text-blue-200',
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
  },
  emerald: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    border: 'border-emerald-300 dark:border-emerald-800',
    text: 'text-emerald-950 dark:text-emerald-100',
    header: 'bg-emerald-200/60 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
  },
  rose: {
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    border: 'border-rose-300 dark:border-rose-800',
    text: 'text-rose-950 dark:text-rose-100',
    header: 'bg-rose-200/60 dark:bg-rose-900/60 text-rose-900 dark:text-rose-200',
    badge: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300'
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-950/40',
    border: 'border-purple-300 dark:border-purple-800',
    text: 'text-purple-950 dark:text-purple-100',
    header: 'bg-purple-200/60 dark:bg-purple-900/60 text-purple-900 dark:text-purple-200',
    badge: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300'
  }
};

export const ShiftStickyNotes: React.FC<ShiftStickyNotesProps> = ({
  shiftDate,
  shiftName,
  currentUser,
  className = '',
  compact = false
}) => {
  const [notes, setNotes] = useState<ShiftNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New Note State
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newColor, setNewColor] = useState<'amber' | 'blue' | 'emerald' | 'rose' | 'purple'>('amber');
  const [newPinned, setNewPinned] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Edit Note State
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editColor, setEditColor] = useState<'amber' | 'blue' | 'emerald' | 'rose' | 'purple'>('amber');
  const [editPinned, setEditPinned] = useState(false);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getShiftNotes(shiftDate);
      setNotes(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load shift notes.');
    } finally {
      setLoading(false);
    }
  }, [shiftDate]);

  useEffect(() => {
    fetchNotes();

    const handleSync = () => {
      fetchNotes();
    };

    window.addEventListener('shift-notes:updated', handleSync);
    return () => {
      window.removeEventListener('shift-notes:updated', handleSync);
    };
  }, [fetchNotes]);

  const notifyChange = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('shift-notes:updated'));
    }
  };

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) {
      setError('Note content is required.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const created = await api.createShiftNote({
        title: newTitle.trim() || undefined,
        content: newContent.trim(),
        color: newColor,
        shift_name: shiftName || 'All',
        shift_date: shiftDate,
        pinned: newPinned ? 1 : 0
      });

      setNotes(prev => [created, ...prev]);
      setNewTitle('');
      setNewContent('');
      setNewColor('amber');
      setNewPinned(false);
      setIsAdding(false);
      notifyChange();
    } catch (err: any) {
      setError(err.message || 'Failed to create shift note.');
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (note: ShiftNote) => {
    setEditingId(note.id);
    setEditTitle(note.title || '');
    setEditContent(note.content);
    setEditColor(note.color || 'amber');
    setEditPinned(Boolean(note.pinned));
  };

  const handleSaveEdit = async (noteId: number) => {
    if (!editContent.trim()) {
      setError('Note content cannot be empty.');
      return;
    }

    try {
      const updated = await api.updateShiftNote(noteId, {
        title: editTitle.trim() || undefined,
        content: editContent.trim(),
        color: editColor,
        pinned: editPinned ? 1 : 0
      });

      setNotes(prev => prev.map(n => (n.id === noteId ? updated : n)));
      setEditingId(null);
      notifyChange();
    } catch (err: any) {
      setError(err.message || 'Failed to update note.');
    }
  };

  const handleTogglePin = async (note: ShiftNote) => {
    try {
      const newPinState = note.pinned ? 0 : 1;
      const updated = await api.updateShiftNote(note.id, {
        pinned: newPinState
      });
      setNotes(prev => {
        const next = prev.map(n => (n.id === note.id ? updated : n));
        return next.sort((a, b) => b.pinned - a.pinned);
      });
      notifyChange();
    } catch (err: any) {
      setError(err.message || 'Failed to toggle pin state.');
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    if (!confirm('Are you sure you want to delete this shift note? This action will be logged in the audit trail.')) {
      return;
    }

    try {
      await api.deleteShiftNote(noteId);
      setNotes(prev => prev.filter(n => n.id !== noteId));
      notifyChange();
    } catch (err: any) {
      setError(err.message || 'Failed to delete note.');
    }
  };

  return (
    <div className={`bg-white dark:bg-[#16324F] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden ${className}`}>
      {/* Board Header */}
      <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5 bg-slate-50/70 dark:bg-slate-800/40">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-xl bg-amber-500 text-white shadow-xs">
            <StickyNote className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Shift Sticky Notes
              </h3>
              {shiftDate && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[10px] font-bold bg-[#0F4C81]/10 dark:bg-blue-950/50 text-[#0F4C81] dark:text-blue-300 border border-[#0F4C81]/20">
                  <Calendar className="w-3 h-3" />
                  Shift Date: {shiftDate}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Linked to operational shift date &bull; Scoped strictly to today's shift day &bull; Full audit logging
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isAdding && (
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="px-3 py-1.5 rounded-xl bg-[#0F4C81] hover:bg-[#16324F] text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Note
            </button>
          )}
        </div>
      </div>

      {/* Content Container */}
      <div className="p-4 space-y-3">
        {error && (
          <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Add Note Form */}
        {isAdding && (
          <form
            onSubmit={handleCreateNote}
            className="p-3.5 rounded-2xl border-2 border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/20 space-y-3 animate-in fade-in duration-150"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                New Operational Sticky Note (Date: {shiftDate || 'Active Shift'})
              </span>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Title or topic (e.g. Critical DB Maintenance, VIP Notice, SLA Window)"
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
              />

              <textarea
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                placeholder="Write sticky note details, contact numbers, temporary workarounds, or reminders for this shift..."
                rows={3}
                required
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              {/* Color Picker */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mr-1">Color:</span>
                {(['amber', 'blue', 'emerald', 'rose', 'purple'] as const).map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewColor(color)}
                    className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                      newColor === color ? 'scale-110 ring-2 ring-slate-400 ring-offset-1' : 'opacity-70 hover:opacity-100'
                    }`}
                    style={{
                      backgroundColor:
                        color === 'amber' ? '#fef3c7' :
                        color === 'blue' ? '#dbeafe' :
                        color === 'emerald' ? '#d1fae5' :
                        color === 'rose' ? '#ffe4e6' : '#f3e8ff',
                      borderColor:
                        color === 'amber' ? '#f59e0b' :
                        color === 'blue' ? '#3b82f6' :
                        color === 'emerald' ? '#10b981' :
                        color === 'rose' ? '#f43f5e' : '#a855f7'
                    }}
                    title={color}
                  />
                ))}
              </div>

              {/* Pin Toggle & Submit */}
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newPinned}
                    onChange={e => setNewPinned(e.target.checked)}
                    className="rounded text-amber-600"
                  />
                  <Pin className="w-3.5 h-3.5 text-amber-600" />
                  Pin Note
                </label>

                <button
                  type="submit"
                  disabled={submitting}
                  className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Pin Sticky Note'}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Notes Grid */}
        {loading && notes.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            Loading operational shift notes...
          </div>
        ) : notes.length === 0 ? (
          <div className="py-6 px-4 text-center rounded-xl bg-slate-50/50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800">
            <StickyNote className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-1.5" />
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              No sticky notes recorded for Shift Date: {shiftDate || 'Today'}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Click &quot;Add Note&quot; above to pin quick operational alerts, contact numbers, or reminders for this work day.
            </p>
          </div>
        ) : (
          <div className={`grid gap-3 ${compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
            {notes.map(note => {
              const styles = COLOR_STYLES[note.color] || COLOR_STYLES.amber;
              const isEditing = editingId === note.id;

              return (
                <div
                  key={note.id}
                  className={`rounded-xl border p-3 flex flex-col justify-between transition-all shadow-xs relative ${styles.bg} ${styles.border}`}
                >
                  {/* Note Header */}
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      {Boolean(note.pinned) && (
                        <span className="p-1 rounded-md bg-amber-500 text-white shadow-xs shrink-0" title="Pinned Note">
                          <Pin className="w-3 h-3 fill-white" />
                        </span>
                      )}
                      {isEditing ? (
                        <input
                          type="text"
                          value={editTitle}
                          onChange={e => setEditTitle(e.target.value)}
                          placeholder="Note Title"
                          className="w-full px-2 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold"
                        />
                      ) : (
                        <h4 className="font-bold text-xs text-slate-900 dark:text-white truncate">
                          {note.title || 'Shift Note'}
                        </h4>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleTogglePin(note)}
                        className={`p-1 rounded hover:bg-black/10 transition-colors ${
                          note.pinned ? 'text-amber-600' : 'text-slate-400 hover:text-slate-600'
                        }`}
                        title={note.pinned ? 'Unpin' : 'Pin to top'}
                      >
                        <Pin className="w-3.5 h-3.5" />
                      </button>

                      {!isEditing && (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(note)}
                            className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-black/10 transition-colors"
                            title="Edit Note"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteNote(note.id)}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-black/10 transition-colors"
                            title="Delete Note"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Note Body */}
                  {isEditing ? (
                    <div className="space-y-2 my-1">
                      <textarea
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        rows={3}
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />

                      {/* Edit Color Picker */}
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-1">
                          {(['amber', 'blue', 'emerald', 'rose', 'purple'] as const).map(color => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => setEditColor(color)}
                              className={`w-5 h-5 rounded-full border ${
                                editColor === color ? 'ring-2 ring-slate-400 scale-110' : 'opacity-70'
                              }`}
                              style={{
                                backgroundColor:
                                  color === 'amber' ? '#fef3c7' :
                                  color === 'blue' ? '#dbeafe' :
                                  color === 'emerald' ? '#d1fae5' :
                                  color === 'rose' ? '#ffe4e6' : '#f3e8ff'
                              }}
                            />
                          ))}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="p-1 rounded text-slate-400 hover:text-slate-600 text-[11px]"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(note.id)}
                            className="px-2.5 py-1 rounded bg-emerald-600 text-white text-[11px] font-bold flex items-center gap-1"
                          >
                            <Check className="w-3 h-3" />
                            Save
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed my-1">
                      {note.content}
                    </p>
                  )}

                  {/* Note Footer */}
                  <div className="mt-2 pt-2 border-t border-black/10 dark:border-white/10 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <UserIcon className="w-3 h-3" />
                      @{note.created_by}
                    </span>
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3" />
                      {new Date(note.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

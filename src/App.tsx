/**
 * Shift Handover - Secure Shift Operations & Handover Management
 * Single Source of Truth Architecture
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { SetupModal } from './components/SetupModal';
import { LoginModal } from './components/LoginModal';
import { DashboardView } from './components/DashboardView';
import { TasksView } from './components/TasksView';
import { HandoverView } from './components/HandoverView';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';
import { DailyBriefingSection } from './components/DailyBriefingSection';
import { TaskDetailModal } from './components/TaskDetailModal';
import { HandoverEmailModal } from './components/HandoverEmailModal';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { api } from './api';
import { User, ShiftInfo, Task, AppSettings, ShiftName } from './types';
import { Lock, CheckCircle2 } from 'lucide-react';

export default function App() {
  // App system status
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);

  // Core operational data
  const [shift, setShift] = useState<ShiftInfo | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [criticalCount, setCriticalCount] = useState(0);
  const [handoverAcknowledged, setHandoverAcknowledged] = useState(false);
  const [previousShiftNotes, setPreviousShiftNotes] = useState<string | null>(null);

  // Navigation & UI state
  const [activeTab, setActiveTab] = useState<'dashboard' | 'tasks' | 'handover' | 'reports' | 'settings'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('hando_active_tab') as any;
      if (['dashboard', 'tasks', 'handover', 'reports', 'settings'].includes(saved)) {
        return saved;
      }
    }
    return 'dashboard';
  });

  const handleSelectTab = (tab: 'dashboard' | 'tasks' | 'handover' | 'reports' | 'settings') => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      localStorage.setItem('hando_active_tab', tab);
    }
  };

  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [handoverEmailId, setHandoverEmailId] = useState<number | undefined>(undefined);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('hando_dark_mode');
      if (saved !== null) return saved === 'true';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // 1. Initial health and session check
  const checkStatusAndSession = useCallback(async () => {
    try {
      const statusRes = await api.getStatus();
      setInitialized(statusRes.initialized);
      if (statusRes.settings) {
        setSettings(prev => ({ ...prev, ...statusRes.settings }));
      }

      if (statusRes.initialized) {
        try {
          const authRes = await api.getMe();
          if (authRes && authRes.user) {
            setCurrentUser(authRes.user);
            try {
              const fullSettings = await api.getSettings();
              if (fullSettings) {
                setSettings(fullSettings);
              }
            } catch {}
          } else {
            setCurrentUser(null);
          }
        } catch {
          setCurrentUser(null);
        }
      }
    } catch (err: any) {
      console.warn('Status check warning (server starting or network reconnect):', err?.message || err);
      // Retry once after a brief delay if initialization check had a network hiccup
      setTimeout(async () => {
        try {
          const retryStatus = await api.getStatus();
          setInitialized(retryStatus.initialized);
          if (retryStatus.settings) {
            setSettings(prev => ({ ...prev, ...retryStatus.settings }));
          }
        } catch {
          setInitialized(false);
        }
      }, 1500);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatusAndSession();
  }, [checkStatusAndSession]);

  // Listen for unauthorized session events
  useEffect(() => {
    const handleUnauthorized = () => {
      setCurrentUser(null);
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  // Dark mode effect
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('hando_dark_mode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('hando_dark_mode', 'false');
    }
  }, [darkMode]);

  // 2. Fetch active shift and task data
  const refreshOperationalData = useCallback(async () => {
    if (!currentUser) return;
    try {
      const [shiftRes, tasksRes, handoverRes] = await Promise.all([
        api.getCurrentShift().catch(() => null),
        api.getTasks().catch(() => null),
        api.getCurrentHandover().catch(() => null)
      ]);

      if (shiftRes) {
        setShift(shiftRes);
      }

      if (Array.isArray(tasksRes)) {
        setTasks(tasksRes);
        setUnresolvedCount(tasksRes.filter(t => ['Pending', 'In Progress'].includes(t.status)).length);
        setCriticalCount(tasksRes.filter(t => t.priority === 'Critical' && t.status !== 'Completed').length);
      }

      if (handoverRes) {
        setHandoverAcknowledged(Boolean(handoverRes.isShiftAccepted));
        if (handoverRes.latestHandover) {
          setPreviousShiftNotes(handoverRes.latestHandover.general_notes || null);
        } else {
          setPreviousShiftNotes(null);
        }
      }
    } catch (err: any) {
      if (err?.message?.includes('Authentication required') || err?.message?.includes('401')) {
        setCurrentUser(null);
      } else {
        console.warn('Operational data refresh skipped:', err?.message || err);
      }
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      refreshOperationalData();
      // Polling interval (every 15 seconds) for shift time countdown and live tasks
      const interval = setInterval(refreshOperationalData, 15000);
      return () => clearInterval(interval);
    }
  }, [currentUser, refreshOperationalData]);

  // Immediate optimistic state update when a task is updated (e.g. marked Completed or Reopened to Pending)
  const handleTaskUpdated = useCallback(async (updatedTask?: Task) => {
    if (updatedTask) {
      setTasks(prev => {
        const exists = prev.some(t => t.id === updatedTask.id);
        const next = exists
          ? prev.map(t => t.id === updatedTask.id ? { ...t, ...updatedTask } : t)
          : [updatedTask, ...prev];
        setUnresolvedCount(next.filter(t => ['Pending', 'In Progress'].includes(t.status)).length);
        setCriticalCount(next.filter(t => t.priority === 'Critical' && t.status !== 'Completed').length);
        return next;
      });
    }
    await refreshOperationalData();
  }, [refreshOperationalData]);

  useEffect(() => {
    const handleRemoteRefresh = () => {
      refreshOperationalData();
    };
    window.addEventListener('operational:refresh', handleRemoteRefresh);
    return () => {
      window.removeEventListener('operational:refresh', handleRemoteRefresh);
    };
  }, [refreshOperationalData]);

  // Logout handler
  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (err) {
      console.error(err);
    } finally {
      setCurrentUser(null);
      setActiveTab('handover');
      if (typeof window !== 'undefined') {
        localStorage.setItem('hando_active_tab', 'handover');
      }
    }
  };

  // Quick acknowledge handler
  const handleQuickAcknowledge = async () => {
    try {
      setHandoverAcknowledged(true);
      await api.acknowledgeHandover();
      await refreshOperationalData();
    } catch (err) {
      console.error(err);
      await refreshOperationalData();
    }
  };

  // Settings saved handler (keeps user on settings page)
  const handleSettingsSaved = async () => {
    try {
      const fullSettings = await api.getSettings();
      if (fullSettings) {
        setSettings(fullSettings);
      }
    } catch {}
    await checkStatusAndSession();
  };

  const handleClearOperationalData = async () => {
    await refreshOperationalData();
    await checkStatusAndSession();
  };

  const handleSwitchDutyShift = async (newShift: ShiftName) => {
    try {
      await api.updateDutyShift(newShift);
      if (currentUser) {
        setCurrentUser({ ...currentUser, selectedShift: newShift });
      }
      if (shift) {
        setShift({ ...shift, userShift: newShift });
      }
      await refreshOperationalData();
    } catch (err: any) {
      console.error('Failed to switch duty shift:', err);
    }
  };

  const handleFactoryResetDone = () => {
    setCurrentUser(null);
    setInitialized(false);
    window.location.reload();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5F7FA] dark:bg-[#0c1c2e] text-slate-600 dark:text-slate-300">
        <div className="w-8 h-8 border-4 border-[#0F4C81] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold tracking-wide">Connecting to Hando Engine...</p>
      </div>
    );
  }

  // Not initialized -> show Setup Wizard (Section 5)
  if (initialized === false) {
    return (
      <SetupModal
        onCompleted={async () => {
          await checkStatusAndSession();
        }}
      />
    );
  }

  // Not authenticated -> show Login Screen (Section 6)
  if (!currentUser) {
    return (
      <LoginModal
        onLoginSuccess={user => {
          setCurrentUser(user);
          handleSelectTab('handover');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F7FA] dark:bg-[#0c1c2e] text-slate-900 dark:text-slate-100 transition-colors max-w-full overflow-x-hidden">
      {/* Top Enterprise Navigation */}
      <Navbar
        currentUser={currentUser}
        shift={shift}
        unresolvedCount={unresolvedCount}
        criticalCount={criticalCount}
        teamName={settings?.team_name || 'Operations Team'}
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        onLogout={handleLogout}
        onChangePassword={() => setChangePasswordOpen(true)}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode(!darkMode)}
        onSwitchShift={handleSwitchDutyShift}
      />

      {/* Global Shift Acceptance Alert Banner */}
      {!handoverAcknowledged && activeTab !== 'handover' && (
        <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300">
                <Lock className="w-5 h-5" />
              </div>
              <div className="text-xs">
                <p className="font-bold text-amber-900 dark:text-amber-200">
                  Shift Handover Pending Acceptance ({shift?.name || 'Active'} Shift)
                </p>
                <p className="text-amber-700 dark:text-amber-300 mt-0.5">
                  Ticket operations (creating, updating status, comments) and shift closure are locked until you officially accept the shift.
                </p>
              </div>
            </div>
            <button
              type="button"
              id="btn-global-accept-shift"
              onClick={handleQuickAcknowledge}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer shrink-0"
            >
              <CheckCircle2 className="w-4 h-4" />
              Accept Shift Now
            </button>
          </div>
        </div>
      )}

      {/* Main Content Body */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 sm:p-6 lg:p-8">
        {activeTab === 'dashboard' && (
          <DashboardView
            currentUser={currentUser}
            shift={shift}
            tasks={tasks}
            unresolvedCount={unresolvedCount}
            criticalCount={criticalCount}
            onOpenTask={taskId => setSelectedTaskId(taskId)}
            onNewTask={() => handleSelectTab('tasks')}
            onNavigateTab={tab => handleSelectTab(tab as any)}
            onAcknowledgeHandover={handleQuickAcknowledge}
            handoverAcknowledged={handoverAcknowledged}
            previousShiftNotes={previousShiftNotes}
            onSwitchShift={handleSwitchDutyShift}
            teamName={settings?.team_name || 'Operations Team'}
          />
        )}

        {activeTab === 'briefing' && (
          <DailyBriefingSection
            onOpenTask={taskId => setSelectedTaskId(taskId)}
            defaultMode="yesterday"
          />
        )}

        {activeTab === 'tasks' && (
          <TasksView
            tasks={tasks}
            shift={shift}
            currentUser={currentUser}
            onOpenTask={taskId => setSelectedTaskId(taskId)}
            onTaskCreated={refreshOperationalData}
            handoverAcknowledged={handoverAcknowledged}
            onAcknowledgeHandover={handleQuickAcknowledge}
          />
        )}

        {activeTab === 'handover' && (
          <HandoverView
            currentUser={currentUser}
            shift={shift}
            onOpenTask={taskId => setSelectedTaskId(taskId)}
            onOpenEmailModal={hId => {
              setHandoverEmailId(hId);
              setEmailModalOpen(true);
            }}
            onShiftClosed={refreshOperationalData}
            handoverAcknowledged={handoverAcknowledged}
            onAcknowledgeHandover={handleQuickAcknowledge}
          />
        )}

        {activeTab === 'reports' && <ReportsView />}

        {activeTab === 'settings' && (
          <SettingsView
            currentUser={currentUser}
            onSettingsSaved={handleSettingsSaved}
            onClearData={handleClearOperationalData}
            onFactoryReset={handleFactoryResetDone}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800/80 bg-white/70 dark:bg-[#16324F]/70 py-4 px-6 text-center text-xs text-slate-400">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 max-w-7xl mx-auto">
          <span>Hando &bull; Database is the Single Source of Truth</span>
          <span>Zero Tasks Lost Between Shifts &bull; Operational Resilience</span>
        </div>
      </footer>

      {/* Task Detail Modal */}
      {selectedTaskId !== null && (
        <TaskDetailModal
          taskId={selectedTaskId}
          shift={shift}
          onClose={() => setSelectedTaskId(null)}
          onTaskUpdated={handleTaskUpdated}
          currentUser={currentUser}
          handoverAcknowledged={handoverAcknowledged}
          onAcknowledgeHandover={handleQuickAcknowledge}
        />
      )}

      {/* Handover Email Modal */}
      {emailModalOpen && (
        <HandoverEmailModal
          handoverId={handoverEmailId}
          onClose={() => {
            setEmailModalOpen(false);
            setHandoverEmailId(undefined);
          }}
        />
      )}

      {/* Change Password Modal */}
      {changePasswordOpen && (
        <ChangePasswordModal
          onClose={() => setChangePasswordOpen(false)}
        />
      )}
    </div>
  );
}

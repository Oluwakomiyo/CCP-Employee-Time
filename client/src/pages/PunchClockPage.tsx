import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { invalidateAllTimeQueries } from '../lib/sync';
import {
  Play,
  Square,
  Coffee,
  AlertTriangle,
  MapPin,
  ListTodo,
} from 'lucide-react';

export const PunchClockPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedProject, setSelectedProject] = useState('');
  const [location, setLocation] = useState<'OFFICE' | 'SITE' | 'REMOTE'>('OFFICE');
  const [breakType, setBreakType] = useState('REST');
  const [activityTitle, setActivityTitle] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [switchProjectId, setSwitchProjectId] = useState('');
  const [switchLocation, setSwitchLocation] = useState<'OFFICE' | 'SITE' | 'REMOTE'>('OFFICE');

  // 1. Fetch live punch clock status
  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ['timeStatus'],
    queryFn: async () => {
      const res = await api.get('/time/status');
      return res.data.data;
    },
    refetchInterval: 15000,
  });

  // 2. Fetch projects assigned to employee
  const { data: projectsData } = useQuery({
    queryKey: ['assignedProjects'],
    queryFn: async () => {
      const res = await api.get('/projects');
      return res.data.data;
    },
  });

  const isClockedIn = statusData?.isClockedIn || false;
  const activeSegment = statusData?.activeSegment;
  const isOnBreak = activeSegment?.isOnBreak || false;

  // Run automated browser session heartbeat while clocked in
  
  // Live seconds ticker
  useEffect(() => {
    if (!isClockedIn || !activeSegment) {
      setElapsed(0);
      return;
    }

    setElapsed(activeSegment.elapsedSeconds);
    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [isClockedIn, activeSegment]);

  // Mutations
  const clockInMutation = useMutation({
    mutationFn: (data: { projectId: string; location: string }) =>
      api.post('/time/clock-in', data),
    onSuccess: () => invalidateAllTimeQueries(queryClient),
  });

  const clockOutMutation = useMutation({
    mutationFn: () => api.post('/time/clock-out'),
    onSuccess: () => invalidateAllTimeQueries(queryClient),
  });

  const startBreakMutation = useMutation({
    mutationFn: (data: { breakType: string }) =>
      api.post('/time/breaks/start', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['timeStatus'] }),
  });

  const endBreakMutation = useMutation({
    mutationFn: () => api.post('/time/breaks/end'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['timeStatus'] }),
  });

  const logActivityMutation = useMutation({
    mutationFn: (data: { title: string }) =>
      api.post('/time/activities', data),
    onSuccess: () => {
      setActivityTitle('');
      queryClient.invalidateQueries({ queryKey: ['timeStatus'] });
    },
  });

  const switchMutation = useMutation({
    mutationFn: (data: any) => api.post('/time/switch', data),
    onSuccess: () => {
      invalidateAllTimeQueries(queryClient);
      setShowSwitchModal(false);
      alert('Project/Location context switched successfully!');
    },
    onError: (err: any) => alert(err.response?.data?.message || 'Failed to switch project'),
  });

  const formatTimer = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins
      .toString()
      .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (statusLoading) {
    return <div className="p-8 text-slate-500 font-medium">Connecting to time server...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Punch Clock & Active Session</h1>
        <p className="text-sm text-slate-500">Record shifts, project activities, and breaks with verified timestamps.</p>
      </div>

      {/* Main Punch Clock Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-8 flex flex-col items-center justify-center text-center border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white">
          <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
            {isClockedIn ? (isOnBreak ? 'On Break' : 'Active Session Elapsed Time') : 'Punch Clock Idle'}
          </div>

          <div
            className={`font-mono text-6xl font-black tracking-tight mb-4 ${isOnBreak
              ? 'text-amber-500'
              : isClockedIn
                ? 'text-ccp-600'
                : 'text-slate-400'
              }`}
          >
            {formatTimer(elapsed)}
          </div>

          {isClockedIn && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-ccp-50 border border-ccp-200 text-ccp-700 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-ccp-500 animate-pulse"></span>
              {activeSegment?.projectName} ({activeSegment?.projectCode})
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="p-6 bg-white">
          {!isClockedIn ? (
            /* CLOCKED OUT STATE: Start Work Form */
            <div className="max-w-lg mx-auto space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Assign Shift to Project
                </label>
                <select
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-ccp-500 focus:outline-none"
                >
                  <option value="">-- Choose Assigned Project --</option>
                  {projectsData?.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                  <MapPin size={14} />
                  Work Location Context
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['OFFICE', 'SITE', 'REMOTE'] as const).map((loc) => (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => setLocation(loc)}
                      className={`py-2 text-xs font-semibold rounded-lg border transition ${location === loc
                        ? 'border-ccp-500 bg-ccp-50 text-ccp-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                      {loc}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() =>
                  clockInMutation.mutate({ projectId: selectedProject, location })
                }
                disabled={!selectedProject || clockInMutation.isPending}
                className="w-full mt-2 bg-ccp-500 hover:bg-ccp-600 disabled:opacity-40 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 shadow-md transition"
              >
                <Play size={18} fill="currentColor" />
                <span>Clock In & Start Work</span>
              </button>
            </div>
          ) : (
            /* CLOCKED IN STATE: Break & Clock Out Controls */
            <div className="space-y-6">
              {/* Break Controls */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Coffee className={isOnBreak ? 'text-amber-500' : 'text-slate-400'} />
                  <div>
                    <div className="text-sm font-bold text-slate-800">
                      {isOnBreak ? 'Break in Progress' : 'Rest & Meal Breaks'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {isOnBreak
                        ? `Elapsed break time: ${formatTimer(
                          activeSegment.activeBreak?.breakElapsedSeconds || 0
                        )}`
                        : 'Official breaks are deducted from gross work time'}
                    </div>
                  </div>
                </div>

                {isOnBreak ? (
                  <button
                    onClick={() => endBreakMutation.mutate()}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg transition shadow-sm"
                  >
                    End Break
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      value={breakType}
                      onChange={(e) => setBreakType(e.target.value)}
                      className="text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="REST">Rest Break (15m)</option>
                      <option value="LUNCH">Lunch Break</option>
                      <option value="MEDICAL">Medical</option>
                      <option value="UNPAID">Unpaid Break</option>
                    </select>
                    <button
                      onClick={() => startBreakMutation.mutate({ breakType })}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg transition"
                    >
                      Take Break
                    </button>
                  </div>
                )}
              </div>

              {/* Activity Task Logger */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <ListTodo size={15} />
                  Log Task Activity
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={activityTitle}
                    onChange={(e) => setActivityTitle(e.target.value)}
                    placeholder="E.g., CAD Model Refactoring, Client Site Inspection..."
                    className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-ccp-500"
                  />
                  <button
                    onClick={() => logActivityMutation.mutate({ title: activityTitle })}
                    disabled={!activityTitle.trim() || logActivityMutation.isPending}
                    className="px-4 py-2 bg-ccp-700 hover:bg-ccp-800 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition"
                  >
                    Log Activity
                  </button>
                </div>
              </div>

              {/* Actions: Switch Context or Clock Out */}
              <div className="space-y-2">
                {isOnBreak && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-lg flex items-center gap-2">
                    <AlertTriangle size={15} />
                    <span>You must end your ongoing break before you can switch projects or clock out.</span>
                  </div>
                )}

                <div className="flex gap-3">
                  {/* 1. SWITCH PROJECT OR LOCATION */}
                  <button
                    type="button"
                    disabled={isOnBreak || switchMutation.isPending}
                    onClick={() => {
                      setSwitchProjectId(activeSegment.projectId);
                      setSwitchLocation(activeSegment.location || 'OFFICE');
                      setShowSwitchModal(true);
                    }}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-3 rounded-lg text-xs transition border border-slate-300 flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <MapPin size={15} />
                    <span>Switch Project / Location</span>
                  </button>

                  {/* 2. SINGLE UNIFIED CLOCK OUT */}
                  <button
                    type="button"
                    onClick={() => clockOutMutation.mutate()}
                    disabled={isOnBreak || clockOutMutation.isPending}
                    className="flex-1 bg-slate-800 hover:bg-slate-900 disabled:opacity-30 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 shadow transition text-xs"
                  >
                    <Square size={15} fill="currentColor" />
                    <span>Clock Out & End Shift</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 🔴 SWITCH PROJECT / LOCATION MODAL */}
      {showSwitchModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <h2 className="text-base font-bold text-slate-900">Switch Project / Location</h2>
            <p className="text-xs text-slate-500">
              Seamlessly transition to another project or change between Site, Office and Remote without ending your workday.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select Project</label>
                <select
                  value={switchProjectId}
                  onChange={(e) => setSwitchProjectId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border rounded-lg"
                >
                  {projectsData?.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">New Location Context</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['OFFICE', 'SITE', 'REMOTE'] as const).map((loc) => (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => setSwitchLocation(loc)}
                      className={`py-2 text-xs font-bold rounded-lg border transition ${switchLocation === loc
                        ? 'border-ccp-500 bg-ccp-50 text-ccp-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                      {loc}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSwitchModal(false)}
                className="px-3 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  switchMutation.mutate({
                    projectId: switchProjectId,
                    location: switchLocation,
                  })
                }
                disabled={switchMutation.isPending}
                className="px-4 py-2 bg-ccp-700 hover:bg-ccp-800 text-white text-xs font-bold rounded-lg shadow"
              >
                {switchMutation.isPending ? 'Switching...' : 'Confirm Switch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
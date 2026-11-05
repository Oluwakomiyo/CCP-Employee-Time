import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { FileEdit, } from 'lucide-react';

export const TimesheetsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [correctionWorkDay, setCorrectionWorkDay] = useState<any | null>(null);
  const [reason, setReason] = useState('');
  const [proposedClockIn, setProposedClockIn] = useState('');
  const [proposedClockOut, setProposedClockOut] = useState('');
  const { user } = useAuth();

  const { data: timesheets, isLoading } = useQuery({
    queryKey: ['timesheetsHistory'],
    queryFn: async () => {
      const res = await api.get('/time/history');
      return res.data.data.history;
    },
    refetchInterval: 10000,
  });

  // 🔴 ADD LIVE CLOCK TICKER
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    const ticker = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(ticker);
  }, []);

  const submitCorrectionMutation = useMutation({
    mutationFn: (data: any) => api.post('/corrections', data),
    onSuccess: () => {
      setCorrectionWorkDay(null);
      setReason('');
      queryClient.invalidateQueries({ queryKey: ['timesheetsHistory'] });
      alert('Correction request submitted for management review!');
    },
  });

  const openCorrectionModal = (day: any) => {
    setCorrectionWorkDay(day);
    const firstSegment = day.segments[0];
    if (firstSegment) {
      setProposedClockIn(new Date(firstSegment.clockIn).toISOString().slice(0, 16));
      setProposedClockOut(
        firstSegment.clockOut
          ? new Date(firstSegment.clockOut).toISOString().slice(0, 16)
          : ''
      );
    }
  };

  const handleSubmitCorrection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionWorkDay) return;

    submitCorrectionMutation.mutate({
      workDayId: correctionWorkDay.id,
      reason,
      requestedChanges: {
        segmentId: correctionWorkDay.segments[0]?.id,
        proposedClockIn: new Date(proposedClockIn).toISOString(),
        proposedClockOut: new Date(proposedClockOut).toISOString(),
      },
    });
  };

  if (isLoading) return <div className="p-8 text-slate-500 font-medium">Loading timesheets...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Workday Timesheets</h1>
        <p className="text-sm text-slate-500">Official records of clocked hours, break times, and status.</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-700 text-xs uppercase font-bold border-b border-slate-200">
            <tr>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Recorded Shift Times</th>
              <th className="px-6 py-4">Total Work Time</th>
              <th className="px-6 py-4">Recorded Breaks</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {timesheets?.map((day: any) => {
              // 🔴 CALCULATE LIVE ELAPSED WORK TIME IF CURRENTLY CLOCKED IN
              const activeSegment = day.segments?.find((s: any) => !s.clockOut);
              let totalSeconds = day.totalWorkSeconds;

              if (activeSegment) {
                const segElapsed = Math.max(0, Math.floor((currentTime - new Date(activeSegment.clockIn).getTime()) / 1000));
                // Subtract open break time if currently on break
                const openBreak = activeSegment.breaks?.find((b: any) => !b.endTime);
                const breakElapsed = openBreak
                  ? Math.max(0, Math.floor((currentTime - new Date(openBreak.startTime).getTime()) / 1000))
                  : 0;
                totalSeconds += Math.max(0, segElapsed - breakElapsed);
              }

              const hours = (totalSeconds / 3600).toFixed(2);
              const breakMins = Math.round(day.totalBreakSeconds / 60);
              const firstSegment = day.segments?.[0];
              const lastSegment = day.segments?.[day.segments.length - 1];

              const recordedClockIn = firstSegment?.clockIn
                ? new Date(firstSegment.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '--';

              const recordedClockOut = lastSegment?.clockOut
                ? new Date(lastSegment.clockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : (day.status === 'OPEN' ? 'In Progress' : '--');

              return (
                <tr key={day.id} className="hover:bg-slate-50/80 transition">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-slate-900">
                      {new Date(day.date).toLocaleDateString(undefined, {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Recorded on {new Date(day.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}{' '}
                      {new Date(day.createdAt).toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      })}
                    </div>
                  </td>

                  {/* 🔴 RECORDED TIMES CELL */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 font-mono text-xs text-slate-700 font-semibold bg-slate-50 border px-2.5 py-1 rounded-lg w-fit">
                      <span>{recordedClockIn}</span>
                      <span className="text-slate-400">→</span>
                      <span className={recordedClockOut === 'In Progress' ? 'text-emerald-600 font-bold' : ''}>
                        {recordedClockOut}
                      </span>
                    </div>
                  </td>

                  <td className="px-6 py-4 font-mono font-bold text-slate-800">
                    <span>{hours} hrs</span>
                    {/* 🔴 PULSING LIVE INDICATOR */}
                    {activeSegment && (
                      <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Live
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-500">{breakMins} mins</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${day.status === 'APPROVED'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : day.status === 'FLAGGED_MISSING_CLOCKOUT'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                    >
                      {day.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {/* 🔴 Only show Request Correction if this workday belongs to the logged-in user */}
                    {user?.employee?.id === day.employeeId && (
                      <button
                        onClick={() => openCorrectionModal(day)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-ccp-700 hover:bg-ccp-50 border border-ccp-200 rounded-lg transition"
                      >
                        <FileEdit size={14} />
                        <span>Request Correction</span>
                      </button>
                    )}
                  </td>
                  Summ
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Correction Modal */}
      {correctionWorkDay && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Submit Time Correction</h2>
            <p className="text-xs text-slate-500 mb-4">
              Propose amendments for{' '}
              {new Date(correctionWorkDay.date).toLocaleDateString()}
            </p>

            <form onSubmit={handleSubmitCorrection} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Proposed Clock-In Time
                </label>
                <input
                  type="datetime-local"
                  required
                  value={proposedClockIn}
                  onChange={(e) => setProposedClockIn(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Proposed Clock-Out Time
                </label>
                <input
                  type="datetime-local"
                  required
                  value={proposedClockOut}
                  onChange={(e) => setProposedClockOut(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason for Adjustment
                </label>
                <textarea
                  required
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain punch discrepancy (e.g., Client on-site meeting without portal access)..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-ccp-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCorrectionWorkDay(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitCorrectionMutation.isPending}
                  className="px-5 py-2 bg-ccp-500 hover:bg-ccp-600 text-white text-sm font-bold rounded-lg transition shadow"
                >
                  {submitCorrectionMutation.isPending ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
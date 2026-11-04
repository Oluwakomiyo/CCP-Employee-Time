import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { FileEdit, } from 'lucide-react';

export const TimesheetsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [correctionWorkDay, setCorrectionWorkDay] = useState<any | null>(null);
  const [reason, setReason] = useState('');
  const [proposedClockIn, setProposedClockIn] = useState('');
  const [proposedClockOut, setProposedClockOut] = useState('');

  const { data: timesheets, isLoading } = useQuery({
    queryKey: ['timesheetsHistory'],
    queryFn: async () => {
      const res = await api.get('/time/history');
      return res.data.data.history;
    },
  });

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
              <th className="px-6 py-4">Total Work Time</th>
              <th className="px-6 py-4">Recorded Breaks</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {timesheets?.map((day: any) => {
              const hours = (day.totalWorkSeconds / 3600).toFixed(2);
              const breakMins = Math.round(day.totalBreakSeconds / 60);

              return (
                <tr key={day.id} className="hover:bg-slate-50/80 transition">
                  <td className="px-6 py-4 font-semibold text-slate-900">
                    {new Date(day.date).toLocaleDateString(undefined, {
                      weekday: 'short',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td className="px-6 py-4 font-mono font-bold text-slate-800">{hours} hrs</td>
                  <td className="px-6 py-4 text-slate-500">{breakMins} mins</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                        day.status === 'APPROVED'
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
                    <button
                      onClick={() => openCorrectionModal(day)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-ccp-700 hover:bg-ccp-50 border border-ccp-200 rounded-lg transition"
                    >
                      <FileEdit size={14} />
                      <span>Request Correction</span>
                    </button>
                  </td>
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
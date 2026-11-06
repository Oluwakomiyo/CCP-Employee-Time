import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ShieldCheck, Laptop, Clock, ListTodo } from 'lucide-react';

export const WorkEvidencePage: React.FC = () => {
  // Fetch all company timesheets with auto-refresh
  const { data: timesheets } = useQuery({
    queryKey: ['managementTimesheets'],
    queryFn: async () => {
      const res = await api.get('/time/history?all=true');
      return res.data.data.history || [];
    },
    refetchOnWindowFocus: true,
  });

  const [selectedDayId, setSelectedDayId] = useState<string>('');

  // Fetch neutral telemetry evidence for selected workday
  const { data: evidence } = useQuery({
    queryKey: ['workEvidence', selectedDayId],
    queryFn: async () => {
      if (!selectedDayId) return null;
      const res = await api.get(`/activity/workdays/${selectedDayId}/evidence`);
      return res.data.data;
    },
    enabled: !!selectedDayId,
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Work Activity & Telemetry Evidence</h1>
        <p className="text-sm text-slate-500">
          Neutral comparison between official recorded shifts and registered device activity (Sections 83–118).
        </p>
      </div>

      {/* Select WorkDay */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center gap-4">
        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider shrink-0">
          Select Shift Date:
        </label>
        <select
          value={selectedDayId}
          onChange={(e) => setSelectedDayId(e.target.value)}
          className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
        >
          <option value="">-- Choose a WorkDay to inspect evidence --</option>
          {timesheets?.map((ts: any) => (
            <option key={ts.id} value={ts.id}>
              {new Date(ts.date).toLocaleDateString()} - {ts.employee.firstName}{' '}
              {ts.employee.lastName} ({ts.status})
            </option>
          ))}
        </select>
      </div>

      {evidence && (
        <div className="space-y-6">
          {/* Neutral Status Banner */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-ccp-50 text-ccp-700 rounded-xl">
                <ShieldCheck size={28} />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-slate-400">
                  Verification Evaluation
                </div>
                <div className="text-lg font-bold text-slate-900">
                  Status:{' '}
                  <span
                    className={`font-black ${evidence.verification.status === 'NORMAL'
                      ? 'text-emerald-600'
                      : evidence.verification.status === 'SITE_WORK'
                        ? 'text-blue-600'
                        : 'text-amber-600'
                      }`}
                  >
                    {evidence.verification.status}
                  </span>
                </div>
              </div>
            </div>

            {evidence.verification.reviewNotes.length > 0 && (
              <div className="max-w-md text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
                {evidence.verification.reviewNotes.join(' ')}
              </div>
            )}
          </div>

          {/* Side-by-Side Facts Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 1. Official Clocked Time (Legal Attendance) */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800 border-b pb-3">
                <Clock size={18} className="text-ccp-600" />
                <span>Question 1: Official Time Record</span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Gross Clocked:</span>
                  <span className="font-mono font-bold">
                    {(evidence.officialTime.grossClockedSeconds / 3600).toFixed(2)} hrs
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Recorded Breaks:</span>
                  <span className="font-mono font-bold">
                    {Math.round(evidence.officialTime.recordedBreakSeconds / 60)} mins
                  </span>
                </div>
                <div className="flex justify-between border-t pt-2 text-base font-bold text-slate-900">
                  <span>Net Official Work:</span>
                  <span className="font-mono text-ccp-700">
                    {(evidence.officialTime.netClockedSeconds / 3600).toFixed(2)} hrs
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Measured Technical Signals (Activity Evidence) */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800 border-b pb-3">
                <Laptop size={18} className="text-slate-700" />
                <span>Question 2: Technical Activity Signals</span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Detected Device Activity:</span>
                  <span className="font-mono font-bold">
                    {(evidence.activityEvidence.detectedActiveSeconds / 3600).toFixed(2)} hrs
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Significant Idle (&gt;15m):</span>
                  <span className="font-mono font-bold">
                    {Math.round(evidence.activityEvidence.significantIdleSeconds / 60)} mins
                  </span>
                </div>
                <div className="flex justify-between border-t pt-2 text-xs text-slate-500">
                  <span>Registered Device:</span>
                  <span className="font-semibold text-slate-800">
                    {evidence.activityEvidence.registeredDevicesSeen[0] || 'Browser Client'}
                  </span>
                </div>
              </div>
            </div>
          </div>
          {/* 🔴 LOGGED TASKS & ACTIVITIES TIMELINE (Sections 98 & 101) */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <ListTodo size={18} className="text-ccp-600" />
                <span>Employee Task Activities ({evidence.context?.activityCount || 0})</span>
              </div>
              <span className="text-xs text-slate-400 font-semibold">
                Projects Worked: {evidence.context?.projectCount || 0}
              </span>
            </div>

            {(!evidence.context?.activities || evidence.context.activities.length === 0) ? (
              <div className="text-xs text-slate-400 italic py-3 text-center">
                No specific task activities logged for this shift.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {evidence.context.activities.map((act: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl flex items-start gap-2.5"
                  >
                    <span className="w-2 h-2 rounded-full bg-ccp-500 mt-1.5 shrink-0"></span>
                    <div className="text-xs">
                      <span className="font-bold text-slate-800">{act.title}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
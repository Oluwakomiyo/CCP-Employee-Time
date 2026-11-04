import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { FileCode2 } from 'lucide-react';

export const AuditLogsPage: React.FC = () => {
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [activeLogDiff, setActiveLogDiff] = useState<any | null>(null);

  const { data: logsData, isLoading } = useQuery({
    queryKey: ['auditLogs', selectedAction],
    queryFn: async () => {
      const url = selectedAction ? `/audit/logs?action=${selectedAction}` : '/audit/logs';
      const res = await api.get(url);
      return res.data.data;
    },
  });

  if (isLoading) return <div className="p-8 text-slate-500 font-medium">Loading audit trail...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">System Audit Trail</h1>
          <p className="text-sm text-slate-500">
            Immutable log of all administrative actions, shifts, corrections, and payroll calculations.
          </p>
        </div>

        {/* Action filter */}
        <select
          value={selectedAction}
          onChange={(e) => setSelectedAction(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white shrink-0 font-semibold"
        >
          <option value="">-- All Actions --</option>
          <option value="CLOCK_IN">CLOCK_IN</option>
          <option value="CLOCK_OUT">CLOCK_OUT</option>
          <option value="FORCE_CLOCK_OUT">FORCE_CLOCK_OUT (Auto-Close)</option>
          <option value="APPROVE_CORRECTION">APPROVE_CORRECTION</option>
          <option value="REJECT_CORRECTION">REJECT_CORRECTION</option>
          <option value="CREATE">CREATE</option>
          <option value="UPDATE">UPDATE</option>
          <option value="LOGIN">LOGIN</option>
          <option value="LOGOUT">LOGOUT</option>
        </select>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-700 text-xs uppercase font-bold border-b border-slate-200">
            <tr>
              <th className="px-6 py-4">Timestamp</th>
              <th className="px-6 py-4">Action</th>
              <th className="px-6 py-4">Entity</th>
              <th className="px-6 py-4">Actor</th>
              <th className="px-6 py-4 text-right">State Diff</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono text-xs">
            {logsData?.map((log: any) => (
              <tr key={log.id} className="hover:bg-slate-50/80 transition">
                <td className="px-6 py-4 text-slate-500 font-sans">
                  {new Date(log.timestamp).toLocaleString()}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                      log.action.includes('CLOCK')
                        ? 'bg-blue-50 text-blue-700'
                        : log.action.includes('APPROVE')
                        ? 'bg-emerald-50 text-emerald-700'
                        : log.action.includes('REJECT')
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {log.action}
                  </span>
                </td>
                <td className="px-6 py-4 text-slate-800 font-semibold">{log.entityName}</td>
                <td className="px-6 py-4 text-slate-600 font-sans">
                  {log.actor?.email || 'SYSTEM AUTOMATION'}
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => setActiveLogDiff(log)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-ccp-700 hover:bg-ccp-50 border border-ccp-200 rounded-lg transition"
                  >
                    <FileCode2 size={13} />
                    <span>Inspect</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* State Diff Modal */}
      {activeLogDiff && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Audit State Inspection</h2>
                <p className="text-xs text-slate-500">
                  Action: <b>{activeLogDiff.action}</b> on <b>{activeLogDiff.entityName}</b> ({activeLogDiff.entityId})
                </p>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {new Date(activeLogDiff.timestamp).toLocaleString()}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-bold uppercase text-slate-400 mb-1">Before State</div>
                <pre className="p-3 bg-slate-900 text-emerald-400 rounded-xl text-[11px] overflow-x-auto h-48">
                  {activeLogDiff.beforeState
                    ? JSON.stringify(activeLogDiff.beforeState, null, 2)
                    : 'null (Created)'}
                </pre>
              </div>
              <div>
                <div className="text-xs font-bold uppercase text-slate-400 mb-1">After State</div>
                <pre className="p-3 bg-slate-900 text-emerald-400 rounded-xl text-[11px] overflow-x-auto h-48">
                  {activeLogDiff.afterState
                    ? JSON.stringify(activeLogDiff.afterState, null, 2)
                    : 'null (Deleted)'}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setActiveLogDiff(null)}
                className="px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
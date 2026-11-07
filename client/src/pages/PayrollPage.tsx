import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ChevronDown, ChevronUp, FolderKanban } from 'lucide-react';

export const PayrollPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [periodStart, setPeriodStart] = useState('2026-09-01');
  const [periodEnd, setPeriodEnd] = useState('2026-09-30');
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);

  const { data: payroll, isLoading } = useQuery({
    queryKey: ['payrollRecords'],
    queryFn: async () => {
      const res = await api.get('/payroll');
      return res.data.data;
    },
  });

  const generateMutation = useMutation({
    mutationFn: () => api.post('/payroll/generate', { periodStart, periodEnd }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['payrollRecords'] });
      alert(res.data.message);
    },
  });

  if (isLoading) return <div className="p-8 text-slate-500 font-medium">Loading payroll...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Executive Payroll Console</h1>
          <p className="text-sm text-slate-500">
            Attendance-driven pay calculations with itemized project labor breakdowns.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="px-2 py-1 text-xs border rounded-lg"
          />
          <input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="px-2 py-1 text-xs border rounded-lg"
          />
          <button
            onClick={() => generateMutation.mutate()}
            className="px-4 py-2 bg-ccp-500 hover:bg-ccp-600 text-white text-xs font-bold rounded-lg shadow"
          >
            Generate Run
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden divide-y">
        {payroll?.map((rec: any) => {
          const isExpanded = expandedEmployeeId === rec.id;

          return (
            <div key={rec.id} className="p-5 hover:bg-slate-50 transition">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-900">
                    {rec.employee.firstName} {rec.employee.lastName}
                  </div>
                  <div className="text-xs text-slate-400 font-mono">{rec.employee.employeeCode}</div>
                </div>

                <div className="flex items-center gap-8">
                  <div className="text-right">
                    <div className="text-xs text-slate-500">Regular / Overtime</div>
                    <div className="font-mono text-xs font-bold text-slate-800">
                      {rec.regularHours}h / <span className="text-amber-600">{rec.overtimeHours}h</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs text-slate-500">Gross Pay</div>
                    <div className="font-mono text-base font-black text-ccp-700">
                      ${parseFloat(rec.grossPay).toFixed(2)} {rec.currency}
                    </div>
                  </div>

                  <button
                    onClick={() => setExpandedEmployeeId(isExpanded ? null : rec.id)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg border"
                  >
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
              </div>

              {/* Expandable Itemized Project Breakdown */}
              {isExpanded && (
                <div className="mt-4 pt-3 border-t bg-slate-50 p-3 rounded-xl space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <FolderKanban size={14} />
                    <span>Project Allocation Breakdown</span>
                  </div>

                  {rec.projectBreakdown?.map((p: any) => (
                    <div
                      key={p.projectCode}
                      className="flex items-center justify-between text-xs bg-white p-2 rounded border"
                    >
                      <span className="font-semibold text-slate-800">
                        {p.projectName} ({p.projectCode})
                      </span>
                      <span className="font-mono text-slate-600">{p.hours} hrs</span>
                      <span className="font-mono font-bold text-slate-900">${p.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
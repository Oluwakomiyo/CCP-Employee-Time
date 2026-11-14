"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export interface PayrollRecord {
  id: string;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  regularHours: string;
  overtimeHours: string;
  grossPay: string;
  currency: string;
  status: "DRAFT" | "FINALIZED";
  generatedAt: string;
  finalizedAt: string | null;
  employee: { id: string; employeeCode: string; firstName: string; lastName: string; department: string };
  projectBreakdown: { projectCode: string; projectName: string; hours: number; amount: number }[];
}

export interface Period {
  periodStart: string;
  periodEnd: string;
}

/** 409 UNRESOLVED_DAYS details from POST /payroll/finalize. */
export interface UnresolvedDay {
  date: string;
  status: string;
  employee: { id: string; employeeCode: string; firstName: string; lastName: string };
}

export const usePayroll = (period: Period) =>
  useQuery({
    queryKey: ["payroll", period],
    queryFn: () => api.page<PayrollRecord[]>(`/payroll?periodStart=${period.periodStart}&periodEnd=${period.periodEnd}&limit=100`),
    placeholderData: keepPreviousData,
  });

export const usePayrollMutations = () => {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["payroll"] });
  return {
    generate: useMutation({
      mutationFn: (p: Period) =>
        api.post<{ payrollRecords: PayrollRecord[]; skippedFinalized: number; daysWithoutRate: { employeeId: string; date: string }[] }>("/payroll/generate", p),
      onSettled: refresh,
    }),
    finalize: useMutation({ mutationFn: (p: Period) => api.post<{ finalized: number }>("/payroll/finalize", p), onSettled: refresh }),
  };
};

export const exportUrl = (p: Period) => `/api/v1/payroll/export?periodStart=${p.periodStart}&periodEnd=${p.periodEnd}`;

"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { Role } from "./types";
import type { ActivityType, LocationType } from "./time";

export type EmploymentStatus = "ACTIVE" | "INACTIVE" | "ON_LEAVE" | "TERMINATED";

export interface Rate {
  baseHourlyRate: string;
  overtimeHourlyRate: string;
  currency: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

/** GET /employees and GET /employees/:id. `compensation` is only present for the CEO. */
export interface Employee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  department: string;
  position: string;
  status: EmploymentStatus;
  hireDate: string;
  user: { id: string; email: string; role: Role; isActive: boolean; mustChangePassword?: boolean };
  compensation?: Rate | null;
  projectMemberships?: { id: string; isProjectLead: boolean; project: { id: string; code: string; name: string; isActive: boolean } }[];
}

export interface EmployeeReport {
  range: { from?: string; to?: string };
  totalWorkingHours: number;
  presenceHours: number;
  breakHours: number;
  validWorkingDays: number;
  averageDailyHours: number;
  projectsWorked: number;
  hoursByProject: { projectId: string; code: string; name: string; hours: number }[];
  hoursByActivity: { activityType: ActivityType; hours: number }[];
  hoursByLocation: { location: LocationType; hours: number }[];
  dailyHours: { date: string; hours: number }[];
  missingClockOuts: number;
  correctionRequests: Record<string, number>;
}

export interface Department {
  id: string;
  name: string;
  _count?: { employees: number };
}

export const ROLES: { value: Role; label: string }[] = [
  { value: "EMPLOYEE", label: "Employee" },
  { value: "PROJECT_MANAGER", label: "Project manager" },
  { value: "CEO_ADMIN", label: "CEO" },
];

export const fullName = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`;

export const formatMoney = (amount: string | number, currency = "NGN") =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(amount));

export const useEmployees = (opts: { search: string; status: EmploymentStatus | null; page: number; limit?: number }) =>
  useQuery({
    queryKey: ["employees", "list", opts],
    queryFn: () => {
      const p = new URLSearchParams({ page: String(opts.page), limit: String(opts.limit ?? 20), sort: "firstName", order: "asc" });
      if (opts.search.trim()) p.set("search", opts.search.trim());
      if (opts.status) p.set("status", opts.status);
      return api.page<Employee[]>(`/employees?${p.toString()}`);
    },
    placeholderData: keepPreviousData,
  });

export const useEmployee = (id: string) =>
  useQuery({ queryKey: ["employees", "one", id], queryFn: () => api.get<{ employee: Employee }>(`/employees/${id}`).then((d) => d.employee) });

export const useEmployeeReport = (id: string, from: string, to: string) =>
  useQuery({
    queryKey: ["management", "employee-report", id, from, to],
    queryFn: () => api.get<EmployeeReport>(`/management/employees/${id}/report?from=${from}&to=${to}`),
    placeholderData: keepPreviousData,
  });

export const useCompensation = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: ["employees", "compensation", id],
    queryFn: () => api.get<{ current: Rate | null; history: Rate[] }>(`/employees/${id}/compensation`),
    enabled,
  });

export const useDepartments = () => useQuery({ queryKey: ["departments"], queryFn: () => api.get<Department[]>("/departments") });

export interface EmployeeInput {
  email: string;
  role: Role;
  employeeCode: string;
  firstName: string;
  lastName: string;
  department: string;
  position: string;
  hireDate: string;
  compensation: { baseHourlyRate: number; overtimeHourlyRate: number; currency: string };
}

export const useEmployeeMutations = () => {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["employees"] });
  return {
    create: useMutation({
      mutationFn: (body: EmployeeInput) => api.post<{ employee: Employee; temporaryPassword: string }>("/employees", body),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: Partial<Omit<EmployeeInput, "compensation" | "role" | "hireDate">> & { status?: EmploymentStatus } }) =>
        api.patch<{ employee: Employee }>(`/employees/${id}`, body),
      onSuccess: refresh,
    }),
    deactivate: useMutation({ mutationFn: (id: string) => api.delete<unknown>(`/employees/${id}`), onSuccess: refresh }),
    resetPassword: useMutation({
      mutationFn: (id: string) => api.patch<{ temporaryPassword: string }>(`/employees/${id}/password`),
    }),
    changeRate: useMutation({
      mutationFn: ({ id, body }: { id: string; body: { baseHourlyRate: number; overtimeHourlyRate: number; currency: string; effectiveDate: string } }) =>
        api.put<unknown>(`/employees/${id}/compensation`, body),
      onSuccess: refresh,
    }),
  };
};

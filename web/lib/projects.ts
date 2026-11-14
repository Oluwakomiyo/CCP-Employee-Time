"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { ActivityType, LocationType } from "./time";

export type ProjectStatus = "PLANNED" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED";

export const PROJECT_STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: "PLANNED", label: "Planned" },
  { value: "ACTIVE", label: "Active" },
  { value: "ON_HOLD", label: "On hold" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];
export const STATUS_TONE = { PLANNED: "info", ACTIVE: "success", ON_HOLD: "warning", COMPLETED: "neutral", CANCELLED: "danger" } as const;

/** GET /projects (list rows). */
export interface ProjectRow {
  id: string;
  code: string;
  name: string;
  status: ProjectStatus;
  clientName: string | null;
  location: string | null;
  estimatedHours: string | null;
  startDate: string;
  endDate: string | null;
  _count: { members: number; workSegments: number };
  /** Net hours, all time. Management only; absent for employees. */
  hoursWorked?: number;
}

/** GET /management/projects/:id/report. Money fields are CEO only. */
export interface ProjectReport {
  project: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    clientName: string | null;
    location: string | null;
    status: ProjectStatus;
    startDate: string;
    endDate: string | null;
    estimatedHours: string | null;
  };
  assignedEmployees: { id: string; firstName: string; lastName: string; department: string; isProjectLead: boolean }[];
  currentWorkers: { employee: { id: string; firstName: string; lastName: string }; state: "WORKING" | "ON_BREAK"; since: string; location: LocationType }[];
  totalHours: number;
  estimatedHours: number | null;
  remainingEstimatedHours: number | null;
  overEstimate: boolean;
  overByHours: number;
  hoursByEmployee: { employeeId: string; employeeCode?: string; name: string; hours: number; labourCost?: number }[];
  hoursByActivity: { activityType: ActivityType; hours: number }[];
  hoursByLocation: { location: LocationType; hours: number }[];
  timeline: { date: string; hours: number }[];
  labourCost?: number;
}

export interface Estimate {
  basis: string;
  actualHoursToDate: number;
  estimatedHoursToDo: number;
  team: { employeeId: string; name: string; averageDailyHours: number; assumedDefault: boolean }[];
  teamDailyHours: number;
  estimatedWorkingDays: number | null;
  estimatedLabourCost?: number;
  note: string;
}

export interface ProjectInput {
  code?: string;
  name: string;
  description?: string;
  clientName?: string;
  location?: string;
  estimatedHours?: number | null;
  status: ProjectStatus;
  startDate: string;
  endDate?: string | null;
}

export const useProjects = (opts: { search: string; status: ProjectStatus | null; page: number; mine: boolean; limit?: number }) =>
  useQuery({
    queryKey: ["projects", "list", opts],
    queryFn: () => {
      const p = new URLSearchParams({ page: String(opts.page), limit: String(opts.limit ?? 20), sort: "code", order: "asc" });
      if (opts.search.trim()) p.set("search", opts.search.trim());
      if (opts.status) p.set("status", opts.status);
      if (opts.mine) p.set("mine", "true");
      return api.page<ProjectRow[]>(`/projects?${p.toString()}`);
    },
    placeholderData: keepPreviousData,
  });

export const useProjectReport = (id: string, from?: string, to?: string) =>
  useQuery({
    queryKey: ["management", "project-report", id, from ?? null, to ?? null],
    queryFn: () => {
      const p = new URLSearchParams();
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      const q = p.toString();
      return api.get<ProjectReport>(`/management/projects/${id}/report${q ? `?${q}` : ""}`);
    },
    placeholderData: keepPreviousData,
  });

export const useEstimate = (projectId: string, employeeIds: string[]) =>
  useQuery({
    queryKey: ["management", "estimate", projectId, [...employeeIds].sort()],
    queryFn: () => api.get<Estimate>(`/management/estimate?projectId=${projectId}&employeeIds=${employeeIds.join(",")}`),
    enabled: employeeIds.length > 0,
    placeholderData: keepPreviousData,
  });

export const useProjectMutations = () => {
  const qc = useQueryClient();
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["projects"] }), qc.invalidateQueries({ queryKey: ["management"] })]);
  return {
    create: useMutation({ mutationFn: (body: ProjectInput) => api.post<{ project: ProjectRow }>("/projects", body), onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: Partial<ProjectInput> }) => api.patch<{ project: ProjectRow }>(`/projects/${id}`, body),
      onSuccess: refresh,
    }),
    addMember: useMutation({
      mutationFn: ({ id, employeeId, isProjectLead }: { id: string; employeeId: string; isProjectLead: boolean }) =>
        api.post<unknown>(`/projects/${id}/members`, { employeeId, isProjectLead }),
      onSuccess: refresh,
    }),
    removeMember: useMutation({
      mutationFn: ({ id, employeeId }: { id: string; employeeId: string }) => api.delete<unknown>(`/projects/${id}/members/${employeeId}`),
      onSuccess: refresh,
    }),
  };
};

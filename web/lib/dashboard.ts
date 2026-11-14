"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { lagosDay } from "./history";

export interface DashboardCards {
  employeesWorkingToday: number;
  employeesOnBreak: number;
  employeesNotClockedIn: number;
  employeesFinished: number;
  totalHoursToday: number;
  activeProjects: number;
  missingClockOuts: number;
  pendingCorrections: number;
}

export interface ProjectHours {
  projectId: string;
  code: string;
  name: string;
  hours: number;
}

export interface EmployeeHours {
  employeeId: string;
  name: string;
  hours: number;
}

export interface DayHours {
  date: string;
  hours: number;
}

export interface KeyedHours {
  [key: string]: string | number;
  hours: number;
}

export interface EstimateVsActual {
  projectId: string;
  code: string;
  name: string;
  estimatedHours: number | null;
  actualHours: number;
}

export interface Dashboard {
  range: { from: string; to: string };
  cards: DashboardCards;
  charts: {
    hoursByProject: ProjectHours[];
    hoursByDepartment: KeyedHours[];
    hoursByEmployee: EmployeeHours[];
    hoursOverTime: DayHours[];
    locationDistribution: KeyedHours[];
    activityDistribution: KeyedHours[];
    estimatedVsActual: EstimateVsActual[];
  };
}

export type DashboardRange = "7" | "30" | "90";

/** Last `n` days ending today, as company dates. Mirrors the server default. */
export const rangeFor = (days: DashboardRange): { from: string; to: string } => {
  const now = new Date();
  const to = lagosDay(now);
  const from = lagosDay(new Date(now.getTime() - (Number(days) - 1) * 86_400_000));
  return { from, to };
};

export const dashboardKey = (from: string, to: string) => ["management", "dashboard", from, to] as const;

export const useDashboard = (from: string, to: string) =>
  useQuery({
    queryKey: dashboardKey(from, to),
    queryFn: () => api.get<Dashboard>(`/management/dashboard?from=${from}&to=${to}`),
  });

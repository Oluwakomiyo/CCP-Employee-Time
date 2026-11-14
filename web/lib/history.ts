"use client";

import { useQuery } from "@tanstack/react-query";
import { api, type PageMeta } from "./api";
import type { ActivityType, BreakType, DayStatus, LocationType } from "./time";

export interface HistoryBreak {
  id: string;
  breakType: BreakType;
  startTime: string;
  endTime: string | null;
  durationSeconds: number | null;
}

export interface HistoryActivity {
  id: string;
  activityType: ActivityType;
  notes: string | null;
  startTime: string;
  endTime: string | null;
}

export interface HistorySegment {
  id: string;
  projectId: string;
  location: LocationType;
  status: string;
  clockIn: string;
  clockOut: string | null;
  durationSeconds: number | null;
  project: { id: string; code: string; name: string };
  breaks: HistoryBreak[];
  activities: HistoryActivity[];
}

export interface WorkDay {
  id: string;
  date: string;
  status: DayStatus;
  totalWorkSeconds: number;
  totalBreakSeconds: number;
  segments: HistorySegment[];
}

export interface HistoryFilters {
  page: number;
  limit: number;
  startDate?: string;
  endDate?: string;
  projectId?: string;
  location?: LocationType | "";
}

const toQuery = (f: HistoryFilters) => {
  const p = new URLSearchParams({ page: String(f.page), limit: String(f.limit) });
  if (f.startDate) p.set("startDate", f.startDate);
  if (f.endDate) p.set("endDate", f.endDate);
  if (f.projectId) p.set("projectId", f.projectId);
  if (f.location) p.set("location", f.location);
  return p.toString();
};

export const historyKey = (f: HistoryFilters) => ["me", "time", f] as const;

export const useWorkHistory = (f: HistoryFilters) =>
  useQuery({
    queryKey: historyKey(f),
    queryFn: () => api.page<{ history: WorkDay[] }>(`/me/time?${toQuery(f)}`),
  });

export type HistoryPage = { data: { history: WorkDay[] }; meta?: PageMeta };

/** Net working time for a day: presence minus breaks (spec §30). */
export const netSeconds = (d: WorkDay) => Math.max(0, d.totalWorkSeconds - d.totalBreakSeconds);

/** Company date (YYYY-MM-DD) of a Date, in Africa/Lagos. */
export const lagosDay = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

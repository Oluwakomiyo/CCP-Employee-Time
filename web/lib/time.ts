"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

/** Enum values mirror server/prisma/schema.prisma. */
export type LocationType = "OFFICE" | "SITE" | "REMOTE" | "OTHER";
export type ActivityType = "DESIGN" | "CLIENT_MEETING" | "SITE_INSPECTION" | "DOCUMENTATION" | "DRAWING" | "ADMINISTRATION" | "OTHER";
export type BreakType = "LUNCH" | "SHORT_BREAK" | "OTHER";
export type DayStatus = "OPEN" | "COMPLETED" | "MISSING_CLOCK_OUT" | "CORRECTION_PENDING" | "CORRECTED";

export const LOCATIONS: { value: LocationType; label: string }[] = [
  { value: "OFFICE", label: "Office" },
  { value: "SITE", label: "Site" },
  { value: "REMOTE", label: "Remote" },
  { value: "OTHER", label: "Other" },
];
export const ACTIVITIES: { value: ActivityType; label: string }[] = [
  { value: "DESIGN", label: "Design" },
  { value: "DRAWING", label: "Drawing" },
  { value: "CLIENT_MEETING", label: "Client meeting" },
  { value: "SITE_INSPECTION", label: "Site inspection" },
  { value: "DOCUMENTATION", label: "Documentation" },
  { value: "ADMINISTRATION", label: "Administration" },
  { value: "OTHER", label: "Other" },
];
export const BREAKS: { value: BreakType; label: string }[] = [
  { value: "LUNCH", label: "Lunch" },
  { value: "SHORT_BREAK", label: "Short break" },
  { value: "OTHER", label: "Other" },
];
export const labelOf = <T extends string>(list: { value: T; label: string }[], v: T | null | undefined) =>
  list.find((o) => o.value === v)?.label ?? "";

/** GET /time/today (server/src/modules/time/time.service.ts statusIn). */
export interface TodayStatus {
  state: "NOT_WORKING" | "WORKING" | "ON_BREAK";
  today: { workDayId: string | null; status: DayStatus | null; presenceSeconds: number; breakSeconds: number; workingSeconds: number };
  activeSegment: null | {
    id: string;
    projectId: string;
    projectName: string;
    projectCode: string;
    location: LocationType;
    clockIn: string;
    elapsedSeconds: number;
    activity: null | { id: string; activityType: ActivityType; description: string | null; startTime: string };
    isOnBreak: boolean;
    activeBreak: null | { id: string; breakType: BreakType; startTime: string; breakElapsedSeconds: number };
  };
}

export interface ProjectOption {
  id: string;
  code: string;
  name: string;
}

export const todayKey = ["time", "today"] as const;

/** Polls every 15 s (spec: the clock stays honest across tabs and devices). */
export const useToday = () =>
  useQuery({ queryKey: todayKey, queryFn: () => api.get<TodayStatus>("/time/today"), refetchInterval: 15_000, staleTime: 0 });

/** Active projects the signed-in user is a member of (mine=true also scopes PMs and the CEO). */
export const useMyProjects = () =>
  useQuery({
    queryKey: ["projects", "mine", "active"],
    queryFn: () => api.get<ProjectOption[]>("/projects?mine=true&status=ACTIVE&limit=100&sort=name&order=asc"),
  });

/** Every punch-clock action. On success the today status is replaced with a fresh read. */
export const useTimeAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api.post<unknown>(`/time/${path}`, body ?? {}),
    onSettled: () => qc.invalidateQueries({ queryKey: todayKey }),
  });
};

/** Seconds since `since`, re-rendered every second while `running`. */
export const useTicker = (running: boolean) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  return now;
};

export const formatClock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export const formatHours = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
};

export const formatTime = (iso: string) =>
  new Intl.DateTimeFormat("en-NG", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" }).format(new Date(iso));

/** "1 Sept 2026" for a date-only value (YYYY-MM-DD or a UTC-midnight ISO). UTC so the day never shifts. */
export const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));

/** "ON_LEAVE" -> "On leave". */
export const sentenceCase = (value: string) => {
  const s = value.toLowerCase().replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

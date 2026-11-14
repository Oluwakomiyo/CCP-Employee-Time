"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { lagosDay } from "./history";
import type { DayStatus, LocationType } from "./time";

export type VerificationStatus = "NORMAL" | "SITE_WORK" | "MISSING_DATA" | "REVIEW";

export interface EvidenceSegment {
  id: string;
  clockIn: string;
  clockOut: string | null;
  location: LocationType;
  project: { id: string; code: string; name: string };
}

export interface EvidenceDay {
  id: string;
  date: string;
  status: DayStatus;
  segments: EvidenceSegment[];
}

export interface WorkEvidence {
  employee: { id: string; employeeCode: string; name: string; department: string };
  workDayId: string;
  date: string;
  officialTime: {
    clockedIn: string | null;
    clockedOut: string | null;
    grossClockedSeconds: number;
    recordedBreakSeconds: number;
    netClockedSeconds: number;
    locations: LocationType[];
  };
  activityEvidence: {
    heartbeatCount: number;
    detectedActiveSeconds: number;
    significantIdleSeconds: number;
    registeredDevicesSeen: string[];
    isDeviceAgentOnline: boolean;
  };
  context: { projectCount: number; activityCount: number; activities: { title: string }[] };
  verification: { status: VerificationStatus; reviewNotes: string[] };
}

export const useEvidenceDay = (employeeId: string, date: Date | undefined) => {
  const day = date ? lagosDay(date) : null;
  return useQuery({
    queryKey: ["management", "workday", employeeId, day],
    queryFn: () => api.get<{ workDay: EvidenceDay | null }>(`/management/employees/${employeeId}/workdays?date=${day}`),
    enabled: employeeId !== "" && day !== null,
  });
};

export const useEvidence = (workDayId: string | null) =>
  useQuery({
    queryKey: ["activity", "evidence", workDayId],
    queryFn: () => api.get<WorkEvidence>(`/activity/workdays/${workDayId}/evidence`),
    enabled: workDayId !== null,
  });

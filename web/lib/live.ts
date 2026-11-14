"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { ActivityType, LocationType } from "./time";

export type LiveState = "WORKING" | "ON_BREAK" | "FINISHED" | "NOT_STARTED";

export interface LiveRow {
  employee: { id: string; firstName: string; lastName: string; department: string; position: string };
  state: LiveState;
  project: { id: string; code: string; name: string } | null;
  location: LocationType | null;
  activity: ActivityType | null;
  breakType: string | null;
  since: string | null;
  segmentSeconds: number;
}

export const liveKey = ["management", "status"] as const;

/** Live board, polled every 15 s like the Today clock. */
export const useLiveStatus = () =>
  useQuery({
    queryKey: liveKey,
    queryFn: () => api.get<LiveRow[]>("/management/status"),
    refetchInterval: 15_000,
    staleTime: 0,
  });

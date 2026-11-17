"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type CorrectionStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface RequestedChanges {
  segmentId?: string;
  projectId?: string;
  proposedClockIn: string;
  proposedClockOut: string;
}

export interface Correction {
  id: string;
  workDayId: string;
  employeeId: string;
  reason: string;
  requestedChanges: RequestedChanges;
  status: CorrectionStatus;
  reviewNotes: string | null;
  createdAt: string;
  workDay: { id: string; date: string; status: string; totalWorkSeconds: number };
  reviewer?: { id: string; email: string; role: string } | null;
}

export const correctionsKey = (status: string | null, page: number) => ["corrections", "mine", status ?? "ALL", page] as const;

export const useCorrections = (status: CorrectionStatus | null, page: number) =>
  useQuery({
    queryKey: correctionsKey(status, page),
    queryFn: () => {
      const p = new URLSearchParams({ page: String(page), limit: "10", mine: "true" });
      if (status) p.set("status", status);
      return api.page<Correction[]>(`/corrections?${p.toString()}`);
    },
  });

export interface CorrectionPayload {
  workDayId: string;
  reason: string;
  requestedChanges: RequestedChanges;
}

/** Lagos wall-clock (date + HH:MM) to ISO. Shortcut: fixed +1 offset, Nigeria has no DST; upgrade to TZ math if policy changes. */
export const lagosToIso = (workDayDate: string, time: string) => {
  const [h, m] = time.split(":").map(Number);
  return new Date(new Date(workDayDate).getTime() + ((h ?? 0) * 60 + (m ?? 0) - 60) * 60_000).toISOString();
};

export const isoToTime = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Lagos" }).format(new Date(iso));

export const useCorrectionMutations = () => {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["corrections"] });
  return {
    create: useMutation({
      mutationFn: (body: CorrectionPayload) => api.post<{ correction: Correction }>("/corrections", body),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: Partial<CorrectionPayload> }) =>
        api.patch<{ correction: Correction }>(`/corrections/${id}`, body),
      onSuccess: refresh,
    }),
    cancel: useMutation({
      mutationFn: (id: string) => api.delete<{ correction: Correction }>(`/corrections/${id}`),
      onSuccess: refresh,
    }),
  };
};

/** A request as reviewers see it: the employee and the day's recorded entries come with it. */
export interface ReviewCorrection extends Correction {
  employee: { id: string; employeeCode: string; firstName: string; lastName: string; department: string };
  workDay: Correction["workDay"] & {
    segments: { id: string; clockIn: string; clockOut: string | null; status: string; location: string; project: { id: string; code: string; name: string } }[];
  };
}

export const useReviewQueue = (status: CorrectionStatus | null, page: number) =>
  useQuery({
    queryKey: ["corrections", "review", status ?? "ALL", page],
    queryFn: () => {
      const p = new URLSearchParams({ page: String(page), limit: "10" });
      if (status) p.set("status", status);
      return api.page<ReviewCorrection[]>(`/corrections?${p.toString()}`);
    },
  });

export const useReviewCorrection = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, reviewNotes }: { id: string; status: "APPROVED" | "REJECTED"; reviewNotes?: string }) =>
      api.patch<unknown>(`/corrections/${id}/review`, { status, reviewNotes }),
    // Refetch on any outcome: a 409 means someone else reviewed it first.
    onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: ["corrections"] }), qc.invalidateQueries({ queryKey: ["management"] })]),
  });
};

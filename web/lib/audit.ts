"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "./api";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "LOGIN"
  | "LOGOUT"
  | "CLOCK_IN"
  | "CLOCK_OUT"
  | "FORCE_CLOCK_OUT"
  | "APPROVE_CORRECTION"
  | "REJECT_CORRECTION";

export const AUDIT_ACTIONS: { value: AuditAction; label: string }[] = [
  { value: "CREATE", label: "Created" },
  { value: "UPDATE", label: "Updated" },
  { value: "DELETE", label: "Deleted" },
  { value: "LOGIN", label: "Signed in" },
  { value: "LOGOUT", label: "Signed out" },
  { value: "CLOCK_IN", label: "Clocked in" },
  { value: "CLOCK_OUT", label: "Clocked out" },
  { value: "FORCE_CLOCK_OUT", label: "Missing clock-out flagged" },
  { value: "APPROVE_CORRECTION", label: "Correction approved" },
  { value: "REJECT_CORRECTION", label: "Correction rejected" },
];

/** GET /audit/logs. Snapshots are scrubbed of password and token hashes on the server. */
export interface AuditEntry {
  id: string;
  action: AuditAction;
  entityName: string;
  entityId: string;
  beforeState: unknown;
  afterState: unknown;
  timestamp: string;
  actor: { id: string; email: string; employee: { firstName: string; lastName: string; employeeCode: string } | null } | null;
}

export const useAuditLog = (f: { action: string | null; from: string | null; to: string | null; page: number }) =>
  useQuery({
    queryKey: ["audit", f],
    queryFn: () => {
      const p = new URLSearchParams({ page: String(f.page), limit: "25" });
      if (f.action) p.set("action", f.action);
      if (f.from) p.set("startDate", f.from);
      if (f.to) p.set("endDate", f.to);
      return api.page<AuditEntry[]>(`/audit/logs?${p.toString()}`);
    },
    placeholderData: keepPreviousData,
  });

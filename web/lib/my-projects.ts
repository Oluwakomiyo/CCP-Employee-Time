"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { lagosDay } from "./history";

export interface MineProject {
  id: string;
  code: string;
  name: string;
  description: string | null;
  clientName: string | null;
  status: string;
  estimatedHours: string | number | null;
  members?: { isProjectLead: boolean; employee: { id: string; firstName: string; lastName: string } }[];
  _count?: { members: number; workSegments: number };
}

export interface HoursByProject {
  projectId: string;
  code: string;
  name: string;
  hours: number;
}

export interface MyReport {
  totalWorkingHours: number;
  validWorkingDays: number;
  averageDailyHours: number;
  projectsWorked: number;
  hoursByProject: HoursByProject[];
}

/** All projects the caller is a member of (mine=true also scopes PMs and the CEO). */
export const useMyProjectsFull = () =>
  useQuery({
    queryKey: ["projects", "mine", "full"],
    queryFn: () => api.get<MineProject[]>("/projects?mine=true&limit=100&sort=name&order=asc"),
  });

/** The employee's own hours by project over a range. No money is ever returned. */
export const useMyReport = (from?: string, to?: string) =>
  useQuery({
    queryKey: ["me", "report", from ?? null, to ?? null],
    queryFn: () => {
      const p = new URLSearchParams();
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      const q = p.toString();
      return api.get<MyReport>(`/me/report${q ? `?${q}` : ""}`);
    },
  });

export { lagosDay };

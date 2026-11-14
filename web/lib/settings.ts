"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export interface Device {
  id: string;
  deviceName: string;
  deviceIdentifier: string;
  platform: string;
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  employee: { id: string; employeeCode: string; firstName: string; lastName: string };
}

export const useDevices = () => useQuery({ queryKey: ["devices"], queryFn: () => api.get<Device[]>("/activity/devices") });

export const useSettingsMutations = () => {
  const qc = useQueryClient();
  const departments = () => qc.invalidateQueries({ queryKey: ["departments"] });
  const devices = () => qc.invalidateQueries({ queryKey: ["devices"] });
  return {
    addDepartment: useMutation({ mutationFn: (name: string) => api.post<unknown>("/departments", { name }), onSuccess: departments }),
    renameDepartment: useMutation({
      mutationFn: ({ id, name }: { id: string; name: string }) => api.patch<unknown>(`/departments/${id}`, { name }),
      // Renaming cascades to employees, so their cached rows are stale too.
      onSuccess: () => Promise.all([departments(), qc.invalidateQueries({ queryKey: ["employees"] })]),
    }),
    registerDevice: useMutation({
      mutationFn: (body: { employeeId: string; deviceName: string; deviceIdentifier: string; platform: string }) =>
        api.post<{ device: Pick<Device, "id" | "deviceName">; apiKey: string }>("/activity/devices", body),
      onSuccess: devices,
    }),
    revokeDevice: useMutation({ mutationFn: (id: string) => api.post<unknown>(`/activity/devices/${id}/revoke`), onSuccess: devices }),
  };
};

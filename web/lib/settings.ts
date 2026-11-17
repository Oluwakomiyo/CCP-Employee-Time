"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export interface Device {
  id: string;
  deviceName: string;
  deviceIdentifier: string;
  platform: string;
  isActive: boolean;
  /** SELF: added by the desktop app when its owner signed in; ADMIN: registered by hand. */
  enrolledBy: "ADMIN" | "SELF";
  lastSeenAt: string | null;
  createdAt: string;
  employee: { id: string; employeeCode: string; firstName: string; lastName: string };
}

export const useDevices = () => useQuery({ queryKey: ["devices"], queryFn: () => api.get<Device[]>("/activity/devices") });

export const useSettingsMutations = () => {
  const qc = useQueryClient();
  const devices = () => qc.invalidateQueries({ queryKey: ["devices"] });
  return {
    registerDevice: useMutation({
      mutationFn: (body: { employeeId: string; deviceName: string; deviceIdentifier: string; platform: string }) =>
        api.post<{ device: Pick<Device, "id" | "deviceName">; apiKey: string }>("/activity/devices", body),
      onSuccess: devices,
    }),
    revokeDevice: useMutation({ mutationFn: (id: string) => api.post<unknown>(`/activity/devices/${id}/revoke`), onSuccess: devices }),
    reinstateDevice: useMutation({ mutationFn: (id: string) => api.post<unknown>(`/activity/devices/${id}/reinstate`), onSuccess: devices }),
  };
};

/** Add and rename for the managed name lists (departments, positions). */
export const useNamedListMutations = (resource: "departments" | "positions") => {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: [resource] });
  return {
    add: useMutation({ mutationFn: (name: string) => api.post<unknown>(`/${resource}`, { name }), onSuccess: refresh }),
    rename: useMutation({
      mutationFn: ({ id, name }: { id: string; name: string }) => api.patch<unknown>(`/${resource}/${id}`, { name }),
      // Renaming cascades to employees, so their cached rows are stale too.
      onSuccess: () => Promise.all([refresh(), qc.invalidateQueries({ queryKey: ["employees"] })]),
    }),
  };
};

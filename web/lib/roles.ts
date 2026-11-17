"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { Grants, PermissionKey } from "./permissions";

export interface CatalogEntry {
  key: PermissionKey;
  module: string;
  label: string;
  scoped: boolean;
}

export interface AppRole {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  presetOf: "CEO_ADMIN" | "PROJECT_MANAGER" | "EMPLOYEE" | null;
  userCount: number;
  permissions: Grants;
}

export const useRoles = (enabled = true) => useQuery({ queryKey: ["roles"], queryFn: () => api.get<AppRole[]>("/roles"), enabled });
export const useCatalog = () => useQuery({ queryKey: ["roles", "catalog"], queryFn: () => api.get<CatalogEntry[]>("/roles/catalog"), staleTime: Infinity });

export const useRoleMutations = () => {
  const qc = useQueryClient();
  // A role change can change what the signed-in person may do, and the role names shown on people.
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["roles"] }),
      qc.invalidateQueries({ queryKey: ["me"] }),
      qc.invalidateQueries({ queryKey: ["employees"] }),
    ]);
  return {
    create: useMutation({
      mutationFn: (body: { name: string; description?: string; copyFrom?: string }) => api.post<AppRole>("/roles", body),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, ...body }: { id: string; name?: string; description?: string | null; permissions?: Grants }) => api.patch<AppRole>(`/roles/${id}`, body),
      onSuccess: refresh,
    }),
    reset: useMutation({ mutationFn: (id: string) => api.post<AppRole>(`/roles/${id}/reset`), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (id: string) => api.delete<{ id: string }>(`/roles/${id}`), onSuccess: refresh }),
    assign: useMutation({
      mutationFn: ({ employeeId, roleId }: { employeeId: string; roleId: string }) => api.put<unknown>(`/roles/assign/${employeeId}`, { roleId }),
      onSuccess: refresh,
    }),
  };
};

const SCOPE_WORD = { OWN: "their own", TEAM: "their team's", ALL: "everyone's" } as const;

/** One plain sentence of what a role can do, for the editor header. */
export const summarise = (grants: Grants, catalog: CatalogEntry[]) => {
  const on = catalog.filter((c) => grants[c.key]);
  if (on.length === 0) return "This role can't do anything yet. Switch on what it needs below.";
  const modules = [...new Set(on.map((c) => c.module))];
  const scopes = on.map((c) => grants[c.key]).filter((g): g is "OWN" | "TEAM" | "ALL" => g !== true);
  const widest = scopes.includes("ALL") ? "ALL" : scopes.includes("TEAM") ? "TEAM" : scopes.length ? "OWN" : null;
  return `${on.length} of ${catalog.length} permissions, across ${modules.join(", ").toLowerCase()}${widest ? `, seeing up to ${SCOPE_WORD[widest]} data` : ""}.`;
};

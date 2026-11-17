"use client";

import { can } from "./permissions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "./api";
import type { Me } from "./types";

export const meKey = ["me"] as const;

/** The signed-in user. Errors (401) mean signed out; the proxy and app layout handle redirects. */
export const useMe = () =>
  useQuery({
    queryKey: meKey,
    queryFn: () => api.get<{ user: Me }>("/auth/me").then((d) => d.user),
    staleTime: 5 * 60_000,
  });

export const useLogout = () => {
  const qc = useQueryClient();
  const router = useRouter();
  return async () => {
    await api.post("/auth/logout").catch(() => undefined); // Sign out locally even if the call fails.
    qc.clear();
    router.replace("/login");
  };
};

/** Where each role lands after signing in. */
/** Where someone lands: the overview if they can see it, otherwise the punch clock. Without the
 *  permission list (the login response), "/" decides once /auth/me has loaded. */
export const homeFor = (me: Pick<Me, "mustChangePassword" | "permissions">) =>
  me.mustChangePassword ? "/change-password" : !me.permissions ? "/" : can(me, "dashboard.view") ? "/dashboard" : "/today";

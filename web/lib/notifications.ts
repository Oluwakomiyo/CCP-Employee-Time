"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type NotificationType =
  | "MISSING_CLOCK_OUT"
  | "CORRECTION_SUBMITTED"
  | "CORRECTION_APPROVED"
  | "CORRECTION_REJECTED"
  | "PROJECT_ASSIGNED"
  | "ACCOUNT_CREATED"
  | "PASSWORD_RESET";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  data: { workDayId?: string; correctionId?: string; projectId?: string } | null;
  readAt: string | null;
  createdAt: string;
}

export const notificationsKey = ["me", "notifications"] as const;

/**
 * Inbox, polled every 60 s. The Arc panel counts unread from the items it is given, so load the
 * server's maximum page (its badge shows "9+" past nine anyway).
 */
export const useNotifications = () =>
  useQuery({
    queryKey: notificationsKey,
    queryFn: () => api.page<Notification[]>("/me/notifications?limit=100"),
    refetchInterval: 60_000,
    staleTime: 0,
  });

export const useNotificationMutations = () => {
  const qc = useQueryClient();
  return {
    markRead: useMutation({
      mutationFn: (id: string) => api.post(`/me/notifications/${id}/read`),
      onSettled: () => qc.invalidateQueries({ queryKey: notificationsKey }),
    }),
    markAllRead: useMutation({
      mutationFn: () => api.post("/me/notifications/read-all"),
      onSettled: () => qc.invalidateQueries({ queryKey: notificationsKey }),
    }),
  };
};

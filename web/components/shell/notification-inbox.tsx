"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { NotificationCenter, type NotificationItem } from "@/components/arc/notification-center/notification-center";
import { useNotificationMutations, useNotifications, type Notification, type NotificationType } from "@/lib/notifications";
import type { Role } from "@/lib/types";

const TONE: Record<NotificationType, "info" | "success" | "warning"> = {
  MISSING_CLOCK_OUT: "warning",
  CORRECTION_SUBMITTED: "info",
  CORRECTION_APPROVED: "success",
  CORRECTION_REJECTED: "warning",
  PROJECT_ASSIGNED: "info",
  ACCOUNT_CREATED: "info",
  PASSWORD_RESET: "info",
};

const whenOf = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  const time = new Intl.DateTimeFormat("en-NG", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" }).format(d);
  if (today) return time;
  const day = new Intl.DateTimeFormat("en-NG", { month: "short", day: "numeric", timeZone: "Africa/Lagos" }).format(d);
  return `${day}, ${time}`;
};

/** Where one notification leads. Correction reviews go to reviewers, everyone else to their own corrections. */
const targetFor = (n: Notification, role: Role): string | null => {
  const data = n.data ?? {};
  if (data.correctionId) return role === "EMPLOYEE" ? "/my-corrections" : "/corrections";
  if (data.workDayId) return `/my-corrections?workDayId=${data.workDayId}`;
  if (data.projectId) return "/my-projects";
  return null;
};

/** Bell in the top bar: polls the inbox, marks items read, deep-links from their payload. */
export function NotificationInbox({ role }: { role: Role }) {
  const router = useRouter();
  const inbox = useNotifications();
  const { markRead } = useNotificationMutations();
  // Mark-all-read fires one callback per item in a single loop; only a lone
  // mark-read navigates, so bulk actions never yank the user somewhere.
  const pendingTargets = useRef<string[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The panel keeps its own state; it only remounts when arrivals or read
  // states change the id set, so polls never disturb an open panel.
  const items = inbox.data?.data ?? [];

  const handleReadChange = (item: NotificationItem, read: boolean) => {
    if (!read) return; // No server-side unread; the panel keeps it local.
    const original = items.find((n) => n.id === item.id);
    if (!original) return;
    markRead.mutate(original.id);
    const target = targetFor(original, role);
    if (!target) return;
    pendingTargets.current.push(target);
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => {
      const targets = pendingTargets.current;
      pendingTargets.current = [];
      if (targets.length === 1 && targets[0]) router.push(targets[0]);
    }, 0);
  };

  return (
    <NotificationCenter
      key={items.map((n) => `${n.id}:${n.readAt ?? "unread"}`).join("|")}
      notifications={items.map((n) => ({
        id: n.id,
        title: n.title,
        description: n.body ?? undefined,
        time: whenOf(n.createdAt),
        read: n.readAt !== null,
        tone: TONE[n.type],
      }))}
      onReadChange={handleReadChange}
    />
  );
}

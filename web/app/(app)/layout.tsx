"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ShieldOff } from "lucide-react";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { AppShell } from "@/components/shell/app-shell";
import { routeFor } from "@/components/shell/nav";
import { useMe } from "@/lib/auth";

/** Signed-in area: loads the user, enforces the first-login password change, renders the shell. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: me, isPending, isError } = useMe();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isError) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (me?.mustChangePassword) router.replace("/change-password");
  }, [isError, me, pathname, router]);

  if (isPending || isError || !me || me.mustChangePassword) {
    return (
      <div style={{ padding: "var(--space-8)", maxWidth: 480 }}>
        <Skeleton label="Loading your workspace" lines={4} avatar />
      </div>
    );
  }

  const route = routeFor(pathname);
  const allowed = !route || route.roles.includes(me.role);

  return (
    <AppShell me={me}>
      {allowed ? (
        children
      ) : (
        <EmptyState
          icon={<ShieldOff size={24} strokeWidth={1.75} aria-hidden="true" />}
          title="You don't have access to this page"
          description="Ask your administrator if you think you should."
        />
      )}
    </AppShell>
  );
}

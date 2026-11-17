"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { useState } from "react";
import { UserMenu } from "@/components/arc/user-menu/user-menu";
import { BottomSheet } from "@/components/arc/bottom-sheet/bottom-sheet";
import { Button } from "@/components/arc/button/button";
import { useLogout } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import type { Me } from "@/lib/types";
import { NotificationInbox } from "./notification-inbox";
import { RateCalculator } from "@/components/rate-calculator/rate-calculator";
import { can } from "@/lib/permissions";
import { navFor, routeFor } from "./nav";
import styles from "./app-shell.module.css";


function NavLinks({ me, onNavigate }: { me: Me; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      {navFor(me).map((group) => (
        <div key={group.section} className={styles.section}>
          <span className={styles.sectionLabel}>{group.section}</span>
          {group.items.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link key={href} href={href} className={styles.link} aria-current={active ? "page" : undefined} onClick={onNavigate}>
                <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}

/** Sidebar on desktop, bottom sheet menu on phones, user menu (theme, profile, sign out) on top. */
export function AppShell({ me, children }: { me: Me; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useLogout();
  const { preference, setPreference } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const name = me.employee ? `${me.employee.firstName} ${me.employee.lastName}` : me.email;

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Main navigation">
        <Link href="/" className={styles.brand}>
          <span className={styles.logoTile}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ccp-logo.png" alt="" />
          </span>
          <span className={styles.brandText}>
            CCP Time
            <small>Time systems</small>
          </span>
        </Link>
        <div className={styles.identity}>
          <span className={styles.identityRole}>{me.roleInfo?.name}</span>
          <span className={styles.identityName}>{name}</span>
          {me.employee && <span className={styles.identityCode}>{me.employee.employeeCode}</span>}
        </div>
        <nav className={styles.nav}>
          <NavLinks me={me} />
        </nav>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <span className={styles.menuButton}>
              <BottomSheet
                title="Menu"
                open={menuOpen}
                onOpenChange={setMenuOpen}
                detents={[0.85]}
                trigger={
                  <Button variant="ghost" size="sm" aria-label="Open menu">
                    <Menu size={20} strokeWidth={1.75} aria-hidden="true" />
                  </Button>
                }
              >
                <nav className={styles.sheetNav}>
                  <NavLinks me={me} onNavigate={() => setMenuOpen(false)} />
                </nav>
              </BottomSheet>
            </span>
            <span className={styles.topbarTitle}>{routeFor(pathname)?.label ?? "CCP Time"}</span>
          </div>
          <div className={styles.topbarRight}>
            <NotificationInbox me={me} />
            <UserMenu
              user={{ name, email: me.email, plan: me.roleInfo?.name ?? "" }}
              theme={preference}
              onThemeChange={setPreference}
              items={[
                { label: "Profile", onSelect: () => router.push("/profile") },
                // The guide is a static page (public/help, built from USER_GUIDE.md); a new tab keeps the user's place.
                { label: "User guide", onSelect: () => window.open("/help", "_blank", "noopener") },
              ]}
              onSignOut={logout}
              showName
            />
          </div>
        </header>
        <main className={styles.content}>{children}</main>
      </div>
      {/* Money tool: only for people who may see pay (CEO / Admin by default). */}
      {can(me, "compensation.view") && <RateCalculator />}
    </div>
  );
}

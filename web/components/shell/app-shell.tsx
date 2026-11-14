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
import { navFor, routeFor } from "./nav";
import styles from "./app-shell.module.css";

const ROLE_LABEL = { CEO_ADMIN: "CEO / Admin", PROJECT_MANAGER: "Project manager", EMPLOYEE: "Employee" } as const;

function NavLinks({ me, onNavigate }: { me: Me; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      {navFor(me.role).map((group) => (
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ccp-logo.png" alt="" />
          CCP Time
        </Link>
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
          <UserMenu
            user={{ name, email: me.email, plan: ROLE_LABEL[me.role] }}
            theme={preference}
            onThemeChange={setPreference}
            items={[{ label: "Profile", onSelect: () => router.push("/profile") }]}
            onSignOut={logout}
            showName
          />
        </header>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}

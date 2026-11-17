import { Block } from "@/components/loading/skeleton-block";
import shell from "./app-shell.module.css";
import styles from "./shell-skeleton.module.css";

/**
 * Placeholder for the app shell while the signed-in user loads. Reuses the
 * shell's own classes (same 900px breakpoint). The brand is static, so it is
 * drawn for real; the identity card and the "My work" links (which every role
 * has) are blocks. The content area stays empty: each page draws its own
 * skeleton next, and two skeleton stages in a row would read as a flicker.
 */
export function ShellSkeleton() {
  return (
    <div className={shell.shell} role="status" aria-label="Loading your workspace" aria-busy="true">
      <aside className={`${shell.sidebar} ${styles.onInk}`} aria-hidden="true">
        <div className={shell.brand}>
          <span className={shell.logoTile}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ccp-logo.png" alt="" />
          </span>
          <span className={shell.brandText}>
            CCP Time
            <small>Time systems</small>
          </span>
        </div>
        <div className={shell.identity}>
          <Block width="5rem" height="0.875rem" index={0} />
          <Block width="8rem" height="1.125rem" index={1} />
          <Block width="4rem" height="0.875rem" index={2} />
        </div>
        <nav className={shell.nav}>
          <div className={shell.section}>
            <span className={shell.sectionLabel}>
              <Block width="4rem" height="0.875rem" index={3} />
            </span>
            {[0, 1, 2, 3].map((l) => (
              <span className={shell.link} key={l}>
                <Block width={18} height={18} index={4 + l} />
                <Block width={`${[6, 7, 6.5, 6][l]}rem`} height="1rem" index={4 + l} />
              </span>
            ))}
          </div>
        </nav>
      </aside>
      <div className={shell.main} aria-hidden="true">
        <header className={shell.topbar}>
          <div className={shell.topbarLeft}>
            <span className={shell.menuButton}>
              <Block width="2.5rem" height="2.5rem" index={9} />
            </span>
            <span className={shell.topbarTitle}>
              <Block width="7rem" height="1.3125rem" radius="0.375rem" index={10} />
            </span>
          </div>
          <div className={shell.topbarRight}>
            {/* Notification bell, then the user menu (avatar + name). */}
            <Block width={40} height={40} radius="var(--radius-control)" index={11} />
            <Block shape="pill" width="8.5rem" height={36} index={12} />
          </div>
        </header>
      </div>
    </div>
  );
}

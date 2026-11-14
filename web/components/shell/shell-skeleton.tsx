import { Block } from "@/components/loading/skeleton-block";
import shell from "./app-shell.module.css";
import heading from "./page-heading.module.css";
import styles from "./shell-skeleton.module.css";

/**
 * Placeholder for the whole app shell while the user loads. Reuses the shell's
 * own grid, sidebar, topbar and content classes, so the 900px breakpoint
 * (sidebar hidden, menu button shown) matches the real shell exactly.
 */
export function ShellSkeleton() {
  return (
    <div className={shell.shell} role="status" aria-label="Loading your workspace" aria-busy="true">
      <aside className={shell.sidebar} aria-hidden="true">
        <div className={shell.brand}>
          <Block shape="circle" width={32} height={32} index={0} />
          <Block width="6rem" height="1.5rem" radius="0.375rem" index={1} />
        </div>
        <nav className={shell.nav}>
          {[0, 1].map((s) => (
            <div className={shell.section} key={s}>
              <span className={shell.sectionLabel}>
                <Block width="4rem" height="1.0625rem" radius="0.375rem" index={2 + s} />
              </span>
              {[0, 1, 2].map((l) => (
                <span className={shell.link} key={l}>
                  <Block width="100%" height="1.125rem" radius="0.375rem" index={3 + s * 3 + l} />
                </span>
              ))}
            </div>
          ))}
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
          <Block shape="circle" width={32} height={32} index={11} />
        </header>
        <main className={shell.content}>
          <div className={heading.heading}>
            <div className={heading.text}>
              <Block width="12rem" height="calc(var(--text-3xl) * 1.1)" radius="0.5rem" index={12} />
              <Block width="18rem" height="1.3125rem" radius="0.375rem" index={13} />
            </div>
          </div>
          <div className={styles.lines}>
            <Block width="100%" height="1.3125rem" radius="0.375rem" index={14} />
            <Block width="85%" height="1.3125rem" radius="0.375rem" index={15} />
            <Block width="60%" height="1.3125rem" radius="0.375rem" index={16} />
          </div>
        </main>
      </div>
    </div>
  );
}

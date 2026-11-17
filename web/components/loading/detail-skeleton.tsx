import { Block } from "./skeleton-block";
import heading from "@/components/shell/page-heading.module.css";
import styles from "@/app/(app)/manage.module.css";

/**
 * Placeholder for a detail page (employee, project): back link, the page heading
 * (optional XL avatar, title, description, badges, action button), the tab bar,
 * a row of MetricCards and the first details card. Keeps an h1 placeholder slot
 * so the page never jumps when the real heading arrives.
 */
export function DetailSkeleton({ label, avatar, tabs, kpis }: { label: string; avatar?: boolean; tabs: number; kpis: number }) {
  return (
    <div className={styles.layout} role="status" aria-label={label} aria-busy="true">
      <span aria-hidden="true">
        <Block width="8rem" height="1.125rem" index={0} />
      </span>
      <div className={heading.heading} aria-hidden="true" style={{ marginBottom: 0 }}>
        <div className={heading.identity}>
          {avatar && <Block shape="circle" width={64} height={64} index={1} />}
          <div className={heading.text}>
            <Block width="14rem" height="calc(var(--text-3xl) * 1.1)" radius="0.5rem" index={2} />
            <Block width="18rem" height="1.3125rem" index={3} />
            <span style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-1)" }}>
              <Block shape="pill" width="4.5rem" height={24} index={4} />
              <Block shape="pill" width="5.5rem" height={24} index={5} />
            </span>
          </div>
        </div>
        <Block width="5rem" height="var(--control-height-md)" index={6} />
      </div>
      <span style={{ display: "flex", gap: "var(--space-1)" }} aria-hidden="true">
        {Array.from({ length: tabs }, (_, i) => (
          <Block key={i} width="6rem" height="var(--control-height-sm)" index={7 + i} />
        ))}
      </span>
      <div className={styles.kpis} aria-hidden="true">
        {Array.from({ length: kpis }, (_, i) => (
          <div key={i} className={styles.card} style={{ minHeight: 147 }}>
            <Block width="6rem" height="1.125rem" index={12 + i} />
            <Block width="4rem" height="2.25rem" index={12 + i} />
            <Block width="7rem" height="1.125rem" index={12 + i} />
          </div>
        ))}
      </div>
      <div className={styles.card} aria-hidden="true">
        <Block width="6rem" height="1.5rem" index={17} />
        {[0, 1, 2].map((i) => (
          <Block key={i} width={i === 2 ? "60%" : "100%"} height="2.5rem" index={18 + i} />
        ))}
      </div>
    </div>
  );
}

/** Just the KPI row, reserved while a secondary report loads so it does not pop in. */
export function KpiRowSkeleton({ count }: { count: number }) {
  return (
    <div className={styles.kpis} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.card} style={{ minHeight: 147 }}>
          <Block width="6rem" height="1.125rem" index={i} />
          <Block width="4rem" height="2.25rem" index={i} />
          <Block width="7rem" height="1.125rem" index={i} />
        </div>
      ))}
    </div>
  );
}

import { Block } from "@/components/loading/skeleton-block";
import styles from "@/app/(app)/manage.module.css";

/**
 * Placeholder for a report: optional 4 MetricCards (employee report), then the three
 * HoursList cards (heading + rows) in the same grid2 as the real report.
 */
export function ReportSkeleton({ kpis, label }: { kpis: boolean; label: string }) {
  return (
    <div className={styles.layout} role="status" aria-label={label} aria-busy="true">
      {kpis && (
        <div className={styles.kpis} aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={styles.card} style={{ minHeight: 147 }}>
              <Block width="6rem" height="1.125rem" index={i * 3} />
              <Block width="4rem" height="2.25rem" index={i * 3 + 1} />
              <Block width="7rem" height="1.125rem" index={i * 3 + 2} />
            </div>
          ))}
        </div>
      )}
      <div className={styles.grid2} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className={styles.card}>
            <Block width="6rem" height="1.4rem" radius="0.375rem" index={12 + i * 5} />
            {[0, 1, 2, 3].map((r) => (
              <span key={r} style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)" }}>
                <Block width={r % 2 ? "55%" : "70%"} height="1.3125rem" index={13 + i * 5 + r} />
                <Block width="3rem" height="1.3125rem" index={13 + i * 5 + r} />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

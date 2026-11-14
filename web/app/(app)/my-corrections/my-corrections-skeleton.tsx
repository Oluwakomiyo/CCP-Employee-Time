import { Block } from "@/components/loading/skeleton-block";
import { TableSkeleton } from "@/components/loading/table-skeleton";
import styles from "./my-corrections.module.css";

/**
 * Placeholder for the corrections list while it loads. Reuses the real
 * toolbar and table wrap; the table shows 5 of up to 10 rows.
 */
export function MyCorrectionsSkeleton() {
  return (
    <div className={styles.layout} role="status" aria-label="Loading corrections" aria-busy="true">
      <div className={styles.toolbar} aria-hidden="true">
        <span className={styles.segmentSkeleton}>
          <Block width="5rem" height="1.125rem" radius="0.25rem" index={0} />
          <span className={styles.segmentRow}>
            {[0, 1, 2, 3].map((i) => (
              <Block key={i} width="4.5rem" height="var(--control-height-sm)" shape="pill" index={1 + i} />
            ))}
          </span>
        </span>
        <Block width="9rem" height="var(--control-height-md)" index={5} />
      </div>
      <div className={styles.tableWrap}>
        <TableSkeleton
          rows={5}
          columns={[{ grow: 0.7 }, { grow: 1.6 }, { grow: 1.4 }, { grow: 0.8, pill: true }, { grow: 1 }, { grow: 0.9 }]}
        />
      </div>
    </div>
  );
}

/**
 * Placeholder for the correction form inside its dialog while workdays load.
 * Reuses the real form layout with one block per field.
 */
export function CorrectionFormSkeleton() {
  return (
    <div className={styles.form} role="status" aria-label="Loading workdays" aria-busy="true">
      <Block width="100%" height="var(--control-height-md)" index={0} />
      <Block width="100%" height="var(--control-height-md)" shape="pill" index={1} />
      <Block width="100%" height="var(--control-height-md)" index={2} />
      <Block width="100%" height="var(--control-height-md)" index={3} />
      <Block width="100%" height="4.5rem" index={4} />
      <Block width="9rem" height="var(--control-height-md)" index={5} />
    </div>
  );
}

import { Block } from "@/components/loading/skeleton-block";
import { TableSkeleton } from "@/components/loading/table-skeleton";
import styles from "./my-corrections.module.css";

/**
 * Placeholder for the corrections list on first load only (filter and page
 * changes keep the old rows, dimmed). Toolbar, then a 10-row table.
 */
export function MyCorrectionsSkeleton() {
  return (
    <div className={styles.layout} role="status" aria-label="Loading corrections" aria-busy="true">
      <div className={styles.toolbar} aria-hidden="true">
        {/* One segmented track (its label is screen-reader only, so no label bar). */}
        <Block width="19rem" height="calc(var(--control-height-sm) + 4px)" radius="var(--radius-control)" index={0} />
        <Block width="9rem" height="var(--control-height-md)" index={5} />
      </div>
      <div className={styles.tableWrap}>
        <TableSkeleton
          rows={10}
          columns={[{ grow: 0.7 }, { grow: 1.6 }, { grow: 1.4 }, { grow: 0.8, pill: true }, { grow: 1 }, { grow: 0.9, kind: "button" }]}
        />
      </div>
    </div>
  );
}

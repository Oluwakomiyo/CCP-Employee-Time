import { Block } from "./skeleton-block";
import styles from "./table-skeleton.module.css";

export interface TableSkeletonColumn {
  /** Proportional track width. Defaults to 1. */
  grow?: number;
  /** Renders a 24px badge pill instead of a text bar (status columns). */
  pill?: boolean;
}

export interface TableSkeletonProps {
  columns: TableSkeletonColumn[];
  /** Visible placeholder rows. Page-size aware screens pass their limit; tall lists pass fewer and note it. */
  rows?: number;
  /** Accessible label. Omit when nested inside another status container. */
  label?: string;
}

/**
 * Placeholder for an Arc SortableDataTable: 44px header strip, 52px rows,
 * same padding, gaps and dividers. At the table's own 620px breakpoint the
 * header folds into a strip of sort pills and rows into two-line stacks.
 */
export function TableSkeleton({ columns, rows = 6, label }: TableSkeletonProps) {
  return (
    <div className={styles.table} {...(label ? { role: "status", "aria-label": label, "aria-busy": true } : { "aria-hidden": true })}>
      <div className={styles.head} aria-hidden="true">
        {columns.map((c, i) => (
          <span key={i} className={styles.cell} style={{ flexGrow: c.grow ?? 1, flexBasis: 0 }}>
            <Block index={i} width={c.pill ? "3.5rem" : "60%"} height={c.pill ? 24 : "1.125rem"} shape={c.pill ? "pill" : "bar"} />
          </span>
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div className={styles.row} key={r} aria-hidden="true">
          {columns.map((c, i) => (
            <span key={i} className={styles.cell} style={{ flexGrow: c.grow ?? 1, flexBasis: 0 }}>
              <Block index={r + i} width={c.pill ? "4.5rem" : r % 3 === 2 && i === columns.length - 1 ? "55%" : "90%"} height={c.pill ? 24 : "1.125rem"} shape={c.pill ? "pill" : "bar"} />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

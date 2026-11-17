import { Block } from "./skeleton-block";
import styles from "./table-skeleton.module.css";

export interface TableSkeletonColumn {
  /** Proportional track width. Defaults to 1. */
  grow?: number;
  /** Renders a 24px badge pill instead of a text bar (status columns). */
  pill?: boolean;
  /** Cell shape matching the real cell: avatar + two lines, two lines, a small button, or a progress bar. */
  kind?: "text" | "avatar" | "twoLine" | "button" | "progress";
}

function Cell({ c, r, i, last }: { c: TableSkeletonColumn; r: number; i: number; last: boolean }) {
  const index = r + i;
  if (c.pill) return <Block index={index} width="4.5rem" height={24} shape="pill" />;
  switch (c.kind) {
    case "avatar":
      return (
        <span className={styles.stack} style={{ flexDirection: "row", alignItems: "center", gap: "var(--space-3)" }}>
          <Block index={index} width={32} height={32} shape="circle" />
          <span className={styles.stack}>
            <Block index={index} width="7rem" height="0.95rem" />
            <Block index={index + 1} width="9rem" height="0.8rem" />
          </span>
        </span>
      );
    case "twoLine":
      return (
        <span className={styles.stack}>
          <Block index={index} width="80%" height="0.95rem" />
          <Block index={index + 1} width="55%" height="0.8rem" />
        </span>
      );
    case "button":
      return <Block index={index} width="4.5rem" height="var(--control-height-sm)" radius="var(--radius-control)" />;
    case "progress":
      return (
        <span className={styles.stack}>
          <Block index={index} width="90%" height={6} shape="pill" />
          <Block index={index + 1} width="50%" height="0.8rem" />
        </span>
      );
    default:
      return <Block index={index} width={r % 3 === 2 && last ? "55%" : "90%"} height="1.125rem" />;
  }
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
export function TableSkeleton({ columns, rows = 6, label, tall }: TableSkeletonProps & { tall?: boolean }) {
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
        <div className={`${styles.row} ${tall ? styles.tall : ""}`} key={r} aria-hidden="true">
          {columns.map((c, i) => (
            <span key={i} className={styles.cell} style={{ flexGrow: c.grow ?? 1, flexBasis: 0 }}>
              <Cell c={c} r={r} i={i} last={i === columns.length - 1} />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

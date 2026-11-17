import { Block } from "@/components/loading/skeleton-block";
import { TableSkeleton } from "@/components/loading/table-skeleton";
import styles from "./my-time.module.css";

/**
 * Placeholder for the work history on first load only (later filter and page
 * changes keep the old rows, dimmed). Mirrors the date row, the filter toolbar
 * row, the 10-row table and the detail section. The
 * timeline rows are plain marker-plus-lines approximations of the Arc
 * timeline, since its internal CSS cannot be reused.
 */
export function MyTimeSkeleton() {
  return (
    <div className={styles.layout} role="status" aria-label="Loading work history" aria-busy="true">
      {/* Date range on its own row, then the filter toolbar row, as in the real page. */}
      <div className={styles.filters} aria-hidden="true">
        <Block width="15rem" height="var(--control-height-md)" index={0} />
      </div>
      <div aria-hidden="true">
        <Block width="6.5rem" height="var(--control-height-sm)" shape="pill" index={2} />
      </div>
      <div className={styles.tableWrap}>
        <TableSkeleton
          rows={10}
          columns={[{ grow: 1 }, { grow: 0.9, pill: true }, { grow: 1.6 }, { grow: 0.8 }, { grow: 0.8 }, { grow: 0.6, kind: "button" }]}
        />
      </div>
      <section className={styles.detail} aria-hidden="true">
        <div className={styles.detailHead}>
          <Block width="9rem" height="1.5rem" radius="0.375rem" index={20} />
          <Block shape="pill" width="6rem" height={24} index={21} />
        </div>
        <Block width="16rem" height="1.3125rem" radius="0.375rem" index={22} />
        <div className={styles.timelineSkeleton}>
          {[0, 1, 2].map((i) => (
            <div className={styles.timelineRow} key={i}>
              <Block shape="circle" width={28} height={28} index={23 + i * 2} />
              <span className={styles.timelineLines}>
                <Block width="70%" height="1.3125rem" radius="0.375rem" index={24 + i * 2} />
                <Block width="40%" height="1.125rem" radius="0.25rem" index={25 + i * 2} />
              </span>
            </div>
          ))}
        </div>
        <Block width="11rem" height="1.3125rem" radius="0.375rem" index={30} />
      </section>
    </div>
  );
}

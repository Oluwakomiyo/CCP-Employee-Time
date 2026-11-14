import { Block } from "@/components/loading/skeleton-block";
import styles from "./today.module.css";

/**
 * Placeholder for the punch clock while today's status loads. Reuses the real
 * panel, state row, timer, stats and actions layout, so the swap to live
 * content keeps the same boxes. Mirrors the working state (timer running);
 * the start form and on-break variants differ and are noted as approximations.
 */
export function TodaySkeleton() {
  return (
    <div className={styles.layout} role="status" aria-label="Loading today" aria-busy="true">
      <section className={styles.panel} aria-hidden="true">
        <div className={styles.stateRow}>
          <Block width="9rem" height="1.75rem" radius="0.375rem" index={0} />
          <Block shape="pill" width="6rem" height={24} index={1} />
        </div>
        <Block width="100%" height="clamp(2.75rem, 10vw, 4.5rem)" radius="0.75rem" index={2} />
        <dl className={styles.stats}>
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <dt>
                <Block width="4rem" height="1.125rem" radius="0.25rem" index={3 + i * 2} />
              </dt>
              <dd>
                <Block width="5rem" height="1.3125rem" radius="0.25rem" index={4 + i * 2} />
              </dd>
            </div>
          ))}
        </dl>
        <dl className={styles.context}>
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <dt>
                <Block width="4rem" height="1.125rem" radius="0.25rem" index={9 + i * 2} />
              </dt>
              <dd>
                <Block width="7rem" height="1.3125rem" radius="0.25rem" index={10 + i * 2} />
              </dd>
            </div>
          ))}
        </dl>
        <div className={styles.actions}>
          <Block width="10rem" height="var(--control-height-md)" index={15} />
          <Block width="12rem" height="var(--control-height-md)" index={16} />
          <Block shape="pill" width="9rem" height="var(--control-height-md)" index={17} />
        </div>
      </section>
    </div>
  );
}

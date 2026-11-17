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
      <section className={styles.clock} aria-hidden="true">
        <div className={styles.stateRow}>
          <Block shape="pill" width={40} height={40} index={0} />
          <Block width="11rem" height="2.5rem" radius="0.375rem" index={1} />
        </div>
        <Block width="100%" height="clamp(2.75rem, 10vw, 4.5rem)" radius="0.75rem" index={2} />
        <dl className={styles.stats}>
          {[0, 1].map((i) => (
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
      </section>
      <section className={styles.panel} aria-hidden="true">
        <Block width="7rem" height="1.5rem" radius="0.25rem" index={8} />
        <div className={styles.entry}>
          {[0, 1, 2].map((i) => (
            <Block key={i} width="9rem" height="2.5rem" radius="0.375rem" index={9 + i} />
          ))}
        </div>
        <div className={styles.actions}>
          <Block width="14rem" height="var(--control-height-md)" index={15} />
          <Block shape="pill" width="10rem" height="var(--control-height-md)" index={16} />
        </div>
      </section>
    </div>
  );
}

import { Block } from "@/components/loading/skeleton-block";
import styles from "./today.module.css";

/**
 * Punch clock placeholder. The clock card is identical in every state, so it is
 * mirrored exactly. The second card mirrors "Start your day" (project select,
 * location + activity row, "Add a note", Clock in), the usual state on a cold load.
 */
export function TodaySkeleton() {
  const field = (index: number, label = "6rem") => (
    <span className={styles.field}>
      <Block width={label} height="1.125rem" radius="0.25rem" index={index} />
      <Block width="100%" height="var(--control-height-md)" index={index + 1} />
    </span>
  );
  return (
    <div className={styles.layout} role="status" aria-label="Loading the punch clock" aria-busy="true">
      <section className={styles.clock} aria-hidden="true">
        <div className={styles.stateRow}>
          <Block shape="circle" width={40} height={40} index={0} />
          <span className={styles.stateText}>
            <Block width="11rem" height="1.4rem" radius="0.375rem" index={1} />
            <Block width="15rem" height="1.125rem" radius="0.25rem" index={2} style={{ marginTop: 4 }} />
          </span>
        </div>
        <Block width="15rem" height="clamp(3rem, 11vw, 5rem)" radius="0.75rem" index={3} />
        <dl className={styles.stats}>
          {[0, 1].map((i) => (
            <div key={i}>
              <dt>
                <Block width="6rem" height="1.125rem" radius="0.25rem" index={4 + i * 2} />
              </dt>
              <dd>
                <Block width="5rem" height="1.5rem" radius="0.25rem" index={5 + i * 2} />
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section className={styles.panel} aria-hidden="true">
        <Block width="7rem" height="1.5rem" radius="0.25rem" index={8} />
        <div className={styles.form}>
          {field(9, "4rem")}
          <div className={styles.twoUp}>
            {field(11, "10rem")}
            {field(13, "9rem")}
          </div>
          <Block width="7rem" height="var(--control-height-sm)" index={15} />
          <Block width="100%" height="var(--control-height-md)" index={16} />
        </div>
      </section>
    </div>
  );
}

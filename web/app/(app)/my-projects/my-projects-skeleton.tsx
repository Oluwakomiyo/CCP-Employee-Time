import { Block } from "@/components/loading/skeleton-block";
import surface from "@/components/loading/skeleton-block.module.css";
import styles from "./my-projects.module.css";

/**
 * Placeholder for the projects grid while projects and the report load.
 * Reuses the real summary grid and card grid; cards use the Card tokens
 * (border, radius-panel, space-5 padding) without mounting Card itself,
 * since Card requires string titles.
 */
export function MyProjectsSkeleton() {
  return (
    <div className={styles.layout} role="status" aria-label="Loading projects" aria-busy="true">
      <Block width="12rem" height="var(--control-height-md)" index={0} />
      <dl className={styles.summary} aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div className={styles.stat} key={i}>
            <dt>
              <Block width="4.5rem" height="1.125rem" radius="0.25rem" index={1 + i * 2} />
            </dt>
            <dd>
              <Block width="3rem" height="1.75rem" radius="0.375rem" index={2 + i * 2} />
            </dd>
          </div>
        ))}
      </dl>
      <div className={styles.grid} aria-hidden="true">
        {[0, 1].map((c) => (
          <div className={surface.surfaceCard} key={c}>
            <Block width="70%" height="1.4rem" radius="0.375rem" index={9 + c * 5} />
            <Block width="45%" height="1.125rem" radius="0.25rem" index={10 + c * 5} />
            <div className={styles.cardBody}>
              <Block width="8rem" height="1.3125rem" radius="0.375rem" index={11 + c * 5} />
              <span className={styles.progressSkeleton}>
                <Block width="9rem" height="1.125rem" radius="0.25rem" index={12 + c * 5} />
                <Block width="100%" height={7} radius="99px" index={13 + c * 5} />
              </span>
            </div>
            {/* Card footer: byline (team size, then "Led by ...") and the status badge. */}
            <span className={styles.cardFoot}>
              <span className={styles.progressSkeleton}>
                <Block width="6rem" height="1.125rem" radius="0.25rem" index={14 + c * 5} />
                <Block width="9rem" height="1.125rem" radius="0.25rem" index={15 + c * 5} />
              </span>
              <Block shape="pill" width="4rem" height={24} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

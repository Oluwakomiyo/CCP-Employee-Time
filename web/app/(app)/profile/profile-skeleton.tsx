import { Block } from "@/components/loading/skeleton-block";
import surface from "@/components/loading/skeleton-block.module.css";
import styles from "./profile.module.css";

/**
 * Placeholder for the profile while the user loads. Reuses the real layout,
 * details grid and form spacing; cards use the shared skeleton surface
 * (same frame as the Arc card).
 */
export function ProfileSkeleton() {
  return (
    <div className={styles.layout} role="status" aria-label="Loading profile" aria-busy="true">
      <div className={surface.surfaceCard} aria-hidden="true">
        <Block width="10rem" height="1.4rem" radius="0.375rem" index={0} />
        <Block width="12rem" height="1.3125rem" radius="0.25rem" index={1} />
        <dl className={styles.details}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <dt>
                <Block width="4.5rem" height="1.125rem" radius="0.25rem" index={2 + i * 2} />
              </dt>
              <dd>
                <Block width="6rem" height="1.3125rem" radius="0.25rem" index={3 + i * 2} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div className={surface.surfaceCard} aria-hidden="true">
        <Block width="9rem" height="1.4rem" radius="0.375rem" index={10} />
        <Block width="14rem" height="1.3125rem" radius="0.25rem" index={11} />
        <div className={styles.form}>
          <Block width="100%" height="var(--control-height-md)" index={12} />
          <Block width="100%" height="var(--control-height-md)" index={13} />
          <Block width="100%" height="var(--control-height-md)" index={14} />
          <Block width="8rem" height="var(--control-height-md)" index={15} />
        </div>
      </div>
    </div>
  );
}

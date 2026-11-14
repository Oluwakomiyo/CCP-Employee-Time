import styles from "./page-heading.module.css";

/**
 * The one h1 per page, an optional one-line description and the page's actions.
 * `leading` sits before the title (an avatar on a person's page); `meta` sits under the description (status badges).
 */
export function PageHeading({
  title,
  description,
  actions,
  leading,
  meta,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  leading?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <div className={styles.heading}>
      <div className={styles.identity}>
        {leading}
        <div className={styles.text}>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
          {meta && <div className={styles.meta}>{meta}</div>}
        </div>
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}

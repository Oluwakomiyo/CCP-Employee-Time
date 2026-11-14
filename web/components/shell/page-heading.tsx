import styles from "./page-heading.module.css";

/** The one h1 per page, an optional one-line description and the page's actions. */
export function PageHeading({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className={styles.heading}>
      <div className={styles.text}>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}

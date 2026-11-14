import styles from "@/app/(app)/manage.module.css";

export interface HoursItem {
  key: string;
  label: string;
  hours: number;
  extra?: string;
}

/** Hours grouped under one heading, as used on the report tabs and the Reports screen. */
export function HoursList({ title, items, emptyMessage }: { title: string; items: HoursItem[]; emptyMessage?: string }) {
  return (
    <section className={styles.card} aria-label={title}>
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className={styles.hint}>{emptyMessage ?? "No hours in this range."}</p>
      ) : (
        <ul className={styles.list}>
          {items.map((i) => (
            <li key={i.key}>
              <span>{i.label}</span>
              <span className={styles.muted}>
                {i.hours}h{i.extra ? ` · ${i.extra}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

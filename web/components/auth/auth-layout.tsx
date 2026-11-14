import styles from "./auth-layout.module.css";

/** Centered single-column layout for signed-out screens. */
export function AuthLayout({ title, subtitle, children, footnote }: { title: string; subtitle: string; children: React.ReactNode; footnote?: string }) {
  return (
    <main className={styles.page}>
      <div className={styles.panel}>
        <div className={styles.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ccp-logo.png" alt="" />
          <span className={styles.brandName}>CCP Time</span>
        </div>
        <div className={styles.heading}>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {children}
        {footnote && <p className={styles.footnote}>{footnote}</p>}
      </div>
    </main>
  );
}

export const formClass = styles.form;

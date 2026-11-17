import type { CSSProperties } from "react";
import styles from "./spinner.module.css";

export interface SpinnerProps {
  /** What is loading, for screen readers (and shown when `showLabel`). */
  label: string;
  showLabel?: boolean;
  size?: number;
  /** ms before it appears; fast loads never flash a spinner. 0 shows at once. */
  delay?: number;
  /** Centre it in its container with some breathing room (empty card or dialog). */
  center?: boolean;
}

/**
 * For waits inside a frame that is already on screen: small lists, dialogs, tabs,
 * refetches. Big first loads use a skeleton instead (see progress.md, loading rules).
 */
export function Spinner({ label, showLabel = false, size = 16, delay = 250, center = false }: SpinnerProps) {
  const spinner = (
    <span role="status" className={`${styles.wrap} ${delay ? styles.delayed : ""}`} style={{ "--delay": `${delay}ms` } as CSSProperties}>
      <span className={styles.ring} style={{ width: size, height: size }} aria-hidden="true" />
      <span className={showLabel ? undefined : styles.visuallyHidden}>{label}</span>
    </span>
  );
  return center ? <div className={styles.center}>{spinner}</div> : spinner;
}

/** Toolbar cue while a list refetches with its previous rows still showing. */
export function InlineBusy({ active, label = "Updating" }: { active: boolean; label?: string }) {
  return active ? <Spinner label={label} showLabel size={14} /> : null;
}

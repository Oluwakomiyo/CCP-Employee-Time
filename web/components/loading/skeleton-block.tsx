import type { CSSProperties } from "react";
import styles from "./skeleton-block.module.css";

export type BlockShape = "bar" | "pill" | "circle";

export interface BlockProps {
  /** bar (default), pill (fully rounded ends) or circle. */
  shape?: BlockShape;
  width?: string | number;
  height?: string | number;
  /** Overrides the shape's radius. Accepts any CSS radius or token. */
  radius?: string;
  /** Stagger position for the pulse wave. Blocks sharing a parent count up from 0. */
  index?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * One pulsing placeholder bar. Always aria-hidden: the owning skeleton carries
 * role="status" with the accessible label. Sizes come from the caller, usually
 * the same tokens as the element it stands in for (control heights, text sizes).
 */
export function Block({ shape = "bar", width, height, radius, index = 0, className, style }: BlockProps) {
  return (
    <span
      aria-hidden="true"
      className={[styles.block, shape === "pill" ? styles.pill : shape === "circle" ? styles.circle : undefined, className]
        .filter(Boolean)
        .join(" ")}
      style={{ width, height, ...(radius ? { "--radius": radius } : {}), "--index": index, ...style } as CSSProperties}
    />
  );
}

import type { Metadata } from "next";
import { PageHeading } from "@/components/shell/page-heading";
import { TodayClock } from "./today-clock";
import styles from "./today.module.css";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <div className={styles.page}>
      <PageHeading title="Today" description="Start work, switch project, location or activity, and take breaks." />
      <TodayClock />
    </div>
  );
}

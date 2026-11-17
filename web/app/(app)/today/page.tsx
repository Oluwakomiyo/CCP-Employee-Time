import type { Metadata } from "next";
import { PageHeading } from "@/components/shell/page-heading";
import { TodayClock } from "./today-clock";
import styles from "./today.module.css";

export const metadata: Metadata = { title: "Punch clock" };

export default function TodayPage() {
  return (
    <div className={styles.page}>
      <PageHeading title="Punch clock" description="Clock in, take breaks and clock out. Everything you record here becomes your timesheet." />
      <TodayClock />
    </div>
  );
}

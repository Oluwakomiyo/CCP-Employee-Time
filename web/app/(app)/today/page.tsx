import type { Metadata } from "next";
import { PageHeading } from "@/components/shell/page-heading";
import { TodayClock } from "./today-clock";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <>
      <PageHeading title="Today" description="Start work, switch project, location or activity, and take breaks." />
      <TodayClock />
    </>
  );
}

import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return <ComingSoon title="Today" description="Start work, switch project, location or activity, and take breaks." />;
}

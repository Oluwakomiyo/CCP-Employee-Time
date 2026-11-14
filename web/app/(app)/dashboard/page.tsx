import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return <ComingSoon title="Dashboard" description="Who's working, hours today and where time is going." />;
}

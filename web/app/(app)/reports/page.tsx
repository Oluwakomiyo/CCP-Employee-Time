import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return <ComingSoon title="Reports" description="Employee and project reports, and duration estimates." />;
}

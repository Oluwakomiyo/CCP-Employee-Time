import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Payroll" };

export default function PayrollPage() {
  return <ComingSoon title="Payroll" description="Generate, finalize and export pay runs." />;
}

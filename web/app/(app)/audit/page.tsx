import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Audit log" };

export default function AuditPage() {
  return <ComingSoon title="Audit log" description="Who changed what, and when." />;
}

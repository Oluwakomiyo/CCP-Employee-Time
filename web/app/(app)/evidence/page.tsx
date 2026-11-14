import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Work evidence" };

export default function EvidencePage() {
  return <ComingSoon title="Work evidence" description="Recorded time next to device activity, without judgement." />;
}

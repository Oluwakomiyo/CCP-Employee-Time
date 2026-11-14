import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Corrections" };

export default function CorrectionsPage() {
  return <ComingSoon title="Corrections" description="Review requests to change recorded time." />;
}

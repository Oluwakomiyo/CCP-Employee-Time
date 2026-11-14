import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "My corrections" };

export default function MyCorrectionsPage() {
  return <ComingSoon title="My corrections" description="Ask for a fix to your recorded time and track the answer." />;
}

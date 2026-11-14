import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Live status" };

export default function LivePage() {
  return <ComingSoon title="Live status" description="Everyone's current state, updated every 15 seconds." />;
}

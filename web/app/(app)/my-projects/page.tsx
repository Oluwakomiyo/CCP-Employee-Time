import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "My projects" };

export default function MyProjectsPage() {
  return <ComingSoon title="My projects" description="Projects you're assigned to and your hours on each." />;
}

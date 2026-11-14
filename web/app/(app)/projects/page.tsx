import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage() {
  return <ComingSoon title="Projects" description="Projects, teams, estimates and progress." />;
}

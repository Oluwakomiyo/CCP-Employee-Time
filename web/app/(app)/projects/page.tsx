import type { Metadata } from "next";
import { PageHeading } from "@/components/shell/page-heading";
import { ProjectList } from "./project-list";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage() {
  return (
    <>
      <PageHeading title="Projects" description="Status, team and hours against each estimate." />
      <ProjectList />
    </>
  );
}

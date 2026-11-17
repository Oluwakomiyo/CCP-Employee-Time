import type { Metadata } from "next";
import { PageHeading } from "@/components/shell/page-heading";
import { ProjectList } from "./project-list";

export const metadata: Metadata = { title: "Projects & teams" };

export default function ProjectsPage() {
  return (
    <>
      <PageHeading title="Projects & teams" description="Each project, who is on it, and hours used against the estimate." />
      <ProjectList />
    </>
  );
}

import type { Metadata } from "next";
import { PageHeading } from "@/components/shell/page-heading";
import { MyProjectsList } from "./my-projects-list";

export const metadata: Metadata = { title: "My projects" };

export default function MyProjectsPage() {
  return (
    <>
      <PageHeading title="My projects" description="Projects you're assigned to and your hours on each." />
      <MyProjectsList />
    </>
  );
}

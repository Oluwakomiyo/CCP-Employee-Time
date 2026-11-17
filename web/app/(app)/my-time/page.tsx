import type { Metadata } from "next";
import { PageHeading } from "@/components/shell/page-heading";
import { MyTimeList } from "./my-time-list";

export const metadata: Metadata = { title: "My timesheets" };

export default function MyTimePage() {
  return (
    <>
      <PageHeading title="My timesheets" description="Every day you worked: when you clocked in and out, your breaks and the projects you worked on." />
      <MyTimeList />
    </>
  );
}

import type { Metadata } from "next";
import { PageHeading } from "@/components/shell/page-heading";
import { ReportsView } from "./reports-view";

export const metadata: Metadata = { title: "Hours reports" };

export default function ReportsPage() {
  return (
    <>
      <PageHeading title="Hours reports" description="Hours by employee or by project, for any range." />
      <ReportsView />
    </>
  );
}

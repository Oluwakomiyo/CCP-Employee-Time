import type { Metadata } from "next";
import { PageHeading } from "@/components/shell/page-heading";
import { DashboardView } from "./dashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <>
      <PageHeading title="Dashboard" description="Who is working, hours today and where time is going." />
      <DashboardView />
    </>
  );
}

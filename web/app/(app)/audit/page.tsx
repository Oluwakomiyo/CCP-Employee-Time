import type { Metadata } from "next";
import { PageHeading } from "@/components/shell/page-heading";
import { AuditLog } from "./audit-log";

export const metadata: Metadata = { title: "Change history" };

export default function AuditPage() {
  return (
    <>
      <PageHeading title="Change history" description="Every change, who made it and what it looked like before and after. Entries can't be edited or deleted." />
      <AuditLog />
    </>
  );
}

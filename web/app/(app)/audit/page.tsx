import type { Metadata } from "next";
import { PageHeading } from "@/components/shell/page-heading";
import { AuditLog } from "./audit-log";

export const metadata: Metadata = { title: "Audit log" };

export default function AuditPage() {
  return (
    <>
      <PageHeading title="Audit log" description="Every change, who made it and what it looked like before and after. Entries can't be edited or deleted." />
      <AuditLog />
    </>
  );
}

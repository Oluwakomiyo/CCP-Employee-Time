import type { Metadata } from "next";
import { PageHeading } from "@/components/shell/page-heading";
import { PayrollView } from "./payroll-view";

export const metadata: Metadata = { title: "Payroll" };

export default function PayrollPage() {
  return (
    <>
      <PageHeading title="Payroll" description="Pay from approved hours, each day priced at the rate in force that day." />
      <PayrollView />
    </>
  );
}

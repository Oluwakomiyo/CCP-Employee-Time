import type { Metadata } from "next";
import { PageHeading } from "@/components/shell/page-heading";
import { EmployeeList } from "./employee-list";

export const metadata: Metadata = { title: "Employee directory" };

export default function EmployeesPage() {
  return (
    <>
      <PageHeading title="Employee directory" description="Everyone at CCP, their role and their department." />
      <EmployeeList />
    </>
  );
}

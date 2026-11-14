import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Employees" };

export default function EmployeesPage() {
  return <ComingSoon title="Employees" description="Staff, roles, projects and pay rates." />;
}

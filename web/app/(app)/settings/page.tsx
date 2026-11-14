import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return <ComingSoon title="Settings" description="Departments, devices and company settings." />;
}

import type { Metadata } from "next";
import { PageHeading } from "@/components/shell/page-heading";
import { SettingsView } from "./settings-view";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeading title="Settings" description="Departments and positions for the employee form, and the desktop devices allowed to report activity." />
      <SettingsView />
    </>
  );
}

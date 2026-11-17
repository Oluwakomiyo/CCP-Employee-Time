import type { Metadata } from "next";
import { PageHeading } from "@/components/shell/page-heading";
import { RolesView } from "./roles-view";

export const metadata: Metadata = { title: "Roles & permissions" };

export default function RolesPage() {
  return (
    <>
      <PageHeading
        title="Roles & permissions"
        description="Decide what each role can see and do. The three built-in roles start from sensible defaults; change them, or create roles of your own."
      />
      <RolesView />
    </>
  );
}

import type { Metadata } from "next";
import { PageHeading } from "@/components/shell/page-heading";
import { EvidenceView } from "./evidence-view";

export const metadata: Metadata = { title: "Work evidence" };

export default function EvidencePage() {
  return (
    <>
      <PageHeading title="Work evidence" description="Recorded time next to device activity, stated plainly." />
      <EvidenceView />
    </>
  );
}

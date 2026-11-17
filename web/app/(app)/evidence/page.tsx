import type { Metadata } from "next";
import { PageHeading } from "@/components/shell/page-heading";
import { EvidenceView } from "./evidence-view";

export const metadata: Metadata = { title: "Hours vs activity" };

export default function EvidencePage() {
  return (
    <>
      <PageHeading title="Hours vs activity" description="Compare the hours someone clocked with what their work computer recorded." />
      <EvidenceView />
    </>
  );
}

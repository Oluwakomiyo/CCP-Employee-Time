import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeading } from "@/components/shell/page-heading";
import { MyCorrectionsList } from "./my-corrections-list";

export const metadata: Metadata = { title: "My corrections" };

export default function MyCorrectionsPage() {
  return (
    <>
      <PageHeading title="My corrections" description="Ask for a fix to your recorded time and track the answer." />
      <Suspense>
        <MyCorrectionsList />
      </Suspense>
    </>
  );
}

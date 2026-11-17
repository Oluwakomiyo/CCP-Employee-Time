import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeading } from "@/components/shell/page-heading";
import { MyCorrectionsList } from "./my-corrections-list";

export const metadata: Metadata = { title: "Fix my hours" };

export default function MyCorrectionsPage() {
  return (
    <>
      <PageHeading title="Fix my hours" description="Forgot to clock out or picked the wrong project? Ask for a fix here and see the answer." />
      <Suspense>
        <MyCorrectionsList />
      </Suspense>
    </>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeading } from "@/components/shell/page-heading";
import { ReviewQueue } from "./review-queue";

export const metadata: Metadata = { title: "Corrections" };

export default function CorrectionsPage() {
  return (
    <>
      <PageHeading title="Corrections" description="Review time corrections from the people you manage." />
      <Suspense>
        <ReviewQueue />
      </Suspense>
    </>
  );
}

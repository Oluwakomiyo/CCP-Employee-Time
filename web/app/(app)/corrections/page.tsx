import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeading } from "@/components/shell/page-heading";
import { ReviewQueue } from "./review-queue";

export const metadata: Metadata = { title: "Approve hour fixes" };

export default function CorrectionsPage() {
  return (
    <>
      <PageHeading title="Approve hour fixes" description="Requests from your team to fix their recorded hours. Approve or reject each one." />
      <Suspense>
        <ReviewQueue />
      </Suspense>
    </>
  );
}

import type { Metadata } from "next";
import { PageHeading } from "@/components/shell/page-heading";
import { LiveBoard } from "./live-board";

export const metadata: Metadata = { title: "Live status" };

export default function LivePage() {
  return (
    <>
      <PageHeading title="Live status" description="Everyone's current state, updated every 15 seconds." />
      <LiveBoard />
    </>
  );
}

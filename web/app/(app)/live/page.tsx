import type { Metadata } from "next";
import { PageHeading } from "@/components/shell/page-heading";
import { LiveBoard } from "./live-board";

export const metadata: Metadata = { title: "Who's working now" };

export default function LivePage() {
  return (
    <>
      <PageHeading title="Who's working now" description="Who is clocked in, on a break or away right now. Updates every 15 seconds." />
      <LiveBoard />
    </>
  );
}

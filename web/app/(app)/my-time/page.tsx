import type { Metadata } from "next";
import { PageHeading } from "@/components/shell/page-heading";
import { MyTimeList } from "./my-time-list";

export const metadata: Metadata = { title: "My time" };

export default function MyTimePage() {
  return (
    <>
      <PageHeading title="My time" description="Your recorded workdays, segments and breaks." />
      <MyTimeList />
    </>
  );
}

import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "My time" };

export default function MyTimePage() {
  return <ComingSoon title="My time" description="Your recorded workdays, segments and breaks." />;
}

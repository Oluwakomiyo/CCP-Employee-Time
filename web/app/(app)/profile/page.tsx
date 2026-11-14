import type { Metadata } from "next";
import { PageHeading } from "@/components/shell/page-heading";
import { ProfileDetails } from "./profile-details";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <>
      <PageHeading title="Profile" description="Your details and password." />
      <ProfileDetails />
    </>
  );
}

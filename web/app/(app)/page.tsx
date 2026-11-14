"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { homeFor, useMe } from "@/lib/auth";

/** "/" sends each role to its home screen. */
export default function Home() {
  const { data: me } = useMe();
  const router = useRouter();
  useEffect(() => {
    if (me) router.replace(homeFor(me));
  }, [me, router]);
  return null;
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { Spinner } from "@/components/loading/spinner";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <Suspense fallback={<Spinner label="Loading sign in" center />}>
      <LoginForm />
    </Suspense>
  );
}

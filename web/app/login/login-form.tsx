"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/arc/input/input";
import { PasswordField } from "@/components/arc/password-field/password-field";
import { Button } from "@/components/arc/button/button";
import { Alert } from "@/components/arc/alert/alert";
import { AuthLayout, formClass } from "@/components/auth/auth-layout";
import { api, errorMessage } from "@/lib/api";
import { homeFor, meKey } from "@/lib/auth";
import type { Me } from "@/lib/types";

/** Only same-site relative paths are allowed as a post-login destination. */
const safeNext = (next: string | null) => (next && next.startsWith("/") && !next.startsWith("//") ? next : null);

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const { user } = await api.post<{ user: Me }>("/auth/login", { email, password });
      qc.setQueryData(meKey, user);
      router.replace(user.mustChangePassword ? "/change-password" : (safeNext(params.get("next")) ?? homeFor(user)));
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <AuthLayout title="Sign in" subtitle="Use the email and password from your administrator." footnote="Forgot your password? Ask your administrator to reset it.">
      <form className={formClass} onSubmit={onSubmit} noValidate>
        {error && <Alert tone="danger" title="Couldn't sign you in">{error}</Alert>}
        <Input label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <PasswordField label="Password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" variant="primary" size="lg" loading={pending} disabled={!email || !password}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}

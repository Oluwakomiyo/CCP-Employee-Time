"use client";

import { Spinner } from "@/components/loading/spinner";
import { KeyRound, LogOut } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { PasswordField } from "@/components/arc/password-field/password-field";
import { PasswordStrength, type PasswordRule } from "@/components/arc/password-strength/password-strength";
import { Button } from "@/components/arc/button/button";
import { Alert } from "@/components/arc/alert/alert";
import { AuthLayout, formClass } from "@/components/auth/auth-layout";
import { api, errorMessage } from "@/lib/api";
import { homeFor, meKey, useLogout, useMe } from "@/lib/auth";
import type { Me } from "@/lib/types";

// Same rules the API enforces (server/src/modules/auth/auth.schema.ts: passwordRule).
export const RULES: PasswordRule[] = [
  { id: "length", label: "At least 10 characters", test: (p) => p.length >= 10, remaining: (p) => Math.max(0, 10 - p.length) },
  { id: "letter", label: "A letter", test: (p) => /[A-Za-z]/.test(p) },
  { id: "number", label: "A number", test: (p) => /[0-9]/.test(p) },
];

export function ChangePasswordForm() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me, isPending: meLoading } = useMe();
  const logout = useLogout();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const meetsRules = RULES.every((r) => r.test(next));
  const mismatch = confirm.length > 0 && confirm !== next;
  const forced = me?.mustChangePassword ?? true;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api.post("/auth/change-password", { currentPassword: current, newPassword: next });
      // Fetch fresh: the cached user still says mustChangePassword.
      const { user } = await api.get<{ user: Me }>("/auth/me");
      qc.setQueryData(meKey, user);
      router.replace(homeFor(user));
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  // Until we know whether this change is forced, the copy and the "Sign out" button would flip.
  if (meLoading) return <Spinner label="Loading" center />;

  return (
    <AuthLayout
      title={forced ? "Choose your password" : "Change password"}
      subtitle={forced ? "Your account uses a temporary password. Set your own to continue." : "Enter your current password, then a new one."}
    >
      <form className={formClass} onSubmit={onSubmit} noValidate>
        {error && <Alert tone="danger" title="Password not changed">{error}</Alert>}
        <PasswordField
          label={forced ? "Temporary password" : "Current password"}
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <PasswordStrength label="New password" autoComplete="new-password" rules={RULES} value={next} onValueChange={(v) => setNext(v)} />
        <PasswordField
          label="Confirm new password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          description={mismatch ? "The passwords don't match." : undefined}
          aria-invalid={mismatch || undefined}
        />
        <Button type="submit" variant="primary" size="lg" loading={pending} disabled={!current || !meetsRules || confirm !== next}>
          <KeyRound size={16} aria-hidden="true" /> Save password
        </Button>
        {forced && (
          <Button type="button" variant="ghost" onClick={logout}>
            <LogOut size={16} aria-hidden="true" /> Sign out
          </Button>
        )}
      </form>
    </AuthLayout>
  );
}

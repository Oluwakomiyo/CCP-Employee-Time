"use client";

import { KeyRound, RotateCw } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import { Card } from "@/components/arc/card/card";
import { PasswordField } from "@/components/arc/password-field/password-field";
import { PasswordStrength } from "@/components/arc/password-strength/password-strength";
import { api, errorMessage } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { RULES } from "@/app/change-password/change-password-form";
import styles from "./profile.module.css";


export function ProfileDetails() {
  const { data: me, isPending, isError, error, refetch } = useMe();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  // The (app) layout only renders once `me` has loaded, so there is no loading state here.
  if (isPending) return null;
  if (isError)
    return (
      <div className={styles.layout}>
        <Alert tone="danger" title="Could not load profile">
          {errorMessage(error)}
        </Alert>
        <div>
          <Button variant="secondary" onClick={() => refetch()}>
            <RotateCw size={16} aria-hidden="true" /> Retry
          </Button>
        </div>
      </div>
    );

  const name = me.employee ? `${me.employee.firstName} ${me.employee.lastName}` : me.email;
  const meetsRules = RULES.every((r) => r.test(next));
  const mismatch = confirm.length > 0 && confirm !== next;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaved(false);
    setPending(true);
    try {
      await api.post("/auth/change-password", { currentPassword: current, newPassword: next });
      setSaved(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={styles.layout}>
      <Card title={name} description={me.email} meta={me.roleInfo?.name}>
        {me.employee && (
          <dl className={styles.details}>
            <div>
              <dt>Employee code</dt>
              <dd>{me.employee.employeeCode}</dd>
            </div>
            <div>
              <dt>Department</dt>
              <dd>{me.employee.department}</dd>
            </div>
            <div>
              <dt>Position</dt>
              <dd>{me.employee.position}</dd>
            </div>
            <div>
              <dt>Hire date</dt>
              <dd>{me.employee.hireDate.slice(0, 10)}</dd>
            </div>
          </dl>
        )}
      </Card>

      <Card title="Change password" description="Enter your current password, then a new one.">
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          {formError && <Alert tone="danger" title="Password not changed">{formError}</Alert>}
          {saved && <Alert tone="success" title="Password changed">Use the new password next time you sign in.</Alert>}
          <PasswordField label="Current password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          <PasswordStrength label="New password" autoComplete="new-password" rules={RULES} value={next} onValueChange={setNext} />
          <PasswordField
            label="Confirm new password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            description={mismatch ? "The passwords don't match." : undefined}
            aria-invalid={mismatch || undefined}
          />
          <div>
            <Button type="submit" variant="primary" loading={pending} disabled={!current || !meetsRules || confirm !== next}>
              <KeyRound size={16} aria-hidden="true" /> Save password
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

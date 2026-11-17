"use client";

import { useState } from "react";
import { Check, UserPlus } from "lucide-react";
import { Alert } from "@/components/arc/alert/alert";
import { ActionButton } from "@/components/arc/action-button/action-button";
import { DatePicker } from "@/components/arc/date-picker/date-picker";
import { DrawerContent } from "@/components/arc/drawer/drawer";
import { Input } from "@/components/arc/input/input";
import MoneyInput from "@/components/arc/money-input/money-input";
import { Select } from "@/components/arc/select/select";
import { errorMessage } from "@/lib/api";
import { lagosDay } from "@/lib/history";
import { koboToNaira, ROLES, useDepartments, useEmployeeMutations, usePositions, type Employee } from "@/lib/employees";
import type { Role } from "@/lib/types";
import styles from "../manage.module.css";

/**
 * Create (CEO, with role, hire date and starting rate) or edit (profile fields only; rate changes
 * have their own history-keeping form on the Compensation tab).
 */
export function EmployeeForm({ employee, onSaved }: { employee?: Employee; onSaved: (result: { name: string; temporaryPassword?: string }) => void }) {
  const departments = useDepartments();
  const positions = usePositions();
  const { create, update } = useEmployeeMutations();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    firstName: employee?.firstName ?? "",
    lastName: employee?.lastName ?? "",
    email: employee?.user.email ?? "",
    department: employee?.department ?? "",
    position: employee?.position ?? "",
    role: "EMPLOYEE" as Role,
    hireDate: new Date(),
    // MoneyInput values are kobo.
    base: null as number | null,
    overtime: null as number | null,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((prev) => ({ ...prev, [k]: v }));

  const missing =
    !f.firstName.trim() || !f.lastName.trim() || !f.email.trim() || !f.department || !f.position.trim() || (!employee && (!f.base || !f.overtime));

  const save = async () => {
    setError(null);
    const name = `${f.firstName.trim()} ${f.lastName.trim()}`;
    const profile = {
      firstName: f.firstName.trim(),
      lastName: f.lastName.trim(),
      email: f.email.trim(),
      department: f.department,
      position: f.position.trim(),
    };
    try {
      if (employee) {
        await update.mutateAsync({ id: employee.id, body: profile });
        onSaved({ name });
      } else {
        const res = await create.mutateAsync({
          ...profile,
          role: f.role,
          hireDate: lagosDay(f.hireDate),
          compensation: { baseHourlyRate: koboToNaira(f.base!), overtimeHourlyRate: koboToNaira(f.overtime!), currency: "NGN" },
        });
        onSaved({ name, temporaryPassword: res.temporaryPassword });
      }
    } catch (e) {
      setError(errorMessage(e));
      throw e;
    }
  };

  return (
    <DrawerContent title={employee ? "Edit employee" : "Add employee"} description={employee ? undefined : "A temporary password is created and shown once."}>
      <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
        {error && (
          <Alert tone="danger" title="Could not save" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}
        <div className={styles.formRow}>
          <Input label="First name" value={f.firstName} onChange={(e) => set("firstName", e.target.value)} autoComplete="off" />
          <Input label="Last name" value={f.lastName} onChange={(e) => set("lastName", e.target.value)} autoComplete="off" />
        </div>
        <Input label="Email" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} autoComplete="off" />
        <div className={styles.formRow}>
          <Select
            label="Department"
            placeholder={departments.isPending ? "Loading departments" : "Choose a department"}
            options={(departments.data ?? []).map((d) => ({ value: d.name, label: d.name }))}
            value={f.department}
            onValueChange={(v: string) => set("department", v)}
          />
          <Select
            label="Position"
            placeholder={positions.isPending ? "Loading positions" : positions.data?.length ? "Choose a position" : "Add positions in Settings first"}
            options={(positions.data ?? []).map((p) => ({ value: p.name, label: p.name }))}
            value={f.position}
            onValueChange={(v: string) => set("position", v)}
            disabled={!positions.data?.length}
          />
        </div>
        {employee ? (
          <p className={styles.muted}>Employee number {employee.employeeCode}. Numbers are issued by the system and never change.</p>
        ) : (
          <p className={styles.muted}>The employee number (EMP-001, EMP-002, ...) is issued automatically when you save.</p>
        )}
        {!employee && (
          <>
            <div className={styles.formRow}>
              <Select label="Role" options={ROLES} value={f.role} onValueChange={(v: string) => set("role", v as Role)} />
              <DatePicker label="Hire date" value={f.hireDate} onChange={(d) => d && set("hireDate", d)} />
            </div>
            <div className={styles.formRow}>
              <MoneyInput label="Hourly rate" currency="NGN" currencies={["NGN"]} quickAdd={[]} min={0} value={f.base} onValueChange={(v) => set("base", v)} />
              <MoneyInput label="Overtime rate" currency="NGN" currencies={["NGN"]} quickAdd={[]} min={0} value={f.overtime} onValueChange={(v) => set("overtime", v)} />
            </div>
          </>
        )}
        <ActionButton icon={employee ? <Check size={17} aria-hidden="true" /> : <UserPlus size={17} aria-hidden="true" />} label={employee ? "Save changes" : "Add employee"} pendingLabel="Saving" successLabel="Saved" disabled={missing} onAction={save} onActionError={() => undefined} />
      </form>
    </DrawerContent>
  );
}

"use client";

import { Check, Pencil } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/arc/alert/alert";
import { ActionButton } from "@/components/arc/action-button/action-button";
import { Avatar } from "@/components/arc/avatar/avatar";
import Badge from "@/components/arc/badge/badge";
import { MetricCard } from "@/components/arc/metric-card/metric-card";
import { Button } from "@/components/arc/button/button";
import ConfirmMorph from "@/components/arc/confirm-morph/confirm-morph";
import { DatePicker } from "@/components/arc/date-picker/date-picker";
import { Drawer } from "@/components/arc/drawer/drawer";
import EmptyState from "@/components/arc/empty-state/empty-state";
import MoneyInput from "@/components/arc/money-input/money-input";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/arc/tabs/tabs";
import { PageHeading } from "@/components/shell/page-heading";
import { EmployeeReport } from "@/components/reports/employee-report";
import { errorMessage } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { formatDate, sentenceCase } from "@/lib/time";
import { rangeFor, type DashboardRange } from "@/lib/dashboard";
import { lagosDay } from "@/lib/history";
import { formatMoney, fullName, ROLES, koboToNaira, useCompensation, useEmployee, useEmployeeMutations, useEmployeeReport, type Employee } from "@/lib/employees";
import { isCeo } from "@/lib/types";
import { EmployeeForm } from "../employee-form";
import { TempPasswordDialog } from "../temp-password-dialog";
import styles from "../../manage.module.css";

const STATUS_TONE = { ACTIVE: "success", INACTIVE: "neutral", ON_LEAVE: "info", TERMINATED: "danger" } as const;

const RANGES = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

export function EmployeeDetail({ id }: { id: string }) {
  const me = useMe();
  const ceo = isCeo(me.data?.role);
  const employee = useEmployee(id);
  const [editing, setEditing] = useState(false);

  if (employee.isPending) return <Skeleton lines={8} label="Loading employee" />;
  if (employee.isError)
    return (
      <Alert tone="danger" title="Could not load this employee">
        {errorMessage(employee.error)}
      </Alert>
    );

  const e = employee.data;
  return (
    <div className={styles.layout}>
      <Link href="/employees" className={styles.back}>
        Back to employees
      </Link>
      <PageHeading
        title={fullName(e)}
        description={`${e.position} · ${e.department} · ${e.employeeCode}`}
        leading={<Avatar name={fullName(e)} size="xl" />}
        meta={
          <>
            <Badge tone={STATUS_TONE[e.status]} dot>
              {sentenceCase(e.status)}
            </Badge>
            <Badge tone="neutral">{ROLES.find((r) => r.value === e.user.role)?.label}</Badge>
            {e.user.mustChangePassword && <Badge tone="info">Must set a new password</Badge>}
          </>
        }
        actions={
          ceo && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil size={16} aria-hidden="true" /> Edit
            </Button>
          )
        }
      />

      <Tabs defaultValue="overview">
        <TabsList aria-label="Employee sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="report">Report</TabsTrigger>
          {ceo && <TabsTrigger value="pay">Compensation</TabsTrigger>}
        </TabsList>
        <TabsContent value="overview">
          <Overview employee={e} ceo={ceo} self={me.data?.employee?.id === e.id} />
        </TabsContent>
        <TabsContent value="report">
          <Report id={e.id} />
        </TabsContent>
        {ceo && (
          <TabsContent value="pay">
            <Compensation employee={e} />
          </TabsContent>
        )}
      </Tabs>

      <Drawer open={editing} onOpenChange={setEditing}>
        {editing && <EmployeeForm employee={e} onSaved={() => setEditing(false)} />}
      </Drawer>
    </div>
  );
}

function Overview({ employee: e, ceo, self }: { employee: Employee; ceo: boolean; self: boolean }) {
  const { update, deactivate, resetPassword } = useEmployeeMutations();
  const [password, setPassword] = useState<string | null>(null);
  const active = e.status === "ACTIVE";
  const { from, to } = rangeFor("30");
  const recent = useEmployeeReport(e.id, from, to);

  return (
    <div className={styles.layout}>
      {recent.data && (
        <div className={styles.kpis} aria-label="Last 30 days">
          <MetricCard label="Hours, last 30 days" value={Math.round(recent.data.totalWorkingHours * 10) / 10} suffix="h" context="net of breaks" />
          <MetricCard label="Average day" value={recent.data.averageDailyHours} suffix="h" context={`over ${recent.data.validWorkingDays} full days`} />
          <MetricCard label="Projects worked" value={recent.data.projectsWorked} context="in the last 30 days" />
          <MetricCard label="Missing clock-outs" value={recent.data.missingClockOuts} context={recent.data.missingClockOuts ? "need a correction" : "all clear"} />
        </div>
      )}
      <section className={styles.card} aria-labelledby="profile">
        <h2 id="profile">Profile</h2>
        <dl className={styles.details}>
          <div>
            <dt>Email</dt>
            <dd>{e.user.email}</dd>
          </div>
          <div>
            <dt>Department</dt>
            <dd>{e.department}</dd>
          </div>
          <div>
            <dt>Hired</dt>
            <dd>{formatDate(e.hireDate)}</dd>
          </div>
          {ceo && (
            <div>
              <dt>Hourly rate</dt>
              <dd>{e.compensation ? `${formatMoney(e.compensation.baseHourlyRate, e.compensation.currency)}/h` : "Not set"}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className={styles.card} aria-labelledby="projects">
        <h2 id="projects">Projects</h2>
        {e.projectMemberships?.length ? (
          <ul className={styles.list}>
            {e.projectMemberships.map((m) => (
              <li key={m.id}>
                <Link href={`/projects/${m.project.id}`} className={styles.link}>
                  {m.project.code} {m.project.name}
                </Link>
                {m.isProjectLead && <Badge tone="info">Lead</Badge>}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.hint}>Not assigned to any project.</p>
        )}
      </section>

      {ceo && !self && (
        <section className={styles.card} aria-labelledby="account">
          <h2 id="account">Account</h2>
          <p className={styles.hint}>
            A reset signs them out everywhere and shows a new temporary password once. Deactivating keeps all their history; they can no longer sign in.
          </p>
          <div className={styles.rowActions}>
            <ConfirmMorph
              label="Reset password"
              prompt="Create a new temporary password?"
              confirmLabel="Reset"
              pendingLabel="Resetting"
              doneLabel="Password reset"
              tone="neutral"
              onConfirm={() => resetPassword.mutateAsync(e.id).then((r) => setPassword(r.temporaryPassword))}
            />
            {active ? (
              <ConfirmMorph label="Deactivate" prompt={`Deactivate ${e.firstName}?`} confirmLabel="Deactivate" pendingLabel="Deactivating" doneLabel="Deactivated" tone="danger" onConfirm={() => deactivate.mutateAsync(e.id)} />
            ) : (
              <ConfirmMorph
                label="Reactivate"
                prompt={`Let ${e.firstName} sign in again?`}
                confirmLabel="Reactivate"
                pendingLabel="Reactivating"
                doneLabel="Reactivated"
                tone="neutral"
                onConfirm={() => update.mutateAsync({ id: e.id, body: { status: "ACTIVE" } })}
              />
            )}
          </div>
        </section>
      )}
      <TempPasswordDialog who={e.firstName} password={password} onClose={() => setPassword(null)} />
    </div>
  );
}

function Report({ id }: { id: string }) {
  const [range, setRange] = useState<DashboardRange>("30");
  const { from, to } = rangeFor(range);

  return (
    <div className={styles.layout}>
      <div className={styles.toolbar}>
        <SegmentedControl label="Range" options={RANGES} value={range} onValueChange={(v: string) => setRange(v as DashboardRange)} />
      </div>
      <EmployeeReport id={id} from={from} to={to} rangeLabel={`last ${range} days`} />
    </div>
  );
}

function Compensation({ employee: e }: { employee: Employee }) {
  const comp = useCompensation(e.id, true);
  const { changeRate } = useEmployeeMutations();
  // MoneyInput values are kobo.
  const [base, setBase] = useState<number | null>(null);
  const [overtime, setOvertime] = useState<number | null>(null);
  const [from, setFrom] = useState<Date | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  if (comp.isPending) return <Skeleton lines={4} label="Loading compensation" />;
  if (comp.isError)
    return (
      <Alert tone="danger" title="Could not load compensation">
        {errorMessage(comp.error)}
      </Alert>
    );

  const save = () => {
    setError(null);
    return changeRate
      .mutateAsync({ id: e.id, body: { baseHourlyRate: koboToNaira(base!), overtimeHourlyRate: koboToNaira(overtime!), currency: "NGN", effectiveDate: lagosDay(from!) } })
      .then(() => comp.refetch())
      .then(() => {
        setBase(null);
        setOvertime(null);
        setFrom(undefined);
      })
      .catch((err: unknown) => {
        setError(errorMessage(err));
        throw err;
      });
  };

  return (
    <div className={styles.layout}>
      <section className={styles.card} aria-labelledby="rates">
        <h2 id="rates">Rate history</h2>
        {comp.data.history.length === 0 ? (
          <EmptyState title="No rate on file" description="Add one below; days without a rate are left out of payroll." />
        ) : (
          <ul className={styles.list}>
            {comp.data.history.map((r) => (
              <li key={r.effectiveFrom}>
                <span>
                  {formatMoney(r.baseHourlyRate, r.currency)}/h, overtime {formatMoney(r.overtimeHourlyRate, r.currency)}/h
                  {!r.effectiveTo && (
                    <>
                      {" "}
                      <Badge tone="success">Current</Badge>
                    </>
                  )}
                </span>
                <span className={styles.muted}>
                  {r.effectiveFrom.slice(0, 10)} to {r.effectiveTo ? r.effectiveTo.slice(0, 10) : "now"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.card} aria-labelledby="new-rate">
        <h2 id="new-rate">Change rate</h2>
        <p className={styles.hint}>The current rate ends the day before the new one starts. Past days keep the rate that applied then.</p>
        {error && (
          <Alert tone="danger" title="Could not change the rate" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}
        <div className={styles.formRow}>
          <MoneyInput label="New hourly rate" currency="NGN" currencies={["NGN"]} quickAdd={[]} min={0} value={base} onValueChange={(v) => setBase(v)} />
          <MoneyInput label="New overtime rate" currency="NGN" currencies={["NGN"]} quickAdd={[]} min={0} value={overtime} onValueChange={(v) => setOvertime(v)} />
          <DatePicker label="Starts on" value={from} onChange={setFrom} />
        </div>
        <ActionButton icon={<Check size={17} aria-hidden="true" />} label="Save new rate" pendingLabel="Saving" successLabel="Rate saved" disabled={!base || !overtime || !from} onAction={save} onActionError={() => undefined} />
      </section>
    </div>
  );
}

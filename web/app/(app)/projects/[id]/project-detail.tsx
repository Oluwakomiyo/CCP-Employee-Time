"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/arc/alert/alert";
import { ActionButton } from "@/components/arc/action-button/action-button";
import Badge from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Combobox } from "@/components/arc/combobox/combobox";
import ConfirmMorph from "@/components/arc/confirm-morph/confirm-morph";
import { Drawer } from "@/components/arc/drawer/drawer";
import EmptyState from "@/components/arc/empty-state/empty-state";
import { MetricCard } from "@/components/arc/metric-card/metric-card";
import { MultiSelect } from "@/components/arc/multi-select/multi-select";
import { Progress } from "@/components/arc/progress/progress";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { Switch } from "@/components/arc/switch/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/arc/tabs/tabs";
import { PageHeading } from "@/components/shell/page-heading";
import { ProjectBreakdown } from "@/components/reports/project-report";
import { errorMessage } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { fullName, useEmployees } from "@/lib/employees";
import { PROJECT_STATUSES, STATUS_TONE, useEstimate, useProjectMutations, useProjectReport, type ProjectReport } from "@/lib/projects";
import { formatTime, labelOf, LOCATIONS } from "@/lib/time";
import { isCeo } from "@/lib/types";
import { ProjectForm } from "../project-form";
import styles from "../../manage.module.css";

export function ProjectDetail({ id }: { id: string }) {
  const me = useMe();
  const ceo = isCeo(me.data?.role);
  const report = useProjectReport(id);
  const [editing, setEditing] = useState(false);

  if (report.isPending) return <Skeleton lines={8} label="Loading project" />;
  if (report.isError)
    return (
      <Alert tone="danger" title="Could not load this project">
        {errorMessage(report.error)}
      </Alert>
    );

  const r = report.data;
  const p = r.project;
  return (
    <div className={styles.layout}>
      <Link href="/projects" className={styles.back}>
        Back to projects
      </Link>
      <PageHeading
        title={`${p.code} ${p.name}`}
        description={[p.clientName, p.location].filter(Boolean).join(" · ") || undefined}
        actions={
          <>
            <Badge tone={STATUS_TONE[p.status]} dot>
              {PROJECT_STATUSES.find((s) => s.value === p.status)?.label}
            </Badge>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
          </>
        }
      />

      <Tabs defaultValue="overview">
        <TabsList aria-label="Project sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="report">Report</TabsTrigger>
          <TabsTrigger value="estimate">Estimate</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Overview r={r} ceo={ceo} />
        </TabsContent>
        <TabsContent value="team">
          <Team r={r} ceo={ceo} />
        </TabsContent>
        <TabsContent value="report">
          <ProjectBreakdown r={r} ceo={ceo} />
        </TabsContent>
        <TabsContent value="estimate">
          <EstimatePanel r={r} ceo={ceo} />
        </TabsContent>
      </Tabs>

      <Drawer open={editing} onOpenChange={setEditing}>
        {editing && <ProjectForm project={p} onSaved={() => setEditing(false)} />}
      </Drawer>
    </div>
  );
}

function Overview({ r, ceo }: { r: ProjectReport; ceo: boolean }) {
  return (
    <div className={styles.layout}>
      <div className={styles.kpis}>
        <MetricCard label="Hours worked" value={r.totalHours} suffix="h" context="all time, net of breaks" />
        {r.estimatedHours !== null && <MetricCard label="Estimate" value={r.estimatedHours} suffix="h" context="planned for the project" />}
        {r.estimatedHours !== null &&
          (r.overEstimate ? (
            <MetricCard label="Over estimate" value={r.overByHours} suffix="h" context="beyond the plan" />
          ) : (
            <MetricCard label="Remaining" value={r.remainingEstimatedHours ?? 0} suffix="h" context="left in the estimate" />
          ))}
        {ceo && r.labourCost !== undefined && <MetricCard label="Labour cost (₦)" value={r.labourCost} context="at each day's rate" />}
      </div>
      {r.estimatedHours !== null && (
        <section className={styles.card} aria-label="Progress against the estimate">
          <Progress value={r.totalHours} max={r.estimatedHours} label={`${r.totalHours} of ${r.estimatedHours} estimated hours`} showValue />
          {r.overEstimate && <Badge tone="warning">Over by {r.overByHours}h</Badge>}
        </section>
      )}
      {r.project.description && (
        <section className={styles.card} aria-labelledby="about">
          <h2 id="about">About</h2>
          <p>{r.project.description}</p>
        </section>
      )}
      <section className={styles.card} aria-labelledby="now">
        <h2 id="now">Working on it now</h2>
        {r.currentWorkers.length === 0 ? (
          <p className={styles.hint}>Nobody is clocked in on this project.</p>
        ) : (
          <ul className={styles.list}>
            {r.currentWorkers.map((w) => (
              <li key={w.employee.id}>
                <span>{fullName(w.employee)}</span>
                <span className={styles.muted}>
                  {w.state === "ON_BREAK" ? "On a break" : labelOf(LOCATIONS, w.location)} since {formatTime(w.since)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Team({ r, ceo }: { r: ProjectReport; ceo: boolean }) {
  const { addMember, removeMember } = useProjectMutations();
  const people = useEmployees({ search: "", status: "ACTIVE", page: 1, limit: 100 });
  const [employeeId, setEmployeeId] = useState("");
  const [lead, setLead] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const memberIds = new Set(r.assignedEmployees.map((m) => m.id));
  const options = (people.data?.data ?? []).filter((e) => !memberIds.has(e.id)).map((e) => ({ value: e.id, label: `${fullName(e)} (${e.employeeCode})`, keywords: [e.department] }));

  const add = () => {
    setError(null);
    return addMember
      .mutateAsync({ id: r.project.id, employeeId, isProjectLead: lead })
      .then(() => {
        setEmployeeId("");
        setLead(false);
      })
      .catch((e: unknown) => {
        setError(errorMessage(e));
        throw e;
      });
  };

  return (
    <div className={styles.layout}>
      <section className={styles.card} aria-labelledby="members">
        <h2 id="members">Team</h2>
        {r.assignedEmployees.length === 0 ? (
          <p className={styles.hint}>Nobody is assigned yet. Only assigned people can clock time on this project.</p>
        ) : (
          <ul className={styles.list}>
            {r.assignedEmployees.map((m) => (
              <li key={m.id}>
                <span>
                  <Link href={`/employees/${m.id}`}>{fullName(m)}</Link> <span className={styles.muted}>{m.department}</span>{" "}
                  {m.isProjectLead && <Badge tone="info">Lead</Badge>}
                </span>
                {(ceo || !m.isProjectLead) && (
                  <ConfirmMorph
                    label="Remove"
                    prompt={`Remove ${m.firstName}?`}
                    confirmLabel="Remove"
                    pendingLabel="Removing"
                    doneLabel="Removed"
                    onConfirm={() => removeMember.mutateAsync({ id: r.project.id, employeeId: m.id })}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        <p className={styles.hint}>Removing someone keeps the hours they already recorded.</p>
      </section>

      <section className={styles.card} aria-labelledby="add-member">
        <h2 id="add-member">Add someone</h2>
        {error && (
          <Alert tone="danger" title="Could not add" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}
        <Combobox label="Employee" placeholder="Search by name" options={options} value={employeeId} onValueChange={setEmployeeId} emptyMessage="Nobody else to add" />
        {ceo && <Switch label="Make them a project lead" checked={lead} onCheckedChange={setLead} />}
        <ActionButton label="Add to project" pendingLabel="Adding" successLabel="Added" disabled={!employeeId} onAction={add} onActionError={() => undefined} />
      </section>
    </div>
  );
}

function EstimatePanel({ r, ceo }: { r: ProjectReport; ceo: boolean }) {
  const [team, setTeam] = useState<string[]>(() => r.assignedEmployees.map((m) => m.id));
  const estimate = useEstimate(r.project.id, team);

  return (
    <div className={styles.layout}>
      <section className={styles.card} aria-labelledby="estimate">
        <h2 id="estimate">How long will it take?</h2>
        <MultiSelect
          label="Team"
          description="Each person's average working day over the last 90 days is used."
          options={r.assignedEmployees.map((m) => ({ value: m.id, label: fullName(m) }))}
          value={team}
          onValueChange={setTeam}
          placeholder="Choose people"
        />
        {team.length === 0 ? (
          <p className={styles.hint}>Choose at least one person.</p>
        ) : estimate.isPending ? (
          <Skeleton lines={3} label="Estimating" />
        ) : estimate.isError ? (
          <Alert tone="danger" title="Could not estimate">
            {errorMessage(estimate.error)}
          </Alert>
        ) : (
          <>
            <div className={styles.kpis}>
              <MetricCard label="Working days" value={estimate.data.estimatedWorkingDays ?? 0} context={`at ${estimate.data.teamDailyHours}h a day for the team`} />
              <MetricCard label="Hours to do" value={estimate.data.estimatedHoursToDo} suffix="h" context={estimate.data.basis === "REMAINING_ESTIMATE" ? "left in the estimate" : "average of completed projects"} />
              {ceo && estimate.data.estimatedLabourCost !== undefined && <MetricCard label="Labour cost (₦)" value={estimate.data.estimatedLabourCost} context="at current rates" />}
            </div>
            {estimate.data.team.some((m) => m.assumedDefault) && (
              <Alert tone="info" title="Some averages are assumed">
                {estimate.data.team
                  .filter((m) => m.assumedDefault)
                  .map((m) => m.name)
                  .join(", ")}{" "}
                {estimate.data.team.filter((m) => m.assumedDefault).length === 1 ? "has" : "have"} no recent history, so an 8 hour day is assumed.
              </Alert>
            )}
            <p className={styles.hint}>{estimate.data.note}</p>
          </>
        )}
      </section>
      {r.assignedEmployees.length === 0 && <EmptyState title="No team yet" description="Add people on the Team tab to estimate." />}
    </div>
  );
}

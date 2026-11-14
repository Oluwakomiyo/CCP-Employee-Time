"use client";

import { useState } from "react";
import { Alert } from "@/components/arc/alert/alert";
import Badge from "@/components/arc/badge/badge";
import { Card } from "@/components/arc/card/card";
import DateRangePicker, { type DateRange } from "@/components/arc/date-range-picker/date-range-picker";
import EmptyState from "@/components/arc/empty-state/empty-state";
import Progress from "@/components/arc/progress/progress";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { errorMessage } from "@/lib/api";
import { formatHours } from "@/lib/time";
import { lagosDay, useMyProjectsFull, useMyReport, type MineProject } from "@/lib/my-projects";
import styles from "./my-projects.module.css";

const STATUS_TONE = {
  ACTIVE: "success",
  PLANNED: "info",
  ON_HOLD: "warning",
  COMPLETED: "neutral",
  CANCELLED: "neutral",
} as const;

const statusTone = (s: string) => (STATUS_TONE as Record<string, "success" | "info" | "warning" | "neutral">)[s] ?? "neutral";

function ProjectCard({ project, hours }: { project: MineProject; hours: number }) {
  const estimated = project.estimatedHours === null ? null : Number(project.estimatedHours);
  const leads = (project.members ?? []).filter((m) => m.isProjectLead);
  const teamSize = project._count?.members ?? project.members?.length ?? 0;
  return (
    <Card
      title={`${project.code} ${project.name}`}
      description={project.clientName ?? project.description ?? undefined}
      meta={teamSize ? `${teamSize} on the team` : undefined}
      status={leads.length ? `Led by ${leads.map((l) => `${l.employee.firstName} ${l.employee.lastName}`).join(", ")}` : undefined}
      action={<Badge tone={statusTone(project.status)} dot>{project.status.toLowerCase().replace("_", " ")}</Badge>}
    >
      <div className={styles.cardBody}>
        <span className={styles.hours}>{formatHours(hours * 3600)} on this project</span>
        {estimated !== null && estimated > 0 ? (
          <Progress value={hours} max={estimated} label={`${hours.toFixed(1)} of ${estimated} estimated hours`} showValue />
        ) : (
          <p className={styles.meta}>No estimate set for this project.</p>
        )}
      </div>
    </Card>
  );
}

export function MyProjectsList() {
  const [range, setRange] = useState<DateRange | null>(null);
  const from = range ? lagosDay(range.start) : undefined;
  const to = range ? lagosDay(range.end) : undefined;
  const projects = useMyProjectsFull();
  const report = useMyReport(from, to);

  if (projects.isPending || report.isPending) return <Skeleton lines={6} label="Loading projects" />;
  const error = projects.isError ? projects.error : report.isError ? report.error : null;
  if (error)
    return (
      <Alert tone="danger" title="Could not load projects">
        {errorMessage(error)}
      </Alert>
    );

  const list = projects.data ?? [];
  const byId = new Map((report.data?.hoursByProject ?? []).map((h) => [h.projectId, h.hours]));

  return (
    <div className={styles.layout}>
      <DateRangePicker value={range} onChange={setRange} label="Hours range" />
      <dl className={styles.summary}>
        <div className={styles.stat}>
          <dt>Projects</dt>
          <dd>{list.length}</dd>
        </div>
        <div className={styles.stat}>
          <dt>Hours{range ? " in range" : ""}</dt>
          <dd>{(report.data?.totalWorkingHours ?? 0).toFixed(1)}</dd>
        </div>
        <div className={styles.stat}>
          <dt>Working days</dt>
          <dd>{report.data?.validWorkingDays ?? 0}</dd>
        </div>
        <div className={styles.stat}>
          <dt>Daily average</dt>
          <dd>{formatHours((report.data?.averageDailyHours ?? 0) * 3600)}</dd>
        </div>
      </dl>

      {list.length === 0 ? (
        <EmptyState title="No projects yet" description="You are not assigned to any project. Ask your manager to add you." />
      ) : (
        <div className={styles.grid}>
          {list.map((p) => (
            <ProjectCard key={p.id} project={p} hours={byId.get(p.id) ?? 0} />
          ))}
        </div>
      )}
    </div>
  );
}

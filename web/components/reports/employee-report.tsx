"use client";

import { Alert } from "@/components/arc/alert/alert";
import { MetricCard } from "@/components/arc/metric-card/metric-card";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { errorMessage } from "@/lib/api";
import { useEmployeeReport } from "@/lib/employees";
import { ACTIVITIES, labelOf, LOCATIONS } from "@/lib/time";
import { HoursList } from "./hours-list";
import styles from "@/app/(app)/manage.module.css";

/** The employee Report tab, shared with the Reports screen. The caller owns the range. */
export function EmployeeReport({ id, from, to, rangeLabel }: { id: string; from: string; to: string; rangeLabel: string }) {
  const report = useEmployeeReport(id, from, to);

  if (report.isPending) return <Skeleton lines={6} label="Loading report" />;
  if (report.isError)
    return (
      <Alert tone="danger" title="Could not load the report">
        {errorMessage(report.error)}
      </Alert>
    );

  return (
    <div className={styles.layout}>
      <div className={styles.kpis}>
        <MetricCard label="Hours worked" value={report.data.totalWorkingHours} suffix="h" context={rangeLabel} />
        <MetricCard label="Average day" value={report.data.averageDailyHours} suffix="h" context={`over ${report.data.validWorkingDays} full days`} />
        <MetricCard label="Breaks" value={report.data.breakHours} suffix="h" context="not counted as work" />
        <MetricCard label="Missing clock-outs" value={report.data.missingClockOuts} context="need a correction" />
      </div>
      <div className={styles.grid2}>
        <HoursList title="By project" items={report.data.hoursByProject.map((p) => ({ key: p.projectId, label: `${p.code} ${p.name}`, hours: p.hours }))} />
        <HoursList title="By activity" items={report.data.hoursByActivity.map((a) => ({ key: a.activityType, label: labelOf(ACTIVITIES, a.activityType), hours: a.hours }))} />
        <HoursList title="By location" items={report.data.hoursByLocation.map((l) => ({ key: l.location, label: labelOf(LOCATIONS, l.location), hours: l.hours }))} />
      </div>
    </div>
  );
}

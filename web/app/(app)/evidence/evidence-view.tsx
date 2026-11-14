"use client";

import { useMemo, useState } from "react";
import { Alert } from "@/components/arc/alert/alert";
import Badge from "@/components/arc/badge/badge";
import { Combobox } from "@/components/arc/combobox/combobox";
import { DatePicker } from "@/components/arc/date-picker/date-picker";
import EmptyState from "@/components/arc/empty-state/empty-state";
import { MetricCard } from "@/components/arc/metric-card/metric-card";
import Timeline, { type TimelineEvent } from "@/components/arc/timeline/timeline";
import { Block } from "@/components/loading/skeleton-block";
import { errorMessage } from "@/lib/api";
import { fullName, useEmployees } from "@/lib/employees";
import { useEvidence, useEvidenceDay, type EvidenceSegment, type VerificationStatus, type WorkEvidence } from "@/lib/evidence";
import { formatTime, labelOf, LOCATIONS } from "@/lib/time";
import styles from "../manage.module.css";

const STATUS_TONE = { NORMAL: "success", SITE_WORK: "info", MISSING_DATA: "warning", REVIEW: "warning" } as const;
const STATUS_LABEL: Record<VerificationStatus, string> = {
  NORMAL: "Normal",
  SITE_WORK: "Site work",
  MISSING_DATA: "Missing data",
  REVIEW: "Review",
};

const toHours = (seconds: number) => Math.round((seconds / 3600) * 10) / 10;

export function EvidenceView() {
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState<Date | undefined>(() => new Date());
  const [now] = useState(() => Date.now());
  const employees = useEmployees({ search: "", status: "ACTIVE", page: 1, limit: 100 });
  const day = useEvidenceDay(employeeId, date);
  const workDayId = day.data?.workDay?.id ?? null;
  // A disabled lookup never settles: only its pending state counts once a day resolves.
  const evidence = useEvidence(workDayId);
  const loadingEvidence = workDayId !== null && evidence.isPending;

  return (
    <div className={styles.layout}>
      <div className={styles.filters}>
        <Combobox
          label="Employee"
          placeholder={employees.isPending ? "Loading people" : "Search by name"}
          emptyMessage="Nobody matches that search"
          options={(employees.data?.data ?? []).map((e) => ({ value: e.id, label: `${fullName(e)} (${e.employeeCode})`, keywords: [e.department, e.position] }))}
          value={employeeId}
          onValueChange={setEmployeeId}
        />
        <DatePicker label="Date" value={date} onChange={setDate} maxDate={new Date()} showToday />
      </div>

      {!employeeId || !date ? (
        <EmptyState title="Pick someone and a date" description="Choose an employee and a day to see the recorded time next to the device activity." />
      ) : day.isPending || loadingEvidence ? (
        <EvidenceSkeleton />
      ) : day.isError ? (
        <Alert tone="danger" title="Could not find that day">
          {errorMessage(day.error)}
        </Alert>
      ) : !day.data?.workDay ? (
        <EmptyState title="No recorded day" description="This person has no workday on that date." />
      ) : evidence.isError ? (
        <Alert tone="danger" title="Could not load the evidence">
          {errorMessage(evidence.error)}
        </Alert>
      ) : evidence.data && day.data?.workDay ? (
        <EvidenceContent d={evidence.data} segments={day.data.workDay.segments} now={now} />
      ) : null}
    </div>
  );
}

function EvidenceContent({ d, segments, now }: { d: WorkEvidence; segments: EvidenceSegment[]; now: number }) {
  const timeline: TimelineEvent[] = useMemo(
    () =>
      segments.map((s) => ({
        id: s.id,
        at: s.clockIn,
        actor: s.project.code,
        title: `${s.project.name}, ${labelOf(LOCATIONS, s.location).toLowerCase()}`,
        meta: `${formatTime(s.clockIn)} to ${s.clockOut ? formatTime(s.clockOut) : "ongoing"}`,
      })),
    [segments],
  );

  return (
    <div className={styles.layout} role="status" aria-label={`Evidence for ${d.employee.name} on ${d.date}`}>
      <div className={styles.kpis}>
        <MetricCard label="Official net" value={toHours(d.officialTime.netClockedSeconds)} suffix="h" context="clocked time minus breaks" />
        <MetricCard label="Device active" value={toHours(d.activityEvidence.detectedActiveSeconds)} suffix="h" context={`from ${d.activityEvidence.heartbeatCount} signals`} />
        <MetricCard label="Breaks recorded" value={toHours(d.officialTime.recordedBreakSeconds)} suffix="h" context="unpaid in this version" />
        <MetricCard label="Idle flagged" value={toHours(d.activityEvidence.significantIdleSeconds)} suffix="h" context="gaps over 15 minutes" />
      </div>

      <section className={styles.card} aria-label="Assessment">
        <div className={styles.rowActions}>
          <h3>Assessment</h3>
          <Badge tone={STATUS_TONE[d.verification.status]} dot>
            {STATUS_LABEL[d.verification.status]}
          </Badge>
          <Badge tone={d.activityEvidence.isDeviceAgentOnline ? "success" : "neutral"} dot={d.activityEvidence.isDeviceAgentOnline}>
            {d.activityEvidence.isDeviceAgentOnline ? "Agent online" : "Agent offline"}
          </Badge>
        </div>
        {d.verification.reviewNotes.length > 0 && (
          <ul className={styles.list}>
            {d.verification.reviewNotes.map((n, i) => (
              <li key={i}>
                <span>{n}</span>
              </li>
            ))}
          </ul>
        )}
        <p className={styles.hint}>
          {d.employee.name} · {d.employee.employeeCode} · {d.employee.department} · {d.date}
          {d.activityEvidence.registeredDevicesSeen.length > 0 ? ` · seen on ${d.activityEvidence.registeredDevicesSeen.join(", ")}` : " · no registered device seen"}
        </p>
      </section>

      {timeline.length > 0 && (
        <section className={styles.card} aria-label="Recorded entries">
          <h3>Recorded entries</h3>
          <Timeline events={timeline} now={now} label={`Clock entries for ${d.date}`} timeZone="Africa/Lagos" />
        </section>
      )}
    </div>
  );
}

function EvidenceSkeleton() {
  return (
    <div className={styles.layout} role="status" aria-label="Loading evidence" aria-busy="true">
      <div className={styles.kpis} aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={styles.card}>
            <Block width="6rem" height="1.125rem" radius="0.25rem" index={i * 2} />
            <Block width="4rem" height="1.75rem" radius="0.375rem" index={i * 2 + 1} />
          </div>
        ))}
      </div>
      <div className={styles.card} aria-hidden="true">
        <Block width="9rem" height="1.4rem" radius="0.375rem" index={8} />
        <Block width="100%" height="1.3125rem" radius="0.25rem" index={9} />
        <Block width="80%" height="1.3125rem" radius="0.25rem" index={10} />
      </div>
    </div>
  );
}

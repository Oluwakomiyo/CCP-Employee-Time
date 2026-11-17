"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  CircleHelp,
  ClipboardCheck,
  Clock,
  Coffee,
  HardHat,
  Hourglass,
  Info,
  ListOrdered,
  LogIn,
  LogOut,
  MapPin,
  Monitor,
  MousePointerClick,
  Scale,
  ShieldCheck,
  Timer,
  TriangleAlert,
  Wifi,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { Alert } from "@/components/arc/alert/alert";
import Badge from "@/components/arc/badge/badge";
import { Combobox } from "@/components/arc/combobox/combobox";
import { DatePicker } from "@/components/arc/date-picker/date-picker";
import EmptyState from "@/components/arc/empty-state/empty-state";
import Timeline, { type TimelineEvent } from "@/components/arc/timeline/timeline";
import { Block } from "@/components/loading/skeleton-block";
import { errorMessage } from "@/lib/api";
import { fullName, useEmployees } from "@/lib/employees";
import { useEvidence, useEvidenceDay, type EvidenceSegment, type VerificationStatus, type WorkEvidence } from "@/lib/evidence";
import { formatHours, formatTime, labelOf, LOCATIONS } from "@/lib/time";
import styles from "../manage.module.css";
import ev from "./evidence.module.css";

const STATUS_TONE = { NORMAL: "success", SITE_WORK: "info", MISSING_DATA: "warning", REVIEW: "warning" } as const;
const VERDICT_ICON: Record<VerificationStatus, LucideIcon> = { NORMAL: ShieldCheck, SITE_WORK: HardHat, MISSING_DATA: CircleHelp, REVIEW: TriangleAlert };
const STATUS_LABEL: Record<VerificationStatus, string> = {
  NORMAL: "Looks normal: activity matches the recorded time",
  SITE_WORK: "Site work: away from the computer is expected",
  MISSING_DATA: "Missing data: not enough device signals to compare",
  REVIEW: "Needs a look: recorded time and activity differ",
};


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

  const o = d.officialTime;
  const a = d.activityEvidence;
  const Verdict = VERDICT_ICON[d.verification.status];
  // How much of the paid (net) time the device saw as active. Over 100% is possible (agent ran during a break).
  const coverage = o.netClockedSeconds > 0 ? Math.round((a.detectedActiveSeconds / o.netClockedSeconds) * 100) : null;
  const breakShare = o.grossClockedSeconds > 0 ? (o.recordedBreakSeconds / o.grossClockedSeconds) * 100 : 0;

  return (
    <div className={styles.layout} role="status" aria-label={`Evidence for ${d.employee.name} on ${d.date}`}>
      {/* Who, when, and the verdict first: the question a reviewer is answering. */}
      <section className={`${styles.card} ${ev.verdict}`} data-tone={STATUS_TONE[d.verification.status]} aria-label="Assessment">
        <div className={ev.verdictHead}>
          <span className={ev.verdictIcon} aria-hidden="true">
            <Verdict size={22} />
          </span>
          <div className={ev.verdictText}>
            <h3>{STATUS_LABEL[d.verification.status]}</h3>
            <p>
              {d.employee.name} · {d.employee.employeeCode} · {d.employee.department} · {d.date}
            </p>
          </div>
        </div>
        {d.verification.reviewNotes.length > 0 && (
          <ul className={ev.notes}>
            {d.verification.reviewNotes.map((n, i) => (
              <li key={i}>
                <Info size={15} aria-hidden="true" /> {n}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className={ev.split}>
        {/* Official time: what the employee clocked; payroll uses this. */}
        <section className={styles.card} aria-labelledby="ev-official">
          <header className={ev.panelHead}>
            <span className={ev.panelIcon} data-kind="official" aria-hidden="true">
              <ClipboardCheck size={18} />
            </span>
            <div>
              <h3 id="ev-official">Official time recorded</h3>
              <p>What was clocked. Payroll is paid from this.</p>
            </div>
          </header>

          <div className={ev.span}>
            <span>
              <LogIn size={15} aria-hidden="true" /> {o.clockedIn ? formatTime(o.clockedIn) : "No clock-in"}
            </span>
            <span className={ev.spanLine} aria-hidden="true" />
            <span>
              <LogOut size={15} aria-hidden="true" /> {o.clockedOut ? formatTime(o.clockedOut) : "Still open"}
            </span>
          </div>

          <dl className={ev.rows}>
            <Row icon={Clock} label="Gross clocked" hint="first clock-in to last clock-out" value={formatHours(o.grossClockedSeconds)} />
            <Row icon={Coffee} label="Recorded breaks" hint="unpaid" value={`− ${formatHours(o.recordedBreakSeconds)}`} tone="paused" />
            <Row icon={Timer} label="Net work time" value={formatHours(o.netClockedSeconds)} strong />
          </dl>
          <div className={ev.bar} role="img" aria-label={`Breaks are ${Math.round(breakShare)}% of the clocked time`}>
            <span className={ev.barWork} style={{ width: `${100 - breakShare}%` }} />
            <span className={ev.barBreak} style={{ width: `${breakShare}%` }} />
          </div>
          <p className={ev.legend}>
            <span className={ev.dotWork} /> Work <span className={ev.dotBreak} /> Breaks
          </p>
          {o.locations.length > 0 && (
            <p className={ev.chips}>
              <MapPin size={15} aria-hidden="true" />
              {o.locations.map((l) => (
                <Badge key={l} tone="neutral">
                  {labelOf(LOCATIONS, l)}
                </Badge>
              ))}
            </p>
          )}
        </section>

        {/* Device signals: supporting evidence from the desktop agent; never changes pay. */}
        <section className={styles.card} aria-labelledby="ev-signals">
          <header className={ev.panelHead}>
            <span className={ev.panelIcon} data-kind="signals" aria-hidden="true">
              <Activity size={18} />
            </span>
            <div>
              <h3 id="ev-signals">Technical activity signals</h3>
              <p>What the desktop agent saw. Supporting evidence only.</p>
            </div>
          </header>

          <dl className={ev.rows}>
            <Row icon={MousePointerClick} label="Detected activity" hint={`from ${a.heartbeatCount} signals`} value={formatHours(a.detectedActiveSeconds)} />
            <Row icon={Hourglass} label="Significant idle" hint="gaps over 15 minutes" value={formatHours(a.significantIdleSeconds)} tone={a.significantIdleSeconds > 0 ? "paused" : undefined} />
            <Row
              icon={a.isDeviceAgentOnline ? Wifi : WifiOff}
              label="Agent status"
              value={
                <Badge tone={a.isDeviceAgentOnline ? "success" : "neutral"} dot>
                  {a.isDeviceAgentOnline ? "Online" : "Offline"}
                </Badge>
              }
            />
            <Row
              icon={Monitor}
              label="Monitored workstation"
              value={a.registeredDevicesSeen.length ? a.registeredDevicesSeen.join(", ") : <span className={styles.muted}>None seen</span>}
            />
          </dl>
        </section>
      </div>

      {/* The comparison in one line, in plain words. */}
      <section className={styles.card} aria-labelledby="ev-coverage">
        <header className={ev.panelHead}>
          <span className={ev.panelIcon} data-kind="official" aria-hidden="true">
            <Scale size={18} />
          </span>
          <div>
            <h3 id="ev-coverage">Activity coverage</h3>
            <p>
              {coverage === null
                ? "No net work time recorded, so there is nothing to compare."
                : `The device was active for ${coverage}% of the net work time.`}{" "}
              Site visits and meetings happen away from the computer, so a low number is a prompt to ask, not proof.
            </p>
          </div>
        </header>
        {coverage !== null && (
          <div className={ev.bar} role="img" aria-label={`Coverage ${coverage}%`}>
            <span className={ev.barSignal} style={{ width: `${Math.min(100, coverage)}%` }} />
          </div>
        )}
      </section>

      {timeline.length > 0 && (
        <section className={styles.card} aria-labelledby="ev-entries">
          <header className={ev.panelHead}>
            <span className={ev.panelIcon} data-kind="official" aria-hidden="true">
              <ListOrdered size={18} />
            </span>
            <div>
              <h3 id="ev-entries">Recorded entries</h3>
              <p>Each project, location or activity change starts a new entry.</p>
            </div>
          </header>
          <Timeline events={timeline} now={now} label={`Clock entries for ${d.date}`} timeZone="Africa/Lagos" />
        </section>
      )}
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  hint,
  value,
  tone,
  strong,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  value: React.ReactNode;
  tone?: "paused";
  strong?: boolean;
}) {
  return (
    <div className={ev.row} data-tone={tone} data-strong={strong || undefined}>
      <dt>
        <Icon size={16} aria-hidden="true" />
        <span>
          {label}
          {hint && <small>{hint}</small>}
        </span>
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

function EvidenceSkeleton() {
  return (
    <div className={styles.layout} role="status" aria-label="Loading evidence" aria-busy="true">
      <div className={styles.card} aria-hidden="true">
        <div className={ev.verdictHead}>
          <Block shape="pill" width={44} height={44} index={0} />
          <Block width="18rem" height="2.5rem" radius="0.375rem" index={1} />
        </div>
      </div>
      <div className={ev.split} aria-hidden="true">
        {[0, 1].map((c) => (
          <div key={c} className={styles.card}>
            <Block width="14rem" height="2.25rem" radius="0.375rem" index={2 + c * 5} />
            {[0, 1, 2, 3].map((i) => (
              <Block key={i} width="100%" height="2.5rem" radius="0.375rem" index={3 + c * 5 + i} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

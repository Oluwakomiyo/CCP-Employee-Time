"use client";

import { useState } from "react";
import Link from "next/link";
import { Square } from "lucide-react";
import { Alert } from "@/components/arc/alert/alert";
import { ActionButton } from "@/components/arc/action-button/action-button";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { HoldToConfirm } from "@/components/arc/hold-to-confirm/hold-to-confirm";
import { Select } from "@/components/arc/select/select";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { TodaySkeleton } from "./today-skeleton";
import { Textarea } from "@/components/arc/textarea/textarea";
import { Drawer, DrawerContent } from "@/components/arc/drawer/drawer";
import { errorMessage } from "@/lib/api";
import {
  ACTIVITIES,
  BREAKS,
  LOCATIONS,
  formatClock,
  formatHours,
  formatTime,
  labelOf,
  useMyProjects,
  useTicker,
  useTimeAction,
  useToday,
  type ActivityType,
  type BreakType,
  type LocationType,
} from "@/lib/time";
import styles from "./today.module.css";

type Change = "project" | "location" | "activity";

export function TodayClock() {
  const today = useToday();
  const projects = useMyProjects();
  const action = useTimeAction();
  const [error, setError] = useState<string | null>(null);
  // Controls the hold button's done state, so a refused or failed end rewinds it instead of sticking on "Work ended".
  const [ending, setEnding] = useState(false);
  const running = today.data?.state === "WORKING" || today.data?.state === "ON_BREAK";
  const now = useTicker(running);

  // Run an action; ActionButton shows pending/success, errors land in the alert.
  const run = (path: string, body?: unknown) => {
    setError(null);
    return action.mutateAsync({ path, body });
  };
  const onError = (e: unknown) => setError(errorMessage(e));

  if (today.isPending) return <TodaySkeleton />;
  if (today.isError) return <Alert tone="danger" title="Could not load today">{errorMessage(today.error)}</Alert>;

  const t = today.data;
  const seg = t.activeSegment;
  // Server numbers are as of the last fetch; add the time since then while the clock runs.
  const drift = (now - today.dataUpdatedAt) / 1000;
  const onBreak = t.state === "ON_BREAK";
  const working = t.today.workingSeconds + (t.state === "WORKING" ? Math.max(0, drift) : 0);
  const breakSeconds = t.today.breakSeconds + (onBreak ? Math.max(0, drift) : 0);
  const breakElapsed = (seg?.activeBreak?.breakElapsedSeconds ?? 0) + Math.max(0, drift);

  return (
    <div className={styles.layout}>
      {error && (
        <Alert tone="danger" title="That didn't work" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      {(t.today.status === "MISSING_CLOCK_OUT" || t.today.status === "CORRECTION_PENDING") && (
        <Alert tone="warning" title={t.today.status === "MISSING_CLOCK_OUT" ? "A clock-out is missing" : "A correction is waiting for review"}>
          Today&apos;s hours are not final yet. <Link href="/my-corrections">Open my corrections</Link>
        </Alert>
      )}

      <section className={styles.panel} aria-labelledby="clock-state">
        <div className={styles.stateRow}>
          <h2 id="clock-state" className={styles.stateTitle}>
            {t.state === "WORKING" ? "Working" : onBreak ? "On a break" : "Not clocked in"}
          </h2>
          <Badge tone={t.state === "WORKING" ? "success" : onBreak ? "warning" : "neutral"} dot>
            {t.state === "WORKING" ? "Clock running" : onBreak ? `${labelOf(BREAKS, seg?.activeBreak?.breakType)} ${formatClock(breakElapsed)}` : "Clock stopped"}
          </Badge>
        </div>

        <p className={styles.timer} aria-live="off" aria-label={`Worked today ${formatHours(working)}`}>
          {formatClock(working)}
        </p>
        <dl className={styles.stats}>
          <div>
            <dt>Worked today</dt>
            <dd>{formatHours(working)}</dd>
          </div>
          <div>
            <dt>Breaks</dt>
            <dd>{formatHours(breakSeconds)}</dd>
          </div>
          {seg && (
            <div>
              <dt>Since</dt>
              <dd>{formatTime(seg.clockIn)}</dd>
            </div>
          )}
        </dl>

        {seg && (
          <dl className={styles.context}>
            <div>
              <dt>Project</dt>
              <dd>
                {seg.projectCode} {seg.projectName}
              </dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>{labelOf(LOCATIONS, seg.location)}</dd>
            </div>
            <div>
              <dt>Doing</dt>
              <dd>
                {labelOf(ACTIVITIES, seg.activity?.activityType) || "Not set"}
                {seg.activity?.description ? <span className={styles.note}>{seg.activity.description}</span> : null}
              </dd>
            </div>
          </dl>
        )}

        {t.state === "NOT_WORKING" ? (
          <StartForm projects={projects} onStart={(body) => run("start", body)} onError={onError} />
        ) : (
          <div className={styles.actions}>
            {onBreak ? (
              <ActionButton label="End break" pendingLabel="Ending break" successLabel="Back to work" onAction={() => run("breaks/end").then(() => undefined)} onActionError={onError} />
            ) : (
              <>
                <BreakButton onStart={(breakType) => run("breaks/start", { breakType })} onError={onError} />
                <ChangeDrawer projects={projects} current={seg!} onChange={run} onError={onError} />
              </>
            )}
            <HoldToConfirm
              label="Hold to end work"
              confirmedLabel="Work ended"
              tone="danger"
              icon={<Square size={16} aria-hidden="true" />}
              disabled={action.isPending || onBreak}
              confirmed={ending}
              onConfirm={() => {
                setEnding(true);
                run("end")
                  .catch(onError)
                  .finally(() => setEnding(false));
              }}
            />
          </div>
        )}
        {onBreak && <p className={styles.hint}>End the break before changing project, location or activity, or ending work.</p>}
      </section>
    </div>
  );
}

type Projects = ReturnType<typeof useMyProjects>;

function ProjectSelect({ projects, value, onChange }: { projects: Projects; value: string; onChange: (v: string) => void }) {
  const options = (projects.data ?? []).map((p) => ({ value: p.id, label: `${p.code} ${p.name}` }));
  return (
    <Select
      label="Project"
      placeholder={projects.isPending ? "Loading projects" : options.length ? "Choose a project" : "No active projects assigned to you"}
      options={options}
      value={value}
      onValueChange={onChange}
      disabled={!options.length}
    />
  );
}

function StartForm({ projects, onStart, onError }: { projects: Projects; onStart: (body: unknown) => Promise<unknown>; onError: (e: unknown) => void }) {
  const [projectId, setProjectId] = useState("");
  const [location, setLocation] = useState<LocationType>("OFFICE");
  const [activity, setActivity] = useState<ActivityType>("DESIGN");
  const [description, setDescription] = useState("");

  return (
    <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
      <ProjectSelect projects={projects} value={projectId} onChange={setProjectId} />
      <SegmentedControl label="Where are you working?" options={LOCATIONS} value={location} onValueChange={(v: string) => setLocation(v as LocationType)} fullWidth />
      <Select label="What are you doing?" options={ACTIVITIES} value={activity} onValueChange={(v: string) => setActivity(v as ActivityType)} />
      <Textarea label="Notes" description="Optional. For example: ground floor layout revisions." maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      <ActionButton
        label="Start work"
        pendingLabel="Starting"
        successLabel="Clock running"
        disabled={!projectId}
        onAction={() => onStart({ projectId, locationType: location, activityType: activity, description: description.trim() || undefined }).then(() => undefined)}
        onActionError={onError}
      />
    </form>
  );
}

function BreakButton({ onStart, onError }: { onStart: (t: BreakType) => Promise<unknown>; onError: (e: unknown) => void }) {
  const [type, setType] = useState<BreakType>("SHORT_BREAK");
  return (
    <div className={styles.breakRow}>
      <Select label="Break type" options={BREAKS} value={type} onValueChange={(v: string) => setType(v as BreakType)} />
      <ActionButton label="Start break" pendingLabel="Starting break" successLabel="On a break" onAction={() => onStart(type).then(() => undefined)} onActionError={onError} />
    </div>
  );
}

function ChangeDrawer({
  projects,
  current,
  onChange,
  onError,
}: {
  projects: Projects;
  current: NonNullable<ReturnType<typeof useToday>["data"]>["activeSegment"] & object;
  onChange: (path: string, body: unknown) => Promise<unknown>;
  onError: (e: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const [what, setWhat] = useState<Change>("activity");
  const [projectId, setProjectId] = useState("");
  const [location, setLocation] = useState<LocationType>(current.location);
  const [activity, setActivity] = useState<ActivityType>(current.activity?.activityType ?? "DESIGN");
  const [description, setDescription] = useState("");

  const submit = async () => {
    const desc = description.trim() || undefined;
    if (what === "project") await onChange("project", { projectId, activityType: activity, description: desc });
    else if (what === "location") await onChange("location", { locationType: location });
    else await onChange("activity", { activityType: activity, description: desc });
    setOpen(false);
  };
  const unchanged =
    (what === "project" && (!projectId || projectId === current.projectId)) || (what === "location" && location === current.location);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Change project, location or activity
      </Button>
      <DrawerContent title="Change what you're working on" description="The current entry closes now and a new one starts.">
        <div className={styles.form}>
          <SegmentedControl
            label="Change"
            options={[
              { value: "activity", label: "Activity" },
              { value: "project", label: "Project" },
              { value: "location", label: "Location" },
            ]}
            value={what}
            onValueChange={(v: string) => setWhat(v as Change)}
            fullWidth
          />
          {what === "project" && <ProjectSelect projects={projects} value={projectId} onChange={setProjectId} />}
          {what === "location" && (
            <SegmentedControl label="Where are you working?" options={LOCATIONS} value={location} onValueChange={(v: string) => setLocation(v as LocationType)} fullWidth />
          )}
          {what !== "location" && (
            <>
              <Select label="What are you doing?" options={ACTIVITIES} value={activity} onValueChange={(v: string) => setActivity(v as ActivityType)} />
              <Textarea label="Notes" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </>
          )}
          <ActionButton label="Save change" pendingLabel="Saving" successLabel="Saved" disabled={unchanged} onAction={submit} onActionError={onError} />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

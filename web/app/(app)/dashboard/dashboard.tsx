"use client";

import { useState } from "react";
import { Alert } from "@/components/arc/alert/alert";
import { BarChart } from "@/components/arc/bar-chart/bar-chart";
import { DonutChart } from "@/components/arc/donut-chart/donut-chart";
import EmptyState from "@/components/arc/empty-state/empty-state";
import { LineChart } from "@/components/arc/line-chart/line-chart";
import { MetricCard } from "@/components/arc/metric-card/metric-card";
import { Block } from "@/components/loading/skeleton-block";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { errorMessage } from "@/lib/api";
import {
  ACTIVITIES,
  labelOf,
  LOCATIONS,
  type ActivityType,
  type LocationType,
} from "@/lib/time";
import {
  fillDays,
  rangeFor,
  useDashboard,
  type DashboardRange,
  type EstimateVsActual,
} from "@/lib/dashboard";
import Badge from "@/components/arc/badge/badge";
import { Progress } from "@/components/arc/progress/progress";
import styles from "./dashboard.module.css";

const RANGES: { value: DashboardRange; label: string }[] = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-NG", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "Africa/Lagos",
  }).format(new Date(`${iso}T00:00:00.000Z`));

const shortDay = (iso: string) =>
  new Intl.DateTimeFormat("en-NG", {
    month: "short",
    day: "numeric",
    timeZone: "Africa/Lagos",
  }).format(new Date(`${iso}T00:00:00.000Z`));

export function DashboardView() {
  const [range, setRange] = useState<DashboardRange>("30");
  const { from, to } = rangeFor(range);
  const dashboard = useDashboard(from, to);

  if (dashboard.isPending) return <DashboardSkeleton />;
  if (dashboard.isError)
    return (
      <Alert tone='danger' title='Could not load the dashboard'>
        {errorMessage(dashboard.error)}
      </Alert>
    );

  const { cards, charts } = dashboard.data;
  const period = `Last ${range} days`;
  // The server returns only days with hours; fill the gaps so the axis is true to the calendar.
  const overTime = fillDays(
    dashboard.data.range.from,
    dashboard.data.range.to,
    charts.hoursOverTime,
  );
  const anyHours = overTime.some((d) => d.hours > 0);

  return (
    <div className={styles.layout} aria-busy={dashboard.isFetching}>
      <div className={styles.toolbar}>
        <SegmentedControl
          label='Range'
          options={RANGES}
          value={range}
          onValueChange={(v: string) => setRange(v as DashboardRange)}
        />
      </div>

      <div className={styles.kpis}>
        <MetricCard
          label='Working now'
          value={cards.employeesWorkingToday}
          context='clocked in'
        />
        <MetricCard
          label='On a break'
          value={cards.employeesOnBreak}
          context='taking a break'
        />
        <MetricCard
          label='Not clocked in'
          value={cards.employeesNotClockedIn}
          context='no time today'
        />
        <MetricCard
          label='Finished'
          value={cards.employeesFinished}
          context='done for today'
        />
        <MetricCard
          label='Hours today'
          value={cards.totalHoursToday}
          suffix='h'
          context='across the team'
        />
        <MetricCard
          label='Active projects'
          value={cards.activeProjects}
          context='currently active'
        />
        <MetricCard
          label='Missing clock-outs'
          value={cards.missingClockOuts}
          context='need a correction'
        />
        <MetricCard
          label='Pending corrections'
          value={cards.pendingCorrections}
          context='awaiting review'
        />
      </div>

      <section className={styles.card} aria-label='Hours over time'>
        <h2>Hours over time</h2>
        {!anyHours ? (
          <EmptyState
            title='No hours in this range'
            description='Hours appear once the team clocks time.'
          />
        ) : (
          <LineChart
            label='Hours worked'
            unit='h'
            height={240}
            categoryLabel='Day'
            series={[{ key: "hours", label: "Hours" }]}
            data={overTime.map((d) => ({
              key: d.date,
              label: dayLabel(d.date),
              axisLabel: shortDay(d.date),
              values: { hours: d.hours },
            }))}
          />
        )}
      </section>

      <div className={styles.grid2}>
        <section className={styles.card} aria-label='Hours by project'>
          <h2>Hours by project</h2>
          {charts.hoursByProject.length === 0 ? (
            <EmptyState
              title='No project hours yet'
              description='Hours appear once the team clocks time.'
            />
          ) : (
            <BarChart
              label='Hours by project'
              period={period}
              unit='h'
              valueLabel='Hours'
              averageLabel='Average per project'
              categoryLabel='Project'
              showAverage={false}
              data={charts.hoursByProject.map((p) => ({
                key: p.projectId,
                label: `${p.code} ${p.name}`,
                axisLabel: p.code,
                value: p.hours,
              }))}
            />
          )}
        </section>
        <section
          className={styles.card}
          aria-label='Estimated against actual hours'>
          <h2>Estimated against actual</h2>
          {charts.estimatedVsActual.length === 0 ? (
            <EmptyState
              title='No active projects'
              description='Estimates appear once projects are created.'
            />
          ) : (
            <EstimateList projects={charts.estimatedVsActual} />
          )}
        </section>
      </div>

      <div className={styles.grid2}>
        <section className={styles.card} aria-label='Hours by location'>
          <h2>Hours by location</h2>
          <DonutChart
            label='Hours by location'
            unit='h'
            data={charts.locationDistribution.map((l) => ({
              key: String(l.location),
              label: labelOf(LOCATIONS, l.location as LocationType),
              value: l.hours,
            }))}
          />
        </section>
        <section className={styles.card} aria-label='Hours by activity'>
          <h2>Hours by activity</h2>
          <DonutChart
            label='Hours by activity'
            unit='h'
            data={charts.activityDistribution.map((a) => ({
              key: String(a.activityType),
              label: labelOf(ACTIVITIES, a.activityType as ActivityType),
              value: a.hours,
            }))}
          />
        </section>
      </div>
    </div>
  );
}

/** Actual hours against each project's estimate; over-budget projects are flagged with the overrun. */
function EstimateList({ projects }: { projects: EstimateVsActual[] }) {
  return (
    <ul className={styles.estimates}>
      {projects.map((p) => {
        const over =
          p.estimatedHours !== null && p.actualHours > p.estimatedHours;
        return (
          <li key={p.projectId}>
            <div className={styles.estimateHead}>
              <span>
                {p.code} {p.name}
              </span>
              {p.estimatedHours === null ? (
                <span className={styles.estimateMeta}>
                  {p.actualHours}h, no estimate
                </span>
              ) : over ? (
                <Badge tone='warning'>
                  Over by{" "}
                  {Math.round((p.actualHours - p.estimatedHours) * 100) / 100}h
                </Badge>
              ) : (
                <span className={styles.estimateMeta}>
                  {p.actualHours} of {p.estimatedHours}h
                </span>
              )}
            </div>
            {p.estimatedHours !== null && (
              <Progress
                value={p.actualHours}
                max={p.estimatedHours}
                aria-label={`${p.code} ${p.name}: ${p.actualHours} of ${p.estimatedHours} estimated hours`}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function DashboardSkeleton() {
  return (
    <div
      className={styles.layout}
      role='status'
      aria-label='Loading dashboard'
      aria-busy='true'>
      <div className={styles.toolbar} aria-hidden='true'>
        <Block
          width='16rem'
          height='2.75rem'
          radius='var(--radius-control)'
          index={0}
        />
      </div>
      <div className={styles.kpis} aria-hidden='true'>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className={styles.card}>
            <Block
              width='6rem'
              height='1.125rem'
              radius='0.25rem'
              index={1 + i * 2}
            />
            <Block
              width='4rem'
              height='1.75rem'
              radius='0.375rem'
              index={2 + i * 2}
            />
          </div>
        ))}
      </div>
      <div className={styles.card} aria-hidden='true'>
        <Block width='10rem' height='1.4rem' radius='0.375rem' index={17} />
        <Block width='100%' height={200} radius='0.5rem' index={18} />
      </div>
      <div className={styles.grid2} aria-hidden='true'>
        {[0, 1].map((i) => (
          <div key={i} className={styles.card}>
            <Block
              width='9rem'
              height='1.4rem'
              radius='0.375rem'
              index={19 + i}
            />
            <Block width='100%' height={140} radius='0.5rem' index={21 + i} />
          </div>
        ))}
      </div>
    </div>
  );
}

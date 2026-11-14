"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Alert } from "@/components/arc/alert/alert";
import Badge from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import DateRangePicker, { type DateRange } from "@/components/arc/date-range-picker/date-range-picker";
import EmptyState from "@/components/arc/empty-state/empty-state";
import FilterToolbar, { type FilterChip, type FilterField } from "@/components/arc/filter-toolbar/filter-toolbar";
import { Pagination } from "@/components/arc/pagination/pagination";
import SortableDataTable, { type DataColumn } from "@/components/arc/sortable-data-table/sortable-data-table";
import { MyTimeSkeleton } from "./my-time-skeleton";
import Timeline, { type TimelineEvent } from "@/components/arc/timeline/timeline";
import { errorMessage } from "@/lib/api";
import {
  lagosDay,
  netSeconds,
  useWorkHistory,
  type HistoryFilters,
  type WorkDay,
} from "@/lib/history";
import { ACTIVITIES, formatHours, formatTime, labelOf, LOCATIONS, useMyProjects, type DayStatus, type LocationType } from "@/lib/time";
import styles from "./my-time.module.css";

const labelOfActivities = (v: string) => ACTIVITIES.find((a) => a.value === v)?.label ?? v;

const STATUS_TONE = {
  OPEN: "info",
  COMPLETED: "success",
  MISSING_CLOCK_OUT: "warning",
  CORRECTION_PENDING: "warning",
  CORRECTED: "neutral",
} as const;

const STATUS_LABEL: Record<DayStatus, string> = {
  OPEN: "Open",
  COMPLETED: "Completed",
  MISSING_CLOCK_OUT: "Missing clock-out",
  CORRECTION_PENDING: "Correction pending",
  CORRECTED: "Corrected",
};

const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-NG", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "Africa/Lagos",
  }).format(new Date(iso));

type Row = Record<string, unknown> & {
  id: string;
  date: string;
  dateLabel: string;
  status: DayStatus;
  projects: string;
  net: number;
  netLabel: string;
  breaksLabel: string;
};

export function MyTimeList() {
  const [page, setPage] = useState(1);
  const [range, setRange] = useState<DateRange | null>(null);
  const [projectId, setProjectId] = useState("");
  const [location, setLocation] = useState<LocationType | "">("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const projects = useMyProjects();
  const filters: HistoryFilters = {
    page,
    limit: 10,
    startDate: range ? lagosDay(range.start) : undefined,
    endDate: range ? lagosDay(range.end) : undefined,
    projectId: projectId || undefined,
    location: location || undefined,
  };
  const history = useWorkHistory(filters);
  const days = useMemo(() => history.data?.data.history ?? [], [history.data]);
  const [now] = useState(() => Date.now());

  const projectOptions = useMemo(
    () => (projects.data ?? []).map((p) => ({ value: p.id, label: `${p.code} ${p.name}` })),
    [projects.data],
  );
  const fields: FilterField[] = useMemo(
    () => [
      { id: "projectId", label: "Project", options: projectOptions },
      { id: "location", label: "Location", options: LOCATIONS.map((l) => ({ value: l.value, label: l.label })) },
    ],
    [projectOptions],
  );
  const chips: FilterChip[] = useMemo(() => {
    const list: FilterChip[] = [];
    if (projectId) list.push({ id: "projectId", label: "Project", value: projectOptions.find((o) => o.value === projectId)?.label ?? projectId });
    if (location) list.push({ id: "location", label: "Location", value: labelOf(LOCATIONS, location) });
    return list;
  }, [projectId, location, projectOptions]);

  const rows: Row[] = useMemo(
    () =>
      days.map((d) => ({
        id: d.id,
        date: d.date,
        dateLabel: dayLabel(d.date),
        status: d.status,
        projects: [...new Set(d.segments.map((s) => s.project.code))].join(", ") || "No entries",
        net: netSeconds(d),
        netLabel: formatHours(netSeconds(d)),
        breaksLabel: formatHours(d.totalBreakSeconds),
      })),
    [days],
  );

  const columns: DataColumn<Row>[] = useMemo(
    () => [
      {
        key: "date",
        label: "Date",
        render: (_v, row) => String(row.dateLabel),
      },
      {
        key: "status",
        label: "Status",
        render: (_v, row) => (
          <Badge tone={STATUS_TONE[row.status as DayStatus]} dot>
            {STATUS_LABEL[row.status as DayStatus]}
          </Badge>
        ),
      },
      { key: "projects", label: "Projects" },
      { key: "netLabel", label: "Net worked" },
      { key: "breaksLabel", label: "Breaks" },
      {
        key: "id",
        label: "Details",
        sortable: false,
        render: (_v, row) => (
          <Button variant="ghost" size="sm" onClick={() => setSelectedId(String(row.id))}>
            View
          </Button>
        ),
      },
    ],
    [],
  );

  const selected: WorkDay | null = days.find((d) => d.id === selectedId) ?? days[0] ?? null;
  const events: TimelineEvent[] = useMemo(() => {
    if (!selected) return [];
    return selected.segments.map((s) => {
      const breakLines = s.breaks.map(
        (b) => `${b.breakType.toLowerCase().replace("_", " ")} ${formatTime(b.startTime)} to ${b.endTime ? formatTime(b.endTime) : "ongoing"}`,
      );
      const activityLines = s.activities.map(
        (a) => `${labelOfActivities(a.activityType)}${a.notes ? ` (${a.notes})` : ""} from ${formatTime(a.startTime)}${a.endTime ? ` to ${formatTime(a.endTime)}` : ""}`,
      );
      const detail =
        breakLines.length || activityLines.length ? (
          <ul className={styles.segmentList}>
            {activityLines.map((line, i) => (
              <li key={`a-${i}`}>{line}</li>
            ))}
            {breakLines.map((line, i) => (
              <li key={`b-${i}`}>Break: {line}</li>
            ))}
          </ul>
        ) : undefined;
      return {
        id: s.id,
        at: s.clockIn,
        actor: s.project.code,
        title: `${s.project.name}, ${labelOf(LOCATIONS, s.location).toLowerCase()}${s.clockOut ? "" : " (ongoing)"}`,
        meta: `${formatTime(s.clockIn)} to ${s.clockOut ? formatTime(s.clockOut) : "now"}`,
        detail,
      } satisfies TimelineEvent;
    });
  }, [selected]);

  if (history.isPending) return <MyTimeSkeleton />;
  if (history.isError)
    return (
      <Alert tone="danger" title="Could not load work history">
        {errorMessage(history.error)}
      </Alert>
    );

  const meta = history.data?.meta;
  const pageCount = meta?.totalPages ?? 0;

  return (
    <div className={styles.layout}>
      <div className={styles.filters}>
        <DateRangePicker value={range} onChange={(r) => { setRange(r); setPage(1); }} label="Date range" />
      </div>
      <FilterToolbar
        filters={chips}
        onRemove={(id) => {
          if (id === "projectId") setProjectId("");
          if (id === "location") setLocation("");
          setPage(1);
        }}
        onClearAll={() => { setProjectId(""); setLocation(""); setPage(1); }}
        addFilter={{
          fields,
          label: "Add filter",
          onAdd: (chip, field) => {
            if (field.id === "projectId") {
              const match = projectOptions.find((o) => o.label === chip.value);
              setProjectId(match?.value ?? "");
            }
            if (field.id === "location") {
              const match = LOCATIONS.find((l) => l.label === chip.value);
              setLocation(match?.value ?? "");
            }
            setPage(1);
          },
        }}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No workdays found"
          description="Try a wider date range or clear the filters."
          action={<Button variant="secondary" onClick={() => { setRange(null); setProjectId(""); setLocation(""); setPage(1); }}>Clear filters</Button>}
        />
      ) : (
        <>
          <div className={styles.tableWrap}>
            <SortableDataTable rows={rows} columns={columns} rowKey="id" caption="Workdays" defaultSort={{ key: "date", direction: "desc" }} />
          </div>
          {pageCount > 1 && (
            <div className={styles.pager}>
              <Pagination page={page} pageCount={pageCount} onPageChange={setPage} label="Work history pages" />
            </div>
          )}
        </>
      )}

      {selected && (
        <section className={styles.detail} aria-label={`Details for ${dayLabel(selected.date)}`}>
          <div className={styles.detailHead}>
            <h2>{dayLabel(selected.date)}</h2>
            <Badge tone={STATUS_TONE[selected.status]} dot>{STATUS_LABEL[selected.status]}</Badge>
          </div>
          <p className={styles.meta}>
            Net {formatHours(netSeconds(selected))} worked, {formatHours(selected.totalBreakSeconds)} on breaks.
          </p>
          {selected.status === "MISSING_CLOCK_OUT" && (
            <Alert tone="warning" title="A clock-out is missing">
              This day is not final. <Link href={`/my-corrections?workDayId=${selected.id}`}>Request a correction</Link>
            </Alert>
          )}
          {events.length ? (
            <Timeline events={events} now={now} label={`Timeline for ${dayLabel(selected.date)}`} timeZone="Africa/Lagos" />
          ) : (
            <p className={styles.meta}>No segments recorded on this day.</p>
          )}
          <div>
            <Link href={`/my-corrections?workDayId=${selected.id}`}>Request correction for this day</Link>
          </div>
        </section>
      )}
    </div>
  );
}

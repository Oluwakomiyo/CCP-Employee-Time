"use client";

import { useMemo } from "react";
import { Alert } from "@/components/arc/alert/alert";
import { Avatar } from "@/components/arc/avatar/avatar";
import Badge from "@/components/arc/badge/badge";
import EmptyState from "@/components/arc/empty-state/empty-state";
import SortableDataTable, { type DataColumn } from "@/components/arc/sortable-data-table/sortable-data-table";
import { Block } from "@/components/loading/skeleton-block";
import { TableSkeleton } from "@/components/loading/table-skeleton";
import { errorMessage } from "@/lib/api";
import { ACTIVITIES, formatHours, formatTime, labelOf, LOCATIONS, useTicker } from "@/lib/time";
import { useLiveStatus, type LiveRow, type LiveState } from "@/lib/live";
import styles from "./live.module.css";

const STATE_TONE = { WORKING: "success", ON_BREAK: "warning", FINISHED: "neutral", NOT_STARTED: "neutral" } as const;
const STATE_LABEL: Record<LiveState, string> = {
  WORKING: "Working",
  ON_BREAK: "On a break",
  FINISHED: "Finished",
  NOT_STARTED: "Not started",
};

type Row = Record<string, unknown> & {
  id: string;
  name: string;
  detail: string;
  state: LiveState;
  project: string;
  doing: string;
  elapsed: number;
  elapsedLabel: string;
  elapsedSort: number;
};

export function LiveBoard() {
  const live = useLiveStatus();
  const running = (live.data ?? []).some((r) => r.state === "WORKING" || r.state === "ON_BREAK");
  const now = useTicker(running);

  const rows: Row[] = useMemo(
    () =>
      (live.data ?? []).map((r) => {
        const name = `${r.employee.firstName} ${r.employee.lastName}`;
        // Measured from `since` (the break start while on a break), plus the time since the last fetch.
        const elapsed = r.since ? r.sinceSeconds + Math.max(0, (now - live.dataUpdatedAt) / 1000) : 0;
        return {
          id: r.employee.id,
          name,
          detail: `${r.employee.position} · ${r.employee.department}`,
          state: r.state,
          project: r.project ? `${r.project.code} ${r.project.name}` : "–",
          doing:
            r.state === "ON_BREAK"
              ? `On a break${r.breakType ? ` (${String(r.breakType).toLowerCase().replace("_", " ")})` : ""}`
              : [labelOf(LOCATIONS, r.location), r.activity ? labelOf(ACTIVITIES, r.activity) : ""].filter(Boolean).join(" · ") || "–",
          elapsed,
          elapsedLabel: r.since ? `${formatHours(elapsed)} (since ${formatTime(r.since)})` : "–",
          elapsedSort: r.since ? elapsed : -1,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live.data, now],
  );

  const columns: DataColumn<Row>[] = useMemo(
    () => [
      {
        key: "name",
        label: "Employee",
        render: (_v, row) => (
          <span className={styles.who}>
            <Avatar name={String(row.name)} size="sm" status={row.state === "WORKING" || row.state === "ON_BREAK" ? "online" : "offline"} />
            <span className={styles.name}>
              {String(row.name)}
              <small>{String(row.detail)}</small>
            </span>
          </span>
        ),
      },
      {
        key: "state",
        label: "State",
        render: (_v, row) => (
          <Badge tone={STATE_TONE[row.state as LiveState]} dot>
            {STATE_LABEL[row.state as LiveState]}
          </Badge>
        ),
      },
      { key: "project", label: "Project" },
      { key: "doing", label: "Doing" },
      // Sorts on the number; the label is only what is shown.
      { key: "elapsedSort", label: "In this state", render: (_v, row) => String(row.elapsedLabel) },
    ],
    [],
  );

  if (live.isPending) return <LiveSkeleton />;
  if (live.isError)
    return (
      <Alert tone="danger" title="Could not load live status">
        {errorMessage(live.error)}
      </Alert>
    );

  return (
    <div className={styles.layout}>
      <p className={styles.meta}>Updates every 15 seconds. Showing {rows.length} active {rows.length === 1 ? "employee" : "employees"}.</p>
      {rows.length === 0 ? (
        <EmptyState title="Nobody to show" description="There are no active employees in your scope." />
      ) : (
        <div className={styles.tableWrap}>
          <SortableDataTable rows={rows} columns={columns} rowKey="id" caption="Who's working now" defaultSort={{ key: "name", direction: "asc" }} />
        </div>
      )}
    </div>
  );
}

export function LiveSkeleton() {
  return (
    <div className={styles.layout} role="status" aria-label="Loading live status" aria-busy="true">
      <Block width="16rem" height="1.3125rem" radius="0.375rem" index={0} />
      <div className={styles.tableWrap}>
        <TableSkeleton rows={6} columns={[{ grow: 1.4, kind: "avatar" }, { grow: 0.8, pill: true }, { grow: 1.2 }, { grow: 1.4 }, { grow: 1 }]} />
      </div>
    </div>
  );
}

export type { LiveRow };

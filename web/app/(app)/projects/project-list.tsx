"use client";

import { FolderPlus } from "lucide-react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/arc/alert/alert";
import Badge from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Drawer } from "@/components/arc/drawer/drawer";
import EmptyState from "@/components/arc/empty-state/empty-state";
import { Pagination } from "@/components/arc/pagination/pagination";
import { SearchField } from "@/components/arc/search-field/search-field";
import { Select } from "@/components/arc/select/select";
import SortableDataTable, { type DataColumn } from "@/components/arc/sortable-data-table/sortable-data-table";
import { TableSkeleton } from "@/components/loading/table-skeleton";
import { InlineBusy } from "@/components/loading/spinner";
import { errorMessage } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { Progress } from "@/components/arc/progress/progress";
import { PROJECT_STATUSES, STATUS_TONE, useProjects, type ProjectStatus } from "@/lib/projects";
import { formatDate } from "@/lib/time";
import { can } from "@/lib/permissions";
import { ProjectForm } from "./project-form";
import styles from "../manage.module.css";

type Row = Record<string, unknown> & {
  id: string;
  code: string;
  name: string;
  client: string;
  status: ProjectStatus;
  team: number;
  worked: number;
  estimate: number | null;
  /** Share of the estimate used, for sorting; -1 when there is no estimate. */
  used: number;
  start: string;
};

export function ProjectList() {
  const router = useRouter();
  const me = useMe();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  // PMs work with the projects they lead; the CEO sees all of them.
  const list = useProjects({ search, status: status === "ALL" ? null : (status as ProjectStatus), page, mine: !!me.data && !can(me.data, "projects.view", "ALL") });

  const rows: Row[] = useMemo(
    () =>
      (list.data?.data ?? []).map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        client: p.clientName ?? "–",
        status: p.status,
        team: p._count.members,
        worked: p.hoursWorked ?? 0,
        estimate: p.estimatedHours ? Number(p.estimatedHours) : null,
        used: p.estimatedHours ? (p.hoursWorked ?? 0) / Number(p.estimatedHours) : -1,
        start: p.startDate,
      })),
    [list.data],
  );

  const columns: DataColumn<Row>[] = useMemo(
    () => [
      {
        key: "code",
        label: "Project",
        render: (_v, row) => (
          <Link href={`/projects/${row.id}`} className={styles.who}>
            <span>
              {row.code} {row.name}
              <small>{row.client}</small>
            </span>
          </Link>
        ),
      },
      { key: "status", label: "Status", render: (_v, row) => <Badge tone={STATUS_TONE[row.status]} dot>{PROJECT_STATUSES.find((s) => s.value === row.status)?.label}</Badge> },
      { key: "used", label: "Hours against estimate", numeric: false, render: (_v, row) => <EstimateCell worked={row.worked} estimate={row.estimate} /> },
      { key: "team", label: "Team" },
      { key: "start", label: "Started", render: (_v, row) => formatDate(row.start) },
    ],
    [],
  );

  return (
    <div className={styles.layout}>
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <SearchField
            label="Search"
            placeholder="Code, name or client"
            value={search}
            onValueChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
          />
          <Select
            label="Status"
            options={[{ value: "ALL", label: "All statuses" }, ...PROJECT_STATUSES]}
            value={status}
            onValueChange={(v: string) => {
              setStatus(v);
              setPage(1);
            }}
          />
          <InlineBusy active={list.isPlaceholderData} />
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <FolderPlus size={16} aria-hidden="true" /> New project
        </Button>
      </div>

      {list.isPending ? (
        <div className={styles.tableWrap}>
          <TableSkeleton rows={6} columns={[{ grow: 1.6, kind: "twoLine" }, { grow: 0.7, pill: true }, { grow: 1.2, kind: "progress" }, { grow: 0.4 }, { grow: 0.7 }]} />
        </div>
      ) : list.isError ? (
        <Alert tone="danger" title="Could not load projects">
          {errorMessage(list.error)}
        </Alert>
      ) : rows.length === 0 ? (
        <EmptyState title="No projects found" description={search ? "Try another code or name." : "Create a project to start tracking time on it."} />
      ) : (
        <>
          <div className={styles.tableWrap} data-stale={list.isPlaceholderData} aria-busy={list.isPlaceholderData}>
            <SortableDataTable rows={rows} columns={columns} rowKey="id" caption="Projects" itemName={{ one: "project", other: "projects" }} />
          </div>
          {(list.data?.meta?.totalPages ?? 0) > 1 && (
            <div className={styles.pager}>
              <Pagination page={page} pageCount={list.data?.meta?.totalPages ?? 1} onPageChange={setPage} label="Project pages" />
            </div>
          )}
        </>
      )}

      <Drawer open={creating} onOpenChange={setCreating}>
        {creating && (
          <ProjectForm
            onSaved={(id) => {
              setCreating(false);
              if (id) router.push(`/projects/${id}`);
            }}
          />
        )}
      </Drawer>
    </div>
  );
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** "92 of 340h" with a bar, or an over-budget badge, or just the hours when there is no estimate. */
function EstimateCell({ worked, estimate }: { worked: number; estimate: number | null }) {
  if (estimate === null) return <span className={styles.muted}>{round1(worked)}h, no estimate</span>;
  if (worked > estimate) return <Badge tone="warning">Over by {round1(worked - estimate)}h</Badge>;
  return (
    <span className={styles.estimateCell}>
      <Progress value={worked} max={estimate} aria-label={`${round1(worked)} of ${estimate} estimated hours`} />
      <small className={styles.muted}>
        {round1(worked)} of {estimate}h
      </small>
    </span>
  );
}

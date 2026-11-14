"use client";

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
import { errorMessage } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { PROJECT_STATUSES, STATUS_TONE, useProjects, type ProjectStatus } from "@/lib/projects";
import { isCeo } from "@/lib/types";
import { ProjectForm } from "./project-form";
import styles from "../manage.module.css";

type Row = Record<string, unknown> & { id: string; project: string; client: string; status: ProjectStatus; team: number; estimate: string; start: string };

export function ProjectList() {
  const router = useRouter();
  const me = useMe();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  // PMs work with the projects they lead; the CEO sees all of them.
  const list = useProjects({ search, status: status === "ALL" ? null : (status as ProjectStatus), page, mine: !!me.data && !isCeo(me.data.role) });

  const rows: Row[] = useMemo(
    () =>
      (list.data?.data ?? []).map((p) => ({
        id: p.id,
        project: `${p.code} ${p.name}`,
        client: p.clientName ?? "–",
        status: p.status,
        team: p._count.members,
        estimate: p.estimatedHours ? `${Number(p.estimatedHours)}h` : "–",
        start: p.startDate.slice(0, 10),
      })),
    [list.data],
  );

  const columns: DataColumn<Row>[] = useMemo(
    () => [
      { key: "project", label: "Project", render: (_v, row) => <Link href={`/projects/${row.id}`}>{row.project}</Link> },
      { key: "client", label: "Client" },
      { key: "status", label: "Status", render: (_v, row) => <Badge tone={STATUS_TONE[row.status]} dot>{PROJECT_STATUSES.find((s) => s.value === row.status)?.label}</Badge> },
      { key: "team", label: "Team" },
      { key: "estimate", label: "Estimate" },
      { key: "start", label: "Started" },
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
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          New project
        </Button>
      </div>

      {list.isPending ? (
        <div className={styles.tableWrap}>
          <TableSkeleton rows={5} columns={[{ grow: 1.6 }, { grow: 1 }, { grow: 0.7, pill: true }, { grow: 0.4 }, { grow: 0.5 }, { grow: 0.7 }]} />
        </div>
      ) : list.isError ? (
        <Alert tone="danger" title="Could not load projects">
          {errorMessage(list.error)}
        </Alert>
      ) : rows.length === 0 ? (
        <EmptyState title="No projects found" description={search ? "Try another code or name." : "Create a project to start tracking time on it."} />
      ) : (
        <>
          <div className={styles.tableWrap}>
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

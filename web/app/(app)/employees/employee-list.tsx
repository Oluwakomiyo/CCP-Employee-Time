"use client";

import { UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/arc/alert/alert";
import { Avatar } from "@/components/arc/avatar/avatar";
import Badge from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Drawer } from "@/components/arc/drawer/drawer";
import EmptyState from "@/components/arc/empty-state/empty-state";
import { Pagination } from "@/components/arc/pagination/pagination";
import { SearchField } from "@/components/arc/search-field/search-field";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import SortableDataTable, { type DataColumn } from "@/components/arc/sortable-data-table/sortable-data-table";
import { TableSkeleton } from "@/components/loading/table-skeleton";
import { InlineBusy } from "@/components/loading/spinner";
import { errorMessage } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { formatMoney, fullName, ROLES, useEmployees, type EmploymentStatus } from "@/lib/employees";
import { sentenceCase } from "@/lib/time";
import { isCeo } from "@/lib/types";
import { EmployeeForm } from "./employee-form";
import { TempPasswordDialog } from "./temp-password-dialog";
import styles from "../manage.module.css";

const STATUS: { value: string; label: string }[] = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "ALL", label: "All" },
];
const STATUS_TONE = { ACTIVE: "success", INACTIVE: "neutral", ON_LEAVE: "info", TERMINATED: "danger" } as const;

type Row = Record<string, unknown> & { id: string; name: string; email: string; code: string; department: string; role: string; status: EmploymentStatus; rate: string };

export function EmployeeList() {
  const me = useMe();
  const ceo = isCeo(me.data?.role);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<{ name: string; password: string } | null>(null);
  const list = useEmployees({ search, status: status === "ALL" ? null : (status as EmploymentStatus), page });

  const rows: Row[] = useMemo(
    () =>
      (list.data?.data ?? []).map((e) => ({
        id: e.id,
        name: fullName(e),
        email: e.user.email,
        code: e.employeeCode,
        department: `${e.department} · ${e.position}`,
        role: ROLES.find((r) => r.value === e.user.role)?.label ?? e.user.role,
        status: e.status,
        rate: e.compensation ? `${formatMoney(e.compensation.baseHourlyRate, e.compensation.currency)}/h` : "–",
      })),
    [list.data],
  );

  const columns: DataColumn<Row>[] = useMemo(
    () => [
      {
        key: "name",
        label: "Employee",
        render: (_v, row) => (
          <Link href={`/employees/${row.id}`} className={styles.who}>
            <Avatar name={row.name} size="sm" />
            <span>
              {row.name}
              <small>{row.email}</small>
            </span>
          </Link>
        ),
      },
      { key: "code", label: "Number" },
      { key: "department", label: "Department" },
      { key: "role", label: "Role" },
      { key: "status", label: "Status", render: (_v, row) => <Badge tone={STATUS_TONE[row.status]} dot>{sentenceCase(row.status)}</Badge> },
      // Pay is CEO only; the API omits it for everyone else.
      ...(ceo ? [{ key: "rate", label: "Hourly rate" }] : []),
    ],
    [ceo],
  );

  return (
    <div className={styles.layout}>
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <SearchField
            label="Search"
            placeholder="Name, number or email"
            value={search}
            onValueChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
          />
          <SegmentedControl
            label="Status"
            options={STATUS}
            value={status}
            onValueChange={(v: string) => {
              setStatus(v);
              setPage(1);
            }}
          />
          <InlineBusy active={list.isPlaceholderData} />
        </div>
        {ceo && (
          <Button variant="primary" onClick={() => setAdding(true)}>
            <UserPlus size={16} aria-hidden="true" /> Add employee
          </Button>
        )}
      </div>

      {list.isPending ? (
        <div className={styles.tableWrap}>
          <TableSkeleton tall rows={10} columns={[{ grow: 1.6, kind: "avatar" }, { grow: 0.6 }, { grow: 1.4 }, { grow: 0.8 }, { grow: 0.6, pill: true }, ...(ceo ? [{ grow: 0.8 }] : [])]} />
        </div>
      ) : list.isError ? (
        <Alert tone="danger" title="Could not load employees">
          {errorMessage(list.error)}
        </Alert>
      ) : rows.length === 0 ? (
        <EmptyState title="No employees found" description={search ? "Try another name or number." : "Nobody matches this filter."} />
      ) : (
        <>
          <div className={styles.tableWrap} data-stale={list.isPlaceholderData} aria-busy={list.isPlaceholderData}>
            <SortableDataTable rows={rows} columns={columns} rowKey="id" caption="Employees" itemName={{ one: "employee", other: "employees" }} />
          </div>
          {(list.data?.meta?.totalPages ?? 0) > 1 && (
            <div className={styles.pager}>
              <Pagination page={page} pageCount={list.data?.meta?.totalPages ?? 1} onPageChange={setPage} label="Employee pages" />
            </div>
          )}
        </>
      )}

      <Drawer open={adding} onOpenChange={setAdding}>
        {adding && (
          <EmployeeForm
            onSaved={({ name, temporaryPassword }) => {
              setAdding(false);
              if (temporaryPassword) setCreated({ name, password: temporaryPassword });
            }}
          />
        )}
      </Drawer>
      <TempPasswordDialog who={created?.name ?? ""} password={created?.password ?? null} onClose={() => setCreated(null)} />
    </div>
  );
}

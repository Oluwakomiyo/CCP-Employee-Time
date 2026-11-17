"use client";

import { CalendarX, Eye } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert } from "@/components/arc/alert/alert";
import Badge from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import DateRangePicker, { type DateRange } from "@/components/arc/date-range-picker/date-range-picker";
import { Drawer, DrawerContent } from "@/components/arc/drawer/drawer";
import EmptyState from "@/components/arc/empty-state/empty-state";
import { JsonViewer } from "@/components/arc/json-viewer/json-viewer";
import { Pagination } from "@/components/arc/pagination/pagination";
import { Select } from "@/components/arc/select/select";
import SortableDataTable, { type DataColumn } from "@/components/arc/sortable-data-table/sortable-data-table";
import { TableSkeleton } from "@/components/loading/table-skeleton";
import { errorMessage } from "@/lib/api";
import { AUDIT_ACTIONS, useAuditLog, type AuditEntry } from "@/lib/audit";
import { useMe } from "@/lib/auth";
import { lagosDay } from "@/lib/history";
import { isCeo } from "@/lib/types";
import styles from "../manage.module.css";

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }).format(new Date(iso));
const actorName = (e: AuditEntry) => (e.actor ? (e.actor.employee ? `${e.actor.employee.firstName} ${e.actor.employee.lastName}` : e.actor.email) : "System");
const actionLabel = (a: string) => AUDIT_ACTIONS.find((x) => x.value === a)?.label ?? a;
/** The event name inside the snapshot (for example PAYROLL_FINALIZED) says more than the bare action. */
const eventOf = (e: AuditEntry) => {
  const ev = (e.afterState as { event?: string } | null)?.event;
  return ev ? ev.toLowerCase().replace(/_/g, " ") : "";
};

type Row = Record<string, unknown> & { id: string; at: string; atLabel: string; actor: string; action: string; entity: string };

export function AuditLog() {
  const me = useMe();
  const [action, setAction] = useState("ALL");
  const [range, setRange] = useState<DateRange | null>(null);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const log = useAuditLog({ action: action === "ALL" ? null : action, from: range ? lagosDay(range.start) : null, to: range ? lagosDay(range.end) : null, page });
  const items = useMemo(() => log.data?.data ?? [], [log.data]);
  const open = items.find((e) => e.id === openId) ?? null;

  const rows: Row[] = useMemo(
    () =>
      items.map((e) => ({
        id: e.id,
        at: e.timestamp,
        atLabel: when(e.timestamp),
        actor: actorName(e),
        action: actionLabel(e.action),
        entity: [e.entityName, eventOf(e)].filter(Boolean).join(": "),
      })),
    [items],
  );

  const columns: DataColumn<Row>[] = [
    { key: "at", label: "When", render: (_v, row) => String(row.atLabel) },
    { key: "actor", label: "Who" },
    { key: "action", label: "Action", render: (_v, row) => <Badge tone="neutral">{String(row.action)}</Badge> },
    { key: "entity", label: "What" },
    {
      key: "id",
      label: "Details",
      sortable: false,
      render: (_v, row) => (
        <Button variant="ghost" size="sm" onClick={() => setOpenId(String(row.id))}>
          <Eye size={14} aria-hidden="true" /> View
        </Button>
      ),
    },
  ];

  return (
    <div className={styles.layout}>
      {me.data && !isCeo(me.data.role) && <p className={styles.hint}>You see the changes you made yourself.</p>}
      <div className={styles.filters}>
        <Select
          label="Action"
          options={[{ value: "ALL", label: "All actions" }, ...AUDIT_ACTIONS]}
          value={action}
          onValueChange={(v: string) => {
            setAction(v);
            setPage(1);
          }}
        />
        <DateRangePicker
          label="Dates"
          value={range}
          onChange={(r) => {
            setRange(r);
            setPage(1);
          }}
        />
        {range && (
          <Button variant="ghost" onClick={() => setRange(null)}>
            <CalendarX size={16} aria-hidden="true" /> Clear dates
          </Button>
        )}
      </div>

      {log.isPending ? (
        <div className={styles.tableWrap}>
          <TableSkeleton rows={8} columns={[{ grow: 1 }, { grow: 1 }, { grow: 0.8, pill: true }, { grow: 1.6 }, { grow: 0.4 }]} />
        </div>
      ) : log.isError ? (
        <Alert tone="danger" title="Could not load the audit log">
          {errorMessage(log.error)}
        </Alert>
      ) : rows.length === 0 ? (
        <EmptyState title="No entries" description="Nothing matches these filters." />
      ) : (
        <>
          <div className={styles.tableWrap}>
            <SortableDataTable rows={rows} columns={columns} rowKey="id" caption="Audit log" />
          </div>
          {(log.data?.meta?.totalPages ?? 0) > 1 && (
            <div className={styles.pager}>
              <Pagination page={page} pageCount={log.data?.meta?.totalPages ?? 1} onPageChange={setPage} label="Audit pages" />
            </div>
          )}
        </>
      )}

      <Drawer open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        {open && (
          <DrawerContent title={`${actionLabel(open.action)}: ${open.entityName}`} description={`${actorName(open)}, ${when(open.timestamp)}`}>
            <div className={styles.form}>
              <p className={styles.hint}>Record {open.entityId}</p>
              <section className={styles.card} aria-label="Before">
                <h3>Before</h3>
                {open.beforeState ? <JsonViewer data={open.beforeState} rootName="before" defaultExpandDepth={2} label="State before the change" /> : <p className={styles.hint}>Not recorded for this action.</p>}
              </section>
              <section className={styles.card} aria-label="After">
                <h3>After</h3>
                {open.afterState ? <JsonViewer data={open.afterState} rootName="after" defaultExpandDepth={2} label="State after the change" /> : <p className={styles.hint}>Not recorded for this action.</p>}
              </section>
            </div>
          </DrawerContent>
        )}
      </Drawer>
    </div>
  );
}

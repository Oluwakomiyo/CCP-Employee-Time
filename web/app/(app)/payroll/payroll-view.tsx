"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Calculator, Download, Lock } from "lucide-react";
import { Alert } from "@/components/arc/alert/alert";
import { ActionButton } from "@/components/arc/action-button/action-button";
import Badge from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import DateRangePicker, { type DateRange } from "@/components/arc/date-range-picker/date-range-picker";
import EmptyState from "@/components/arc/empty-state/empty-state";
import { HoldToConfirm } from "@/components/arc/hold-to-confirm/hold-to-confirm";
import { MetricCard } from "@/components/arc/metric-card/metric-card";
import SortableDataTable, { type DataColumn } from "@/components/arc/sortable-data-table/sortable-data-table";
import { TableSkeleton } from "@/components/loading/table-skeleton";
import { ApiError, errorMessage } from "@/lib/api";
import { formatMoney, fullName } from "@/lib/employees";
import { lagosDay } from "@/lib/history";
import { exportUrl, usePayroll, usePayrollMutations, type Period, type UnresolvedDay } from "@/lib/payroll";
import styles from "../manage.module.css";

/** The current month so far, in company dates. */
const thisMonth = (): DateRange => {
  const today = new Date();
  const [y, m] = lagosDay(today).split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1, 12)), end: today };
};

const PRESETS = [
  { label: "This month", range: () => thisMonth() },
  {
    label: "Last month",
    range: () => {
      const [y, m] = lagosDay(new Date()).split("-").map(Number);
      return { start: new Date(Date.UTC(y, m - 2, 1, 12)), end: new Date(Date.UTC(y, m - 1, 0, 12)) };
    },
  },
];

type Row = Record<string, unknown> & { id: string; employee: string; regular: number; overtime: number; gross: number; grossLabel: string; projects: string; status: string };

export function PayrollView() {
  const [range, setRange] = useState<DateRange>(thisMonth);
  const period: Period = { periodStart: lagosDay(range.start), periodEnd: lagosDay(range.end) };
  const payroll = usePayroll(period);
  const { generate, finalize } = usePayrollMutations();
  const [notice, setNotice] = useState<{ tone: "success" | "warning" | "danger"; title: string; body?: string } | null>(null);
  const [unresolved, setUnresolved] = useState<UnresolvedDay[] | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  // The list filter is "within the range"; only records for exactly this period belong to this run.
  const records = useMemo(
    () => (payroll.data?.data ?? []).filter((r) => r.periodStart.slice(0, 10) === period.periodStart && r.periodEnd.slice(0, 10) === period.periodEnd),
    [payroll.data, period.periodStart, period.periodEnd],
  );
  const drafts = records.filter((r) => r.status === "DRAFT").length;
  const total = records.reduce((a, r) => a + Number(r.grossPay), 0);
  const hours = records.reduce((a, r) => a + Number(r.regularHours) + Number(r.overtimeHours), 0);

  const rows: Row[] = records.map((r) => ({
    id: r.id,
    employee: `${fullName(r.employee)} (${r.employee.employeeCode})`,
    regular: Number(r.regularHours),
    overtime: Number(r.overtimeHours),
    gross: Number(r.grossPay),
    grossLabel: formatMoney(r.grossPay, r.currency),
    projects: r.projectBreakdown.map((p) => `${p.projectCode} ${p.hours}h`).join(" · ") || "–",
    status: r.status,
  }));

  const columns: DataColumn<Row>[] = [
    { key: "employee", label: "Employee" },
    { key: "regular", label: "Regular h" },
    { key: "overtime", label: "Overtime h" },
    { key: "gross", label: "Gross pay", render: (_v, row) => String(row.grossLabel) },
    { key: "projects", label: "By project" },
    { key: "status", label: "Status", render: (_v, row) => <Badge tone={row.status === "FINALIZED" ? "success" : "warning"} dot>{row.status === "FINALIZED" ? "Finalized" : "Draft"}</Badge> },
  ];

  const runGenerate = () => {
    setNotice(null);
    setUnresolved(null);
    return generate
      .mutateAsync(period)
      .then((res) => {
        const missing = res.daysWithoutRate.length;
        setNotice(
          missing
            ? { tone: "warning", title: `Draft ready, ${missing} day${missing === 1 ? "" : "s"} left out`, body: "Those days have no hourly rate on file. Add a rate on the employee's Compensation tab, then generate again." }
            : { tone: "success", title: `Draft ready for ${res.payrollRecords.length} people`, body: res.skippedFinalized ? `${res.skippedFinalized} finalized records were left unchanged.` : undefined },
        );
      })
      .catch((e: unknown) => {
        setNotice({ tone: "danger", title: "Could not generate payroll", body: errorMessage(e) });
        throw e;
      });
  };

  const runFinalize = () => {
    setFinalizing(true);
    setNotice(null);
    setUnresolved(null);
    finalize
      .mutateAsync(period)
      .then((res) => setNotice({ tone: "success", title: `Finalized ${res.finalized} records`, body: "They are locked and will not change if hours are corrected later." }))
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.code === "UNRESOLVED_DAYS") setUnresolved((e.details as { unresolved: UnresolvedDay[] }).unresolved);
        else setNotice({ tone: "danger", title: "Could not finalize", body: errorMessage(e) });
      })
      .finally(() => setFinalizing(false));
  };

  return (
    <div className={styles.layout}>
      <div className={styles.toolbar}>
        <DateRangePicker label="Pay period" value={range} onChange={setRange} presets={PRESETS} />
        <div className={styles.rowActions}>
          <ActionButton icon={<Calculator size={17} aria-hidden="true" />} label={records.length ? "Regenerate draft" : "Generate draft"} pendingLabel="Generating" successLabel="Generated" onAction={runGenerate} onActionError={() => undefined} />
          {records.length > 0 && (
            <Button variant="secondary" onClick={() => (window.location.href = exportUrl(period))}>
              <Download size={16} aria-hidden="true" /> Export CSV
            </Button>
          )}
        </div>
      </div>

      {notice && (
        <Alert tone={notice.tone} title={notice.title} onDismiss={() => setNotice(null)}>
          {notice.body}
        </Alert>
      )}
      {unresolved && (
        <>
          <Alert tone="warning" title="Resolve these days before finalizing" onDismiss={() => setUnresolved(null)}>
            Nobody is paid on incomplete time. Approve or reject the corrections, or ask the people below to request one.
          </Alert>
          <section className={styles.card} aria-labelledby="unresolved">
            <h2 id="unresolved">Unresolved days</h2>
            <ul className={styles.list}>
              {unresolved.map((d) => (
                <li key={`${d.employee.id}-${d.date}`}>
                  <span>
                    {fullName(d.employee)}, {d.date.slice(0, 10)}
                  </span>
                  <span className={styles.muted}>{d.status.toLowerCase().replace(/_/g, " ")}</span>
                </li>
              ))}
            </ul>
            <Link href="/corrections">Open corrections</Link>
          </section>
        </>
      )}

      {payroll.isPending ? (
        <div className={styles.tableWrap}>
          <TableSkeleton rows={5} columns={[{ grow: 1.6 }, { grow: 0.5 }, { grow: 0.5 }, { grow: 0.8 }, { grow: 1.4 }, { grow: 0.6, pill: true }]} />
        </div>
      ) : payroll.isError ? (
        <Alert tone="danger" title="Could not load payroll">
          {errorMessage(payroll.error)}
        </Alert>
      ) : records.length === 0 ? (
        <EmptyState title="No payroll for this period yet" description="Generate a draft from the approved hours. You can regenerate it until it is finalized." />
      ) : (
        <>
          <div className={styles.kpis}>
            <MetricCard label="Gross pay (₦)" value={Math.round(total)} context={`${records.length} people`} />
            <MetricCard label="Hours paid" value={Math.round(hours * 100) / 100} suffix="h" context="regular and overtime" />
            <MetricCard label="Drafts" value={drafts} context={drafts ? "not final yet" : "all finalized"} />
          </div>
          <div className={styles.tableWrap}>
            <SortableDataTable rows={rows} columns={columns} rowKey="id" caption="Payroll records" defaultSort={{ key: "employee", direction: "asc" }} />
          </div>
          {drafts > 0 && (
            <section className={styles.card} aria-labelledby="finalize">
              <h2 id="finalize">Finalize this period</h2>
              <p className={styles.hint}>
                Locks every draft above. Refused while anyone has an open day, a missing clock-out or a pending correction in the period.
              </p>
              <HoldToConfirm icon={<Lock size={16} aria-hidden="true" />} label="Hold to finalize" confirmedLabel="Finalized" tone="accent" confirmed={finalizing} disabled={finalize.isPending} onConfirm={runFinalize} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

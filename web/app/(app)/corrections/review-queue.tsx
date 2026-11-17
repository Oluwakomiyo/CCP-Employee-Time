"use client";

import { Check, ClipboardCheck, Eye, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert } from "@/components/arc/alert/alert";
import { ActionButton } from "@/components/arc/action-button/action-button";
import Badge from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Drawer, DrawerContent } from "@/components/arc/drawer/drawer";
import EmptyState from "@/components/arc/empty-state/empty-state";
import { Pagination } from "@/components/arc/pagination/pagination";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import SortableDataTable, { type DataColumn } from "@/components/arc/sortable-data-table/sortable-data-table";
import { Textarea } from "@/components/arc/textarea/textarea";
import { TableSkeleton } from "@/components/loading/table-skeleton";
import { InlineBusy } from "@/components/loading/spinner";
import { ApiError, errorMessage } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { isoToTime, useReviewCorrection, useReviewQueue, type CorrectionStatus, type ReviewCorrection } from "@/lib/corrections";
import { formatHours } from "@/lib/time";
import styles from "../manage.module.css";

const STATUS_TONE = { PENDING: "warning", APPROVED: "success", REJECTED: "danger", CANCELLED: "neutral" } as const;
const FILTERS = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ALL", label: "All" },
];

type Row = Record<string, unknown> & { id: string; employee: string; date: string; change: string; reason: string; status: CorrectionStatus };

const nameOf = (c: ReviewCorrection) => `${c.employee.firstName} ${c.employee.lastName}`;

/** "PRJ-001 08:00 to 17:00" for a new entry, or "Entry 08:00 to 17:00" for a fix to a recorded one. */
const describeChange = (c: ReviewCorrection) => {
  const ch = c.requestedChanges;
  const seg = ch.segmentId ? c.workDay.segments.find((s) => s.id === ch.segmentId) : null;
  const what = seg ? `${seg.project.code} entry` : `New ${c.workDay.segments.find((s) => s.project.id === ch.projectId)?.project.code ?? "project"} entry`;
  return `${what} ${isoToTime(ch.proposedClockIn)} to ${isoToTime(ch.proposedClockOut)}`;
};

export function ReviewQueue() {
  const [filter, setFilter] = useState("PENDING");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const queue = useReviewQueue(filter === "ALL" ? null : (filter as CorrectionStatus), page);
  const items = useMemo(() => queue.data?.data ?? [], [queue.data]);
  const open = items.find((c) => c.id === openId) ?? null;

  const rows: Row[] = useMemo(
    () =>
      items.map((c) => ({
        id: c.id,
        employee: `${nameOf(c)} (${c.employee.employeeCode})`,
        date: c.workDay.date.slice(0, 10),
        change: describeChange(c),
        reason: c.reason,
        status: c.status,
      })),
    [items],
  );

  const columns: DataColumn<Row>[] = useMemo(
    () => [
      { key: "employee", label: "Employee" },
      { key: "date", label: "Day" },
      { key: "change", label: "Requested change" },
      { key: "reason", label: "Reason" },
      { key: "status", label: "Status", render: (_v, row) => <Badge tone={STATUS_TONE[row.status]} dot>{row.status.toLowerCase()}</Badge> },
      {
        key: "id",
        label: "Actions",
        sortable: false,
        render: (_v, row) => (
          <Button variant={row.status === "PENDING" ? "secondary" : "ghost"} size="sm" onClick={() => setOpenId(String(row.id))}>
            {row.status === "PENDING" ? <ClipboardCheck size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
          {row.status === "PENDING" ? "Review" : "View"}
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div className={styles.layout}>
      <div className={styles.toolbar}>
        <SegmentedControl
          label="Filter by status"
          options={FILTERS}
          value={filter}
          onValueChange={(v: string) => {
            setFilter(v);
            setPage(1);
          }}
        />
        <InlineBusy active={queue.isPlaceholderData} />
      </div>

      {queue.isPending ? (
        <div className={styles.tableWrap}>
          <TableSkeleton rows={10} columns={[{ grow: 1.4 }, { grow: 0.8 }, { grow: 1.6 }, { grow: 1.4 }, { grow: 0.8, pill: true }, { grow: 0.6, kind: "button" }]} />
        </div>
      ) : queue.isError ? (
        <Alert tone="danger" title="Could not load corrections">
          {errorMessage(queue.error)}
        </Alert>
      ) : rows.length === 0 ? (
        <EmptyState
          title={filter === "PENDING" ? "Nothing to review" : "No corrections here"}
          description={filter === "PENDING" ? "New requests from your team appear here." : "Try another filter."}
        />
      ) : (
        <>
          <div className={styles.tableWrap} data-stale={queue.isPlaceholderData} aria-busy={queue.isPlaceholderData}>
            <SortableDataTable rows={rows} columns={columns} rowKey="id" caption="Correction requests" />
          </div>
          {(queue.data?.meta?.totalPages ?? 0) > 1 && (
            <div className={styles.pager}>
              <Pagination page={page} pageCount={queue.data?.meta?.totalPages ?? 1} onPageChange={setPage} label="Correction pages" />
            </div>
          )}
        </>
      )}

      <Drawer open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        {open && <ReviewPanel key={open.id} correction={open} onDone={() => setOpenId(null)} />}
      </Drawer>
    </div>
  );
}

function ReviewPanel({ correction: c, onDone }: { correction: ReviewCorrection; onDone: () => void }) {
  const me = useMe();
  const review = useReviewCorrection();
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const own = me.data?.employee?.id === c.employee.id;
  const ch = c.requestedChanges;
  const proposedSeconds = (Date.parse(ch.proposedClockOut) - Date.parse(ch.proposedClockIn)) / 1000;

  const decide = (status: "APPROVED" | "REJECTED") =>
    review
      .mutateAsync({ id: c.id, status, reviewNotes: notes.trim() || undefined })
      .then(() => onDone())
      .catch((e: unknown) => {
        setError(e instanceof ApiError && e.code === "ALREADY_REVIEWED" ? "Someone else reviewed this request first. The list is up to date now." : errorMessage(e));
        throw e;
      });

  return (
    <DrawerContent title={`${nameOf(c)}, ${c.workDay.date.slice(0, 10)}`} description={`${c.employee.department} · ${c.employee.employeeCode}`}>
      <div className={styles.form}>
        {error && (
          <Alert tone="danger" title="That didn't work" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}

        <section className={styles.card} aria-labelledby="recorded">
          <h3 id="recorded">Recorded</h3>
          {c.workDay.segments.length === 0 ? (
            <p className={styles.hint}>Nothing was recorded on this day.</p>
          ) : (
            <ul className={styles.list}>
              {c.workDay.segments.map((s) => (
                <li key={s.id}>
                  <span>
                    {s.project.code} {s.project.name}
                    {s.id === ch.segmentId && (
                      <>
                        {" "}
                        <Badge tone="info">To change</Badge>
                      </>
                    )}
                  </span>
                  <span className={styles.muted}>
                    {isoToTime(s.clockIn)} to {s.clockOut ? isoToTime(s.clockOut) : "no clock-out"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className={styles.hint}>Day total before breaks: {formatHours(c.workDay.totalWorkSeconds)}</p>
        </section>

        <section className={styles.card} aria-labelledby="requested">
          <h3 id="requested">Requested</h3>
          <dl className={styles.details}>
            <div>
              <dt>Change</dt>
              <dd>{describeChange(c)}</dd>
            </div>
            <div>
              <dt>Length</dt>
              <dd>{formatHours(proposedSeconds)}</dd>
            </div>
          </dl>
          <p>{c.reason}</p>
        </section>

        {c.status !== "PENDING" ? (
          <p className={styles.hint}>
            {c.status === "CANCELLED" ? "Withdrawn by the employee." : `${c.status === "APPROVED" ? "Approved" : "Rejected"}${c.reviewNotes ? `: ${c.reviewNotes}` : "."}`}
          </p>
        ) : own ? (
          <p className={styles.hint}>This is your own request. Another reviewer has to decide it.</p>
        ) : (
          <>
            <Textarea label="Notes for the employee" description="Optional. Shown with the decision." maxLength={500} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            <div className={styles.rowActions}>
              <ActionButton icon={<Check size={17} aria-hidden="true" />} label="Approve" pendingLabel="Approving" successLabel="Approved" onAction={() => decide("APPROVED")} onActionError={() => undefined} />
              <Button variant="danger" loading={review.isPending && review.variables?.status === "REJECTED"} disabled={review.isPending} onClick={() => void decide("REJECTED").catch(() => undefined)}>
                <X size={16} aria-hidden="true" /> Reject
              </Button>
            </div>
          </>
        )}
      </div>
    </DrawerContent>
  );
}

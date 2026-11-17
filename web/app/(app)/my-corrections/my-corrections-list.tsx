"use client";

import { ArrowLeft, FilePen, Pencil, Send, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert } from "@/components/arc/alert/alert";
import { ActionButton } from "@/components/arc/action-button/action-button";
import Badge from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog";import { Pagination } from "@/components/arc/pagination/pagination";
import { Select } from "@/components/arc/select/select";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { MyCorrectionsSkeleton, CorrectionFormSkeleton } from "./my-corrections-skeleton";
import SortableDataTable, { type DataColumn } from "@/components/arc/sortable-data-table/sortable-data-table";
import { Textarea } from "@/components/arc/textarea/textarea";
import { TimePicker } from "@/components/arc/time-picker/time-picker";
import EmptyState from "@/components/arc/empty-state/empty-state";
import { errorMessage } from "@/lib/api";
import { useWorkHistory } from "@/lib/history";
import { isoToTime, lagosToIso, useCorrectionMutations, useCorrections, type Correction, type CorrectionStatus } from "@/lib/corrections";
import { formatTime, useMyProjects } from "@/lib/time";
import styles from "./my-corrections.module.css";

const STATUS_TONE = { PENDING: "warning", APPROVED: "success", REJECTED: "danger", CANCELLED: "neutral" } as const;

type Row = Record<string, unknown> & {
  id: string;
  date: string;
  summary: string;
  reason: string;
  status: CorrectionStatus;
  notes: string;
};

const FILTERS = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

export function MyCorrectionsList() {
  const initialDay = useSearchParams().get("workDayId");
  const [filter, setFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<{ correction?: Correction; dayId?: string } | null>(
    initialDay ? { dayId: initialDay } : null,
  );
  const [withdrawing, setWithdrawing] = useState<Correction | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const list = useCorrections(filter === "ALL" ? null : (filter as CorrectionStatus), page);
  const mutations = useCorrectionMutations();
  const projects = useMyProjects();

  const rows: Row[] = useMemo(
    () =>
      (list.data?.data ?? []).map((c) => {
        const ch = c.requestedChanges;
        const projectCode =
          (ch.projectId && (projects.data ?? []).find((p) => p.id === ch.projectId)?.code) ?? (ch.segmentId ? "Recorded entry" : "Unknown project");
        return {
          id: c.id,
          date: c.workDay.date.slice(0, 10),
          summary: `${projectCode} ${isoToTime(ch.proposedClockIn)} to ${isoToTime(ch.proposedClockOut)}`,
          reason: c.reason,
          status: c.status,
          notes: c.status === "CANCELLED" ? "Withdrawn" : (c.reviewNotes ?? "Awaiting review"),
        };
      }),
    [list.data, projects.data],
  );

  const columns: DataColumn<Row>[] = useMemo(
    () => [
      { key: "date", label: "Day" },
      { key: "summary", label: "Requested change" },
      { key: "reason", label: "Reason" },
      {
        key: "status",
        label: "Status",
        render: (_v, row) => <Badge tone={STATUS_TONE[row.status]} dot>{row.status.toLowerCase()}</Badge>,
      },
      { key: "notes", label: "Review" },
      {
        key: "id",
        label: "Actions",
        sortable: false,
        render: (_v, row) => {
          const correction = (list.data?.data ?? []).find((c) => c.id === String(row.id));
          if (!correction || correction.status !== "PENDING") return <>–</>;
          return (
            <span className={styles.rowActions}>
              <Button variant="ghost" size="sm" onClick={() => setDialog({ correction, dayId: correction.workDayId })}>
                <Pencil size={14} aria-hidden="true" /> Edit
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setWithdrawing(correction)}>
                <Undo2 size={14} aria-hidden="true" /> Withdraw
              </Button>
            </span>
          );
        },
      },
    ],
    [list.data],
  );

  if (list.isPending) return <MyCorrectionsSkeleton />;

  return (
    <div className={styles.layout}>
      <div className={styles.toolbar}>
        <SegmentedControl
          label="Filter by status"
          options={FILTERS}
          value={filter}
          onValueChange={(v: string) => { setFilter(v); setPage(1); }}
        />
        <Button variant="primary" onClick={() => setDialog({})}>
          <FilePen size={16} aria-hidden="true" /> Request correction
        </Button>
      </div>

      {list.isError ? (
        <Alert tone="danger" title="Could not load corrections">
          {errorMessage(list.error)}
        </Alert>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No corrections here"
          description={filter === "ALL" ? "You have not requested any corrections yet." : `No ${filter.toLowerCase()} requests.`}
          action={<Button variant="secondary" onClick={() => setDialog({})}><FilePen size={16} aria-hidden="true" /> Request correction</Button>}
        />
      ) : (
        <>
          <div className={styles.tableWrap}>
            <SortableDataTable rows={rows} columns={columns} rowKey="id" caption="My corrections" />
          </div>
          {(list.data?.meta?.totalPages ?? 0) > 1 && (
            <div className={styles.pager}>
              <Pagination page={page} pageCount={list.data!.meta!.totalPages} onPageChange={setPage} label="Corrections pages" />
            </div>
          )}
        </>
      )}

      <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent title={dialog?.correction ? "Edit correction" : "Request correction"} description="Times are in Lagos time. The server rejects overlaps and entries on projects you are not assigned to.">
          {dialog && <CorrectionForm key={dialog.correction?.id ?? dialog.dayId ?? "new"} correction={dialog.correction} dayId={dialog.dayId} onDone={() => setDialog(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={withdrawing !== null} onOpenChange={(open) => { if (!open) { setWithdrawing(null); setWithdrawError(null); } }}>
        {withdrawing && (
          <DialogContent title="Withdraw this request?" description={`${withdrawing.workDay.date.slice(0, 10)} · ${withdrawing.reason}`}>
            <div className={styles.form}>
              {withdrawError && (
                <Alert tone="danger" title="Could not withdraw" onDismiss={() => setWithdrawError(null)}>
                  {withdrawError}
                </Alert>
              )}
              <div className={styles.rowActions}>
                <Button variant="secondary" onClick={() => { setWithdrawing(null); setWithdrawError(null); }}>
                  <ArrowLeft size={16} aria-hidden="true" /> Keep it
                </Button>
                <Button
                  variant="danger"
                  loading={mutations.cancel.isPending}
                  onClick={() =>
                    mutations.cancel
                      .mutateAsync(withdrawing.id)
                      .then(() => { setWithdrawing(null); setWithdrawError(null); })
                      .catch((e: unknown) => setWithdrawError(errorMessage(e)))
                  }
                >
                  <Undo2 size={16} aria-hidden="true" /> Withdraw
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function CorrectionForm({ correction, dayId, onDone }: { correction?: Correction; dayId?: string; onDone: () => void }) {
  const mutations = useCorrectionMutations();
  const days = useWorkHistory({ page: 1, limit: 31 });
  const projects = useMyProjects();
  const [error, setError] = useState<string | null>(null);

  const dayOptions = useMemo(
    () => (days.data?.data.history ?? []).map((d) => ({ value: d.id, label: `${d.date.slice(0, 10)} (${d.status.toLowerCase().replace("_", " ")})` })),
    [days.data],
  );
  const [day, setDay] = useState(correction?.workDayId ?? dayId ?? "");
  const selectedDay = (days.data?.data.history ?? []).find((d) => d.id === day);

  const changes = correction?.requestedChanges;
  const [mode, setMode] = useState<"fix" | "add">(changes?.segmentId || !changes?.projectId ? "fix" : "add");
  const segmentOptions = useMemo(
    () =>
      (selectedDay?.segments ?? []).map((s) => ({
        value: s.id,
        label: `${s.project.code} ${formatTime(s.clockIn)} to ${s.clockOut ? formatTime(s.clockOut) : "ongoing"}`,
      })),
    [selectedDay],
  );
  const projectOptions = useMemo(() => (projects.data ?? []).map((p) => ({ value: p.id, label: `${p.code} ${p.name}` })), [projects.data]);

  const [segmentId, setSegmentId] = useState(changes?.segmentId ?? "");
  const [projectId, setProjectId] = useState(changes?.projectId ?? "");
  const initialSegment = selectedDay?.segments.find((s) => s.id === (segmentId || selectedDay.segments[0]?.id));  const [clockIn, setClockIn] = useState(() => (changes ? isoToTime(changes.proposedClockIn) : initialSegment ? isoToTime(initialSegment.clockIn) : "08:00"));
  const [clockOut, setClockOut] = useState(() => (changes ? isoToTime(changes.proposedClockOut) : initialSegment?.clockOut ? isoToTime(initialSegment.clockOut) : "17:00"));
  const [reason, setReason] = useState(correction?.reason ?? "");

  const valid = day !== "" && (mode === "fix" ? segmentId !== "" || segmentOptions.length > 0 : projectId !== "") && /^\d{2}:\d{2}$/.test(clockIn) && /^\d{2}:\d{2}$/.test(clockOut) && reason.trim().length >= 5;

  const submit = async () => {
    if (!selectedDay) return;
    setError(null);
    const requestedChanges =
      mode === "fix"
        ? { segmentId: segmentId || selectedDay.segments[0]?.id || "", proposedClockIn: lagosToIso(selectedDay.date, clockIn), proposedClockOut: lagosToIso(selectedDay.date, clockOut) }
        : { projectId, proposedClockIn: lagosToIso(selectedDay.date, clockIn), proposedClockOut: lagosToIso(selectedDay.date, clockOut) };
    try {
      if (correction) await mutations.update.mutateAsync({ id: correction.id, body: { reason: reason.trim(), requestedChanges } });
      else await mutations.create.mutateAsync({ workDayId: day, reason: reason.trim(), requestedChanges });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (days.isPending) return <CorrectionFormSkeleton />;
  if (days.isError)
    return (
      <Alert tone="danger" title="Could not load workdays">
        {errorMessage(days.error)}
      </Alert>
    );

  return (
    <div className={styles.form}>
      {error && <Alert tone="danger" title="Correction not saved">{error}</Alert>}
      <Select label="Workday" options={dayOptions} value={day} onValueChange={setDay} placeholder={dayOptions.length ? "Choose a workday" : "No workdays found"} disabled={!!correction || !!dayId} />
      {!selectedDay ? (
        <p className={styles.hint}>Pick a workday to continue.</p>
      ) : (
        <>
          <SegmentedControl
            label="What needs fixing?"
            options={[
              { value: "fix", label: "Fix recorded time" },
              { value: "add", label: "Add missed time" },
            ]}
            value={mode}
            onValueChange={(v: string) => setMode(v as "fix" | "add")}
            fullWidth
          />
          {mode === "fix" ? (
            <Select label="Entry" options={segmentOptions} value={segmentId || selectedDay.segments[0]?.id || ""} onValueChange={setSegmentId} placeholder="Choose an entry" />
          ) : (
            <Select label="Project" options={projectOptions} value={projectId} onValueChange={setProjectId} placeholder={projectOptions.length ? "Choose a project" : "No projects assigned"} />
          )}
          <TimePicker label="Proposed clock-in" format="24h" minuteStep={5} value={clockIn} onChange={setClockIn} />
          <TimePicker label="Proposed clock-out" format="24h" minuteStep={5} value={clockOut} onChange={setClockOut} />
          <Textarea label="Reason" description="At least 5 characters. For example: forgot to clock out after the site visit." rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          <ActionButton icon={<Send size={17} aria-hidden="true" />} label={correction ? "Save changes" : "Submit request"} pendingLabel="Saving" successLabel="Saved" disabled={!valid} onAction={submit} onActionError={(e) => setError(errorMessage(e))} />
        </>
      )}
    </div>
  );
}

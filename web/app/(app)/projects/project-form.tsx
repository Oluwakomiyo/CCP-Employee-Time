"use client";

import { FolderPlus } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/arc/alert/alert";
import { ActionButton } from "@/components/arc/action-button/action-button";
import { DatePicker } from "@/components/arc/date-picker/date-picker";
import { DrawerContent } from "@/components/arc/drawer/drawer";
import { Input } from "@/components/arc/input/input";
import { NumberField } from "@/components/arc/number-field/number-field";
import { Select } from "@/components/arc/select/select";
import { Textarea } from "@/components/arc/textarea/textarea";
import { errorMessage } from "@/lib/api";
import { lagosDay } from "@/lib/history";
import { PROJECT_STATUSES, useProjectMutations, type ProjectReport, type ProjectStatus } from "@/lib/projects";
import styles from "../manage.module.css";

const toDate = (iso?: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`) : undefined);

/** Create (code is fixed once set) or edit a project. Status replaces delete once time is recorded. */
export function ProjectForm({ project, onSaved }: { project?: ProjectReport["project"]; onSaved: (id?: string) => void }) {
  const { create, update } = useProjectMutations();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    code: project?.code ?? "",
    name: project?.name ?? "",
    clientName: project?.clientName ?? "",
    location: project?.location ?? "",
    description: project?.description ?? "",
    estimatedHours: project?.estimatedHours ? Number(project.estimatedHours) : 0,
    status: (project?.status ?? "ACTIVE") as ProjectStatus,
    startDate: toDate(project?.startDate) ?? new Date(),
    endDate: toDate(project?.endDate),
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const invalid = f.name.trim().length < 2 || (!project && f.code.trim().length < 2) || (!!f.endDate && f.endDate < f.startDate);

  const save = async () => {
    setError(null);
    const body = {
      name: f.name.trim(),
      clientName: f.clientName.trim() || undefined,
      location: f.location.trim() || undefined,
      description: f.description.trim() || undefined,
      estimatedHours: f.estimatedHours > 0 ? f.estimatedHours : project ? null : undefined,
      status: f.status,
      startDate: lagosDay(f.startDate),
      endDate: f.endDate ? lagosDay(f.endDate) : project ? null : undefined,
    };
    try {
      if (project) {
        await update.mutateAsync({ id: project.id, body });
        onSaved(project.id);
      } else {
        const res = await create.mutateAsync({ ...body, code: f.code.trim() });
        onSaved(res.project.id);
      }
    } catch (e) {
      setError(errorMessage(e));
      throw e;
    }
  };

  return (
    <DrawerContent title={project ? "Edit project" : "New project"}>
      <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
        {error && (
          <Alert tone="danger" title="Could not save" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}
        <div className={styles.formRow}>
          {!project && <Input label="Code" description="For example PRJ-004." value={f.code} onChange={(e) => set("code", e.target.value.toUpperCase())} />}
          <Input label="Name" value={f.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className={styles.formRow}>
          <Input label="Client" value={f.clientName} onChange={(e) => set("clientName", e.target.value)} />
          <Input label="Site location" value={f.location} onChange={(e) => set("location", e.target.value)} />
        </div>
        <div className={styles.formRow}>
          <Select label="Status" options={PROJECT_STATUSES} value={f.status} onValueChange={(v: string) => set("status", v as ProjectStatus)} />
          <NumberField label="Estimated hours" description="0 means no estimate." min={0} max={1_000_000} step={10} value={f.estimatedHours} onValueChange={(v) => set("estimatedHours", v)} />
        </div>
        <div className={styles.formRow}>
          <DatePicker label="Start date" value={f.startDate} onChange={(d) => d && set("startDate", d)} />
          <DatePicker label="End date" description="Optional." value={f.endDate} onChange={(d) => set("endDate", d)} minDate={f.startDate} />
        </div>
        <Textarea label="Description" rows={3} maxLength={2000} value={f.description} onChange={(e) => set("description", e.target.value)} />
        <ActionButton icon={<FolderPlus size={17} aria-hidden="true" />} label={project ? "Save changes" : "Create project"} pendingLabel="Saving" successLabel="Saved" disabled={invalid} onAction={save} onActionError={() => undefined} />
      </form>
    </DrawerContent>
  );
}

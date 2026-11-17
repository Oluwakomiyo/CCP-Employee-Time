"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, FolderPlus, PencilLine } from "lucide-react";
import { Alert } from "@/components/arc/alert/alert";
import { ActionButton } from "@/components/arc/action-button/action-button";
import { Button } from "@/components/arc/button/button";
import { Combobox } from "@/components/arc/combobox/combobox";
import { DatePicker } from "@/components/arc/date-picker/date-picker";
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog";
import { Input } from "@/components/arc/input/input";
import { MultiSelect } from "@/components/arc/multi-select/multi-select";
import { NumberField } from "@/components/arc/number-field/number-field";
import RadioCards from "@/components/arc/radio-cards/radio-cards";
import { Textarea } from "@/components/arc/textarea/textarea";
import { errorMessage } from "@/lib/api";
import { fullName, useEmployees } from "@/lib/employees";
import { lagosDay } from "@/lib/history";
import { useProjectMutations, useProjects } from "@/lib/projects";
import { addWorkingDays, type CalcInput, type CalcResult } from "@/lib/rate-calculator";
import styles from "./rate-calculator.module.css";

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;
const toDate = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00Z`) : undefined);
const STEPS = ["Project", "Plan", "Team", "Review"] as const;

/**
 * "Use this plan": four short steps that turn a calculation into a project.
 * Everything is pre-filled from the calculator and stays editable. Only existing project
 * endpoints are used, so the API's own permission checks apply.
 */
export function PlanWizard({ input, result, onClose }: { input: CalcInput & { name: string }; result: CalcResult; onClose: () => void }) {
  const { create, update, addMember } = useProjectMutations();
  const projects = useProjects({ search: "", status: null, page: 1, mine: false, limit: 100 });
  const people = useEmployees({ search: "", status: "ACTIVE", page: 1, limit: 100 });

  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<"new" | "existing">("new");
  const [projectId, setProjectId] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState(input.name);
  const [clientName, setClientName] = useState("");
  const [hours, setHours] = useState(result.personHours);
  const [start, setStart] = useState<Date | undefined>(toDate(input.startDate) ?? new Date());
  // The end follows the start by the calculated number of working days, until it is edited by hand.
  const endFor = (s: Date | undefined) =>
    s && result.workingDays >= 1 ? toDate(addWorkingDays(lagosDay(s), Math.ceil(result.workingDays), input.daysPerWeek)) : undefined;
  const [end, setEnd] = useState<Date | undefined>(toDate(result.endDate) ?? endFor(toDate(input.startDate) ?? new Date()));
  const pickStart = (d: Date | undefined) => {
    setStart(d);
    setEnd(endFor(d));
  };
  const budgetNote =
    `Planned budget ${naira(input.mode === "budget" ? input.budget : result.budgetNeeded)} (${input.contingencyPct}% held back), ` +
    `${result.people} ${result.people === 1 ? "person" : "people"} at ${input.hoursPerDay}h a day for ${result.workingDays} working days. ` +
    `Team: ${input.team.filter((t) => t.count > 0).map((t) => `${t.count} × ${t.label || "role"} at ${naira(t.rate)}/h`).join(", ")}.`;
  const [description, setDescription] = useState(budgetNote);
  const [team, setTeam] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; name: string } | null>(null);

  const existing = (projects.data?.data ?? []).find((p) => p.id === projectId);
  const stepValid = [
    kind === "new" ? code.trim().length >= 2 && name.trim().length >= 2 : !!projectId,
    hours > 0 && !!start && (!end || end >= start),
    true,
    true,
  ][step];

  const apply = async () => {
    setError(null);
    try {
      const plan = { estimatedHours: hours, startDate: lagosDay(start!) };
      const endDate = end ? lagosDay(end) : null;
      let id: string;
      let label: string;
      if (kind === "new") {
        const res = await create.mutateAsync({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          clientName: clientName.trim() || undefined,
          description: description.trim() || undefined,
          status: "ACTIVE",
          ...plan,
          // A new project takes an end date or none; null is only for clearing one on update.
          ...(endDate ? { endDate } : {}),
        });
        id = res.project.id;
        label = `${res.project.code} ${res.project.name}`;
      } else {
        // An existing project keeps its own description; only the plan figures change.
        await update.mutateAsync({ id: projectId, body: { ...plan, endDate } });
        id = projectId;
        label = existing ? `${existing.code} ${existing.name}` : "the project";
      }
      for (const employeeId of team) await addMember.mutateAsync({ id, employeeId, isProjectLead: false }).catch(() => undefined);
      setDone({ id, name: label });
    } catch (e) {
      setError(errorMessage(e));
      throw e;
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={done ? "Plan in place" : "Turn this into a project?"}
        description={done ? undefined : `${naira(result.workCost)} of work: ${result.workingDays} working days, ${result.personHours.toLocaleString("en-NG")} person-hours.`}
      >
        {done ? (
          <div className={styles.wizard}>
            <Alert tone="success" title={`${done.name} is ready`}>
              Estimated hours, dates{kind === "new" ? ", the budget note" : ""}
              {team.length ? ` and ${team.length} ${team.length === 1 ? "person" : "people"}` : ""} are set.
            </Alert>
            <div className={styles.wizardNav}>
              <Button variant="secondary" onClick={onClose}>Close</Button>
              <Link href={`/projects/${done.id}`} onClick={onClose} className={styles.linkButton}>
                Open the project <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>
        ) : (
          <div className={styles.wizard}>
            <ol className={styles.steps} aria-label="Steps">
              {STEPS.map((s, i) => (
                <li key={s} aria-current={i === step ? "step" : undefined} data-done={i < step || undefined}>
                  <span>{i < step ? <Check size={12} aria-hidden="true" /> : i + 1}</span> {s}
                </li>
              ))}
            </ol>
            <p className={styles.stepCount}>
              Step {step + 1} of {STEPS.length}
            </p>
            {error && (
              <Alert tone="danger" title="That didn't work" onDismiss={() => setError(null)}>
                {error}
              </Alert>
            )}

            {step === 0 && (
              <>
                <RadioCards
                  aria-label="Which project?"
                  value={kind}
                  onValueChange={(v: string) => setKind(v as "new" | "existing")}
                  options={[
                    { value: "new", label: "A new project", description: "Create it from this plan" },
                    { value: "existing", label: "An existing project", description: "Update its hours and dates" },
                  ]}
                />
                {kind === "new" ? (
                  <>
                    <div className={styles.grid}>
                      <Input label="Project code" placeholder="PRJ-104" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} />
                      <Input label="Client (optional)" value={clientName} onChange={(e) => setClientName(e.target.value)} maxLength={100} />
                    </div>
                    <Input label="Project name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
                  </>
                ) : (
                  <Combobox
                    label="Project"
                    placeholder={projects.isPending ? "Loading projects…" : "Search by code or name"}
                    disabled={projects.isPending}
                    emptyMessage="No project matches"
                    options={(projects.data?.data ?? []).map((p) => ({ value: p.id, label: `${p.code} ${p.name}` }))}
                    value={projectId}
                    onValueChange={setProjectId}
                  />
                )}
              </>
            )}

            {step === 1 && (
              <>
                <NumberField label="Estimated hours" description="Total person-hours from the calculation." value={hours} onValueChange={setHours} min={1} max={1_000_000} step={10} limitHint={false} />
                <div className={styles.grid}>
                  <DatePicker label="Start date" value={start} onChange={pickStart} />
                  <DatePicker label="End date (optional)" value={end} onChange={setEnd} minDate={start} />
                </div>
                {kind === "new" && <Textarea label="Description" description="The budget note; edit it as you like." rows={4} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />}
              </>
            )}

            {step === 2 && (
              <MultiSelect
                label="People to add (optional)"
                description={`The plan has ${result.people} ${result.people === 1 ? "person" : "people"}. Pick who, or skip and add them later.`}
                placeholder={people.isPending ? "Loading people…" : "Choose people"}
                disabled={people.isPending}
                options={(people.data?.data ?? []).map((e) => ({ value: e.id, label: `${fullName(e)} (${e.position})` }))}
                value={team}
                onValueChange={setTeam}
              />
            )}

            {step === 3 && (
              <dl className={styles.review}>
                <div>
                  <dt>Project</dt>
                  <dd>{kind === "new" ? `${code} ${name} (new)` : existing ? `${existing.code} ${existing.name}` : ""}</dd>
                </div>
                <div>
                  <dt>Estimated hours</dt>
                  <dd>{hours.toLocaleString("en-NG")}</dd>
                </div>
                <div>
                  <dt>Dates</dt>
                  <dd>
                    {start ? lagosDay(start) : ""} {end ? `to ${lagosDay(end)}` : "(no end date)"}
                  </dd>
                </div>
                <div>
                  <dt>People</dt>
                  <dd>{team.length ? `${team.length} added` : "None yet"}</dd>
                </div>
              </dl>
            )}

            <div className={styles.wizardNav}>
              {step > 0 ? (
                <Button variant="ghost" onClick={() => setStep(step - 1)}>
                  <ArrowLeft size={16} aria-hidden="true" /> Back
                </Button>
              ) : (
                <Button variant="ghost" onClick={onClose}>Not now</Button>
              )}
              {step < STEPS.length - 1 ? (
                <Button variant="primary" disabled={!stepValid} onClick={() => setStep(step + 1)}>
                  Next <ArrowRight size={16} aria-hidden="true" />
                </Button>
              ) : (
                <ActionButton
                  icon={kind === "new" ? <FolderPlus size={17} aria-hidden="true" /> : <PencilLine size={17} aria-hidden="true" />}
                  label={kind === "new" ? "Create project" : "Update project"}
                  pendingLabel="Saving"
                  successLabel="Done"
                  onAction={apply}
                  onActionError={() => undefined}
                />
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

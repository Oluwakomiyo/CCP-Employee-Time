"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Calculator, Plus, Trash2, Wand2, X } from "lucide-react";
import { Alert } from "@/components/arc/alert/alert";
import { BottomSheet } from "@/components/arc/bottom-sheet/bottom-sheet";
import { Button } from "@/components/arc/button/button";
import { DatePicker } from "@/components/arc/date-picker/date-picker";
import { Input } from "@/components/arc/input/input";
import { NumberField } from "@/components/arc/number-field/number-field";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/arc/popover/popover";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { lagosDay } from "@/lib/history";
import { calculate, describe, STANDARD_DAY_HOURS, type CalcInput, type CalcResult, type TeamLine } from "@/lib/rate-calculator";
import { PlanWizard } from "./plan-wizard";
import styles from "./rate-calculator.module.css";

const STORE = "ccp:rate-calculator";
const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;
let nextId = 0;
const line = (label = "", count = 1, rate = 0): TeamLine => ({ id: `l${Date.now()}-${nextId++}`, label, count, rate });

const DEFAULTS: CalcInput & { name: string } = {
  name: "",
  mode: "budget",
  budget: 0,
  team: [line("Architects", 2, 5000), line("Site engineer", 1, 4000)],
  hoursPerDay: 8,
  daysPerWeek: 5,
  contingencyPct: 10,
  overtimeMultiplier: 1.5,
  startDate: null,
  workingDays: 20,
};

/** Kept for the browser tab, so closing the panel never loses the figures (per-viewer convenience only). */
function load(): typeof DEFAULTS {
  try {
    const saved = sessionStorage.getItem(STORE);
    return saved ? { ...DEFAULTS, ...JSON.parse(saved) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

const phoneQuery = "(max-width: 600px)";
const usePhone = () =>
  useSyncExternalStore(
    (cb) => {
      const mq = matchMedia(phoneQuery);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => matchMedia(phoneQuery).matches,
    () => false,
  );

/**
 * Fixed bottom-right tile for admins (compensation.view): works out what a budget buys, or what
 * a plan costs, from reference figures. "Use this plan" turns the result into a project.
 */
export function RateCalculator() {
  const phone = usePhone();
  const [open, setOpen] = useState(false);
  const [wizard, setWizard] = useState<{ input: CalcInput & { name: string }; result: CalcResult } | null>(null);

  const trigger = (
    <button type="button" className={styles.fab} aria-label="Open the rate calculator">
      <Calculator size={20} aria-hidden="true" />
      <span className={styles.fabLabel}>Rate calculator</span>
    </button>
  );
  const panel = <CalculatorPanel onUse={(input, result) => { setOpen(false); setWizard({ input, result }); }} />;

  return (
    <>
      {phone ? (
        <BottomSheet trigger={trigger} open={open} onOpenChange={setOpen} title="Rate calculator" description="What a budget buys, or what a plan costs." detents={[0.92]}>
          {panel}
        </BottomSheet>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent side="top" align="end" sideOffset={10} className={styles.popover} aria-label="Rate calculator">
            <div className={styles.popoverHead}>
              <div>
                <h2>Rate calculator</h2>
                <p>What a budget buys, or what a plan costs.</p>
              </div>
              <PopoverClose asChild>
                <Button variant="ghost" size="sm" aria-label="Close the rate calculator">
                  <X size={16} aria-hidden="true" />
                </Button>
              </PopoverClose>
            </div>
            {panel}
          </PopoverContent>
        </Popover>
      )}
      {wizard && <PlanWizard input={wizard.input} result={wizard.result} onClose={() => setWizard(null)} />}
    </>
  );
}

function CalculatorPanel({ onUse }: { onUse: (input: CalcInput & { name: string }, result: CalcResult) => void }) {
  const [f, setF] = useState(load);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(f));
    } catch {
      /* storage unavailable: the figures just won't survive a reload */
    }
  }, [f]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const setLine = (id: string, patch: Partial<TeamLine>) => set("team", f.team.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const result = useMemo(() => calculate(f), [f]);
  const short = result && f.mode === "cost" && f.budget > 0 && result.remaining < 0;

  return (
    <div className={styles.panel}>
      <SegmentedControl
        label="What do you want to know?"
        options={[
          { value: "budget", label: "How far it goes" },
          { value: "cost", label: "What it costs" },
        ]}
        value={f.mode}
        onValueChange={(v: string) => set("mode", v as CalcInput["mode"])}
        fullWidth
      />

      <Input label="Project name (optional)" placeholder="For example: Lekki duplex" value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={100} />
      <NumberField
        label={f.mode === "budget" ? "Amount allocated" : "Budget (optional, to compare)"}
        prefix="₦"
        value={f.budget}
        onValueChange={(v) => set("budget", v)}
        step={50000}
        formatOptions={{ maximumFractionDigits: 0, useGrouping: true }}
        limitHint={false}
      />

      <fieldset className={styles.team}>
        <legend>Team (reference rates per person)</legend>
        {f.team.map((t) => (
          <div key={t.id} className={styles.line}>
            <Input label="Role" value={t.label} onChange={(e) => setLine(t.id, { label: e.target.value })} placeholder="Architect" />
            <NumberField label="People" value={t.count} onValueChange={(v) => setLine(t.id, { count: v })} min={0} max={500} size="sm" limitHint={false} />
            <NumberField label="₦ / hour" value={t.rate} onValueChange={(v) => setLine(t.id, { rate: v })} min={0} step={500} size="sm" formatOptions={{ maximumFractionDigits: 0, useGrouping: true }} limitHint={false} />
            <Button variant="ghost" size="sm" aria-label={`Remove ${t.label || "this line"}`} onClick={() => set("team", f.team.filter((x) => x.id !== t.id))}>
              <Trash2 size={14} aria-hidden="true" />
            </Button>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={() => set("team", [...f.team, line()])}>
          <Plus size={14} aria-hidden="true" /> Add a role
        </Button>
      </fieldset>

      <div className={styles.grid}>
        <NumberField label="Hours a day" value={f.hoursPerDay} onValueChange={(v) => set("hoursPerDay", v)} min={1} max={24} step={0.5} size="sm" limitHint={false} />
        <NumberField label="Reserve" suffix="%" value={f.contingencyPct} onValueChange={(v) => set("contingencyPct", v)} min={0} max={50} size="sm" limitHint={false} />
        {f.mode === "cost" && <NumberField label="Working days" value={f.workingDays} onValueChange={(v) => set("workingDays", v)} min={1} max={2000} size="sm" limitHint={false} />}
        {f.hoursPerDay > STANDARD_DAY_HOURS && (
          <NumberField label="Overtime pay" suffix="×" value={f.overtimeMultiplier} onValueChange={(v) => set("overtimeMultiplier", v)} min={1} max={3} step={0.25} size="sm" limitHint={false} />
        )}
      </div>
      <div className={styles.grid}>
        <SegmentedControl
          label="Working week"
          options={[
            { value: "5", label: "Mon–Fri" },
            { value: "6", label: "Mon–Sat" },
            { value: "7", label: "Every day" },
          ]}
          value={String(f.daysPerWeek)}
          onValueChange={(v: string) => set("daysPerWeek", Number(v))}
        />
        <DatePicker label="Start date (optional)" value={f.startDate ? new Date(`${f.startDate}T12:00:00Z`) : undefined} onChange={(d) => set("startDate", d ? lagosDay(d) : null)} />
      </div>

      {!result ? (
        <p className={styles.hint}>Add a team with people and an hourly rate{f.mode === "budget" ? ", and the amount allocated" : ""}, and the answer appears here.</p>
      ) : (
        <section className={styles.result} aria-live="polite" aria-label="Result">
          <p className={styles.sentence}>{describe(f, result)}</p>
          {short && (
            <Alert tone="warning" title="Over budget">
              This plan needs {naira(result.budgetNeeded)}, {naira(-result.remaining)} more than the budget.
            </Alert>
          )}
          <dl className={styles.figures}>
            <div>
              <dt>Working days</dt>
              <dd>{result.workingDays}</dd>
            </div>
            <div>
              <dt>Person-hours</dt>
              <dd>{result.personHours.toLocaleString("en-NG")}</dd>
            </div>
            <div>
              <dt>Team cost a day</dt>
              <dd>{naira(result.costPerDay)}</dd>
            </div>
            <div>
              <dt>Team cost an hour</dt>
              <dd>{naira(result.teamHourly)}</dd>
            </div>
            <div>
              <dt>{f.mode === "budget" ? "Held back" : "Budget needed"}</dt>
              <dd>{naira(f.mode === "budget" ? result.reserve : result.budgetNeeded)}</dd>
            </div>
            {result.endDate && (
              <div>
                <dt>Ends</dt>
                <dd>{result.endDate}</dd>
              </div>
            )}
          </dl>
          <Button variant="primary" onClick={() => onUse(f, result)}>
            <Wand2 size={16} aria-hidden="true" /> Use this plan
          </Button>
        </section>
      )}
    </div>
  );
}

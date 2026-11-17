"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle,
  Banknote,
  Calculator,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock,
  Hourglass,
  Percent,
  PiggyBank,
  Plus,
  RotateCcw,
  Tag,
  Timer,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { BottomSheet } from "@/components/arc/bottom-sheet/bottom-sheet";
import { Button } from "@/components/arc/button/button";
import { DatePicker } from "@/components/arc/date-picker/date-picker";
import { Drawer, DrawerContent } from "@/components/arc/drawer/drawer";
import { Input } from "@/components/arc/input/input";
import { NumberField } from "@/components/arc/number-field/number-field";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { lagosDay } from "@/lib/history";
import { calculate, describe, STANDARD_DAY_HOURS, type CalcInput, type CalcResult, type TeamLine } from "@/lib/rate-calculator";
import { PlanWizard } from "./plan-wizard";
import styles from "./rate-calculator.module.css";

const STORE = "ccp:rate-calculator";
const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;
/** ₦4,500,000 → ₦4.5m: short enough for the big answer and the bar legend. */
const short = (n: number) =>
  n >= 1_000_000 ? `₦${(n / 1_000_000).toLocaleString("en-NG", { maximumFractionDigits: 2 })}m` : n >= 10_000 ? `₦${Math.round(n / 1000).toLocaleString("en-NG")}k` : naira(n);
const longDate = (iso: string) =>
  new Intl.DateTimeFormat("en-NG", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

let nextId = 0;
const line = (label = "", count = 1, rate = 0): TeamLine => ({ id: `l${Date.now()}-${nextId++}`, label, count, rate });

type Form = CalcInput & { name: string };
const fresh = (): Form => ({
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
});

/** Kept for the browser tab, so closing the panel never loses the figures (per-viewer convenience only). */
function load(): Form {
  try {
    const saved = sessionStorage.getItem(STORE);
    return saved ? { ...fresh(), ...JSON.parse(saved) } : fresh();
  } catch {
    return fresh();
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
  const [wizard, setWizard] = useState<{ input: Form; result: CalcResult } | null>(null);

  const trigger = (
    <button type="button" className={styles.fab} aria-label="Open the rate calculator" onClick={phone ? undefined : () => setOpen(true)}>
      <Calculator size={20} aria-hidden="true" />
      <span className={styles.fabLabel}>Rate calculator</span>
    </button>
  );
  const panel = <CalculatorPanel onUse={(input, result) => { setOpen(false); setWizard({ input, result }); }} />;

  return (
    <>
      {phone ? (
        <BottomSheet trigger={trigger} open={open} onOpenChange={setOpen} title="Rate calculator" description="What a budget buys, or what a plan costs." detents={[0.94]}>
          {panel}
        </BottomSheet>
      ) : (
        <>
          {trigger}
          <Drawer open={open} onOpenChange={setOpen}>
            <DrawerContent side="right" title="Rate calculator" description="What a budget buys, or what a plan costs. Reference figures only; nothing is saved." className={styles.drawer}>
              {panel}
            </DrawerContent>
          </Drawer>
        </>
      )}
      {wizard && <PlanWizard input={wizard.input} result={wizard.result} onClose={() => setWizard(null)} />}
    </>
  );
}

/** A numbered section with an icon, so the panel reads top to bottom: budget, team, schedule. */
function Section({ n, icon: Icon, title, hint, children }: { n: number; icon: LucideIcon; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className={styles.section} aria-labelledby={`calc-s${n}`}>
      <header className={styles.sectionHead}>
        <span className={styles.sectionIcon} aria-hidden="true">
          <Icon size={16} />
        </span>
        <div>
          <h3 id={`calc-s${n}`}>
            <span className={styles.stepNo}>{n}</span> {title}
          </h3>
          {hint && <p>{hint}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

function CalculatorPanel({ onUse }: { onUse: (input: Form, result: CalcResult) => void }) {
  const [f, setF] = useState(load);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(f));
    } catch {
      /* storage unavailable: the figures just won't survive a reload */
    }
  }, [f]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const setLine = (id: string, patch: Partial<TeamLine>) => set("team", f.team.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const result = useMemo(() => calculate(f), [f]);
  const people = f.team.reduce((a, t) => a + (t.count > 0 ? t.count : 0), 0);
  const hourly = f.team.reduce((a, t) => a + Math.max(0, t.count) * Math.max(0, t.rate), 0);

  return (
    <div className={styles.panel}>
      <SegmentedControl
        label="What do you want to know?"
        options={[
          { value: "budget", label: "How far a budget goes" },
          { value: "cost", label: "What a plan costs" },
        ]}
        value={f.mode}
        onValueChange={(v: string) => set("mode", v as CalcInput["mode"])}
        fullWidth
      />

      <Answer f={f} r={result} />

      <Section n={1} icon={Wallet} title="Budget" hint={f.mode === "budget" ? "The money set aside for this work." : "Optional: to see if the plan fits."}>
        <div className={styles.fieldWithIcon}>
          <Banknote size={18} aria-hidden="true" />
          <NumberField
            label={f.mode === "budget" ? "Amount allocated" : "Budget to compare against"}
            prefix="₦"
            value={f.budget}
            onValueChange={(v) => set("budget", v)}
            step={50000}
            formatOptions={{ maximumFractionDigits: 0, useGrouping: true }}
            limitHint={false}
          />
        </div>
        <div className={styles.fieldWithIcon}>
          <Tag size={18} aria-hidden="true" />
          <Input label="Project name (optional)" placeholder="For example: Lekki duplex" value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={100} />
        </div>
      </Section>

      <Section n={2} icon={Users} title="Team" hint="Reference rates per person, per hour. Not tied to real people.">
        <div className={styles.table} role="group" aria-label="Team roles">
          <div className={styles.tableHead} aria-hidden="true">
            <span>Role</span>
            <span>People</span>
            <span>₦ / hour each</span>
            <span>Subtotal</span>
            <span />
          </div>
          {f.team.map((t) => (
            <div key={t.id} className={styles.row}>
              <Input label="Role" value={t.label} onChange={(e) => setLine(t.id, { label: e.target.value })} placeholder="Architect" className={styles.cellRole} />
              <NumberField label="People" value={t.count} onValueChange={(v) => setLine(t.id, { count: v })} min={0} max={500} size="sm" limitHint={false} />
              <NumberField label="₦ per hour each" value={t.rate} onValueChange={(v) => setLine(t.id, { rate: v })} min={0} step={500} size="sm" formatOptions={{ maximumFractionDigits: 0, useGrouping: true }} limitHint={false} />
              <span className={styles.subtotal} aria-label={`Subtotal ${naira(t.count * t.rate)} an hour`}>
                {naira(t.count * t.rate)}
                <small>/h</small>
              </span>
              <Button variant="ghost" size="sm" aria-label={`Remove ${t.label || "this role"}`} onClick={() => set("team", f.team.filter((x) => x.id !== t.id))}>
                <Trash2 size={14} aria-hidden="true" />
              </Button>
            </div>
          ))}
          <div className={styles.totalRow}>
            <Button variant="ghost" size="sm" onClick={() => set("team", [...f.team, line()])}>
              <Plus size={14} aria-hidden="true" /> Add a role
            </Button>
            <span>
              <Users size={14} aria-hidden="true" /> {people} {people === 1 ? "person" : "people"} · <strong>{naira(hourly)}</strong>/h
            </span>
          </div>
        </div>
      </Section>

      <Section n={3} icon={CalendarClock} title="Schedule" hint="How the team works, and what to keep in reserve.">
        <div className={styles.grid}>
          <div className={styles.fieldWithIcon}>
            <Clock size={18} aria-hidden="true" />
            <NumberField label="Hours a day" value={f.hoursPerDay} onValueChange={(v) => set("hoursPerDay", v)} min={1} max={24} step={0.5} size="sm" limitHint={false} />
          </div>
          <div className={styles.fieldWithIcon}>
            <Percent size={18} aria-hidden="true" />
            <NumberField label="Reserve" suffix="%" value={f.contingencyPct} onValueChange={(v) => set("contingencyPct", v)} min={0} max={50} size="sm" limitHint={false} />
          </div>
          {f.mode === "cost" && (
            <div className={styles.fieldWithIcon}>
              <CalendarDays size={18} aria-hidden="true" />
              <NumberField label="Working days" value={f.workingDays} onValueChange={(v) => set("workingDays", v)} min={1} max={2000} size="sm" limitHint={false} />
            </div>
          )}
          {f.hoursPerDay > STANDARD_DAY_HOURS && (
            <div className={styles.fieldWithIcon}>
              <TrendingUp size={18} aria-hidden="true" />
              <NumberField label="Overtime pay" suffix="×" value={f.overtimeMultiplier} onValueChange={(v) => set("overtimeMultiplier", v)} min={1} max={3} step={0.25} size="sm" limitHint={false} />
            </div>
          )}
        </div>
        {f.hoursPerDay > STANDARD_DAY_HOURS && (
          <p className={styles.note}>
            <TrendingUp size={14} aria-hidden="true" /> {f.hoursPerDay - STANDARD_DAY_HOURS}h a day above {STANDARD_DAY_HOURS}h are paid as overtime, like payroll.
          </p>
        )}
        <SegmentedControl
          label="Working week"
          options={[
            { value: "5", label: "Mon–Fri" },
            { value: "6", label: "Mon–Sat" },
            { value: "7", label: "Every day" },
          ]}
          value={String(f.daysPerWeek)}
          onValueChange={(v: string) => set("daysPerWeek", Number(v))}
          fullWidth
        />
        <DatePicker label="Start date (optional, gives an end date)" value={f.startDate ? new Date(`${f.startDate}T12:00:00Z`) : undefined} onChange={(d) => set("startDate", d ? lagosDay(d) : null)} />
      </Section>

      <footer className={styles.footer}>
        <Button variant="ghost" onClick={() => setF(fresh())}>
          <RotateCcw size={16} aria-hidden="true" /> Start over
        </Button>
        <Button variant="primary" disabled={!result} onClick={() => result && onUse(f, result)}>
          <Wand2 size={16} aria-hidden="true" /> Use this plan
        </Button>
      </footer>
    </div>
  );
}

/** The answer, first and largest: one number, a bar of where the money goes, and four supporting figures. */
function Answer({ f, r }: { f: Form; r: CalcResult | null }) {
  if (!r) {
    return (
      <div className={styles.answer} data-state="empty" aria-live="polite">
        <Calculator size={22} aria-hidden="true" />
        <p>Add a team with people and an hourly rate{f.mode === "budget" ? ", and the amount allocated" : ""}. The answer appears here as you type.</p>
      </div>
    );
  }
  const over = f.mode === "cost" && f.budget > 0 && r.remaining < 0;
  const fits = f.mode === "cost" && f.budget > 0 && r.remaining >= 0;
  // The bar: budget mode splits the budget into work and reserve; cost mode compares what's needed with the budget.
  const total = f.mode === "budget" ? f.budget : Math.max(r.budgetNeeded, f.budget || 0);
  const segs =
    f.mode === "budget"
      ? [
          { key: "work", label: "Work", value: r.workCost },
          { key: "reserve", label: "Reserve", value: r.reserve },
        ]
      : [
          { key: "work", label: "Work", value: r.workCost },
          { key: "reserve", label: "Reserve", value: r.reserve },
          ...(fits ? [{ key: "left", label: "Left over", value: r.remaining }] : []),
        ];

  return (
    <div className={styles.answer} data-state={over ? "over" : "ok"} aria-live="polite" aria-label="Answer">
      <div className={styles.hero}>
        <span className={styles.heroIcon} aria-hidden="true">
          {f.mode === "budget" ? <Hourglass size={20} /> : over ? <AlertTriangle size={20} /> : <PiggyBank size={20} />}
        </span>
        <div>
          <p className={styles.heroLabel}>{f.mode === "budget" ? "The budget lasts" : "Budget needed"}</p>
          <p className={styles.heroValue}>
            {f.mode === "budget" ? (
              <>
                {r.workingDays} <small>working days</small>
              </>
            ) : (
              naira(r.budgetNeeded)
            )}
          </p>
          <p className={styles.heroSub}>
            {f.mode === "budget" ? `About ${r.weeks} weeks` : `${r.workingDays} working days, reserve included`}
            {r.endDate ? ` · ends ${longDate(r.endDate)}` : ""}
          </p>
        </div>
      </div>

      {total > 0 && (
        <div className={styles.barBlock}>
          <div className={styles.bar} role="img" aria-label={segs.map((s) => `${s.label} ${naira(s.value)}`).join(", ")}>
            {segs.map((s) => (
              <span key={s.key} data-seg={s.key} style={{ width: `${Math.max(0, (s.value / total) * 100)}%` }} />
            ))}
            {/* Where the budget ends, when the plan runs past it. */}
            {over && <b className={styles.budgetMark} style={{ left: `${(f.budget / total) * 100}%` }} aria-hidden="true" />}
          </div>
          <ul className={styles.legend}>
            {segs.map((s) => (
              <li key={s.key}>
                <i data-seg={s.key} aria-hidden="true" /> {s.label} {short(s.value)}
              </li>
            ))}
            {f.mode === "cost" && f.budget > 0 && <li className={styles.legendBudget}>Budget {short(f.budget)}</li>}
          </ul>
        </div>
      )}

      {f.mode === "cost" && f.budget > 0 && (
        <p className={styles.verdict} data-over={over || undefined}>
          {over ? <AlertTriangle size={16} aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}
          {over ? `${naira(-r.remaining)} over the budget` : `Fits, with ${naira(r.remaining)} to spare`}
        </p>
      )}

      <dl className={styles.stats}>
        <Stat icon={Timer} label="Person-hours" value={r.personHours.toLocaleString("en-NG")} />
        <Stat icon={CalendarCheck} label="Team cost a day" value={naira(r.costPerDay)} />
        <Stat icon={Clock} label="Team cost an hour" value={naira(r.teamHourly)} />
        <Stat icon={PiggyBank} label="Held in reserve" value={naira(r.reserve)} />
      </dl>
      <p className={styles.sentence}>{describe(f, r)}</p>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div>
      <dt>
        <Icon size={14} aria-hidden="true" /> {label}
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

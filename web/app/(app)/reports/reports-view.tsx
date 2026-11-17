"use client";

import { ReportSkeleton } from "@/components/reports/report-skeleton";
import { useState } from "react";
import { Alert } from "@/components/arc/alert/alert";
import { Combobox } from "@/components/arc/combobox/combobox";
import DateRangePicker, { type DateRange } from "@/components/arc/date-range-picker/date-range-picker";
import EmptyState from "@/components/arc/empty-state/empty-state";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { EmployeeReport } from "@/components/reports/employee-report";
import { ProjectBreakdown } from "@/components/reports/project-report";
import { errorMessage } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { rangeFor } from "@/lib/dashboard";
import { fullName, useEmployees } from "@/lib/employees";
import { lagosDay } from "@/lib/history";
import { useProjectReport, useProjects } from "@/lib/projects";
import { isCeo } from "@/lib/types";
import styles from "../manage.module.css";

type Subject = "employee" | "project";

const dayToDate = (day: string) => new Date(`${day}T00:00:00.000Z`);
const defaultRange = (): DateRange => {
  const r = rangeFor("30");
  return { start: dayToDate(r.from), end: dayToDate(r.to) };
};

export function ReportsView() {
  const me = useMe();
  const ceo = isCeo(me.data?.role);
  const [subject, setSubject] = useState<Subject>("employee");
  const [employeeId, setEmployeeId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [range, setRange] = useState<DateRange>(defaultRange);
  const from = lagosDay(range.start);
  const to = lagosDay(range.end);

  const employees = useEmployees({ search: "", status: "ACTIVE", page: 1, limit: 100 });
  const projects = useProjects({ search: "", status: null, page: 1, mine: !ceo, limit: 100 });

  const employee = (employees.data?.data ?? []).find((e) => e.id === employeeId);
  const project = (projects.data?.data ?? []).find((p) => p.id === projectId);

  return (
    <div className={styles.layout}>
      <div className={styles.filters}>
        <SegmentedControl
          label="Report about"
          options={[
            { value: "employee", label: "Employee" },
            { value: "project", label: "Project" },
          ]}
          value={subject}
          onValueChange={(v: string) => setSubject(v as Subject)}
        />
        {subject === "employee" ? (
          <Combobox
            label="Employee"
            placeholder={employees.isPending ? "Loading people" : "Search by name"}
            emptyMessage="Nobody matches that search"
            options={(employees.data?.data ?? []).map((e) => ({ value: e.id, label: `${fullName(e)} (${e.employeeCode})`, keywords: [e.department, e.position] }))}
            value={employeeId}
            onValueChange={setEmployeeId}
          />
        ) : (
          <Combobox
            label="Project"
            placeholder={projects.isPending ? "Loading projects" : "Search by code or name"}
            emptyMessage="No project matches that search"
            options={(projects.data?.data ?? []).map((p) => ({ value: p.id, label: `${p.code} ${p.name}`, keywords: [p.clientName ?? "", p.status] }))}
            value={projectId}
            onValueChange={setProjectId}
          />
        )}
        <DateRangePicker label="Range" value={range} onChange={setRange} />
      </div>

      {subject === "employee" ? (
        !employee ? (
          <EmptyState title="Pick an employee" description="Choose someone above to see their hours." />
        ) : (
          <section aria-label={`Report for ${fullName(employee)}`}>
            <h2 className={styles.sectionTitle}>
              {fullName(employee)} · {employee.employeeCode}
            </h2>
            <EmployeeReport id={employee.id} from={from} to={to} rangeLabel={from === to ? `on ${from}` : `${from} to ${to}`} />
          </section>
        )
      ) : !project ? (
        <EmptyState title="Pick a project" description="Choose a project above to see its hours." />
      ) : (
        <ProjectSection id={project.id} title={`${project.code} ${project.name}`} from={from} to={to} ceo={ceo} />
      )}
    </div>
  );
}

function ProjectSection({ id, title, from, to, ceo }: { id: string; title: string; from: string; to: string; ceo: boolean }) {
  const report = useProjectReport(id, from, to);

  if (report.isPending) {
    return (
      <section aria-label={`Report for ${title}`}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <ReportSkeleton kpis={false} label="Loading project report" />
      </section>
    );
  }
  if (report.isError)
    return (
      <Alert tone="danger" title="Could not load this report">
        {errorMessage(report.error)}
      </Alert>
    );

  return (
    <section aria-label={`Report for ${title}`}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div data-stale={report.isPlaceholderData} aria-busy={report.isPlaceholderData}>
        <ProjectBreakdown r={report.data} ceo={ceo} />
      </div>
    </section>
  );
}

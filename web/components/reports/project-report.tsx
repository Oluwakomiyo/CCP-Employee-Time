"use client";

import { formatMoney } from "@/lib/employees";
import type { ProjectReport } from "@/lib/projects";
import { ACTIVITIES, labelOf, LOCATIONS } from "@/lib/time";
import { HoursList } from "./hours-list";
import styles from "@/app/(app)/manage.module.css";

/** The project Report tab, shared with the Reports screen. Takes a loaded report; money only renders for the CEO. */
export function ProjectBreakdown({ r, ceo }: { r: ProjectReport; ceo: boolean }) {
  return (
    <div className={styles.grid2}>
      <HoursList
        title="By person"
        emptyMessage="No hours recorded yet."
        items={r.hoursByEmployee.map((e) => ({ key: e.employeeId, label: e.name, hours: e.hours, extra: ceo && e.labourCost !== undefined ? formatMoney(e.labourCost) : undefined }))}
      />
      <HoursList title="By activity" items={r.hoursByActivity.map((a) => ({ key: a.activityType, label: labelOf(ACTIVITIES, a.activityType), hours: a.hours }))} emptyMessage="No hours recorded yet." />
      <HoursList title="By location" items={r.hoursByLocation.map((l) => ({ key: l.location, label: labelOf(LOCATIONS, l.location), hours: l.hours }))} emptyMessage="No hours recorded yet." />
    </div>
  );
}

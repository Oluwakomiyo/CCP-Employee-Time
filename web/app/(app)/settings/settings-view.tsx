"use client";

import { useState } from "react";
import { BadgeCheck, Building2, Check, Pencil, Plus } from "lucide-react";
import { Alert } from "@/components/arc/alert/alert";
import { ActionButton } from "@/components/arc/action-button/action-button";
import Badge from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Combobox } from "@/components/arc/combobox/combobox";
import { CopyButton } from "@/components/arc/copy-button/copy-button";
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog";
import EmptyState from "@/components/arc/empty-state/empty-state";
import { Input } from "@/components/arc/input/input";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import SortableDataTable, { type DataColumn } from "@/components/arc/sortable-data-table/sortable-data-table";
import { errorMessage } from "@/lib/api";
import { fullName, useDepartments, useEmployees, usePositions, type Department } from "@/lib/employees";
import { useDevices, useNamedListMutations, useSettingsMutations } from "@/lib/settings";
import styles from "../manage.module.css";

export function SettingsView() {
  return (
    <div className={styles.layout}>
      <div className={styles.grid2}>
        <NamedList resource="departments" title="Departments" noun="department" icon={<Building2 size={18} aria-hidden="true" />} query={useDepartments} />
      <NamedList resource="positions" title="Positions" noun="position" icon={<BadgeCheck size={18} aria-hidden="true" />} query={usePositions} />
      </div>
      <Devices />
    </div>
  );
}

/** Departments and positions: a managed list of names the employee form picks from. */
function NamedList({
  resource,
  title,
  noun,
  icon,
  query,
}: {
  resource: "departments" | "positions";
  title: string;
  noun: string;
  icon: React.ReactNode;
  query: typeof useDepartments;
}) {
  const departments = query();
  const { add: addDepartment, rename: renameDepartment } = useNamedListMutations(resource);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<Department | null>(null);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fail = (e: unknown) => {
    setError(errorMessage(e));
    throw e;
  };

  return (
    <section className={styles.card} aria-labelledby={resource}>
      <h2 id={resource} className={styles.cardTitle}>
        {icon} {title}
      </h2>
      {error && (
        <Alert tone="danger" title="That didn't work" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      {departments.isPending ? (
        <Skeleton lines={4} label={`Loading ${resource}`} />
      ) : departments.isError ? (
        <Alert tone="danger" title={`Could not load ${resource}`}>
          {errorMessage(departments.error)}
        </Alert>
      ) : (
        <ul className={styles.list}>
          {departments.data.map((d) => (
            <li key={d.id}>
              <span>
                {d.name} <span className={styles.muted}>{d._count?.employees === 1 ? "1 person" : `${d._count?.employees ?? 0} people`}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRenaming(d);
                  setNewName(d.name);
                }}
              >
                <Pencil size={14} aria-hidden="true" /> Rename
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.toolbar}>
        <Input label={`New ${noun}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        <ActionButton
          icon={<Plus size={17} aria-hidden="true" />}
          label={`Add ${noun}`}
          pendingLabel="Adding"
          successLabel="Added"
          disabled={name.trim().length < 2}
          onAction={() =>
            addDepartment
              .mutateAsync(name.trim())
              .then(() => setName(""))
              .catch(fail)
          }
          onActionError={() => undefined}
        />
      </div>

      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        {renaming && (
          <DialogContent title={`Rename ${renaming.name}`} description="Everyone in it moves with the new name.">
            <div className={styles.form}>
              <Input label="Name" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={100} />
              <ActionButton
                icon={<Check size={17} aria-hidden="true" />}
                label="Save name"
                pendingLabel="Saving"
                successLabel="Saved"
                disabled={newName.trim().length < 2 || newName.trim() === renaming.name}
                onAction={() =>
                  renameDepartment
                    .mutateAsync({ id: renaming.id, name: newName.trim() })
                    .then(() => setRenaming(null))
                    .catch(fail)
                }
                onActionError={() => setRenaming(null)}
              />
            </div>
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
}

type DeviceRow = Record<string, unknown> & { id: string; device: string; owner: string; platform: string; seen: string; active: boolean };

const seenLabel = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }).format(new Date(iso)) : "Never";

function Devices() {
  const devices = useDevices();
  const { revokeDevice } = useSettingsMutations();
  const [registering, setRegistering] = useState(false);
  const [key, setKey] = useState<{ device: string; apiKey: string } | null>(null);
  const [revoking, setRevoking] = useState<{ id: string; name: string } | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const rows: DeviceRow[] = (devices.data ?? []).map((d) => ({
    id: d.id,
    device: `${d.deviceName} (${d.deviceIdentifier})`,
    owner: `${fullName(d.employee)} (${d.employee.employeeCode})`,
    platform: d.platform,
    seen: seenLabel(d.lastSeenAt),
    active: d.isActive,
  }));
  const columns: DataColumn<DeviceRow>[] = [
    { key: "device", label: "Device" },
    { key: "owner", label: "Assigned to" },
    { key: "platform", label: "Platform" },
    { key: "seen", label: "Last seen" },
    {
      key: "active",
      label: "Status",
      sortable: false,
      // A dialog, not an inline morph: the last column has no room to expand without clipping.
      render: (_v, row) =>
        row.active ? (
          <Button variant="ghost" size="sm" onClick={() => setRevoking({ id: String(row.id), name: String(row.device) })}>
            Revoke
          </Button>
        ) : (
          <Badge tone="neutral">Revoked</Badge>
        ),
    },
  ];

  return (
    <section className={styles.card} aria-labelledby="devices">
      <div className={styles.toolbar}>
        <h2 id="devices">Desktop devices</h2>
        <Button variant="secondary" onClick={() => setRegistering(true)}>
          Register device
        </Button>
      </div>
      <p className={styles.hint}>Each device has its own key for the desktop agent. Revoke a lost or replaced device; its key stops working at once.</p>
      {devices.isPending ? (
        <Skeleton lines={3} label="Loading devices" />
      ) : devices.isError ? (
        <Alert tone="danger" title="Could not load devices">
          {errorMessage(devices.error)}
        </Alert>
      ) : rows.length === 0 ? (
        <EmptyState title="No devices yet" description="Register a device to let its desktop agent report activity." />
      ) : (
        <div className={styles.tableWrap}>
          <SortableDataTable rows={rows} columns={columns} rowKey="id" caption="Desktop devices" />
        </div>
      )}

      <Dialog open={!!revoking} onOpenChange={(o) => !o && setRevoking(null)}>
        {revoking && (
          <DialogContent title="Revoke this device?" description={`${revoking.name}. Its agent key stops working at once. Register it again to restore it.`}>
            <div className={styles.form}>
              {revokeError && (
                <Alert tone="danger" title="Could not revoke" onDismiss={() => setRevokeError(null)}>
                  {revokeError}
                </Alert>
              )}
              <div className={styles.rowActions}>
                <Button variant="secondary" onClick={() => setRevoking(null)}>
                  Keep it
                </Button>
                <Button
                  variant="danger"
                  loading={revokeDevice.isPending}
                  onClick={() =>
                    revokeDevice
                      .mutateAsync(revoking.id)
                      .then(() => setRevoking(null))
                      .catch((e: unknown) => setRevokeError(errorMessage(e)))
                  }
                >
                  Revoke
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
      <Dialog open={registering} onOpenChange={setRegistering}>
        {registering && (
          <RegisterDevice
            onDone={(device, apiKey) => {
              setRegistering(false);
              setKey({ device, apiKey });
            }}
          />
        )}
      </Dialog>
      <Dialog open={!!key} onOpenChange={(o) => !o && setKey(null)}>
        {key && (
          <DialogContent title="Device key" description={`Put this in the agent's config on ${key.device}.`}>
            <div className={styles.form}>
              <div className={styles.secret}>
                <span>{key.apiKey}</span>
                <CopyButton value={key.apiKey} label="Copy key" iconOnly />
              </div>
              <Alert tone="warning" title="Shown only once">
                Only a hash is stored. If it is lost, revoke the device and register it again.
              </Alert>
              <Button variant="primary" onClick={() => setKey(null)}>
                Done
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
}

function RegisterDevice({ onDone }: { onDone: (device: string, apiKey: string) => void }) {
  const people = useEmployees({ search: "", status: "ACTIVE", page: 1, limit: 100 });
  const { registerDevice } = useSettingsMutations();
  const [f, setF] = useState({ employeeId: "", deviceName: "", deviceIdentifier: "", platform: "" });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const invalid = !f.employeeId || f.deviceName.trim().length < 2 || f.deviceIdentifier.trim().length < 4 || !f.platform.trim();

  return (
    <DialogContent title="Register device" description="A key is created for this device and shown once.">
      <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
        {error && (
          <Alert tone="danger" title="Could not register" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}
        <Combobox
          label="Assigned to"
          placeholder="Search by name"
          options={(people.data?.data ?? []).map((e) => ({ value: e.id, label: `${fullName(e)} (${e.employeeCode})` }))}
          value={f.employeeId}
          onValueChange={(v) => set("employeeId", v)}
        />
        <Input label="Device name" placeholder="Studio PC 2" value={f.deviceName} onChange={(e) => set("deviceName", e.target.value)} />
        <Input label="Hardware identifier" description="Serial number or MAC address." value={f.deviceIdentifier} onChange={(e) => set("deviceIdentifier", e.target.value)} />
        <Input label="Platform" placeholder="Windows 11" value={f.platform} onChange={(e) => set("platform", e.target.value)} />
        <ActionButton
          label="Register"
          pendingLabel="Registering"
          successLabel="Registered"
          disabled={invalid}
          onAction={() =>
            registerDevice
              .mutateAsync({ employeeId: f.employeeId, deviceName: f.deviceName.trim(), deviceIdentifier: f.deviceIdentifier.trim(), platform: f.platform.trim() })
              .then((r) => onDone(f.deviceName.trim(), r.apiKey))
              .catch((e: unknown) => {
                setError(errorMessage(e));
                throw e;
              })
          }
          onActionError={() => undefined}
        />
      </form>
    </DialogContent>
  );
}

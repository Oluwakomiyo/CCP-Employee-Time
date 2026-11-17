"use client";

import { useMemo, useState } from "react";
import { Check, Plus, RotateCcw, ShieldCheck, Trash2, Users, X } from "lucide-react";
import { Alert } from "@/components/arc/alert/alert";
import { ActionButton } from "@/components/arc/action-button/action-button";
import Badge from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog";
import { Input } from "@/components/arc/input/input";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { Select } from "@/components/arc/select/select";
import { Switch } from "@/components/arc/switch/switch";
import { Spinner } from "@/components/loading/spinner";
import { errorMessage } from "@/lib/api";
import type { Grants, Scope } from "@/lib/permissions";
import { summarise, useCatalog, useRoleMutations, useRoles, type AppRole, type CatalogEntry } from "@/lib/roles";
import styles from "../manage.module.css";
import r from "./roles.module.css";

const SCOPES = [
  { value: "OWN", label: "Just themselves" },
  { value: "TEAM", label: "Their team" },
  { value: "ALL", label: "Everyone" },
];

const sameGrants = (a: Grants, b: Grants) => {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k as keyof Grants] === b[k as keyof Grants]);
};

export function RolesView() {
  const roles = useRoles();
  const catalog = useCatalog();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  if (roles.isPending || catalog.isPending) return <Spinner label="Loading roles" showLabel center />;
  if (roles.isError || catalog.isError)
    return (
      <Alert tone="danger" title="Could not load roles">
        {errorMessage(roles.error ?? catalog.error)}
      </Alert>
    );

  const selected = roles.data.find((x) => x.id === selectedId) ?? roles.data[0];

  return (
    <div className={r.split}>
      <nav className={r.list} aria-label="Roles">
        <ul>
          {roles.data.map((role) => (
            <li key={role.id}>
              <button type="button" className={r.roleButton} aria-current={role.id === selected?.id ? "true" : undefined} onClick={() => setSelectedId(role.id)}>
                <span className={r.roleName}>
                  {role.name}
                  {role.isSystem && <Badge tone="neutral">Built-in</Badge>}
                </span>
                <span className={r.roleMeta}>
                  <Users size={13} aria-hidden="true" /> {role.userCount === 1 ? "1 person" : `${role.userCount} people`}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <Button variant="secondary" onClick={() => setCreating(true)}>
          <Plus size={16} aria-hidden="true" /> New role
        </Button>
      </nav>

      {selected && <RoleEditor key={selected.id} role={selected} catalog={catalog.data} onDeleted={() => setSelectedId(null)} />}

      <Dialog open={creating} onOpenChange={setCreating}>
        {creating && <NewRole roles={roles.data} onCreated={(id) => { setSelectedId(id); setCreating(false); }} />}
      </Dialog>
    </div>
  );
}

function NewRole({ roles, onCreated }: { roles: AppRole[]; onCreated: (id: string) => void }) {
  const { create } = useRoleMutations();
  const [name, setName] = useState("");
  const [copyFrom, setCopyFrom] = useState(roles.find((x) => x.key === "employee")?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  return (
    <DialogContent title="New role" description="Start from an existing role, then switch permissions on or off.">
      <div className={styles.form}>
        {error && <Alert tone="danger" title="Could not create the role">{error}</Alert>}
        <Input label="Name" placeholder="For example: SEO specialist" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus />
        <Select label="Start from" options={roles.map((x) => ({ value: x.id, label: x.name }))} value={copyFrom} onValueChange={setCopyFrom} />
        <ActionButton
          icon={<Plus size={17} aria-hidden="true" />}
          label="Create role"
          pendingLabel="Creating"
          successLabel="Created"
          disabled={name.trim().length < 2}
          onAction={() =>
            create
              .mutateAsync({ name: name.trim(), copyFrom: copyFrom || undefined })
              .then((role) => onCreated(role.id))
              .catch((e: unknown) => {
                setError(errorMessage(e));
                throw e;
              })
          }
          onActionError={() => undefined}
        />
      </div>
    </DialogContent>
  );
}

function RoleEditor({ role, catalog, onDeleted }: { role: AppRole; catalog: CatalogEntry[]; onDeleted: () => void }) {
  const { update, reset, remove } = useRoleMutations();
  const [grants, setGrants] = useState<Grants>(role.permissions);
  const [name, setName] = useState(role.name);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"reset" | "delete" | null>(null);
  const isAdmin = role.key === "ceo_admin";

  const groups = useMemo(() => {
    const m = new Map<string, CatalogEntry[]>();
    for (const c of catalog) m.set(c.module, [...(m.get(c.module) ?? []), c]);
    return [...m.entries()];
  }, [catalog]);

  const dirty = !sameGrants(grants, role.permissions) || name.trim() !== role.name;
  const toggle = (c: CatalogEntry, on: boolean) =>
    setGrants((g) => {
      const next = { ...g };
      if (on) next[c.key] = c.scoped ? "OWN" : true;
      else delete next[c.key];
      return next;
    });
  const setScope = (c: CatalogEntry, scope: Scope) => setGrants((g) => ({ ...g, [c.key]: scope }));

  const fail = (e: unknown) => {
    setError(errorMessage(e));
    throw e;
  };

  return (
    <section className={`${styles.card} ${r.editor}`} aria-labelledby="role-title">
      <header className={r.editorHead}>
        <span className={r.headIcon} aria-hidden="true">
          <ShieldCheck size={20} />
        </span>
        <div>
          <h2 id="role-title" className={r.title}>
            {role.name}
          </h2>
          <p className={styles.hint}>{summarise(grants, catalog)}</p>
        </div>
      </header>

      {error && (
        <Alert tone="danger" title="That didn't work" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      {!role.isSystem && <Input label="Role name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />}

      {groups.map(([module, items]) => (
        <fieldset key={module} className={r.group}>
          <legend>{module}</legend>
          {items.map((c) => {
            const g = grants[c.key];
            const locked = isAdmin && c.key === "roles.manage";
            return (
              <div key={c.key} className={r.row} data-on={!!g}>
                <Switch label={c.label} checked={!!g} disabled={locked} onCheckedChange={(on) => toggle(c, on)} />
                {locked && <span className={styles.hint}>Always on for this role, so someone can always manage roles.</span>}
                {c.scoped && g && (
                  <SegmentedControl label={`Whose data: ${c.label}`} options={SCOPES} value={g === true ? "ALL" : g} onValueChange={(v: string) => setScope(c, v as Scope)} />
                )}
              </div>
            );
          })}
        </fieldset>
      ))}

      <div className={r.saveBar}>
        <div className={styles.rowActions}>
          {role.isSystem ? (
            <Button variant="ghost" onClick={() => setConfirm("reset")}>
              <RotateCcw size={16} aria-hidden="true" /> Reset to default
            </Button>
          ) : (
            <Button variant="danger" disabled={role.userCount > 0} title={role.userCount > 0 ? "Move everyone to another role first" : undefined} onClick={() => setConfirm("delete")}>
              <Trash2 size={16} aria-hidden="true" /> Delete role
            </Button>
          )}
        </div>
        <div className={styles.rowActions}>
          {dirty && (
            <Button variant="ghost" onClick={() => { setGrants(role.permissions); setName(role.name); }}>
              <X size={16} aria-hidden="true" /> Discard
            </Button>
          )}
          <ActionButton
            icon={<Check size={17} aria-hidden="true" />}
            label="Save changes"
            pendingLabel="Saving"
            successLabel="Saved"
            disabled={!dirty || name.trim().length < 2}
            onAction={() =>
              update
                .mutateAsync({ id: role.id, permissions: grants, ...(role.isSystem ? {} : { name: name.trim() }) })
                .then(() => setError(null))
                .catch(fail)
            }
            onActionError={() => undefined}
          />
        </div>
      </div>

      <Dialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        {confirm === "reset" && (
          <DialogContent title={`Reset ${role.name}?`} description="Its permissions go back to the defaults the system shipped with. Everyone with this role is affected at once.">
            <div className={styles.rowActions}>
              <Button variant="secondary" onClick={() => setConfirm(null)}>Keep my changes</Button>
              <Button
                variant="primary"
                loading={reset.isPending}
                onClick={() =>
                  reset
                    .mutateAsync(role.id)
                    .then((fresh) => { setGrants(fresh.permissions); setConfirm(null); })
                    .catch((e: unknown) => { setError(errorMessage(e)); setConfirm(null); })
                }
              >
                <RotateCcw size={16} aria-hidden="true" /> Reset to default
              </Button>
            </div>
          </DialogContent>
        )}
        {confirm === "delete" && (
          <DialogContent title={`Delete ${role.name}?`} description="Nobody has this role. This cannot be undone.">
            <div className={styles.rowActions}>
              <Button variant="secondary" onClick={() => setConfirm(null)}>Keep it</Button>
              <Button
                variant="danger"
                loading={remove.isPending}
                onClick={() =>
                  remove
                    .mutateAsync(role.id)
                    .then(() => { setConfirm(null); onDeleted(); })
                    .catch((e: unknown) => { setError(errorMessage(e)); setConfirm(null); })
                }
              >
                <Trash2 size={16} aria-hidden="true" /> Delete role
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
}

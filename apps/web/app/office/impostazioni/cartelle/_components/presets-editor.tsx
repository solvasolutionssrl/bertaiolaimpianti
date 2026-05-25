'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Eye, Upload, AlertCircle } from 'lucide-react';
import { Button } from '@impiantixplus/ui';
import type { AppRole } from '@impiantixplus/api';

import { aggiornaFolderPreset } from '../../../../_actions/folder-acl';

interface PresetRow {
  id: string;
  path: string;
  label: string;
  ordine: number;
  visible_roles: string[];
  upload_roles: string[];
}

interface Props {
  presets: PresetRow[];
  canEdit: boolean;
}

const ROLES: { value: AppRole; label: string; short: string }[] = [
  { value: 'admin', label: 'Admin', short: 'A' },
  { value: 'office', label: 'Office', short: 'O' },
  { value: 'tecnico', label: 'Tecnico', short: 'T' },
  { value: 'cliente', label: 'Cliente', short: 'C' },
];

/**
 * Matrice editabile presets × ruoli. Due celle per cartella (Vedi/Carica).
 * Salva per riga via server action.
 */
export function PresetsEditor({ presets, canEdit }: Props) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-border bg-muted/30">
            <tr>
              <th className="px-4 py-2 text-left font-medium uppercase tracking-wide text-[10px] text-muted-foreground">
                Cartella
              </th>
              <th className="px-3 py-2 text-center font-medium uppercase tracking-wide text-[10px] text-muted-foreground" colSpan={4}>
                <span className="inline-flex items-center gap-1">
                  <Eye className="h-3 w-3" /> Visibilità
                </span>
              </th>
              <th className="px-3 py-2 text-center font-medium uppercase tracking-wide text-[10px] text-muted-foreground" colSpan={4}>
                <span className="inline-flex items-center gap-1">
                  <Upload className="h-3 w-3" /> Caricamento
                </span>
              </th>
              <th className="px-3 py-2 text-right font-medium uppercase tracking-wide text-[10px] text-muted-foreground">
                Azione
              </th>
            </tr>
            <tr className="border-b border-border bg-muted/15 text-[10px] uppercase text-muted-foreground">
              <th className="px-4 py-1.5 text-left"></th>
              {ROLES.map((r) => (
                <th key={`v-${r.value}`} className="px-1 py-1.5 text-center font-mono tabular-nums" title={r.label}>
                  {r.short}
                </th>
              ))}
              {ROLES.map((r) => (
                <th key={`u-${r.value}`} className="px-1 py-1.5 text-center font-mono tabular-nums" title={r.label}>
                  {r.short}
                </th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {presets.map((p) => (
              <PresetRowEditor key={p.id} preset={p} canEdit={canEdit} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PresetRowEditor({ preset, canEdit }: { preset: PresetRow; canEdit: boolean }) {
  const router = useRouter();
  const [visible, setVisible] = React.useState<Set<AppRole>>(
    () => new Set(preset.visible_roles as AppRole[]),
  );
  const [upload, setUpload] = React.useState<Set<AppRole>>(
    () => new Set(preset.upload_roles as AppRole[]),
  );
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);

  const baseV = React.useMemo(
    () => new Set(preset.visible_roles as AppRole[]),
    [preset.visible_roles],
  );
  const baseU = React.useMemo(
    () => new Set(preset.upload_roles as AppRole[]),
    [preset.upload_roles],
  );

  const dirty = React.useMemo(() => {
    const same = (a: Set<AppRole>, b: Set<AppRole>) =>
      a.size === b.size && [...a].every((x) => b.has(x));
    return !same(visible, baseV) || !same(upload, baseU);
  }, [visible, upload, baseV, baseU]);

  const toggle = (set: Set<AppRole>, role: AppRole, setter: (s: Set<AppRole>) => void) => {
    const next = new Set(set);
    if (next.has(role)) next.delete(role);
    else next.add(role);
    setter(next);
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    const r = await aggiornaFolderPreset({
      presetId: preset.id,
      visibleRoles: [...visible],
      uploadRoles: [...upload],
    });
    setSaving(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setSavedAt(Date.now());
    router.refresh();
  };

  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-muted/10">
      <td className="px-4 py-2">
        <div>
          <p className="font-medium">{preset.label}</p>
          <p className="font-mono text-[10px] text-muted-foreground">{preset.path}</p>
        </div>
      </td>
      {ROLES.map((r) => (
        <td key={`v-${r.value}`} className="px-1 py-2 text-center">
          <Checkbox
            checked={visible.has(r.value)}
            disabled={!canEdit}
            onToggle={() => toggle(visible, r.value, setVisible)}
            aria-label={`Vedi ${r.label}`}
          />
        </td>
      ))}
      {ROLES.map((r) => (
        <td key={`u-${r.value}`} className="px-1 py-2 text-center">
          <Checkbox
            checked={upload.has(r.value)}
            disabled={!canEdit}
            onToggle={() => toggle(upload, r.value, setUpload)}
            aria-label={`Carica ${r.label}`}
          />
        </td>
      ))}
      <td className="px-3 py-2 text-right">
        {canEdit && (
          <Button
            type="button"
            size="sm"
            variant={dirty ? 'default' : 'outline'}
            onClick={onSave}
            disabled={!dirty || saving}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : Date.now() - savedAt < 2500 ? (
              <Check className="h-3.5 w-3.5 text-success" />
            ) : null}
            {savedAt && Date.now() - savedAt < 2500 ? 'Salvato' : 'Salva'}
          </Button>
        )}
        {error && (
          <span className="inline-flex items-center gap-1 text-[10px] text-destructive">
            <AlertCircle className="h-3 w-3" />
            {error.slice(0, 40)}
          </span>
        )}
      </td>
    </tr>
  );
}

function Checkbox({
  checked,
  disabled,
  onToggle,
  ...props
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
} & React.HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={checked}
      className={
        'inline-flex h-5 w-5 items-center justify-center rounded border transition ' +
        (checked
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background hover:border-primary/50') +
        (disabled ? ' cursor-not-allowed opacity-50' : '')
      }
      {...props}
    >
      {checked && <Check className="h-3 w-3" />}
    </button>
  );
}

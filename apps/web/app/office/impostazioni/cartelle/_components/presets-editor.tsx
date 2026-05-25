'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Eye, Upload, AlertCircle } from 'lucide-react';
import { Button } from '@kommessa/ui';
import type { AppRole } from '@kommessa/api';

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

const ROLES: { value: AppRole; label: string; chipClass: string }[] = [
  {
    value: 'admin',
    label: 'Admin',
    chipClass:
      'bg-primary/15 text-primary border-primary/30',
  },
  {
    value: 'office',
    label: 'Office',
    chipClass:
      'bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-300',
  },
  {
    value: 'tecnico',
    label: 'Tecnico',
    chipClass:
      'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300',
  },
  {
    value: 'cliente',
    label: 'Cliente',
    chipClass:
      'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300',
  },
];

/**
 * Matrice editabile presets × ruoli. Due gruppi colonne (Visibilità +
 * Caricamento) con chip colorati per ruolo. Salva per riga via server action.
 */
export function PresetsEditor({ presets, canEdit }: Props) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            {/* Gruppo macro: Visibilità / Caricamento */}
            <tr className="border-b border-border bg-muted/40">
              <th
                rowSpan={2}
                className="border-r border-border px-4 py-2 text-left font-semibold tracking-tight text-xs text-foreground"
              >
                Cartella
              </th>
              <th
                colSpan={ROLES.length}
                className="border-r border-border px-3 py-2 text-center"
              >
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Eye className="h-3.5 w-3.5" /> Chi può vedere
                </span>
              </th>
              <th
                colSpan={ROLES.length}
                className="border-r border-border px-3 py-2 text-center"
              >
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Upload className="h-3.5 w-3.5" /> Chi può caricare
                </span>
              </th>
              <th
                rowSpan={2}
                className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                Azione
              </th>
            </tr>
            {/* Riga colonne ruolo: chip colorati per disambiguare a colpo d'occhio */}
            <tr className="border-b border-border bg-muted/15">
              {ROLES.map((r, idx) => (
                <th
                  key={`v-${r.value}`}
                  className={
                    'px-2 py-1.5 text-center align-middle ' +
                    (idx === ROLES.length - 1 ? 'border-r border-border' : '')
                  }
                >
                  <span
                    className={
                      'inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ' +
                      r.chipClass
                    }
                  >
                    {r.label}
                  </span>
                </th>
              ))}
              {ROLES.map((r, idx) => (
                <th
                  key={`u-${r.value}`}
                  className={
                    'px-2 py-1.5 text-center align-middle ' +
                    (idx === ROLES.length - 1 ? 'border-r border-border' : '')
                  }
                >
                  <span
                    className={
                      'inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ' +
                      r.chipClass
                    }
                  >
                    {r.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {presets.map((p) => (
              <PresetRowEditor key={p.id} preset={p} canEdit={canEdit} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Legenda compatta sotto la tabella */}
      <div className="border-t border-border bg-muted/20 px-4 py-2.5">
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Legenda ruoli
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ROLES.map((r) => (
            <span
              key={r.value}
              className={
                'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ' +
                r.chipClass
              }
            >
              {r.label}
            </span>
          ))}
        </div>
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
      {ROLES.map((r, idx) => (
        <td
          key={`v-${r.value}`}
          className={
            'px-1 py-2 text-center align-middle ' +
            (idx === ROLES.length - 1 ? 'border-r border-border' : '')
          }
        >
          <Checkbox
            checked={visible.has(r.value)}
            disabled={!canEdit}
            onToggle={() => toggle(visible, r.value, setVisible)}
            aria-label={`Visibile a ${r.label}`}
            title={`Vedi: ${r.label}`}
          />
        </td>
      ))}
      {ROLES.map((r, idx) => (
        <td
          key={`u-${r.value}`}
          className={
            'px-1 py-2 text-center align-middle ' +
            (idx === ROLES.length - 1 ? 'border-r border-border' : '')
          }
        >
          <Checkbox
            checked={upload.has(r.value)}
            disabled={!canEdit}
            onToggle={() => toggle(upload, r.value, setUpload)}
            aria-label={`Caricamento per ${r.label}`}
            title={`Carica: ${r.label}`}
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

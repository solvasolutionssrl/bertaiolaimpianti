'use client';

import * as React from 'react';
import { useTransition } from 'react';
import { X, RotateCcw, ShieldCheck, Loader2 } from 'lucide-react';
import {
  PERMISSION_AREAS,
  PERMISSION_LEVELS,
  AREA_LABELS,
  LEVEL_LABELS,
  getRoleDefaultPermissions,
} from '@impiantixplus/api/types';
import type {
  PermissionArea,
  PermissionLevelMap,
  UserPermissionOverrides,
  EffectivePermissions,
} from '@impiantixplus/api/types';
import type { AppRole } from '@impiantixplus/api';
import { salvaPermessi } from '../_actions/permissions';

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  role: AppRole;
  overrides: UserPermissionOverrides | null;
}

export function PermissionsSheet({ open, onClose, userId, userName, role, overrides }: Props) {
  const defaults = getRoleDefaultPermissions(role);

  // Local state: current selection per area (starts from effective = defaults merged with overrides)
  const [selected, setSelected] = React.useState<EffectivePermissions>(() =>
    mergePermissions(defaults, overrides),
  );
  const [pending, start] = useTransition();
  const [saved, setSaved] = React.useState(false);

  // Reset when the sheet opens with new data
  React.useEffect(() => {
    if (open) {
      setSelected(mergePermissions(defaults, overrides));
      setSaved(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId]);

  if (!open) return null;

  const roleLabel: Record<AppRole, string> = {
    owner: 'Owner', admin: 'Admin', office: 'Ufficio',
    capo: 'Capo cantiere', tecnico: 'Tecnico', cliente: 'Cliente',
  };

  const hasChanges = PERMISSION_AREAS.some((area) => selected[area] !== defaults[area]);

  function handleSelect(area: PermissionArea, level: string) {
    setSelected((prev) => ({ ...prev, [area]: level }));
    setSaved(false);
  }

  function handleReset() {
    setSelected(mergePermissions(defaults, null));
    setSaved(false);
  }

  function handleSave() {
    // Build overrides: only store areas that differ from defaults
    const newOverrides: UserPermissionOverrides = {};
    let hasOverrides = false;
    for (const area of PERMISSION_AREAS) {
      if (selected[area] !== defaults[area]) {
        (newOverrides as Record<string, string>)[area] = selected[area];
        hasOverrides = true;
      }
    }

    start(async () => {
      try {
        await salvaPermessi({ userId, overrides: hasOverrides ? newOverrides : null });
        setSaved(true);
        setTimeout(onClose, 800);
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Errore nel salvataggio.');
      }
    });
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Permessi avanzati — ${userName}`}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-2xl border-t border-border bg-background shadow-2xl sm:inset-x-auto sm:right-4 sm:top-4 sm:bottom-4 sm:w-[480px] sm:rounded-2xl sm:border"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-border bg-background/95 px-5 py-4 backdrop-blur-sm">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
              <h2 className="text-sm font-semibold">Permessi avanzati</h2>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {userName}
              <span className="mx-1.5 text-border">·</span>
              <span className="font-medium text-foreground">{roleLabel[role]}</span>
              <span className="mx-1.5 text-border">·</span>
              default dal ruolo
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Chiudi"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Legend */}
        <div className="border-b border-border px-5 py-2.5">
          <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full border-2 border-primary bg-primary/20" />
              Override attivo
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-muted" />
              Default ruolo
            </span>
          </div>
        </div>

        {/* Matrix */}
        <div className="divide-y divide-border px-5">
          {PERMISSION_AREAS.map((area) => {
            const levels = PERMISSION_LEVELS[area];
            const currentValue = selected[area] as string;
            const defaultValue = defaults[area] as string;
            const isOverride = currentValue !== defaultValue;

            return (
              <div key={area} className="py-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    {AREA_LABELS[area]}
                  </span>
                  {isOverride ? (
                    <span className="font-mono text-[9px] uppercase tracking-wider text-primary">
                      override
                    </span>
                  ) : null}
                </div>
                <div className="flex gap-1">
                  {levels.map((level) => {
                    const isSelected = currentValue === level;
                    const isDefault = defaultValue === level;

                    return (
                      <button
                        key={level}
                        type="button"
                        onClick={() => handleSelect(area, level)}
                        className={[
                          'flex-1 rounded-lg border px-1.5 py-2 font-mono text-[10px] uppercase tracking-wider transition-colors',
                          isSelected
                            ? isOverride
                              ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                              : 'border-primary/40 bg-primary/10 text-primary'
                            : isDefault
                              ? 'border-border bg-muted/40 text-muted-foreground'
                              : 'border-border/50 bg-transparent text-muted-foreground/60 hover:border-border hover:text-muted-foreground',
                        ].join(' ')}
                        aria-pressed={isSelected}
                        title={isDefault && !isSelected ? `Default: ${LEVEL_LABELS[level] ?? level}` : undefined}
                      >
                        {LEVEL_LABELS[level] ?? level}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border bg-background/95 px-5 py-4 backdrop-blur-sm">
          <button
            type="button"
            onClick={handleReset}
            disabled={!hasChanges || pending}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw className="h-3 w-3" />
            Ripristina default
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={pending}
              className="flex min-w-[80px] items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : saved ? (
                '✓ Salvato'
              ) : (
                'Salva'
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function mergePermissions(
  defaults: EffectivePermissions,
  overrides: UserPermissionOverrides | null,
): EffectivePermissions {
  if (!overrides) return { ...defaults };
  const merged = { ...defaults };
  for (const area of PERMISSION_AREAS) {
    const ov = (overrides as Record<string, string | undefined>)[area];
    if (ov !== undefined) {
      (merged as Record<string, string>)[area] = ov;
    }
  }
  return merged;
}

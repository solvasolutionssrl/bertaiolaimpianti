'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { Card, CardContent, Input, Label, cn } from '@kommessa/ui';

import { aggiornaAlertSetting } from '../../../_actions/alert-settings';
import { useAlert } from '@/app/_components/confirm-provider';

import type {
  AlertSetting,
  AlertType,
} from '../../../_lib/alerts';

interface Props {
  initial: Record<AlertType, AlertSetting>;
  defaults: Record<
    AlertType,
    { enabled: boolean; threshold_days: number; label: string; description: string }
  >;
  canEdit: boolean;
}

export function AlertSettingsForm({ initial, defaults, canEdit }: Props) {
  const router = useRouter();
  const showAlert = useAlert();
  const [state, setState] = React.useState(initial);
  const [savingType, setSavingType] = React.useState<AlertType | null>(null);

  const setRow = (type: AlertType, patch: Partial<AlertSetting>) => {
    setState((s) => ({ ...s, [type]: { ...s[type], ...patch } }));
  };

  const persist = async (type: AlertType, row: AlertSetting) => {
    setSavingType(type);
    const res = await aggiornaAlertSetting({
      alertType: type,
      enabled: row.enabled,
      thresholdDays: row.threshold_days,
    });
    setSavingType(null);
    if (!res.ok) {
      await showAlert({ title: 'Errore', body: res.error });
      return;
    }
    router.refresh();
  };

  const types = Object.keys(defaults) as AlertType[];

  return (
    <Card>
      <CardContent className="space-y-3 py-5">
        <div className="space-y-1">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Categorie di avviso
          </p>
          <p className="text-xs text-muted-foreground">
            Attiva o disattiva le categorie di alert calcolate automaticamente,
            e regola le soglie in giorni dove ha senso.
            {!canEdit ? (
              <>
                {' '}
                <span className="font-semibold">
                  Solo admin/office possono modificare.
                </span>
              </>
            ) : null}
          </p>
        </div>
        <div className="divide-y divide-border">
          {types.map((type) => {
            const row = state[type];
            const meta = defaults[type];
            const hasThreshold = !['todo_scaduti', 'todo_urgenti_non_assegnati'].includes(
              type,
            );
            return (
              <div key={type} className="flex items-start gap-3 py-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={row.enabled}
                  disabled={!canEdit || savingType === type}
                  onClick={() => {
                    const next = !row.enabled;
                    setRow(type, { enabled: next });
                    void persist(type, { ...row, enabled: next });
                  }}
                  className={cn(
                    'mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50',
                    row.enabled
                      ? 'border-primary bg-primary'
                      : 'border-border bg-muted',
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                      row.enabled ? 'translate-x-6' : 'translate-x-1',
                    )}
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    {row.enabled ? (
                      <Bell className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <BellOff className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    {meta.label}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {meta.description}
                  </p>
                  {hasThreshold && row.enabled ? (
                    <div className="mt-2 flex items-center gap-2">
                      <Label
                        htmlFor={`th_${type}`}
                        className="text-[11px] uppercase tracking-wider text-muted-foreground"
                      >
                        Soglia
                      </Label>
                      <Input
                        id={`th_${type}`}
                        type="number"
                        min={0}
                        max={365}
                        disabled={!canEdit || savingType === type}
                        value={row.threshold_days}
                        onChange={(e) =>
                          setRow(type, {
                            threshold_days: Math.max(
                              0,
                              Math.min(365, parseInt(e.target.value, 10) || 0),
                            ),
                          })
                        }
                        onBlur={(e) => {
                          const v = Math.max(
                            0,
                            Math.min(365, parseInt(e.target.value, 10) || 0),
                          );
                          if (v !== initial[type].threshold_days) {
                            void persist(type, {
                              ...row,
                              threshold_days: v,
                            });
                          }
                        }}
                        className="h-7 w-20 text-xs"
                      />
                      <span className="text-xs text-muted-foreground">giorni</span>
                    </div>
                  ) : null}
                </div>
                {savingType === type ? (
                  <Loader2 className="mt-2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : null}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

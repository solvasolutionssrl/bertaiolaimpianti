'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@kommessa/ui';
import { FEATURE_REGISTRY, featureDefault, type FeatureKey } from '@/app/_lib/tenant-features-registry';
import { aggiornaFunzioneTenant } from '../../../_actions/tenants';
import { useAlert } from '@/app/_components/confirm-provider';

type Stato = 'default' | 'on' | 'off';

const SCELTE: { stato: Stato; label: string }[] = [
  { stato: 'default', label: 'Predefinito' },
  { stato: 'on', label: 'Mostra' },
  { stato: 'off', label: 'Nascondi' },
];

export function TabFunzioni({
  tenantId,
  features,
  kommessaWorld,
}: {
  tenantId: string;
  /** Override correnti da `tenants.features`. */
  features: Record<string, boolean>;
  /** Mondo commesse del tenant (app_mode ≠ kantiere) → guida i default. */
  kommessaWorld: boolean;
}) {
  const router = useRouter();
  const showAlert = useAlert();
  const [pendingKey, setPendingKey] = React.useState<FeatureKey | null>(null);
  const [, start] = React.useTransition();

  const applica = (key: FeatureKey, stato: Stato) => {
    const value = stato === 'default' ? null : stato === 'on';
    setPendingKey(key);
    start(async () => {
      const res = await aggiornaFunzioneTenant({ tenantId, key, value });
      setPendingKey(null);
      if (!res.ok) {
        await showAlert({ title: 'Errore', body: res.error });
        return;
      }
      router.refresh();
    });
  };

  return (
    <Card>
      <CardContent className="space-y-4 py-6">
        <p className="text-[11px] leading-snug text-muted-foreground">
          Mostra o nascondi singole funzioni dell&apos;area office per questo tenant.{' '}
          <strong>Predefinito</strong> segue l&apos;esperienza app: le funzioni del mondo commesse
          sono attive per i tenant Kommessa/Completa e spente per i tenant solo-Kantiere. Le pagine
          nascoste sono bloccate anche via URL (404).
        </p>

        {FEATURE_REGISTRY.map((def) => {
          const has = Object.prototype.hasOwnProperty.call(features, def.key);
          const statoCorrente: Stato = !has ? 'default' : features[def.key] ? 'on' : 'off';
          const predefinito = featureDefault(def, kommessaWorld);
          const effettivo = has ? !!features[def.key] : predefinito;
          const busy = pendingKey === def.key;

          return (
            <div
              key={def.key}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {def.label}
                  <span
                    className={
                      'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ' +
                      (effettivo
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-600')
                    }
                  >
                    {effettivo ? 'Attiva' : 'Nascosta'}
                  </span>
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {def.descrizione} · Predefinito: {predefinito ? 'attiva' : 'nascosta'}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <div className="inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5">
                  {SCELTE.map((s) => {
                    const selected = statoCorrente === s.stato;
                    return (
                      <button
                        key={s.stato}
                        type="button"
                        onClick={() => applica(def.key, s.stato)}
                        disabled={busy || selected}
                        className={
                          'rounded px-2.5 py-1 text-xs font-medium transition-colors ' +
                          (selected
                            ? 'bg-background text-foreground shadow-soft'
                            : 'text-muted-foreground hover:text-foreground')
                        }
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
                ) : null}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

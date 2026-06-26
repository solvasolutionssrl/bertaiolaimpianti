'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, Car, Gauge, AlertTriangle } from 'lucide-react';
import { Badge, Button, Card, CardContent, cn } from '@kommessa/ui';

import { aggiornaRoutingProviderTenant } from '../../../_actions/tenants';
import { useAlert } from '@/app/_components/confirm-provider';

type Provider = 'free' | 'google';

interface Option {
  id: Provider;
  label: string;
  byline: string;
  description: string;
  costo: string;
  tone: 'muted' | 'primary';
}

const OPTIONS: Option[] = [
  {
    id: 'free',
    label: 'Free (OSRM / OpenRouteService)',
    byline: 'Gratis · senza traffico',
    description:
      'Stima a flusso libero (niente traffico reale). Sufficiente come suggerimento: il tecnico conferma o corregge. Nessun costo.',
    costo: '€0',
    tone: 'muted',
  },
  {
    id: 'google',
    label: 'Google Maps (Routes API)',
    byline: 'Traffico reale · a pagamento',
    description:
      'Tempo di percorrenza con il traffico attuale (come l’app Maps) + km reali. A pagamento sulla chiave di piattaforma. Consigliato dove i tempi di viaggio contano per ore e costi.',
    costo: '~€5–10 / 1.000 stime (entro free tier per volumi bassi)',
    tone: 'primary',
  },
];

export function TabRouting({
  tenantId,
  tenantNome,
  currentProvider,
  googleKeyConfigured,
}: {
  tenantId: string;
  tenantNome: string;
  currentProvider: Provider;
  googleKeyConfigured: boolean;
}) {
  const router = useRouter();
  const showAlert = useAlert();
  const [pending, start] = React.useTransition();
  const [selected, setSelected] = React.useState<Provider>(currentProvider);
  const dirty = selected !== currentProvider;

  const apply = () => {
    start(async () => {
      const res = await aggiornaRoutingProviderTenant({ tenantId, provider: selected });
      if (!res.ok) {
        await showAlert({ title: 'Errore', body: res.error });
        return;
      }
      router.refresh();
    });
  };

  return (
    <Card>
      <CardContent className="space-y-5 py-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Car className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Stima viaggio (km + tempo)
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Provider usato per stimare i chilometri e il tempo di percorrenza
              tra sede e cantiere per{' '}
              <strong className="text-foreground">{tenantNome}</strong>. La chiave
              Google è unica di piattaforma: qui decidi solo se questo tenant la
              usa.
            </p>
          </div>
        </div>

        {/* Stato chiave di piattaforma */}
        <div
          className={cn(
            'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs',
            googleKeyConfigured
              ? 'border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-700 dark:text-emerald-400'
              : 'border-amber-500/40 bg-amber-500/[0.06] text-amber-700 dark:text-amber-400',
          )}
        >
          {googleKeyConfigured ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )}
          <span>
            Chiave Google di piattaforma (<code className="font-mono">GOOGLE_MAPS_API_KEY</code>):{' '}
            <strong>{googleKeyConfigured ? 'configurata' : 'assente'}</strong>.
            {!googleKeyConfigured
              ? ' Finché manca, anche scegliendo Google si ricade sul provider free.'
              : ''}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {OPTIONS.map((opt) => {
            const isSelected = selected === opt.id;
            const isCurrent = currentProvider === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSelected(opt.id)}
                className={cn(
                  'flex flex-col gap-2 rounded-lg border p-3.5 text-left transition-all',
                  isSelected
                    ? 'border-primary ring-2 ' +
                        (opt.tone === 'primary'
                          ? 'ring-primary/40 bg-primary/[0.04]'
                          : 'ring-border bg-muted/20')
                    : 'border-border hover:border-primary/40 hover:bg-muted/30',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-semibold">{opt.label}</h3>
                      {isCurrent ? (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400"
                        >
                          <CheckCircle2 className="mr-0.5 h-2.5 w-2.5" />
                          Attivo
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {opt.byline}
                    </p>
                  </div>
                  {opt.id === 'google' ? (
                    <Gauge className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  ) : null}
                </div>
                <p className="text-xs leading-relaxed text-foreground/85">{opt.description}</p>
                <span className="mt-1 font-mono text-[11px] text-muted-foreground">{opt.costo}</span>
              </button>
            );
          })}
        </div>

        {selected === 'google' && !googleKeyConfigured ? (
          <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Puoi salvare la scelta, ma diventerà effettiva solo quando la chiave di
            piattaforma sarà presente nell&apos;ambiente.
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-[11px] leading-snug text-muted-foreground">
            La modifica è immediata: le stime successive useranno il nuovo provider.
            Le tratte già in cache restano finché non scadono.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {dirty ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelected(currentProvider)}
                disabled={pending}
              >
                Annulla
              </Button>
            ) : null}
            <Button type="button" size="sm" onClick={apply} disabled={pending || !dirty}>
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {pending ? 'Salvo…' : 'Applica provider'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

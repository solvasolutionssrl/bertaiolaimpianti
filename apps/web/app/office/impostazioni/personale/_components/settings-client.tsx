'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Scale, Plus, Trash2, Loader2, Sparkles, ExternalLink, Clock, CalendarDays } from 'lucide-react';
import { Button, Card, CardContent, Badge } from '@kommessa/ui';
import { PERMESSO_TIPI, UNITA_LABEL } from '@kommessa/api/permessi-tipi';
import type { TipoOpt } from '@/app/_lib/dipendenti-config';
import { useAlert, useConfirm } from '@/app/_components/confirm-provider';
import {
  aggiornaTipiPermessoAttivi,
  creaTipoPermessoCustom,
  eliminaTipoPermessoCustom,
} from '@/app/office/_actions/ferie-permessi';

type Unita = 'giorni' | 'ore' | 'entrambi';

export function PersonaleSettingsClient({
  attivi,
  custom,
  canManage,
}: {
  attivi: string[];
  custom: TipoOpt[];
  canManage: boolean;
}) {
  const router = useRouter();
  const alert = useAlert();
  const confirm = useConfirm();
  const [pending, start] = React.useTransition();
  const [set, setSet] = React.useState<Set<string>>(new Set(attivi));

  // Nuovo tipo custom
  const [label, setLabel] = React.useState('');
  const [unita, setUnita] = React.useState<Unita>('giorni');
  const [oreDefault, setOreDefault] = React.useState('');

  const toggle = (codice: string) => {
    const next = new Set(set);
    if (next.has(codice)) next.delete(codice);
    else next.add(codice);
    setSet(next);
    start(async () => {
      const res = await aggiornaTipiPermessoAttivi({ codici: [...next] });
      if (!res.ok) {
        setSet(set);
        await alert({ title: 'Errore', body: res.error });
        return;
      }
      router.refresh();
    });
  };

  const creaCustom = () => {
    if (label.trim().length < 2) return;
    start(async () => {
      const res = await creaTipoPermessoCustom({
        label: label.trim(),
        unita,
        oreDefault: unita === 'ore' && oreDefault ? Number(oreDefault) : null,
      });
      if (!res.ok) {
        await alert({ title: 'Errore', body: res.error });
        return;
      }
      setLabel('');
      setOreDefault('');
      setUnita('giorni');
      router.refresh();
    });
  };

  const eliminaCustom = async (t: TipoOpt) => {
    if (
      !(await confirm({
        title: `Eliminare "${t.label}"?`,
        description: 'Non sarà più selezionabile nelle nuove richieste. Le richieste già inviate restano.',
        destructive: true,
        confirmLabel: 'Elimina',
      }))
    )
      return;
    start(async () => {
      const res = await eliminaTipoPermessoCustom(t.codice);
      if (!res.ok) await alert({ title: 'Errore', body: res.error });
      router.refresh();
    });
  };

  return (
    <div className="max-w-4xl space-y-5">
      <header>
        <h1 className="text-lg font-semibold tracking-tight">Ferie e permessi</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Gestisci quali tipi di permesso possono richiedere i dipendenti e aggiungi tipi
          personalizzati per la tua azienda.
        </p>
      </header>

      {/* Tipi mostrati ai dipendenti (built-in) */}
      <Card>
        <CardContent className="py-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Tipi mostrati ai dipendenti</h2>
            <span className="text-[11px] text-muted-foreground">{set.size} attivi</span>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {PERMESSO_TIPI.map((t) => {
              const on = set.has(t.codice);
              return (
                <label
                  key={t.codice}
                  className={
                    'flex cursor-pointer items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm ' +
                    (on ? 'border-primary/30 bg-primary/5' : 'border-border')
                  }
                >
                  <span className="flex items-center gap-1.5">
                    {t.unita === 'ore' ? (
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    {t.label}
                  </span>
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={on}
                    disabled={!canManage || pending}
                    onChange={() => toggle(t.codice)}
                  />
                </label>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Tipi personalizzati */}
      <Card>
        <CardContent className="py-4">
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" /> Tipi personalizzati
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Crea un tipo tuo (es. &laquo;Permesso sindacale interno&raquo;) scegliendo la durata:
            giorni interi, a ore (con eventuale durata predefinita) o libera.
          </p>

          {custom.length > 0 ? (
            <div className="mb-3 space-y-1.5">
              {custom.map((t) => (
                <div
                  key={t.codice}
                  className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{t.label}</span>
                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[10px] text-slate-600">
                      {UNITA_LABEL[t.unita]}
                      {t.unita === 'ore' && t.oreDefault ? ` · ${t.oreDefault}h` : ''}
                    </Badge>
                  </span>
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => eliminaCustom(t)}
                      disabled={pending}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Elimina"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="mb-3 text-xs text-muted-foreground">Nessun tipo personalizzato.</p>
          )}

          {canManage ? (
            <div className="grid gap-2 rounded-md border border-dashed border-border p-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Nome</span>
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="es. Permesso interno"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Durata</span>
                <select
                  value={unita}
                  onChange={(e) => setUnita(e.target.value as Unita)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm focus:border-primary focus:outline-none"
                >
                  <option value="giorni">Tutto il giorno</option>
                  <option value="ore">A ore</option>
                  <option value="entrambi">Libera</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Ore pred.</span>
                <input
                  type="number"
                  min={0.5}
                  max={24}
                  step={0.5}
                  value={oreDefault}
                  onChange={(e) => setOreDefault(e.target.value)}
                  disabled={unita !== 'ore'}
                  placeholder="—"
                  className="h-9 w-20 rounded-md border border-input bg-background px-2 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
                />
              </label>
              <Button type="button" onClick={creaCustom} disabled={pending || label.trim().length < 2}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Aggiungi
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Riferimenti normativi */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <Scale className="h-4 w-4 text-primary" /> Riferimenti normativi
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Descrizioni e fonti verificabili (legge/CCNL) di ogni tipo di permesso.
            </p>
          </div>
          <Link
            href="/office/personale/tipi-permesso"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted/40"
          >
            <ExternalLink className="h-4 w-4" /> Apri riferimenti
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

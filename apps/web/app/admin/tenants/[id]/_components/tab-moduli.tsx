'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Badge, Button, Card, CardContent } from '@kommessa/ui';
import {
  aggiornaModuloTenant,
  aggiornaAppModeTenant,
  aggiornaCodiceAzienda,
} from '../../../_actions/tenants';
import { useAlert } from '@/app/_components/confirm-provider';

type AppMode = 'kommessa' | 'kantiere' | 'full';

const APP_MODE_OPZIONI: { value: AppMode; label: string; descrizione: string }[] = [
  {
    value: 'kommessa',
    label: 'Kommessa',
    descrizione: 'Esperienza attuale: dashboard, commesse, foto, dettatura.',
  },
  {
    value: 'kantiere',
    label: 'Solo Kantiere',
    descrizione: 'PWA dedicata: scansione QR, ore, cantieri. Niente commesse.',
  },
  {
    value: 'full',
    label: 'Completa',
    descrizione: 'Kommessa + entry point Kantiere nella stessa PWA.',
  },
];

export function TabModuli({
  tenantId,
  kantiereAttivo,
  appMode: appModeIniziale,
  codiceAzienda: codiceIniziale,
}: {
  tenantId: string;
  kantiereAttivo: boolean;
  appMode: AppMode;
  codiceAzienda: string;
}) {
  const router = useRouter();
  const showAlert = useAlert();
  const [pending, start] = React.useTransition();
  const [attivo, setAttivo] = React.useState(kantiereAttivo);
  const dirty = attivo !== kantiereAttivo;

  const [appMode, setAppMode] = React.useState<AppMode>(appModeIniziale);
  const [pendingMode, startMode] = React.useTransition();

  const [codice, setCodice] = React.useState(codiceIniziale);
  const [pendingCodice, startCodice] = React.useTransition();
  const codiceDirty = codice.trim().toUpperCase() !== codiceIniziale.toUpperCase();

  const salvaCodice = () => {
    startCodice(async () => {
      const res = await aggiornaCodiceAzienda({ tenantId, codice: codice.trim() });
      if (!res.ok) {
        await showAlert({ title: 'Errore', body: res.error });
        return;
      }
      router.refresh();
    });
  };

  const apply = () => {
    start(async () => {
      const res = await aggiornaModuloTenant({
        tenantId,
        moduleCode: 'kantiere',
        attivo,
      });
      if (!res.ok) {
        await showAlert({ title: 'Errore', body: res.error });
        return;
      }
      router.refresh();
    });
  };

  const applyMode = (next: AppMode) => {
    const prev = appMode;
    setAppMode(next);
    startMode(async () => {
      const res = await aggiornaAppModeTenant({ tenantId, appMode: next });
      if (!res.ok) {
        setAppMode(prev);
        await showAlert({ title: 'Errore', body: res.error });
        return;
      }
      router.refresh();
    });
  };

  return (
    <Card>
      <CardContent className="space-y-5 py-6">
        {/* base: sempre attivo, non modificabile */}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Base</p>
            <p className="text-[11px] text-muted-foreground">
              Commesse, foto, ticketing. Sempre attivo per ogni tenant.
            </p>
          </div>
          <Badge variant="secondary">Sempre attivo</Badge>
        </div>

        {/* kantiere: toggle */}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Kantiere — Tesserino Digitale</p>
            <p className="text-[11px] text-muted-foreground">
              Dipendenti, squadre, presenze/ore, QR cantiere. Additivo a base.
            </p>
          </div>
          <label className="inline-flex shrink-0 cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={attivo}
              onChange={(e) => setAttivo(e.target.checked)}
              disabled={pending}
            />
            <span className="text-xs text-muted-foreground">
              {attivo ? 'Attivo' : 'Spento'}
            </span>
          </label>
        </div>

        {/* Codice azienda (login a 3 campi) */}
        <div className="space-y-2 rounded-lg border border-border px-4 py-3">
          <div>
            <p className="text-sm font-medium">Codice azienda</p>
            <p className="text-[11px] text-muted-foreground">
              1° campo del login per disambiguare gli utenti tra tenant. Il
              tenant di default (Bertaiola) accede anche senza codice.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={codice}
              onChange={(e) => setCodice(e.target.value.toUpperCase())}
              placeholder="es. FPM"
              maxLength={20}
              className="h-9 w-40 rounded-md border border-input bg-background px-3 text-sm uppercase tracking-wide focus:border-primary focus:outline-none"
            />
            <Button
              type="button"
              size="sm"
              onClick={salvaCodice}
              disabled={pendingCodice || !codiceDirty}
            >
              {pendingCodice ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                'Salva'
              )}
            </Button>
          </div>
        </div>

        {/* Esperienza mobile (app_mode) */}
        <div className="space-y-3 rounded-lg border border-border px-4 py-3">
          <div>
            <p className="text-sm font-medium">Esperienza mobile (PWA)</p>
            <p className="text-[11px] text-muted-foreground">
              Quale interfaccia vedono gli utenti sul telefono. &laquo;Solo
              Kantiere&raquo; e &laquo;Completa&raquo; richiedono il modulo
              Kantiere attivo; spegnendo il modulo l&apos;esperienza torna
              automaticamente a &laquo;Kommessa&raquo;.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {APP_MODE_OPZIONI.map((opt) => {
              const selected = appMode === opt.value;
              const consigliaKantiere = opt.value !== 'kommessa' && !attivo;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => applyMode(opt.value)}
                  disabled={pendingMode || selected || consigliaKantiere}
                  className={
                    'flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors ' +
                    (selected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                      : 'border-border hover:bg-muted/40') +
                    (pendingMode ? ' opacity-70' : '') +
                    (consigliaKantiere ? ' cursor-not-allowed opacity-50' : '')
                  }
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {opt.label}
                    {selected ? (
                      <CheckCircle2
                        className="h-3.5 w-3.5 text-primary"
                        aria-hidden="true"
                      />
                    ) : null}
                  </span>
                  <span className="text-[11px] leading-snug text-muted-foreground">
                    {opt.descrizione}
                  </span>
                  {consigliaKantiere ? (
                    <span className="text-[10px] font-medium text-amber-600">
                      Attiva prima il modulo Kantiere
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-[11px] leading-snug text-muted-foreground">
            L&apos;attivazione è immediata. Lo storico audit registra il cambio
            e l&apos;utente platform admin.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {dirty ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAttivo(kantiereAttivo)}
                disabled={pending}
              >
                Annulla
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              onClick={apply}
              disabled={pending || !dirty}
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {pending ? 'Salvo…' : 'Applica'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

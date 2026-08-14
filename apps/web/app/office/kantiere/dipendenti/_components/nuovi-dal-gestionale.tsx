'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, CloudOff, Link2, Loader2, RotateCcw, UserPlus } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  cn,
} from '@kommessa/ui';

import { useAlert } from '@/app/_components/confirm-provider';
import {
  collegaDalGestionale,
  creaDipendenteDalGestionale,
  ignoraDalGestionale,
  riprendiIgnorato,
} from '@/app/_actions/integrazione-nuovi';

/**
 * «Sul gestionale locale c'è una persona che qui non c'è.»
 *
 * Compare solo quando c'è davvero qualcosa da decidere, e non si chiude da
 * solo: finché resta lì, le ore di quella persona non escono.
 *
 * Tre strade, e la terza conta quanto le altre. L'anagrafica di un gestionale è
 * sempre piena di accessi di servizio e postazioni che persone non sono. Senza
 * un modo per dirlo, l'avviso resterebbe acceso per sempre e in due settimane
 * nessuno lo guarderebbe più.
 *
 * ⚠️ Il nome del programma non si scrive: si dice «gestionale locale».
 */

export interface NuovoRow {
  externalId: string;
  nome: string;
  externalCodice: string | null;
  attiva: boolean | null;
}

export interface IgnoratoRow {
  externalId: string;
  etichetta: string | null;
  motivo: string | null;
}

export interface DipendenteOpt {
  id: string;
  etichetta: string;
  collegato: boolean;
}

type Modo = { tipo: 'collega' | 'crea'; riga: NuovoRow } | null;

/** «Rossi Mario» → cognome «Rossi», nome «Mario». Il primo token è il cognome. */
function spezzaNome(intero: string): { cognome: string; nome: string } {
  const parti = intero.trim().split(/\s+/);
  if (parti.length === 1) return { cognome: parti[0] ?? '', nome: '' };
  return { cognome: parti[0] ?? '', nome: parti.slice(1).join(' ') };
}

export function NuoviDalGestionale({
  nuovi,
  ignorati,
  /** Il collegamento col gestionale locale è acceso per questo cliente. */
  attivo,
  dipendenti,
}: {
  nuovi: NuovoRow[];
  ignorati: IgnoratoRow[];
  attivo: boolean;
  dipendenti: DipendenteOpt[];
}) {
  const router = useRouter();
  const showAlert = useAlert();
  const [pending, start] = React.useTransition();
  const [modo, setModo] = React.useState<Modo>(null);
  const [scelto, setScelto] = React.useState('');
  const [form, setForm] = React.useState({ cognome: '', nome: '', matricola: '', mansione: '' });

  if (!attivo || (nuovi.length === 0 && ignorati.length === 0)) return null;

  const esegui = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        await showAlert({ title: 'Non fatto', body: r.error });
        return;
      }
      setModo(null);
      setScelto('');
      router.refresh();
    });
  };

  const apriCollega = (riga: NuovoRow) => {
    setScelto('');
    setModo({ tipo: 'collega', riga });
  };
  const apriCrea = (riga: NuovoRow) => {
    const { cognome, nome } = spezzaNome(riga.nome);
    setForm({ cognome, nome, matricola: '', mansione: '' });
    setModo({ tipo: 'crea', riga });
  };

  return (
    <>
      {nuovi.length > 0 ? (
      <Card className="border-amber-500/40 bg-amber-500/[0.03]">
        <CardContent className="space-y-3 py-5">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400">
              <UserPlus className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">
                {nuovi.length === 1
                  ? 'Sul gestionale locale c’è una persona nuova'
                  : `Sul gestionale locale ci sono ${nuovi.length} persone nuove`}
              </h2>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                Non {nuovi.length === 1 ? 'la creiamo' : 'le creiamo'} da soli: dietro
                una persona c’è un contratto e una busta paga. Dicci tu chi è. Finché
                non lo fai, le sue ore restano qui.
              </p>
            </div>
          </div>

          <ul className="space-y-2">
            {nuovi.map((n) => (
              <li
                key={n.externalId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2"
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium">{n.nome}</span>
                  <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                    id {n.externalId}
                    {n.externalCodice && n.externalCodice !== n.externalId
                      ? ` · cod. ${n.externalCodice}`
                      : ''}
                  </span>
                  {n.attiva === false ? (
                    <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      non più in forza
                    </span>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => apriCollega(n)}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Collega
                  </Button>
                  <Button type="button" size="sm" disabled={pending} onClick={() => apriCrea(n)}>
                    <UserPlus className="h-3.5 w-3.5" />
                    Crea
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    title="Non è un dipendente: è un accesso di servizio o una postazione"
                    disabled={pending}
                    onClick={() =>
                      esegui(() =>
                        ignoraDalGestionale({
                          entita: 'dipendente',
                          externalId: n.externalId,
                          etichetta: n.nome,
                          motivo: 'non è un dipendente',
                        }),
                      )
                    }
                  >
                    <CloudOff className="h-3.5 w-3.5" />
                    Non è una persona
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      ) : null}

      {/* ── Messi da parte: la promessa «si disfa con un click» va mantenuta ── */}
      {ignorati.length > 0 ? (
        <details className="rounded-lg border border-border bg-card px-3 py-2">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs text-muted-foreground">
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            {ignorati.length === 1
              ? 'Hai messo da parte una voce che non è una persona'
              : `Hai messo da parte ${ignorati.length} voci che non sono persone`}
          </summary>
          <ul className="mt-2 space-y-1 border-t border-border/60 pt-2">
            {ignorati.map((i) => (
              <li
                key={i.externalId}
                className="flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <span className="min-w-0 text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {i.etichetta ?? i.externalId}
                  </span>
                  <span className="ml-1.5 font-mono text-[10px]">id {i.externalId}</span>
                  {i.motivo ? <span className="ml-1.5">· {i.motivo}</span> : null}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    esegui(() =>
                      riprendiIgnorato({ entita: 'dipendente', externalId: i.externalId }),
                    )
                  }
                >
                  <RotateCcw className="h-3 w-3" />
                  Rimettila in elenco
                </Button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {/* ── Collega a uno esistente ─────────────────────────────────────── */}
      <Dialog
        open={modo?.tipo === 'collega'}
        onOpenChange={(o) => !o && setModo(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Collega {modo?.riga.nome}</DialogTitle>
            <DialogDescription>
              Chi è, fra i tuoi? Da adesso in poi le sue ore escono con questo nome.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="scelta-dip">Dipendente</Label>
            <select
              id="scelta-dip"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              value={scelto}
              onChange={(e) => setScelto(e.target.value)}
              disabled={pending}
            >
              <option value="">Scegli…</option>
              {dipendenti.map((d) => (
                <option key={d.id} value={d.id} disabled={d.collegato}>
                  {d.etichetta}
                  {d.collegato ? ' · già collegato' : ''}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              Chi è già collegato non si può scegliere: la stessa persona su due
              nomi farebbe contare le ore due volte.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setModo(null)} disabled={pending}>
              Annulla
            </Button>
            <Button
              type="button"
              disabled={pending || !scelto}
              onClick={() =>
                modo &&
                esegui(() =>
                  collegaDalGestionale({
                    entita: 'dipendente',
                    externalId: modo.riga.externalId,
                    nostroId: scelto,
                    etichetta: modo.riga.nome,
                  }),
                )
              }
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Collega
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Crea nuovo ──────────────────────────────────────────────────── */}
      <Dialog open={modo?.tipo === 'crea'} onOpenChange={(o) => !o && setModo(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Crea {modo?.riga.nome}</DialogTitle>
            <DialogDescription>
              Nome e cognome arrivano dal gestionale locale. Il resto lo metti tu.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">Cognome</span>
              <Input
                value={form.cognome}
                onChange={(e) => setForm((f) => ({ ...f, cognome: e.target.value }))}
                disabled={pending}
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">Nome</span>
              <Input
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                disabled={pending}
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">Matricola</span>
              <Input
                value={form.matricola}
                onChange={(e) => setForm((f) => ({ ...f, matricola: e.target.value }))}
                placeholder="es. 00061"
                className="font-mono"
                disabled={pending}
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">Mansione</span>
              <Input
                value={form.mansione}
                onChange={(e) => setForm((f) => ({ ...f, mansione: e.target.value }))}
                placeholder="es. Elettricista"
                disabled={pending}
              />
            </label>
          </div>

          <p
            className={cn(
              'rounded-md border border-amber-500/40 bg-amber-500/[0.06] px-3 py-2',
              'text-[11px] leading-relaxed text-amber-800 dark:text-amber-300',
            )}
          >
            La <strong>matricola è la vostra</strong>, quella del consulente del
            lavoro. Non quella del gestionale locale: si somigliano ma non sono la
            stessa cosa. Se non la sai, lasciala vuota e la metti dopo.
          </p>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setModo(null)} disabled={pending}>
              Annulla
            </Button>
            <Button
              type="button"
              disabled={pending || !form.cognome.trim() || !form.nome.trim()}
              onClick={() =>
                modo &&
                esegui(() =>
                  creaDipendenteDalGestionale({
                    externalId: modo.riga.externalId,
                    cognome: form.cognome.trim(),
                    nome: form.nome.trim(),
                    matricola: form.matricola.trim() || undefined,
                    mansione: form.mansione.trim() || undefined,
                    inForza: modo.riga.attiva !== false,
                  }),
                )
              }
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Crea e collega
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Chiude il cerchio: il segno «collegato» sulla riga di un dipendente. */
export function DipendenteCollegato({
  collegato,
  externalId,
  /** Il collegamento col gestionale locale è acceso per questo cliente. */
  attivo,
  className,
}: {
  collegato: boolean;
  externalId?: string | null;
  attivo?: boolean;
  className?: string;
}) {
  if (!attivo || !collegato) return null;
  const testo = externalId
    ? `Collegato al gestionale locale, con il codice ${externalId}.`
    : 'Collegato al gestionale locale.';
  return (
    <span
      title={testo}
      className={cn('inline-flex shrink-0 items-center text-sky-600 dark:text-sky-400', className)}
    >
      <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">{testo}</span>
    </span>
  );
}

'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, Clock, FlaskConical, Plug, RefreshCw } from 'lucide-react';
import { Badge, Card, CardContent, cn } from '@kommessa/ui';

import type { CodaTenant, EsecuzioneRow, ScritturaRow } from './tipi';

const fmt = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'Europe/Rome',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function quando(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : fmt.format(d);
}

/** «2 ore fa» dice più di un orario quando la domanda è "è fermo?". */
function da(iso: string | null): string {
  if (!iso) return 'mai';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'adesso';
  if (min < 60) return `${min} min fa`;
  const ore = Math.floor(min / 60);
  if (ore < 24) return `${ore} ${ore === 1 ? 'ora' : 'ore'} fa`;
  const gg = Math.floor(ore / 24);
  return `${gg} ${gg === 1 ? 'giorno' : 'giorni'} fa`;
}

/** Oltre questo, un collegamento che dovrebbe girare è probabilmente fermo. */
const SOGLIA_SILENZIO_ORE = 24;

function silenziosoDa(iso: string | null): boolean {
  if (!iso) return true;
  return Date.now() - new Date(iso).getTime() > SOGLIA_SILENZIO_ORE * 3600_000;
}

type Tab = 'stato' | 'scritture' | 'giri';

/**
 * Vista di piattaforma sui collegamenti coi gestionali.
 *
 * Con l'API a risorse non c'è più una coda da sorvegliare: decide l'agente
 * cosa prendere. Restano le due domande che contano quando il cliente chiama —
 * **cosa è stato scritto fuori** e **da quanto nessuno si fa vivo** — più una
 * terza che l'esperienza ha aggiunto: **quanto ritardo sta accumulando** chi
 * ci tiene aggiornati.
 */
export function IntegrazioniClient({
  code,
  scritture,
  giri,
  nessunModulo,
}: {
  code: CodaTenant[];
  scritture: ScritturaRow[];
  giri: EsecuzioneRow[];
  nessunModulo: boolean;
}) {
  const [tab, setTab] = React.useState<Tab>('stato');
  const [soloErrori, setSoloErrori] = React.useState(false);

  const scrFiltrate = soloErrori ? scritture.filter((s) => s.esito === 'errore') : scritture;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Plug className="h-5 w-5" aria-hidden="true" />
            Integrazioni
          </h1>
          <p className="text-sm text-muted-foreground">
            Collegamenti con i gestionali dei clienti.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {(
            [
              ['stato', 'Stato'],
              ['scritture', 'Scritture'],
              ['giri', 'Giri'],
            ] as [Tab, string][]
          ).map(([k, etichetta]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm transition-colors',
                tab === k
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {etichetta}
            </button>
          ))}
        </div>
      </div>

      {nessunModulo ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Nessun cliente ha il modulo <strong>integrazione</strong> attivo.
            <br />
            Si accende dal pannello del singolo cliente.
          </CardContent>
        </Card>
      ) : null}

      {tab === 'stato' ? (
        <div className="grid gap-3 md:grid-cols-2">
          {code.map((c) => {
            const muto = silenziosoDa(c.ultimoGiroOk);
            const inSimulazione = c.modalita !== 'attiva';
            return (
              <Card
                key={c.tenantId}
                className={cn(
                  c.scrittureErrore > 0 && 'border-red-500/40',
                  c.scrittureErrore === 0 && muto && 'border-amber-500/40',
                )}
              >
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{c.tenant}</p>
                      <p className="text-xs text-muted-foreground">
                        gestionale: {c.sistema}
                      </p>
                    </div>
                    {c.scrittureErrore > 0 ? (
                      <Badge className="shrink-0 bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                        <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />
                        {c.scrittureErrore} in errore
                      </Badge>
                    ) : muto ? (
                      <Badge className="shrink-0 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        <Clock className="mr-1 h-3 w-3" aria-hidden="true" />
                        silenzioso
                      </Badge>
                    ) : (
                      <Badge className="shrink-0 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden="true" />
                        ok
                      </Badge>
                    )}
                  </div>

                  {/* La sicura di collaudo va detta forte: chi guarda deve
                      sapere subito perché non sta uscendo niente. */}
                  {inSimulazione ? (
                    <p className="flex items-start gap-1.5 rounded-md border border-sky-500/30 bg-sky-50 px-2.5 py-1.5 text-[11px] text-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
                      <FlaskConical className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                      <span>
                        In <strong>simulazione</strong>: si legge tutto, ma niente
                        deve essere scritto sul gestionale.
                        {c.collaudoEsterni > 0
                          ? ` ${c.collaudoEsterni} identificativi aperti per la prova.`
                          : ''}
                      </span>
                    </p>
                  ) : null}

                  <div className="grid grid-cols-3 gap-2 text-center">
                    {(
                      [
                        ['Scritte', c.scrittureOk, 'text-emerald-600'],
                        [
                          'Errori',
                          c.scrittureErrore,
                          c.scrittureErrore > 0 ? 'text-red-600' : '',
                        ],
                        [
                          'Ritardo medio',
                          c.ritardoMedioMin,
                          (c.ritardoMedioMin ?? 0) > 60 ? 'text-amber-600' : '',
                        ],
                      ] as [string, number | null, string][]
                    ).map(([et, n, colore]) => (
                      <div key={et} className="rounded-md border border-border py-1.5">
                        <p className={cn('text-lg font-semibold tabular-nums', colore)}>
                          {n == null ? '—' : et === 'Ritardo medio' ? `${n}′` : n}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{et}</p>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p className="flex items-center gap-1.5">
                      <RefreshCw className="h-3 w-3" aria-hidden="true" />
                      Ultimo giro riuscito: <strong>{da(c.ultimoGiroOk)}</strong>
                      {c.ultimoGiro && c.ultimoGiro !== c.ultimoGiroOk
                        ? ` · ultimo tentativo ${da(c.ultimoGiro)}`
                        : null}
                    </p>
                    <p>
                      Ultima scrittura sul gestionale:{' '}
                      <strong>{da(c.ultimaScrittura)}</strong>
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}

      {tab === 'scritture' ? (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <p className="text-sm text-muted-foreground">
                Ultime {scritture.length} scritture sui gestionali
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={soloErrori}
                  onChange={(e) => setSoloErrori(e.target.checked)}
                  className="h-4 w-4"
                />
                Solo errori
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="w-[16%] px-3 py-2 font-medium">Cliente</th>
                    <th className="w-[14%] px-3 py-2 font-medium">Cosa</th>
                    <th className="w-[10%] px-3 py-2 font-medium">Esito</th>
                    <th className="w-[26%] px-3 py-2 font-medium">Riferimento / errore</th>
                    <th className="w-[17%] px-3 py-2 font-medium">Scritta il</th>
                    <th className="w-[17%] px-3 py-2 font-medium">Comunicata</th>
                  </tr>
                </thead>
                <tbody>
                  {scrFiltrate.map((s, i) => (
                    <tr
                      key={s.id}
                      className={cn(
                        'border-t border-border align-top',
                        i % 2 === 1 && 'bg-muted/20',
                      )}
                    >
                      <td className="truncate px-3 py-2" title={s.tenant}>
                        {s.tenant}
                      </td>
                      <td className="px-3 py-2 capitalize">
                        {s.risorsa}
                        {s.variante ? (
                          <span className="text-muted-foreground"> · {s.variante}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          className={cn(
                            'font-normal',
                            s.esito === 'ok'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
                          )}
                        >
                          {s.esito}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        {s.errore ? (
                          <span className="text-red-600 dark:text-red-400">{s.errore}</span>
                        ) : s.riferimento ? (
                          <code className="text-[11px] text-muted-foreground">
                            {s.riferimento}
                          </code>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {quando(s.scrittoAl)}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {quando(s.registratoAl)}
                      </td>
                    </tr>
                  ))}
                  {scrFiltrate.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-8 text-center text-sm text-muted-foreground"
                      >
                        {soloErrori ? 'Nessun errore.' : 'Nessuna scrittura registrata.'}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === 'giri' ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="w-[18%] px-3 py-2 font-medium">Cliente</th>
                    <th className="w-[12%] px-3 py-2 font-medium">Direzione</th>
                    <th className="w-[12%] px-3 py-2 font-medium">Esito</th>
                    <th className="w-[20%] px-3 py-2 font-medium">Conteggi</th>
                    <th className="w-[22%] px-3 py-2 font-medium">Messaggio</th>
                    <th className="w-[16%] px-3 py-2 font-medium">Avviato</th>
                  </tr>
                </thead>
                <tbody>
                  {giri.map((g, i) => (
                    <tr
                      key={g.id}
                      className={cn('border-t border-border', i % 2 === 1 && 'bg-muted/20')}
                    >
                      <td className="truncate px-3 py-2" title={g.tenant}>
                        {g.tenant}
                      </td>
                      <td className="px-3 py-2 capitalize text-muted-foreground">
                        {g.direzione} · {g.avvio}
                      </td>
                      <td className="px-3 py-2">
                        {/* Aperto e mai chiuso: l'agente non è tornato. */}
                        {!g.conclusaAt ? (
                          <Badge className="bg-amber-100 font-normal text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            in corso
                          </Badge>
                        ) : (
                          <Badge
                            className={cn(
                              'font-normal',
                              g.esito === 'ok' &&
                                'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
                              g.esito === 'parziale' &&
                                'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
                              g.esito === 'errore' &&
                                'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
                            )}
                          >
                            {g.esito ?? '—'}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {g.letti} letti · {g.scritti} scritti
                        {g.errori > 0 ? (
                          <span className="text-red-600"> · {g.errori} errori</span>
                        ) : null}
                      </td>
                      <td
                        className="truncate px-3 py-2 text-muted-foreground"
                        title={g.messaggio ?? ''}
                      >
                        {g.messaggio ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {quando(g.avviataAt)}
                      </td>
                    </tr>
                  ))}
                  {giri.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-8 text-center text-sm text-muted-foreground"
                      >
                        Nessun giro registrato.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, Clock, Plug, RefreshCw } from 'lucide-react';
import { Badge, Card, CardContent, cn } from '@kommessa/ui';

import type { CodaTenant, EsecuzioneRow, OperazioneRow } from './tipi';

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

/** Oltre questo, un'integrazione che dovrebbe girare è probabilmente ferma. */
const SOGLIA_SILENZIO_ORE = 24;

function silenziosaDa(iso: string | null): boolean {
  if (!iso) return true;
  return Date.now() - new Date(iso).getTime() > SOGLIA_SILENZIO_ORE * 3600_000;
}

const COLORE_STATO: Record<string, string> = {
  in_attesa: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  in_corso: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  inviato: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  errore: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  annullato: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500',
};

const ETICHETTA_STATO: Record<string, string> = {
  in_attesa: 'In attesa',
  in_corso: 'In corso',
  inviato: 'Inviata',
  errore: 'Errore',
  annullato: 'Annullata',
};

type Tab = 'code' | 'operazioni' | 'giri';

export function IntegrazioniClient({
  code,
  operazioni,
  giri,
  nessunModulo,
}: {
  code: CodaTenant[];
  operazioni: OperazioneRow[];
  giri: EsecuzioneRow[];
  nessunModulo: boolean;
}) {
  const [tab, setTab] = React.useState<Tab>('code');
  const [soloErrori, setSoloErrori] = React.useState(false);

  const opFiltrate = soloErrori
    ? operazioni.filter((o) => o.stato === 'errore')
    : operazioni;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Plug className="h-5 w-5" aria-hidden="true" />
            Integrazioni
          </h1>
          <p className="text-sm text-muted-foreground">
            Sincronizzazioni con i gestionali dei clienti.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {(
            [
              ['code', 'Code'],
              ['operazioni', 'Operazioni'],
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

      {tab === 'code' ? (
        <div className="grid gap-3 md:grid-cols-2">
          {code.map((c) => {
            const muta = silenziosaDa(c.ultimoGiroOk);
            return (
              <Card
                key={c.tenantId}
                className={cn(
                  c.inErrore > 0 && 'border-red-500/40',
                  c.inErrore === 0 && muta && 'border-amber-500/40',
                )}
              >
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{c.tenant}</p>
                      <p className="text-xs text-muted-foreground">
                        gestionale: {c.sistema}
                        {c.autoPush ? ' · invio automatico' : ' · solo manuale'}
                      </p>
                    </div>
                    {c.inErrore > 0 ? (
                      <Badge className="shrink-0 bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                        <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />
                        {c.inErrore} in errore
                      </Badge>
                    ) : muta ? (
                      <Badge className="shrink-0 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        <Clock className="mr-1 h-3 w-3" aria-hidden="true" />
                        silenziosa
                      </Badge>
                    ) : (
                      <Badge className="shrink-0 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden="true" />
                        ok
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center">
                    {(
                      [
                        ['In attesa', c.inAttesa, ''],
                        ['In corso', c.inCorso, c.inCorso > 0 ? 'text-amber-600' : ''],
                        ['Errore', c.inErrore, c.inErrore > 0 ? 'text-red-600' : ''],
                        ['Inviate', c.inviate, 'text-emerald-600'],
                      ] as [string, number, string][]
                    ).map(([et, n, colore]) => (
                      <div key={et} className="rounded-md border border-border py-1.5">
                        <p className={cn('text-lg font-semibold tabular-nums', colore)}>
                          {n}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{et}</p>
                      </div>
                    ))}
                  </div>

                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <RefreshCw className="h-3 w-3" aria-hidden="true" />
                    Ultimo giro riuscito: <strong>{da(c.ultimoGiroOk)}</strong>
                    {c.ultimoGiro && c.ultimoGiro !== c.ultimoGiroOk
                      ? ` · ultimo tentativo ${da(c.ultimoGiro)}`
                      : null}
                  </p>

                  {/* Un'operazione bloccata in `in_corso` vuol dire che l'agente
                      l'ha presa e non ha mai riferito: e' morto a meta' giro. */}
                  {c.inCorso > 0 ? (
                    <p className="rounded-md border border-amber-500/30 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                      {c.inCorso} presa in carico e mai conclusa: l’agente potrebbe
                      essersi interrotto a metà giro.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}

      {tab === 'operazioni' ? (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <p className="text-sm text-muted-foreground">
                Ultime {operazioni.length} operazioni
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
                    <th className="w-[15%] px-3 py-2 font-medium">Cliente</th>
                    <th className="w-[8%] px-3 py-2 font-medium">Tipo</th>
                    <th className="w-[10%] px-3 py-2 font-medium">Stato</th>
                    <th className="w-[37%] px-3 py-2 font-medium">Descrizione</th>
                    <th className="w-[18%] px-3 py-2 font-medium">Esito / errore</th>
                    <th className="w-[12%] px-3 py-2 font-medium">Quando</th>
                  </tr>
                </thead>
                <tbody>
                  {opFiltrate.map((o, i) => (
                    <tr
                      key={o.id}
                      className={cn(
                        'border-t border-border align-top',
                        i % 2 === 1 && 'bg-muted/20',
                      )}
                    >
                      <td className="truncate px-3 py-2" title={o.tenant}>
                        {o.tenant}
                      </td>
                      <td className="px-3 py-2 capitalize">{o.tipo}</td>
                      <td className="px-3 py-2">
                        <Badge className={cn('font-normal', COLORE_STATO[o.stato])}>
                          {ETICHETTA_STATO[o.stato] ?? o.stato}
                        </Badge>
                        {o.tentativi > 1 ? (
                          <span className="ml-1 text-[11px] text-muted-foreground">
                            ×{o.tentativi}
                          </span>
                        ) : null}
                      </td>
                      <td
                        className="truncate px-3 py-2 text-muted-foreground"
                        title={o.descrizione ?? ''}
                      >
                        {o.descrizione ?? '—'}
                      </td>
                      <td className="px-3 py-2">
                        {o.errore ? (
                          <span className="text-red-600 dark:text-red-400">{o.errore}</span>
                        ) : o.esitoEsterno ? (
                          <code className="text-[11px] text-muted-foreground">
                            {o.esitoEsterno}
                          </code>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {quando(o.inviataAt ?? o.creataAt)}
                      </td>
                    </tr>
                  ))}
                  {opFiltrate.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-8 text-center text-sm text-muted-foreground"
                      >
                        {soloErrori ? 'Nessun errore.' : 'Nessuna operazione.'}
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
                      className={cn(
                        'border-t border-border',
                        i % 2 === 1 && 'bg-muted/20',
                      )}
                    >
                      <td className="truncate px-3 py-2" title={g.tenant}>
                        {g.tenant}
                      </td>
                      <td className="px-3 py-2 capitalize text-muted-foreground">
                        {g.direzione} · {g.avvio}
                      </td>
                      <td className="px-3 py-2">
                        {/* Aperto e mai chiuso: l'agente non e' tornato. */}
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

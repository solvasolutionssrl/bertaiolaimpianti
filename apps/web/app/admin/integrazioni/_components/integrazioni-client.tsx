'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronRight, FlaskConical, Plug, PowerOff } from 'lucide-react';
import { Badge, Card, CardContent, cn } from '@kommessa/ui';

import {
  SemaforoCollegamento,
  etichettaStato,
} from '../../_components/semaforo-collegamento';
import type { EsecuzioneRow, RigaCollegamento, ScritturaRow } from './tipi';

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

/**
 * «2 ore fa» dice più di un orario quando la domanda è "è fermo?".
 *
 * Prende le ore **già calcolate dal server** e non guarda l'orologio: un
 * `Date.now()` nel render di un componente client SSRato produce un testo
 * diverso fra server e browser, e React scarta l'albero con un errore di
 * idratazione. Stessa trappola documentata per la PWA.
 */
function daOre(ore: number | null): string {
  if (ore === null) return 'mai';
  if (ore < 1) return 'da poco';
  if (ore < 24) return `${ore} ${ore === 1 ? 'ora' : 'ore'} fa`;
  const gg = Math.floor(ore / 24);
  return `${gg} ${gg === 1 ? 'giorno' : 'giorni'} fa`;
}

type Tab = 'stato' | 'scritture' | 'giri';

/**
 * Vista di piattaforma sui collegamenti coi gestionali.
 *
 * Con l'API a risorse non c'è più una coda da sorvegliare: decide l'agente
 * cosa prendere. Restano le domande che contano quando il cliente chiama —
 * **come sta il collegamento**, **cosa è uscito**, **chi è passato**.
 *
 * Il semaforo e il perché arrivano già decisi dal server: la stessa funzione
 * che decide se mandare la mail. Ricalcolarli qui vorrebbe dire, prima o poi,
 * una pagina che dice «tutto a posto» mentre parte un avviso di guasto.
 */
export function IntegrazioniClient({
  righe,
  scritture,
  giri,
}: {
  righe: RigaCollegamento[];
  scritture: ScritturaRow[];
  giri: EsecuzioneRow[];
}) {
  const [tab, setTab] = React.useState<Tab>('stato');
  const [soloErrori, setSoloErrori] = React.useState(false);

  const scrFiltrate = soloErrori ? scritture.filter((s) => s.esito === 'errore') : scritture;
  const daGuardare = righe.filter(
    (r) => r.stato === 'guasto' || r.stato === 'attenzione',
  ).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Plug className="h-5 w-5" aria-hidden="true" />
            Integrazioni
          </h1>
          <p className="text-sm text-muted-foreground">
            {righe.length === 0
              ? 'Nessun cliente collegato a un gestionale.'
              : daGuardare === 0
                ? `${righe.length} ${righe.length === 1 ? 'collegamento' : 'collegamenti'}, tutti regolari.`
                : `${daGuardare} su ${righe.length} ${daGuardare === 1 ? 'chiede' : 'chiedono'} attenzione.`}
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

      {righe.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Nessun cliente ha il modulo <strong>integrazione</strong>.
            <br />
            Si accende dal pannello del singolo cliente, scheda Integrazione.
          </CardContent>
        </Card>
      ) : null}

      {tab === 'stato' ? (
        <div className="space-y-3">
          {righe.map((r) => (
            <Card
              key={r.tenantId}
              className={cn(
                r.stato === 'guasto' && 'border-red-500/40',
                r.stato === 'attenzione' && 'border-amber-500/40',
              )}
            >
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <SemaforoCollegamento stato={r.stato} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate font-semibold">{r.tenant}</p>
                        <Badge variant="outline" className="text-[10px]">
                          {r.sistema ?? 'gestionale non scelto'}
                        </Badge>
                        {!r.attivo ? (
                          <Badge className="bg-slate-200 text-[10px] font-normal text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            <PowerOff className="mr-1 h-3 w-3" aria-hidden="true" />
                            modulo spento
                          </Badge>
                        ) : null}
                        {r.modalita === 'simulazione' ? (
                          <Badge className="bg-sky-100 text-[10px] font-normal text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                            <FlaskConical className="mr-1 h-3 w-3" aria-hidden="true" />
                            simulazione
                          </Badge>
                        ) : null}
                      </div>
                      <ul className="mt-1 space-y-0.5">
                        {r.motivi.map((m) => (
                          <li key={m} className="text-xs text-muted-foreground">
                            {m}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <Link
                    href={`/admin/tenants/${r.tenantId}?tab=integrazione`}
                    className="inline-flex shrink-0 items-center gap-0.5 text-xs text-primary hover:underline"
                  >
                    {etichettaStato(r.stato) === 'Regolare' ? 'Gestisci' : 'Vai a sistemare'}
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {(
                    [
                      ['Visto', daOre(r.silenzioOre), r.stato === 'guasto' ? 'rosso' : ''],
                      [
                        'Scritte 24h',
                        String(r.scrittureOk),
                        '',
                      ],
                      [
                        'Errori 24h',
                        String(r.scrittureErrore),
                        r.scrittureErrore > 0 ? 'rosso' : '',
                      ],
                      [
                        'Ritardo',
                        r.ritardoMedioMin === null ? '—' : `${r.ritardoMedioMin}′`,
                        (r.ritardoMedioMin ?? 0) > 60 ? 'ambra' : '',
                      ],
                      [
                        'Collegate',
                        `${r.collegate}/${r.nostreTotali}`,
                        r.collegate < r.nostreTotali ? 'ambra' : '',
                      ],
                    ] as [string, string, string][]
                  ).map(([et, v, tono]) => (
                    <div
                      key={et}
                      className={cn(
                        'rounded-md border px-2.5 py-1.5',
                        tono === 'rosso'
                          ? 'border-red-500/30 bg-red-500/[0.05]'
                          : tono === 'ambra'
                            ? 'border-amber-500/30 bg-amber-500/[0.05]'
                            : 'border-border',
                      )}
                    >
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {et}
                      </p>
                      <p className="truncate text-sm font-semibold tabular-nums">{v}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
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

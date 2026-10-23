'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Fingerprint } from 'lucide-react';
import { Button, Card, CardContent, cn } from '@kommessa/ui';

import type { MiaGiornata } from '@/app/office/_lib/mia-giornata';
import { ETICHETTA_STATO_TIMBRO, type TimbroGiornataVista } from '@/app/_lib/timbro/vista';
import { GiornataFlow, TimbratureRiepilogo, type TimbraturaInput } from '@/app/office/kantiere/_components/timbrature-riepilogo';
import { TimbriTerminale } from '@/app/office/kantiere/_components/timbri-terminale';
import { useCompilaMio } from '../../_components/compila-mio';

export interface RigaOreMia {
  id: string;
  data: string;
  stato: string;
  daVerificare: boolean;
  lavoroMin: number;
  ordinarieMin: number;
  straordinarieMin: number;
  viaggioMin: number;
  viaggioKm: number;
  righe: { etichetta: string; lavoroMin: number; viaggioMin: number }[];
  timbrature: TimbraturaInput[];
  timbro: TimbroGiornataVista | null;
}

const hm = (min: number) => `${Math.floor(Math.max(0, min) / 60)}:${String(Math.round(Math.max(0, min)) % 60).padStart(2, '0')}`;
const fmtGiorno = (g: string) => {
  const [y, m, d] = g.split('-').map(Number);
  const s = new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const STATO: Record<string, string> = { bozza: 'Da verificare', inviato: 'Inviata', approvato: 'Regolare', respinto: 'Respinta' };

/**
 * «Le mie ore» da computer: le mie giornate del periodo, una riga ciascuna,
 * con la linea del giorno e il dettaglio che si apre. Le giornate timbrate
 * ancora da ripartire stanno in cima, con il tasto che apre il dialog da
 * scrivania nel solo modo «mio».
 */
export function OreMioClient({ mia, righe, daRipartire, periodo, haTimbratureOggi }: {
  mia: MiaGiornata;
  righe: RigaOreMia[];
  daRipartire: TimbroGiornataVista[];
  periodo: { da: string; a: string };
  haTimbratureOggi: boolean;
}) {
  const router = useRouter();
  const { apri, dialogo } = useCompilaMio(mia);
  const [aperta, setAperta] = React.useState<string | null>(null);
  const totale = righe.reduce((a, r) => a + r.lavoroMin, 0);

  const cambiaPeriodo = (da: string, a: string) => router.push(`/office/mio/ore?da=${da}&a=${a}`);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Dal
          <input type="date" defaultValue={periodo.da} max={periodo.a} onChange={(e) => e.target.value && cambiaPeriodo(e.target.value, periodo.a)} className="h-10 rounded-md border border-input bg-background px-2 text-sm text-foreground" />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          al
          <input type="date" defaultValue={periodo.a} min={periodo.da} onChange={(e) => e.target.value && cambiaPeriodo(periodo.da, e.target.value)} className="h-10 rounded-md border border-input bg-background px-2 text-sm text-foreground" />
        </label>
        <p className="text-sm text-muted-foreground">
          {righe.length} {righe.length === 1 ? 'giornata' : 'giornate'} · <span className="tabular-nums">{hm(totale)}</span> di lavoro
        </p>
        {mia.impostazioni.registraGiornataAttivo && !haTimbratureOggi && !mia.turno ? (
          <Button size="sm" className="ml-auto" onClick={() => apri({ tipo: 'registra' })}>
            Registra giornata
          </Button>
        ) : null}
      </div>

      {daRipartire.length > 0 ? (
        <section className="rounded-xl border border-sky-200 bg-sky-50/60 px-3.5 py-2.5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-900">Da ripartire · {daRipartire.length}</p>
          <ul className="space-y-1.5 text-xs">
            {daRipartire.map((g) => (
              <li key={g.chiave} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="w-24 shrink-0 tabular-nums">{fmtGiorno(g.giorno)}</span>
                <TimbriTerminale timbri={g.timbri} compatto />
                <span className="ml-auto inline-flex items-center gap-2">
                  <span className="rounded-full border border-sky-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-sky-800">{ETICHETTA_STATO_TIMBRO[g.stato]}</span>
                  {g.stato === 'da_ripartire' || g.stato === 'da_chiudere' ? (
                    <Button size="sm" variant="outline" className="h-7" onClick={() => apri({ tipo: 'scatola', vista: g })}>
                      Inserisci le commesse
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Card>
        <CardContent className="p-0 sm:p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-8 px-2 py-2" aria-label="Dettaglio" />
                <th className="w-32 px-3 py-2 font-medium">Giorno</th>
                <th className="px-3 py-2 font-medium">Giornata</th>
                <th className="w-20 px-3 py-2 text-right font-medium">Lavoro</th>
                <th className="w-20 px-3 py-2 text-right font-medium">Straord.</th>
                <th className="w-24 px-3 py-2 text-right font-medium">Viaggio</th>
                <th className="w-28 px-3 py-2 font-medium">Esito</th>
              </tr>
            </thead>
            <tbody>
              {righe.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    Nessuna giornata nel periodo.
                  </td>
                </tr>
              ) : (
                righe.map((r) => {
                  const open = aperta === r.id;
                  return (
                    <React.Fragment key={r.id}>
                      <tr
                        data-giornata={r.data}
                        className={cn('cursor-pointer border-b border-border hover:bg-muted/40', open && 'bg-muted/30')}
                        onClick={() => setAperta(open ? null : r.id)}
                      >
                        <td className="px-2 py-2 text-muted-foreground">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                        <td className="px-3 py-2 font-medium tabular-nums">{fmtGiorno(r.data)}</td>
                        <td className="px-3 py-2">
                          <GiornataFlow timbrature={r.timbrature} oreViaggio={r.viaggioMin / 60} kmViaggio={r.viaggioKm} minutiLavoro={r.lavoroMin} />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{hm(r.lavoroMin)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.straordinarieMin > 0 ? hm(r.straordinarieMin) : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {r.viaggioMin > 0 || r.viaggioKm > 0 ? `${r.viaggioKm > 0 ? `${Math.round(r.viaggioKm)} km · ` : ''}${hm(r.viaggioMin)}` : '—'}
                        </td>
                        <td className="px-3 py-2">
                          {r.timbro && r.righe.length === 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800">
                              <Fingerprint className="h-3 w-3" aria-hidden="true" /> {ETICHETTA_STATO_TIMBRO[r.timbro.stato]}
                            </span>
                          ) : r.daVerificare ? (
                            <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">Da verificare</span>
                          ) : (
                            <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{STATO[r.stato] ?? r.stato}</span>
                          )}
                        </td>
                      </tr>
                      {open ? (
                        <tr className="border-b border-border bg-muted/20">
                          <td colSpan={7} className="px-4 py-3">
                            <div className="grid gap-4 md:grid-cols-2">
                              <div>
                                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Ore per cantiere</p>
                                {r.righe.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">Nessuna riga: le ore non sono ancora attribuite.</p>
                                ) : (
                                  <ul className="space-y-1 text-xs">
                                    {r.righe.map((x, i) => (
                                      <li key={i} className="flex items-center justify-between gap-3">
                                        <span className="truncate">{x.etichetta}</span>
                                        <span className="shrink-0 tabular-nums">
                                          {hm(x.lavoroMin)}
                                          {x.viaggioMin > 0 ? <span className="text-muted-foreground"> · viaggio {hm(x.viaggioMin)}</span> : null}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                              <div>
                                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Timbrature</p>
                                {r.timbrature.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">Senza timbrature.</p>
                                ) : (
                                  <TimbratureRiepilogo timbrature={r.timbrature} />
                                )}
                                {r.timbro ? (
                                  <div className="mt-2">
                                    <TimbriTerminale timbri={r.timbro.timbri} compatto />
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {dialogo}
    </div>
  );
}

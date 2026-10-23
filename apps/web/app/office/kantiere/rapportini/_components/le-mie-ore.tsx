'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { UserRound } from 'lucide-react';
import { Button, cn } from '@kommessa/ui';

import type { MiaGiornata } from '@/app/office/_lib/mia-giornata';
import { useMiaGiornata } from '@/app/office/_components/mia-giornata';
import type { GiornataAperta } from '@/app/office/_actions/kantiere-rapportini';
import { ETICHETTA_STATO_TIMBRO, type TimbroGiornataVista } from '@/app/_lib/timbro/vista';
import { TimbriTerminale } from '../../_components/timbri-terminale';
import { GiornataApertaRiga } from './giornate-aperte-panel';

const fmtGiorno = (g: string) => {
  const [y, m, d] = g.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
};

/**
 * «Le mie ore»: la zona della pagina che parla di ME, per chi gestisce le
 * presenze da PC e timbra anche per se'. Stessa sostanza della pillola
 * nell'header (stesso hook, stessi dialog), ma qui c'e' spazio: lo stato di
 * oggi con i tasti, e sotto le mie giornate che chiedono una mano. Tutto cio'
 * che riguarda gli altri sta sotto, nella zona «La squadra».
 */
export function LeMieOre({
  mia,
  timbroOggi,
  timbro,
  giorniAperti,
  nAnomalie,
  onRipartisci,
  onVediLeMie,
}: {
  mia: MiaGiornata;
  /** La mia giornata timbrata di OGGI, se c'e' (anche aperta): e' quella del blocco «Oggi». */
  timbroOggi: TimbroGiornataVista | null;
  /** Le mie giornate timbrate da sistemare, oggi compreso: quelle non di oggi vanno in «Da sistemare». */
  timbro: TimbroGiornataVista[];
  giorniAperti: GiornataAperta[];
  nAnomalie: number;
  onRipartisci: (g: TimbroGiornataVista) => void;
  onVediLeMie: (soloAnomalie: boolean) => void;
}) {
  const router = useRouter();
  // Il blocco «Oggi» parla di oggi: la pillola nell'header mostra la giornata
  // piu' vecchia da ripartire (e' un promemoria), qui quella sta nell'elenco.
  const datiOggi = React.useMemo(() => ({ ...mia, timbro: timbroOggi }), [mia, timbroOggi]);
  const { stato, corpo, dialoghi } = useMiaGiornata(datiOggi);
  const { Icona } = stato;
  const altre = timbro.filter((g) => g.giorno !== mia.giorno);
  const daSistemare = altre.length + giorniAperti.length + nAnomalie;

  return (
    <section data-le-mie-ore className="rounded-xl border border-border bg-card shadow-soft">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Le mie ore
        </h2>
        <span className={cn('inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium', stato.colore)}>
          {stato.pulsa ? (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
          ) : (
            <Icona className="h-3.5 w-3.5 shrink-0" />
          )}
          {stato.testo}
        </span>
        <button type="button" onClick={() => onVediLeMie(false)} className="ml-auto text-xs font-medium text-primary hover:underline">
          Vedi le mie giornate
        </button>
      </div>
      <div className="grid gap-3 px-3.5 py-3 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Oggi</p>
          {corpo}
        </div>
        <div className="min-w-0 md:border-l md:border-border md:pl-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Da completare{daSistemare > 0 ? ` · ${daSistemare}` : ''}
          </p>
          {daSistemare === 0 ? (
            <p className="text-xs text-muted-foreground">Nessuna giornata in sospeso.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {altre.map((g) => (
                <li key={g.chiave} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-sky-200 bg-sky-50/60 px-2.5 py-1.5">
                  <span className="w-20 shrink-0 tabular-nums text-muted-foreground">{fmtGiorno(g.giorno)}</span>
                  <TimbriTerminale timbri={g.timbri} compatto />
                  <span className="ml-auto inline-flex items-center gap-2">
                    <span className="rounded-full border border-sky-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-sky-800" title={g.motivo ?? undefined}>
                      {ETICHETTA_STATO_TIMBRO[g.stato]}
                    </span>
                    {g.stato === 'da_ripartire' || g.stato === 'da_chiudere' ? (
                      <Button size="sm" variant="outline" className="h-7" onClick={() => onRipartisci(g)}>
                        Inserisci le commesse
                      </Button>
                    ) : null}
                  </span>
                </li>
              ))}
              {giorniAperti.map((g) => (
                <GiornataApertaRiga key={`${g.giorno}-${g.ingressoTs}`} g={g} senzaNome onDone={() => router.refresh()} />
              ))}
              {nAnomalie > 0 ? (
                <li className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300/60 bg-amber-50/70 px-2.5 py-1.5">
                  <span className="text-amber-900">
                    {nAnomalie === 1 ? 'Una giornata' : `${nAnomalie} giornate`} da verificare: turno rimasto aperto o ore oltre soglia.
                  </span>
                  <button type="button" onClick={() => onVediLeMie(true)} className="ml-auto rounded-md border border-amber-400 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100">
                    Mostrale
                  </button>
                </li>
              ) : null}
            </ul>
          )}
        </div>
      </div>
      {dialoghi}
    </section>
  );
}

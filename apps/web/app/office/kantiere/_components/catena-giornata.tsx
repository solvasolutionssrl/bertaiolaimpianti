'use client';

import { Car, Coffee, HardHat } from 'lucide-react';

import { componiCatenaGiornata, type EventoCatena, type ViaggioCatena } from '@kommessa/api/giornata-catena';
import { formattaOreGiornata, formattaOreTotale } from '@kommessa/api/kantiere-ore';
import { oraMostrata } from '@kommessa/api/ora-mostrata';

import { ETICHETTA_STATO_TIMBRO, type TimbroGiornataVista } from '@/app/_lib/timbro/vista';
import { usePresenzaViva } from './presenza-viva';
import { boccaDelTimbro } from './timbri-terminale';
import { OrigineLine, type TimbraturaInput } from './timbrature-riepilogo';

/**
 * La giornata di una persona come UNA catena cronologica.
 *
 * Prima c'erano tre blocchi impilati (passaggi del registro, timbrature sui
 * cantieri, viaggio) e, dentro il secondo, le pause in una lista DOPO tutti i
 * segmenti: una pausa delle 12:30 si leggeva sotto un segmento che cominciava
 * alle 13:00, e dei viaggi non si sapeva se venissero prima o in mezzo.
 *
 * L'ordine non si disegna qui: lo decide `componiCatenaGiornata`, pura e
 * provata. Qui si legge e si colora.
 */

/** Riquadro del totale: ciò che si vuole sapere senza leggere le righe. */
function Totali({
  minutiLavoro,
  oreViaggio,
  kmViaggio,
  timbro,
}: {
  minutiLavoro: number;
  oreViaggio: number;
  kmViaggio: number;
  timbro?: TimbroGiornataVista | null;
}) {
  // ⚠️⚠️ **«Lavorate 0:00» su una persona al lavoro da un'ora.** `minutiLavoro`
  // conta le ore ATTRIBUITE ai cantieri: finché nessuno ripartisce la giornata
  // sono zero, e lo era anche la pastiglia «Presenza», che usa il netto dei
  // soli intervalli CHIUSI. Nella riga della tabella il tempo giusto si
  // vedeva, qui dentro no: due numeri diversi per la stessa giornata, a dieci
  // pixel di distanza. Ora il conto è lo stesso — `usePresenzaViva` — e,
  // quando non c'è ancora niente sui cantieri, il numero grande **si chiama
  // Presenza**, perché è quello che è.
  const presenzaViva = usePresenzaViva(timbro);
  const soloPresenza = minutiLavoro === 0 && presenzaViva !== null;
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
      <span className="text-[11px] text-muted-foreground">{soloPresenza ? 'Presenza' : 'Lavorate'}</span>
      <span
        className={`tabular-nums text-sm font-semibold ${soloPresenza ? 'text-muted-foreground' : 'text-foreground'}`}
        title={soloPresenza ? 'Tempo di presenza: le ore non sono ancora attribuite ai cantieri.' : undefined}
      >
        {formattaOreGiornata(soloPresenza ? presenzaViva : minutiLavoro)}
      </span>
      {oreViaggio > 0 ? (
        <>
          <span className="h-4 w-px bg-border" aria-hidden="true" />
          <span className="text-[11px] text-muted-foreground">Viaggio</span>
          <span className="tabular-nums text-sm font-semibold text-sky-800">
            {formattaOreGiornata(Math.round(oreViaggio * 60))}
          </span>
        </>
      ) : null}
      {kmViaggio > 0 ? (
        <>
          <span className="h-4 w-px bg-border" aria-hidden="true" />
          <span className="text-[11px] text-muted-foreground">Km da autista</span>
          <span className="tabular-nums text-sm font-semibold text-sky-800">{Math.round(kmViaggio)}</span>
        </>
      ) : null}
      {timbro ? (
        <span
          className="ml-auto rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700"
          title={timbro.motivo ?? undefined}
        >
          {soloPresenza ? '' : `Presenza ${formattaOreGiornata(presenzaViva ?? timbro.nettoMin)} · `}
          {ETICHETTA_STATO_TIMBRO[timbro.stato]}
        </span>
      ) : null}
    </div>
  );
}

/** Una tratta, scritta uguale dentro la catena e in coda. */
function CorpoViaggio({ v, da, a }: { v: ViaggioCatena; da: string; a: string }) {
  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
      <span className="truncate text-[12.5px] font-semibold text-sky-900">
        {da} <span className="font-normal text-sky-400">→</span> {a}
      </span>
      <span className="text-[10.5px] text-muted-foreground">{v.autista ? 'autista' : 'passeggero'}</span>
      <span className="ml-auto whitespace-nowrap tabular-nums text-[11.5px] font-semibold text-sky-700">
        {v.autista && v.km > 0 ? `${Math.round(v.km)} km · ` : ''}
        {formattaOreGiornata(v.minuti)}
      </span>
    </span>
  );
}

function Riga({
  ora,
  tinta,
  pallino,
  Icona,
  genere,
  children,
}: {
  ora: string | null;
  tinta: string;
  pallino: string;
  Icona?: typeof Car;
  /** Che cosa è questa riga: serve al banco di prova per misurare l'ordine. */
  genere: 'passaggio' | 'viaggio' | 'pausa' | 'lavoro';
  children: React.ReactNode;
}) {
  return (
    <div
      data-catena-riga={genere}
      data-ora={ora ?? ''}
      className={['grid grid-cols-[44px_20px_minmax(0,1fr)] items-start gap-x-2 rounded-md py-1', tinta].join(' ')}
    >
      <span className="pt-0.5 text-right tabular-nums text-[11px] font-medium text-foreground/80">
        {ora ?? ''}
      </span>
      <span className="relative grid place-items-center pt-[7px]">
        {/* La spina sta DENTRO la cella del pallino: si allinea per
            costruzione, non con un `left` indovinato. */}
        <span
          className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border"
          aria-hidden="true"
        />
        <span
          className={['relative h-[7px] w-[7px] shrink-0 rounded-full ring-[3px] ring-card', pallino].join(' ')}
          aria-hidden="true"
        />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-start gap-1.5">
          {Icona ? <Icona className="mt-[3px] h-3 w-3 shrink-0 opacity-60" aria-hidden="true" /> : null}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">{children}</span>
        </span>
      </span>
    </div>
  );
}

export function CatenaGiornata({
  timbrature,
  viaggi = [],
  timbro = null,
  minutiLavoro = 0,
  oreViaggio = 0,
  kmViaggio = 0,
}: {
  timbrature: TimbraturaInput[];
  viaggi?: ViaggioCatena[];
  timbro?: TimbroGiornataVista | null;
  minutiLavoro?: number;
  oreViaggio?: number;
  kmViaggio?: number;
}) {
  const { eventi, coda } = componiCatenaGiornata({
    timbrature,
    viaggi,
    passaggi: timbro?.timbri ?? [],
  });

  if (eventi.length === 0 && coda.length === 0) {
    return (
      <>
        <Totali minutiLavoro={minutiLavoro} oreViaggio={oreViaggio} kmViaggio={kmViaggio} timbro={timbro} />
        <p className="text-xs text-muted-foreground">
          {minutiLavoro > 0
            ? `Senza timbrature · ${formattaOreGiornata(minutiLavoro)} di lavoro dichiarati.`
            : 'Nessuna timbratura registrata.'}
        </p>
      </>
    );
  }

  // Il luogo si scrive sulla riga solo se la giornata ne ha più d'uno:
  // altrimenti è già in testa alla riga della tabella.
  const luoghi = new Set(
    eventi.filter((e): e is Extract<EventoCatena, { kind: 'lavoro' }> => e.kind === 'lavoro').map((e) => e.luogo).filter(Boolean),
  );
  const piuLuoghi = luoghi.size > 1;

  return (
    <>
      <Totali minutiLavoro={minutiLavoro} oreViaggio={oreViaggio} kmViaggio={kmViaggio} timbro={timbro} />
      <div className="relative" data-catena>
        {eventi.map((e) => {
          if (e.kind === 'passaggio') {
            const p = e.passaggio;
            const bocca = boccaDelTimbro({ genere: p.genere ?? null, dispositivo: p.dispositivo ?? null });
            const verso = p.tipo === 'uscita' ? 'in uscita' : p.tipo === 'ingresso' ? 'in ingresso' : 'scartato';
            return (
              <Riga
                key={`p-${p.id}`}
                ora={oraMostrata(e.ts)}
                genere="passaggio"
                tinta="bg-gradient-to-r from-slate-100/70 to-transparent"
                pallino="bg-slate-500"
                Icona={bocca.Icona}
              >
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span
                    className={[
                      'text-[12.5px] font-semibold text-slate-700',
                      p.scartato ? 'line-through opacity-60' : '',
                    ].join(' ')}
                  >
                    Passaggio {verso}
                  </span>
                  <span className="text-[10.5px] text-muted-foreground">{bocca.titolo}</span>
                </span>
              </Riga>
            );
          }
          if (e.kind === 'viaggio') {
            return (
              <Riga
                key={`v-${e.viaggio.id}`}
                ora={oraMostrata(e.ts)}
                genere="viaggio"
                tinta="bg-gradient-to-r from-sky-50 to-transparent"
                pallino="bg-sky-600"
                Icona={Car}
              >
                <CorpoViaggio v={e.viaggio} da={e.da} a={e.a} />
              </Riga>
            );
          }
          if (e.kind === 'pausa') {
            return (
              <Riga
                key={`z-${e.ts}`}
                ora={oraMostrata(e.ts)}
                genere="pausa"
                tinta="bg-gradient-to-r from-amber-50 to-transparent"
                pallino="bg-amber-400"
                Icona={Coffee}
              >
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[12.5px] font-semibold text-amber-800">Pausa pranzo</span>
                  <span className="text-[10.5px] text-muted-foreground">
                    {e.fine ? `fino alle ${oraMostrata(e.fine)}` : 'in corso'}
                    {e.auto ? ' · chiusa automaticamente' : ''}
                  </span>
                  {e.minuti != null ? (
                    <span className="ml-auto whitespace-nowrap tabular-nums text-[11.5px] font-semibold text-amber-700">
                      {formattaOreGiornata(e.minuti)}
                    </span>
                  ) : null}
                </span>
                <OrigineLine meta={e.meta} />
              </Riga>
            );
          }
          return (
            <Riga
              key={`l-${e.ts}`}
              ora={oraMostrata(e.ts)}
              genere="lavoro"
              tinta="bg-gradient-to-r from-primary/[0.07] to-transparent"
              pallino={e.fine ? 'bg-emerald-500' : 'bg-emerald-500 animate-pulse'}
              Icona={HardHat}
            >
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="truncate text-[12.5px] font-semibold text-foreground">
                  {piuLuoghi && e.luogo ? e.luogo : 'Lavoro sul cantiere'}
                </span>
                <span className="text-[10.5px] text-muted-foreground">
                  {e.fine ? `fino alle ${oraMostrata(e.fine)}` : 'in corso'}
                </span>
                <span className="ml-auto whitespace-nowrap tabular-nums text-[11.5px] font-semibold text-primary">
                  {e.minuti != null ? formattaOreGiornata(e.minuti) : ''}
                </span>
              </span>
              <OrigineLine meta={e.meta} />
            </Riga>
          );
        })}
      </div>

      {coda.length > 0 ? (
        <div className="mt-2 rounded-md border border-dashed border-sky-300 bg-sky-50/50 px-2.5 py-1.5">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
            Tratte senza collocazione nella giornata
          </p>
          <div className="flex flex-col gap-1">
            {coda.map((e) =>
              e.kind === 'viaggio' ? (
                <span key={`c-${e.viaggio.id}`} className="flex min-w-0 items-start gap-1.5 text-xs">
                  <Car className="mt-[3px] h-3 w-3 shrink-0 text-sky-600" aria-hidden="true" />
                  <CorpoViaggio v={e.viaggio} da={e.da} a={e.a} />
                </span>
              ) : null,
            )}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Una tratta non porta un orario: si colloca dai confini dei segmenti timbrati. Queste non
            hanno un segmento su cui agganciarsi, quindi sono elencate a parte invece di essere
            nascoste. I loro {formattaOreTotale(coda.reduce((s, e) => s + (e.kind === 'viaggio' ? e.viaggio.minuti : 0), 0))} sono comunque nei totali.
          </p>
        </div>
      ) : null}
    </>
  );
}

'use client';

import * as React from 'react';
import { Check, Loader2, Repeat, Search, X } from 'lucide-react';
import { Button, Card, CardContent, Input } from '@kommessa/ui';
import type { CausaleEssePaghe } from '@kommessa/api/paghe-causali';
import { giorniDelPeriodo, estremiDelMese, tipoGiorno } from '@kommessa/api/paghe-mappatura';

import { useAlert, useConfirm } from '@/app/_components/confirm-provider';
import { eliminaEventoPaghe, salvaEventoPaghe } from '@/app/office/_actions/paghe';
import type { EventoMese, ModelloMese } from '../_lib/dati-mese';

/**
 * Il foglio del mese, dipendente per dipendente.
 *
 * Prende il posto del foglio Excel che la segretaria compilava a mano: una
 * casella per giorno, sabati, domeniche e festivi gia' marcati, e dentro solo
 * le eccezioni (una ferie, un permesso, uno straordinario). Il mese e' un
 * calendario invece di trenta righe da scorrere, ma la sostanza e' quella: si
 * guarda una persona alla volta e si riempiono i buchi.
 *
 * E' un banco di lavoro, non una scheda di lettura: tre colonne fisse (chi,
 * il mese, cosa scrivo) e niente da scorrere, cosi' si sta con le mani ferme
 * sulla tastiera. Si sceglie la causale una volta e poi si clicca sui giorni.
 *
 * Quello che arriva dalle timbrature si vede ma non si tocca: si corregge alla
 * fonte, nella giornata. Quello scritto a mano si aggiunge e si toglie da qui.
 */

export interface FoglioMeseProps {
  mese: ModelloMese;
  eventiPerDip: Map<string, EventoMese[]>;
  catalogo: CausaleEssePaghe[];
  onAggiornato: () => void;
}

const GIORNI_SETTIMANA = ['LU', 'MA', 'ME', 'GI', 'VE', 'SA', 'DO'];

/** Lunedi' = 0, come le colonne del calendario. */
function indiceSettimana(iso: string): number {
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return (d + 6) % 7;
}

function ore(valore: number): string {
  return valore.toFixed(2).replace('.', ',');
}

function giornoBreve(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function FoglioMese({ mese, eventiPerDip, catalogo, onAggiornato }: FoglioMeseProps) {
  const showAlert = useAlert();
  const conferma = useConfirm();

  const inForza = React.useMemo(
    () => mese.dipendenti.filter((d) => d.attivo),
    [mese.dipendenti],
  );
  // Si parte da chi non ha giornate in Kommessa: sono quelli che senza questa
  // pagina resterebbero fuori dal file.
  const primoDaFare = React.useMemo(
    () => inForza.find((d) => !d.usaKommessa) ?? inForza[0],
    [inForza],
  );

  const [dipendenteId, setDipendenteId] = React.useState<string | undefined>(primoDaFare?.id);
  const [cerca, setCerca] = React.useState('');
  const [giorno, setGiorno] = React.useState<string | null>(null);
  const [causale, setCausale] = React.useState('');
  const [quante, setQuante] = React.useState('');
  const [fino, setFino] = React.useState('');
  const [soloFeriali, setSoloFeriali] = React.useState(true);
  const [inCorso, setInCorso] = React.useState(false);
  const campoOre = React.useRef<HTMLInputElement>(null);

  const dipendente = inForza.find((d) => d.id === dipendenteId);
  // Memorizzato: senza, ogni render creerebbe un array nuovo e i conti sotto si
  // rifarebbero ogni volta.
  const suoi = React.useMemo(
    () => (dipendenteId ? eventiPerDip.get(dipendenteId) ?? [] : []),
    [dipendenteId, eventiPerDip],
  );

  const perCodice = React.useMemo(
    () => new Map(catalogo.map((c) => [c.codice, c])),
    [catalogo],
  );
  // Le causali che si usano davvero, in cima. Le altre restano nel menu.
  const frequenti = React.useMemo(
    () => catalogo.filter((c) => c.frequente).slice(0, 10),
    [catalogo],
  );

  const estremi = React.useMemo(() => estremiDelMese(mese.periodo), [mese.periodo]);
  const giorni = React.useMemo(
    () => giorniDelPeriodo(estremi.dal, estremi.al),
    [estremi.dal, estremi.al],
  );

  const eventiDelGiorno = React.useMemo(() => {
    const mappa = new Map<string, EventoMese[]>();
    for (const e of suoi) {
      for (const g of giorniDelPeriodo(e.dal, e.al)) {
        if (!g.startsWith(mese.periodo)) continue;
        const lista = mappa.get(g);
        if (lista) lista.push(e);
        else mappa.set(g, [e]);
      }
    }
    return mappa;
  }, [suoi, mese.periodo]);

  const totali = React.useMemo(() => {
    let assenza = 0;
    let straordinario = 0;
    let viaggio = 0;
    const giorniAssenza = new Set<string>();
    for (const e of suoi) {
      const c = perCodice.get(e.causale);
      if (c?.famiglia === 'straordinario') {
        if (e.causale === mese.config.regole.viaggioEccedente) viaggio += e.ore;
        else straordinario += e.ore;
      } else {
        assenza += e.ore;
        for (const g of giorniDelPeriodo(e.dal, e.al)) giorniAssenza.add(g);
      }
    }
    return { assenza, straordinario, viaggio, giorniAssenza: giorniAssenza.size };
  }, [suoi, perCodice, mese.config.regole.viaggioEccedente]);

  const elenco = React.useMemo(() => {
    const q = cerca.trim().toLowerCase();
    const filtrati = q
      ? inForza.filter((d) => `${d.cognome} ${d.nome}`.toLowerCase().includes(q))
      : inForza;
    // Prima chi non usa l'app: sono quelli da riempire a mano.
    return [...filtrati].sort((a, b) => {
      if (a.usaKommessa !== b.usaKommessa) return a.usaKommessa ? 1 : -1;
      return a.cognome.localeCompare(b.cognome, 'it');
    });
  }, [inForza, cerca]);

  function apriGiorno(g: string) {
    setGiorno(g);
    setFino('');
    // La causale resta quella di prima: chi compila un mese di ferie la sceglie
    // una volta sola e poi clicca i giorni.
    setTimeout(() => campoOre.current?.focus(), 0);
  }

  function scegliCausale(codice: string) {
    setCausale(codice);
    const c = perCodice.get(codice);
    // Un'assenza copre la giornata, uno straordinario no: si parte da li'.
    if (c && c.famiglia === 'evento' && !quante) setQuante(String(mese.oreGiornataIntera));
    setTimeout(() => campoOre.current?.focus(), 0);
  }

  async function salva() {
    if (!dipendenteId || !giorno) return;
    if (!causale) {
      await showAlert({ title: 'Manca la causale', body: 'Scegli cosa e' + "' successo quel giorno." });
      return;
    }
    const valore = Number(quante.replace(',', '.'));
    if (!Number.isFinite(valore) || valore <= 0) {
      await showAlert({
        title: 'Ore non valide',
        body: 'Scrivi le ore in cifre, per esempio 8 oppure 1,50.',
      });
      return;
    }

    setInCorso(true);
    const res = await salvaEventoPaghe({
      periodo: mese.periodo,
      dipendenteId,
      causale,
      dal: giorno,
      al: fino && fino > giorno ? fino : giorno,
      ore: valore,
      soloFeriali,
    });
    setInCorso(false);
    if (!res.ok) {
      await showAlert({ title: 'Non salvato', body: res.error });
      return;
    }
    setFino('');
    onAggiornato();
  }

  async function togli(evento: EventoMese) {
    if (!evento.id) return;
    const ok = await conferma({
      title: 'Togli la riga',
      description: `${evento.causale} del ${giornoBreve(evento.dal)}${evento.dal !== evento.al ? ` fino al ${giornoBreve(evento.al)}` : ''}.`,
      confirmLabel: 'Togli',
      destructive: true,
    });
    if (!ok) return;
    setInCorso(true);
    const res = await eliminaEventoPaghe(evento.id);
    setInCorso(false);
    if (!res.ok) await showAlert({ title: 'Non tolta', body: res.error });
    else onAggiornato();
  }

  const vuoteInTesta = indiceSettimana(estremi.dal);
  const scelta = causale ? perCodice.get(causale) : undefined;

  return (
    // Le colonne laterali stanno strette apposta: il calendario e' il banco di
    // lavoro e si prende tutto quello che avanza.
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[196px_minmax(0,1fr)_272px]">
      {/* 1. Chi: prima quelli da riempire. */}
      <Card className="xl:sticky xl:top-4 xl:self-start">
        <CardContent className="p-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
              placeholder="Cerca persona"
              className="h-8 bg-background pl-7 text-[13px] shadow-none"
            />
          </div>
          <div className="mt-2 max-h-[calc(100vh-15rem)] space-y-0.5 overflow-y-auto">
            {elenco.map((d) => {
              const quanti = eventiPerDip.get(d.id)?.length ?? 0;
              const scelto = d.id === dipendenteId;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    setDipendenteId(d.id);
                    setGiorno(null);
                  }}
                  className={`flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left ${
                    scelto ? 'bg-primary text-primary-foreground' : 'hover:bg-primary/5'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate text-[13px]">
                    {d.cognome} {d.nome}
                  </span>
                  {d.usaKommessa ? (
                    <span
                      title="Ha giornate registrate in Kommessa: straordinari e viaggio arrivano da soli."
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${scelto ? 'bg-primary-foreground' : 'bg-emerald-500'}`}
                    />
                  ) : (
                    <span
                      className={`shrink-0 text-[11px] tabular-nums ${
                        scelto
                          ? 'text-primary-foreground/80'
                          : quanti > 0
                            ? 'text-emerald-700'
                            : 'text-amber-700'
                      }`}
                    >
                      {quanti > 0 ? quanti : 'vuoto'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-2 border-t border-border pt-2 text-[11px] leading-snug text-muted-foreground">
            Il pallino verde è di chi timbra: per quelli non serve scrivere niente. Gli altri
            mostrano quante righe hanno.
          </p>
        </CardContent>
      </Card>

      {/* 2. Il mese: la parte grande, quella su cui si lavora. */}
      <Card className="min-w-0">
        <CardContent className="p-3">
          {!dipendente ? (
            <p className="p-6 text-center text-[13px] text-muted-foreground">
              Scegli una persona dall'elenco.
            </p>
          ) : (
            <>
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-foreground">
                    {dipendente.cognome} {dipendente.nome}
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    {dipendente.codicePaghe ? (
                      <>codice paghe {dipendente.codicePaghe}</>
                    ) : (
                      <span className="text-rose-600">
                        senza codice paghe: resterà fuori dal file
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {[
                    ['Assenza', `${ore(totali.assenza)} h`, `${totali.giorniAssenza} gg`],
                    ['Straordinario', `${ore(totali.straordinario)} h`, ''],
                    ['Viaggio', `${ore(totali.viaggio)} h`, ''],
                  ].map(([et, valore, nota]) => (
                    <span
                      key={et}
                      className="rounded border border-border bg-muted/30 px-2 py-1 tabular-nums"
                    >
                      <span className="text-muted-foreground">{et} </span>
                      <span className="font-semibold text-foreground">{valore}</span>
                      {nota ? <span className="text-muted-foreground"> · {nota}</span> : null}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1">
                {GIORNI_SETTIMANA.map((g) => (
                  <div
                    key={g}
                    className="pb-0.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {g}
                  </div>
                ))}
                {Array.from({ length: vuoteInTesta }, (_, i) => (
                  <div key={`vuota-${i}`} />
                ))}
                {giorni.map((g) => {
                  const tipo = tipoGiorno(g);
                  const eventi = eventiDelGiorno.get(g) ?? [];
                  const scelto = g === giorno;
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => apriGiorno(g)}
                      className={`group flex min-h-[7rem] flex-col items-stretch gap-0.5 rounded-md border p-2 text-left transition-colors ${
                        scelto
                          ? 'border-primary bg-primary/[0.04] ring-1 ring-primary'
                          : tipo === 'feriale'
                            ? 'border-border bg-card hover:border-primary/40'
                            : 'border-border/60 bg-muted/40 hover:border-primary/40'
                      }`}
                    >
                      <span className="flex items-baseline justify-between">
                        <span
                          className={`text-[13px] font-semibold tabular-nums ${
                            tipo === 'feriale' ? 'text-foreground' : 'text-muted-foreground'
                          }`}
                        >
                          {Number(g.slice(8, 10))}
                        </span>
                        {/* Come sul foglio di prima: i giorni non lavorativi si
                            riconoscono senza doverli contare. */}
                        {tipo !== 'feriale' ? (
                          <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
                            {tipo === 'festivo' ? 'festivo' : 'riposo'}
                          </span>
                        ) : null}
                      </span>
                      {eventi.map((e, i) => {
                        const c = perCodice.get(e.causale);
                        const aMano = e.origine === 'manuale';
                        return (
                          <span
                            key={`${e.id ?? 'k'}-${i}`}
                            title={`${c?.descrizione ?? e.causale}${e.ore > 0 ? ` · ${ore(e.ore)} ore` : ''}${aMano ? '' : ' (dalle timbrature)'}`}
                            className={`flex items-center gap-1 rounded px-1 py-0.5 text-[11px] font-medium ${
                              aMano ? 'bg-sky-100 text-sky-900' : 'bg-emerald-50 text-emerald-800'
                            }`}
                          >
                            <span className="font-mono font-semibold">{e.causale}</span>
                            {e.ore > 0 ? <span className="tabular-nums">{ore(e.ore)}</span> : null}
                            {aMano ? (
                              <span
                                role="button"
                                tabIndex={-1}
                                aria-label="Togli"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  void togli(e);
                                }}
                                className="ml-auto rounded p-0.5 hover:bg-sky-200"
                              >
                                <X className="h-2.5 w-2.5" />
                              </span>
                            ) : null}
                          </span>
                        );
                      })}
                      {eventi.length === 0 && tipo === 'feriale' ? (
                        <span className="mt-auto text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                          aggiungi
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                In azzurro quello che hai scritto tu, in verde quello che arriva dalle timbrature:
                quello non si tocca da qui, si corregge nella giornata. I giorni normali non vanno
                scritti, nel file vanno solo le variazioni.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* 3. Cosa scrivo: sempre a portata, senza inseguire popup. */}
      <Card className="xl:sticky xl:top-4 xl:self-start">
        <CardContent className="p-3">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Cosa è successo
          </h3>

          {!giorno ? (
            <p className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-[12px] leading-snug text-muted-foreground">
              Clicca un giorno del calendario. Poi scegli la causale una volta sola: resta scelta, e
              per i giorni dopo basta cliccare e premere Invio.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md bg-primary/5 px-2.5 py-1.5 text-[13px] font-semibold text-primary">
                {giornoBreve(giorno)}
                {tipoGiorno(giorno) !== 'feriale' ? (
                  <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                    {tipoGiorno(giorno) === 'festivo' ? 'festivo' : 'sabato o domenica'}
                  </span>
                ) : null}
              </div>

              <div>
                <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">
                  Causale
                </span>
                <div className="flex flex-wrap gap-1">
                  {frequenti.map((c) => (
                    <button
                      key={c.codice}
                      type="button"
                      title={c.descrizione}
                      onClick={() => scegliCausale(c.codice)}
                      className={`rounded px-1.5 py-1 font-mono text-[11px] font-semibold ring-1 transition-colors ${
                        causale === c.codice
                          ? 'bg-primary text-primary-foreground ring-primary'
                          : 'bg-card text-foreground ring-border hover:ring-primary/50'
                      }`}
                    >
                      {c.codice}
                    </button>
                  ))}
                </div>
                <select
                  value={frequenti.some((c) => c.codice === causale) ? '' : causale}
                  onChange={(e) => e.target.value && scegliCausale(e.target.value)}
                  className="mt-1.5 h-8 w-full rounded-md border border-input bg-background px-1.5 text-[12px]"
                >
                  <option value="">altra causale…</option>
                  {catalogo.map((c) => (
                    <option key={c.codice} value={c.codice}>
                      {c.codice} · {c.descrizione}
                    </option>
                  ))}
                </select>
                {scelta ? (
                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                    {scelta.descrizione}
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-muted-foreground" htmlFor="ore-g">
                    Ore
                  </label>
                  <Input
                    id="ore-g"
                    ref={campoOre}
                    value={quante}
                    inputMode="decimal"
                    onChange={(e) => setQuante(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void salva();
                    }}
                    className="h-8 bg-background font-mono text-[13px] shadow-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground" htmlFor="fino-g">
                    Ripeti fino al
                  </label>
                  <Input
                    id="fino-g"
                    type="date"
                    value={fino}
                    min={giorno}
                    max={estremi.al}
                    onChange={(e) => setFino(e.target.value)}
                    className="h-8 bg-background text-[12px] shadow-none"
                  />
                </div>
              </div>

              {fino && fino > giorno ? (
                <label className="flex items-start gap-1.5 text-[11px] leading-snug text-foreground">
                  <input
                    type="checkbox"
                    checked={soloFeriali}
                    onChange={(e) => setSoloFeriali(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5"
                  />
                  salta sabati, domeniche e festivi
                </label>
              ) : null}

              <Button size="sm" className="w-full" onClick={salva} disabled={inCorso}>
                {inCorso ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : fino && fino > giorno ? (
                  <Repeat className="mr-1.5 h-3.5 w-3.5" />
                ) : (
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                )}
                Aggiungi
              </Button>
              <p className="text-[11px] leading-snug text-muted-foreground">
                La causale resta scelta: per il giorno dopo basta cliccarlo e premere Invio.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

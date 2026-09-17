'use client';

import * as React from 'react';
import { Loader2, Plus, Search, Trash2 } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@kommessa/ui';
import type { CausaleEssePaghe } from '@kommessa/api/paghe-causali';
import type { RegoleCausali } from '@kommessa/api/paghe-mappatura';

import { useAlert, useConfirm } from '@/app/_components/confirm-provider';
import {
  aggiungiCausalePersonalizzata,
  eliminaCausalePersonalizzata,
  impostaCausaleAssenza,
  salvaImpostazioniPaghe,
} from '@/app/office/_actions/paghe';

/**
 * Il dizionario del consulente: cosa vuol dire ogni sigla e con quale sigla si
 * comunica ogni evento di Kommessa.
 *
 * La tabella delle causali e' quella dello Studio, importata per intero: 233
 * codici che da soli non dicono niente, per questo ognuno viaggia sempre con la
 * sua descrizione. Le corrispondenze invece sono una scelta, e la scelta e' del
 * cliente: qui si decide una volta e resta.
 */

export interface DizionarioDialogProps {
  catalogo: CausaleEssePaghe[];
  codiciPersonalizzati: string[];
  regole: RegoleCausali;
  tipiAssenza: { codice: string; label: string }[];
  daDecidere: string[];
  codiceDitta: string;
  programmaPresenze: string;
  onChiudi: () => void;
  onSalvato: () => void;
}

type Scheda = 'file' | 'corrispondenze' | 'tabella' | 'regole';

export function DizionarioDialog({
  catalogo,
  codiciPersonalizzati,
  regole,
  tipiAssenza,
  daDecidere,
  codiceDitta,
  programmaPresenze,
  onChiudi,
  onSalvato,
}: DizionarioDialogProps) {
  const showAlert = useAlert();
  const confirm = useConfirm();
  const [scheda, setScheda] = React.useState<Scheda>(
    daDecidere.length > 0 ? 'corrispondenze' : 'file',
  );
  const [ditta, setDitta] = React.useState(codiceDitta);
  const [programma, setProgramma] = React.useState(programmaPresenze);
  const [inCorso, setInCorso] = React.useState(false);
  const [cerca, setCerca] = React.useState('');

  const [nuovo, setNuovo] = React.useState({
    codice: '',
    descrizione: '',
    famiglia: 'evento' as 'evento' | 'straordinario',
    record: '14' as '12' | '14',
  });

  const [feriale, setFeriale] = React.useState(regole.straordinarioFeriale);
  const [sabato, setSabato] = React.useState(regole.straordinarioSabato);
  const [festivo, setFestivo] = React.useState(regole.straordinarioFestivo);
  const [viaggio, setViaggio] = React.useState(regole.viaggioEccedente);
  const [arrotondamento, setArrotondamento] = React.useState(
    String(regole.arrotondamentoMinuti),
  );

  const ordinato = React.useMemo(
    () =>
      [...catalogo].sort((a, b) => {
        if (a.frequente !== b.frequente) return a.frequente ? -1 : 1;
        return a.codice.localeCompare(b.codice);
      }),
    [catalogo],
  );

  const risultati = React.useMemo(() => {
    const q = cerca.trim().toLowerCase();
    if (!q) return ordinato;
    return ordinato.filter(
      (c) => c.codice.toLowerCase().includes(q) || c.descrizione.toLowerCase().includes(q),
    );
  }, [ordinato, cerca]);

  async function cambiaCorrispondenza(tipo: string, causale: string) {
    setInCorso(true);
    const res = await impostaCausaleAssenza({ tipo, causale });
    setInCorso(false);
    if (!res.ok) await showAlert({ title: 'Non salvata', body: res.error });
    else onSalvato();
  }

  async function aggiungi() {
    setInCorso(true);
    const res = await aggiungiCausalePersonalizzata(nuovo);
    setInCorso(false);
    if (!res.ok) {
      await showAlert({ title: 'Non aggiunta', body: res.error });
      return;
    }
    setNuovo({ codice: '', descrizione: '', famiglia: 'evento', record: '14' });
    onSalvato();
  }

  async function rimuovi(codice: string) {
    const ok = await confirm({
      title: `Togli la causale ${codice}`,
      description: 'Le righe gia' + "' salvate con questa causale resteranno, ma non passeranno piu' il controllo.",
      confirmLabel: 'Togli',
      destructive: true,
    });
    if (!ok) return;
    setInCorso(true);
    const res = await eliminaCausalePersonalizzata(codice);
    setInCorso(false);
    if (!res.ok) await showAlert({ title: 'Non tolta', body: res.error });
    else onSalvato();
  }

  async function salvaRegole() {
    setInCorso(true);
    const res = await salvaImpostazioniPaghe({
      codiceDitta: ditta.trim(),
      programmaPresenze: programma.trim() || 'Kommessa',
      arrotondamentoMinuti: Number(arrotondamento) || 0,
      straordinarioFeriale: feriale,
      straordinarioSabato: sabato,
      straordinarioFestivo: festivo,
      viaggioEccedente: viaggio,
    });
    setInCorso(false);
    if (!res.ok) await showAlert({ title: 'Non salvate', body: res.error });
    else onSalvato();
  }

  const opzioni = (
    <>
      <option value="">Da decidere</option>
      {ordinato.map((c) => (
        <option key={c.codice} value={c.codice}>
          {c.codice} · {c.descrizione}
        </option>
      ))}
    </>
  );

  return (
    <Dialog open onOpenChange={(v) => (v ? undefined : onChiudi())}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] overflow-x-hidden sm:max-w-[960px]">
        <DialogHeader>
          <DialogTitle>Impostazioni dell'export</DialogTitle>
        </DialogHeader>

        <div className="inline-flex w-fit rounded-lg border border-border bg-card p-1">
          {(
            [
              ['file', 'File'],
              ['corrispondenze', 'Corrispondenze'],
              ['tabella', 'Tabella causali'],
              ['regole', 'Regole'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setScheda(id)}
              className={
                scheda === id
                  ? 'rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground'
                  : 'rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground'
              }
            >
              {label}
              {id === 'corrispondenze' && daDecidere.length > 0 ? (
                <span className="ml-1.5 rounded bg-amber-500 px-1 text-[10px] text-white">
                  {daDecidere.length}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {scheda === 'file' ? (
          <div className="min-w-0 space-y-4">
            <p className="text-[13px] leading-snug text-muted-foreground">
              Come si presenta il file allo Studio. Sono due dati soli, ma senza il primo il file
              non si genera.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground" htmlFor="ditta">
                  Codice ditta dello Studio
                </label>
                <Input
                  id="ditta"
                  value={ditta}
                  maxLength={7}
                  onChange={(e) => setDitta(e.target.value.toUpperCase())}
                  className="mt-1 h-9 bg-background font-mono shadow-none"
                />
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  Va scritto come lo ha dato il consulente, gruppo compreso.
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground" htmlFor="programma">
                  Nome del programma di rilevazione
                </label>
                <Input
                  id="programma"
                  value={programma}
                  maxLength={15}
                  onChange={(e) => setProgramma(e.target.value)}
                  className="mt-1 h-9 bg-background shadow-none"
                />
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  Compare nell'intestazione del file. Si cambia solo se lo chiede lo Studio.
                </p>
              </div>
            </div>
            {!ditta.trim() ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[12px] leading-snug text-amber-800">
                Finche' il codice ditta e' vuoto il file non si puo' generare: un file consegnato
                sulla ditta sbagliata sarebbe peggio di un file mancante.
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button size="sm" onClick={salvaRegole} disabled={inCorso}>
                {inCorso ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Salva
              </Button>
            </div>
          </div>
        ) : null}

        {scheda === 'corrispondenze' ? (
          <div className="min-w-0">
            <p className="mb-2 text-[13px] leading-snug text-muted-foreground">
              Con quale causale si comunica ogni tipo di assenza di Kommessa. Quelle lasciate da
              decidere non sono una dimenticanza: il programma paghe ha piu' voci vicine e la
              scelta va fatta con il consulente.
            </p>
            <div className="max-h-[52vh] overflow-y-auto rounded-md border border-border">
              <table className="w-full table-fixed border-collapse text-sm">
                <tbody>
                  {tipiAssenza.map((t, i) => {
                    const attuale = regole.assenze[t.codice] ?? '';
                    const manca = daDecidere.includes(t.codice);
                    return (
                      <tr
                        key={t.codice}
                        className={`border-b border-border/60 last:border-0 ${manca ? 'bg-amber-50' : i % 2 ? 'bg-muted/20' : ''}`}
                      >
                        <td className="w-[38%] px-3 py-2">
                          <span className="block truncate font-medium text-foreground">
                            {t.label}
                          </span>
                          {manca ? (
                            <span className="text-[11px] text-amber-700">
                              usata questo mese, serve una scelta
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-1.5">
                          <select
                            value={attuale}
                            disabled={inCorso}
                            onChange={(e) => cambiaCorrispondenza(t.codice, e.target.value)}
                            className="h-8 w-full rounded-md border border-input bg-background px-2 text-[13px]"
                          >
                            {opzioni}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Il permesso 104 cambia voce da solo a seconda che sia a giornate o a ore.
            </p>
          </div>
        ) : null}

        {scheda === 'tabella' ? (
          <div className="min-w-0 space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={cerca}
                onChange={(e) => setCerca(e.target.value)}
                placeholder={`Cerca fra ${catalogo.length} causali`}
                className="h-9 bg-background pl-8 shadow-none"
              />
            </div>

            <div className="max-h-[38vh] overflow-y-auto rounded-md border border-border">
              <table className="w-full table-fixed border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-muted/70 backdrop-blur">
                  <tr className="text-left text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                    <th className="w-16 px-3 py-1.5 font-semibold">Sigla</th>
                    <th className="px-3 py-1.5 font-semibold">Vuol dire</th>
                    <th className="w-24 px-3 py-1.5 font-semibold">Come va</th>
                    <th className="w-10 px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {risultati.map((c, i) => {
                    const mia = codiciPersonalizzati.includes(c.codice);
                    return (
                      <tr
                        key={c.codice}
                        className={`border-t border-border/60 ${i % 2 ? 'bg-muted/20' : ''}`}
                      >
                        <td className="px-3 py-1.5 font-mono text-[12px] font-semibold text-primary">
                          {c.codice}
                        </td>
                        <td className="px-3 py-1.5">
                          <span className="block truncate text-[13px] text-foreground">
                            {c.descrizione}
                          </span>
                          {mia ? (
                            <span className="text-[10px] uppercase tracking-wide text-emerald-700">
                              aggiunta da voi
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-1.5 text-[12px] text-muted-foreground">
                          {c.record === '12' ? 'a periodo' : 'giorno per giorno'}
                        </td>
                        <td className="px-2 py-1">
                          {mia ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-rose-600"
                              aria-label={`Togli ${c.codice}`}
                              onClick={() => rimuovi(c.codice)}
                              disabled={inCorso}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="rounded-md border border-border bg-muted/20 p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Aggiungi una causale
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[6rem_minmax(0,1fr)_8rem_9rem_auto]">
                <Input
                  value={nuovo.codice}
                  maxLength={4}
                  placeholder="Sigla"
                  onChange={(e) => setNuovo({ ...nuovo, codice: e.target.value.toUpperCase() })}
                  className="h-9 bg-background font-mono shadow-none"
                />
                <Input
                  value={nuovo.descrizione}
                  placeholder="Che cosa vuol dire"
                  onChange={(e) => setNuovo({ ...nuovo, descrizione: e.target.value })}
                  className="h-9 bg-background shadow-none"
                />
                <select
                  value={nuovo.famiglia}
                  onChange={(e) =>
                    setNuovo({ ...nuovo, famiglia: e.target.value as 'evento' | 'straordinario' })
                  }
                  className="h-9 rounded-md border border-input bg-background px-2 text-[13px]"
                >
                  <option value="evento">Assenza</option>
                  <option value="straordinario">Straordinario</option>
                </select>
                <select
                  value={nuovo.record}
                  onChange={(e) => setNuovo({ ...nuovo, record: e.target.value as '12' | '14' })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-[13px]"
                >
                  <option value="14">Giorno per giorno</option>
                  <option value="12">A periodo</option>
                </select>
                <Button
                  size="sm"
                  className="h-9"
                  onClick={aggiungi}
                  disabled={inCorso || nuovo.codice.length < 2 || nuovo.descrizione.trim().length < 2}
                >
                  {inCorso ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                Serve solo se il consulente apre una voce che nella tabella non c'e'. Le 233
                causali dello Studio ci sono gia' tutte.
              </p>
            </div>
          </div>
        ) : null}

        {scheda === 'regole' ? (
          <div className="min-w-0 space-y-4">
            <p className="text-[13px] leading-snug text-muted-foreground">
              Con quali voci si comunicano le ore che Kommessa calcola da sola. Il giorno della
              settimana serve solo a distinguere i tre straordinari: quando Kommessa sa gia' di
              che evento si tratta, la causale arriva da li'.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(
                [
                  ['Straordinario feriale', feriale, setFeriale],
                  ['Straordinario di sabato', sabato, setSabato],
                  ['Straordinario festivo o domenicale', festivo, setFestivo],
                  ["Ore di viaggio oltre l'orario", viaggio, setViaggio],
                ] as const
              ).map(([etichetta, valore, imposta]) => (
                <div key={etichetta}>
                  <label className="text-xs font-medium text-muted-foreground">{etichetta}</label>
                  <select
                    value={valore}
                    onChange={(e) => imposta(e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]"
                  >
                    {ordinato
                      .filter((c) => c.famiglia === 'straordinario')
                      .map((c) => (
                        <option key={c.codice} value={c.codice}>
                          {c.codice} · {c.descrizione}
                        </option>
                      ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="rounded-md border border-border bg-muted/20 p-3">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="arrotonda">
                Arrotondamento di straordinari e viaggio
              </label>
              <select
                id="arrotonda"
                value={arrotondamento}
                onChange={(e) => setArrotondamento(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-[13px] sm:w-64"
              >
                <option value="0">Al minuto, come registrato</option>
                <option value="5">Ai 5 minuti</option>
                <option value="15">Al quarto d'ora</option>
                <option value="30">Alla mezz'ora</option>
              </select>
              <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                Si applica al totale del giorno, non alla singola timbratura. Cambia quello che
                viene pagato: decidilo con il consulente.
              </p>
            </div>

            <div className="flex justify-end">
              <Button size="sm" onClick={salvaRegole} disabled={inCorso}>
                {inCorso ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Salva le regole
              </Button>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onChiudi}>
            Chiudi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

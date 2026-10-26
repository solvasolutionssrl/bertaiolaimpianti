'use client';

import { arrotondaMsAlPasso } from '@kommessa/api/arrotondamento-timbri';
import { etichettaMezzoEstesa, ordinaMezzi } from '@kommessa/api/mezzi';
import { etichettaLuogo, luogoDaValore, valoreLuogo } from '@kommessa/api/sottocantieri';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownLeft, ArrowUpRight, Building2, Car, Coffee, GripVertical, Loader2, MapPin, Plus, Trash2, Undo2 } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, cn } from '@kommessa/ui';
import {
  latoRilascioInserimento,
  latoRilascioRiordino,
  indiceDopoRiordino,
  type LatoRilascio,
} from '@kommessa/api/trascina-riordino';
import { calcolaSegmentiSplit } from '@kommessa/api/kantiere-split';
import { arrotondaA } from '@kommessa/api/kantiere-ore';
import { riempiScatola } from '@kommessa/api/timbro-giornata';

import { Scelta } from '@/app/_components/scelta';
import {
  registraGiornataDaZero,
  registraGiornataPerDipendente,
  ripartisciGiornataTimbro,
  terminaTurnoMio,
} from '@/app/_actions/kantiere-timbra';
import type { TimbroGiornataVista } from '@/app/_lib/timbro/vista';
import type { CantiereOpzione, TurnoMio } from '../../_lib/mia-giornata';
import { OreInput } from './ore-input';
import { TimbriTerminale } from './timbri-terminale';

/**
 * «Compila giornata» da scrivania: la stessa cosa che il telefono fa in
 * «Registra giornata» e nella scatola timbrata, riadattata al PC. A sinistra
 * si compila (orari, pausa, i blocchi di lavoro con «in sede / in cantiere»,
 * le strade fra un blocco e l'altro, partenza e rientro); a destra si vede
 * **la giornata come verra' scritta**: orari veri di ogni cantiere, pausa,
 * tratte, totali. Nessun conto resta nascosto.
 *
 * Dal 24/10/2026 (richiesta di Luca) i blocchi sono **card trascinabili**,
 * sia a sinistra sia nella colonna di destra: l'ordine e' UNO solo (lo stato
 * `righe`) e le due viste lo mostrano e lo muovono entrambe. Anche la pausa
 * pranzo si trascina fra i blocchi a destra: la posizione scelta vince sulla
 * regola del motore (`pausaDopoIndice`). Le ore si scrivono come vengono
 * («7:30», «7,5», «730»): vedi `OreInput`.
 *
 * Quattro modi, un salvataggio per ciascuno, tutti sullo stesso scrittore
 * del server:
 *  - `registra`        la mia giornata di oggi, senza timbrature
 *  - `registra_altro`  la giornata di un'altra persona, da ufficio, un giorno qualsiasi
 *  - `scatola`         la giornata timbrata al terminale, mia o di un altro
 *  - `chiusura`        chiudo adesso il mio turno aperto, dividendo fra cantieri se serve
 */

export type ModoCompila =
  | { tipo: 'registra' }
  | { tipo: 'registra_altro'; dipendenteId: string; dipendenteNome: string; giorno: string }
  | { tipo: 'scatola'; vista: TimbroGiornataVista; dipendenteId?: string; dipendenteNome?: string }
  | { tipo: 'chiusura'; turno: TurnoMio };

export interface DatiCompila {
  cantieri: CantiereOpzione[];
  sedi: { id: string; nome: string; tipo: string; isDefault: boolean }[];
  sediPerCantiere: Record<string, string[]>;
  mezzi: { id: string; targa: string; modello: string | null }[];
  ultimoMezzoId: string | null;
  modalitaLavoro: 'ufficio' | 'esterno';
  impostazioni: { passoMinuti: number; stepViaggio: number; sogliaPausaPranzoOre: number; splitAttivo: boolean; tolleranzaChiusuraMin: number; arrotondamentoTimbriMin?: number };
}

type Riga = { id: string; cantiereId: string; sottocantiereId: string | null; minuti: number; inSede: boolean };
type Stima = { minuti: number; km: number | null } | null;
type Guida = { autista: boolean; mezzoId: string | null };
/** Cio' che chi compila dice di una tratta: chi guidava, un tempo corretto a mano e il perche'. */
type TrattaDetta = { guida?: Guida; minuti?: number | null; motivo?: string };

const fmtOra = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });
const fmtGiorno = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long' });
const hm = (min: number) => `${Math.floor(Math.max(0, min) / 60)}:${String(Math.max(0, min) % 60).padStart(2, '0')}`;
const oggiRome = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
/** ISO di un «HH:MM» di un giorno, in ora italiana. */
function isoDi(giorno: string, hhmm: string): string {
  const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10));
  // Offset italiano del giorno (CET/CEST), ricavato da Intl.
  const campione = new Date(`${giorno}T12:00:00Z`);
  const parti = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', hour: 'numeric', hour12: false }).formatToParts(campione);
  const oraRome = parseInt(parti.find((p) => p.type === 'hour')?.value ?? '12', 10) % 24;
  const offset = oraRome - 12;
  return new Date(Date.UTC(+giorno.slice(0, 4), +giorno.slice(5, 7) - 1, +giorno.slice(8, 10), (h ?? 0) - offset, m ?? 0)).toISOString();
}
const hmRome = (iso: string) => fmtOra.format(new Date(iso));
let contatoreId = 0;
const nuovoId = () => `b${Date.now().toString(36)}${(contatoreId += 1)}`;
const nuovaRiga = (r: Omit<Riga, 'id'>): Riga => ({ id: nuovoId(), ...r });

/**
 * Le tinte dei blocchi: leggere, una per blocco, sei e poi si ricomincia.
 * Sono le stesse famiglie della «La giornata» del telefono, nella densita'
 * dell'ufficio: bordo a sinistra pieno, fondo appena tinto.
 */
/**
 * Una tinta per cantiere, e devono distinguersi **a colpo d'occhio**.
 *
 * ⚠️ Prima tre toni su sei erano blu (`primary`, `indigo`, `sky`): la prima,
 * la terza e la quinta card si somigliavano, che e' il contrario del motivo
 * per cui le tinte esistono. E i fondi stavano al 4-6%, cioe' bianco.
 * Ora i toni adiacenti sono **lontani di tinta** e il fondo si vede.
 *
 * ⚠️ Non vale la regola «poca varieta' di colori» dell'ufficio: li' il colore
 * decora, qui **e' l'identita' della riga** mentre la si trascina.
 */
const TINTE = [
  { bordo: 'border-l-primary', fondo: 'bg-primary/[0.09]' },
  { bordo: 'border-l-amber-500', fondo: 'bg-amber-500/[0.13]' },
  { bordo: 'border-l-teal-600', fondo: 'bg-teal-600/[0.11]' },
  { bordo: 'border-l-rose-500', fondo: 'bg-rose-500/[0.10]' },
  { bordo: 'border-l-violet-500', fondo: 'bg-violet-500/[0.10]' },
  { bordo: 'border-l-lime-600', fondo: 'bg-lime-600/[0.13]' },
] as const;
const tinta = (i: number) => TINTE[i % TINTE.length]!;

/** Sposta l'elemento `da` in posizione `a` e restituisce una copia. */
function sposta<T>(lista: readonly T[], da: number, a: number): T[] {
  if (da === a || da < 0 || a < 0 || da >= lista.length || a >= lista.length) return [...lista];
  const out = [...lista];
  const [el] = out.splice(da, 1);
  out.splice(a, 0, el as T);
  return out;
}

export function CompilaGiornataDialog({
  open,
  onOpenChange,
  modo,
  dati,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modo: ModoCompila | null;
  dati: DatiCompila;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [inizio, setInizio] = React.useState('08:00');
  const [pausaMin, setPausaMin] = React.useState(60);
  /** Dopo quale riga (indice in `righe`) sta la pausa; null = decide il motore. */
  const [pausaDopo, setPausaDopo] = React.useState<number | null>(null);
  const [righe, setRighe] = React.useState<Riga[]>([]);
  const [partenza, setPartenza] = React.useState<string>('casa');
  const [rientro, setRientro] = React.useState<string>('casa');
  const [guidaGiornata, setGuidaGiornata] = React.useState<Guida>({ autista: false, mezzoId: null });
  const [tratte, setTratte] = React.useState<Record<string, TrattaDetta>>({});
  const [stime, setStime] = React.useState<Record<string, Stima | 'attesa'>>({});
  const [errore, setErrore] = React.useState<string | null>(null);
  const [annuncio, setAnnuncio] = React.useState('');

  const sedeDefault = dati.sedi.find((s) => s.isDefault) ?? null;
  const inUfficio = dati.modalitaLavoro === 'ufficio';
  const giorno =
    modo?.tipo === 'registra_altro' ? modo.giorno : modo?.tipo === 'scatola' ? modo.vista.giorno : oggiRome();

  // Reset a ogni apertura, dal modo.
  React.useEffect(() => {
    if (!open || !modo) return;
    setErrore(null);
    setGuidaGiornata({ autista: false, mezzoId: dati.ultimoMezzoId ?? null });
    setTratte({});
    setPausaDopo(null);
    setAnnuncio('');
    const sede = sedeDefault?.id ?? 'casa';
    if (modo.tipo === 'scatola') {
      setInizio(modo.vista.inizioIso ? hmRome(modo.vista.inizioIso) : '08:00');
      setPausaMin(modo.vista.pausaTimbrataMin > 0 ? 0 : modo.vista.nettoMin > 5 * 60 ? 60 : 0);
      setRighe(
        modo.vista.primoCantiere
          ? [nuovaRiga({ cantiereId: modo.vista.primoCantiere.id, sottocantiereId: modo.vista.primoCantiere.sottocantiereId ?? null, minuti: 0, inSede: false })]
          : [nuovaRiga({ cantiereId: '', sottocantiereId: null, minuti: 0, inSede: inUfficio })],
      );
      setPartenza(sede);
      setRientro(sede);
    } else if (modo.tipo === 'chiusura') {
      setInizio(hmRome(modo.turno.inizioTs));
      setPausaMin(0);
      setRighe([nuovaRiga({ cantiereId: modo.turno.cantiereId, sottocantiereId: modo.turno.sottocantiereId, minuti: 0, inSede: modo.turno.inSede })]);
      setPartenza(sede);
      setRientro(sede);
    } else {
      setInizio('08:00');
      setPausaMin(60);
      setRighe([nuovaRiga({ cantiereId: '', sottocantiereId: null, minuti: 0, inSede: inUfficio })]);
      setPartenza(sede);
      setRientro(sede);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, modo]);

  // ── stime di viaggio ───────────────────────────────────────────────────────
  const luogoDi = (r: Riga) => (r.inSede && sedeDefault ? `s:${sedeDefault.id}` : `c:${r.cantiereId}`);
  const chiaveTratta = (da: string, a: string) => `${da}>${a}`;
  const corpo = (da: string, a: string): Record<string, string> => {
    const [tDa, iDa] = [da[0], da.slice(2)];
    const [tA, iA] = [a[0], a.slice(2)];
    if (tDa === 's' && tA === 's') return { daSedeId: iDa, aSedeId: iA };
    if (tDa === 'c' && tA === 'c') return { daCantiereId: iDa, aCantiereId: iA };
    return tDa === 's' ? { sedeId: iDa, cantiereId: iA, direzione: 'andata' } : { sedeId: iA, cantiereId: iDa, direzione: 'ritorno' };
  };
  const vive = righe.filter((r) => r.cantiereId);
  /** Indice in `righe` di ogni riga viva (i blocchi del motore sono le vive). */
  const indiceRiga = vive.map((v) => righe.findIndex((r) => r.id === v.id));
  const primo = vive[0];
  const ultimo = vive[vive.length - 1];
  const andataDentro = modo?.tipo === 'scatola' ? modo.vista.inizioFisico : false;
  const ritornoDentro = modo?.tipo === 'scatola' ? modo.vista.fineFisica : false;
  const chiediAndata = modo?.tipo !== 'chiusura' && !(modo?.tipo === 'scatola' && modo.vista.primoCantiere);
  const trattaAndata = chiediAndata && partenza !== 'casa' && primo && luogoDi(primo) !== `s:${partenza}` ? chiaveTratta(`s:${partenza}`, luogoDi(primo)) : null;
  const trattaRitorno = rientro !== 'casa' && ultimo && luogoDi(ultimo) !== `s:${rientro}` ? chiaveTratta(luogoDi(ultimo), `s:${rientro}`) : null;
  const tratteFra: (string | null)[] = vive.map((r, i) => (i === 0 ? null : luogoDi(vive[i - 1]!) === luogoDi(r) ? null : chiaveTratta(luogoDi(vive[i - 1]!), luogoDi(r))));
  const richieste = [trattaAndata, trattaRitorno, ...tratteFra].filter((x): x is string => !!x);
  const firma = richieste.join('|');
  React.useEffect(() => {
    if (!open) return;
    for (const k of richieste) {
      if (stime[k] !== undefined) continue;
      setStime((p) => ({ ...p, [k]: 'attesa' }));
      const [da, a] = k.split('>') as [string, string];
      fetch('/api/routing/stima', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo(da, a)) })
        .then((r) => r.json() as Promise<{ ok?: boolean; minuti?: number | null; km?: number | null }>)
        .then((j) => (j.ok && typeof j.minuti === 'number' ? { minuti: j.minuti, km: typeof j.km === 'number' ? j.km : null } : null))
        .catch(() => null)
        .then((esito) => setStime((p) => ({ ...p, [k]: esito })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, firma]);
  /** La stima del sistema, arrotondata al passo del viaggio. */
  const stimaTratta = (k: string | null): number | null => {
    if (!k) return null;
    const s = stime[k];
    return s && s !== 'attesa' ? arrotondaA(Math.round(s.minuti), dati.impostazioni.stepViaggio) : null;
  };
  /** I minuti che contano: quelli corretti a mano, se ci sono, altrimenti la stima. */
  const minutiTratta = (k: string | null): number => {
    if (!k) return 0;
    const detta = tratte[k]?.minuti;
    if (detta != null) return detta;
    return stimaTratta(k) ?? 0;
  };
  const kmTratta = (k: string | null): number => {
    if (!k) return 0;
    const s = stime[k];
    return s && s !== 'attesa' && s.km ? s.km : 0;
  };
  const guidaTratta = (k: string | null): Guida => (k && tratte[k]?.guida) || guidaGiornata;
  const inAttesa = richieste.some((k) => stime[k] === 'attesa' || stime[k] === undefined);
  const andataMin = minutiTratta(trattaAndata);
  const ritornoMin = minutiTratta(trattaRitorno);
  const viaggioPrima = tratteFra.map(minutiTratta);
  const fraMin = viaggioPrima.reduce((a, b) => a + b, 0);

  // ── i conti ────────────────────────────────────────────────────────────────
  const assegnato = vive.reduce((a, r) => a + r.minuti, 0);
  const passoTimbri = dati.impostazioni.arrotondamentoTimbriMin ?? 0;
  let nettoMin: number; // lavoro da versare
  let inizioMs: number;
  let fineMs: number;
  const adesso = Date.now();
  if (modo?.tipo === 'scatola') {
    nettoMin = modo.vista.nettoMin - pausaMin - fraMin - (andataDentro ? andataMin : 0) - (ritornoDentro ? ritornoMin : 0);
    inizioMs = modo.vista.inizioIso ? Date.parse(modo.vista.inizioIso) : adesso;
    fineMs = modo.vista.fineIso ? Date.parse(modo.vista.fineIso) : adesso;
  } else if (modo?.tipo === 'chiusura') {
    // Come fara' il server: estremi arrotondati al passo del cliente.
    inizioMs = arrotondaMsAlPasso(Date.parse(modo.turno.inizioTs), passoTimbri);
    fineMs = arrotondaMsAlPasso(adesso, passoTimbri);
    nettoMin = Math.round((fineMs - inizioMs) / 60_000) - pausaMin - fraMin;
  } else {
    inizioMs = arrotondaMsAlPasso(Date.parse(isoDi(giorno, inizio)), passoTimbri);
    nettoMin = assegnato;
    fineMs = inizioMs + (assegnato + pausaMin + fraMin) * 60_000;
  }
  const resto = modo?.tipo === 'registra' || modo?.tipo === 'registra_altro' ? 0 : nettoMin - assegnato;
  const ultimaAssorbe = modo?.tipo === 'scatola' || modo?.tipo === 'chiusura';

  // La pausa messa a mano: l'indice del BLOCCO (fra le vive) dopo cui sta.
  const pausaDopoVivo = pausaDopo === null ? null : (() => { let b = -1; for (let i = 0; i < indiceRiga.length; i++) if (indiceRiga[i]! <= pausaDopo) b = i; return b >= 0 ? b : null; })();

  // ── l'anteprima: la giornata come verra' scritta ───────────────────────────
  const segmenti = vive.map((r, i) => ({ cantiereId: r.cantiereId, sottocantiereId: r.sottocantiereId, minuti: ultimaAssorbe && i === vive.length - 1 ? r.minuti + Math.max(0, resto) : r.minuti }));
  let eventi: { cantiereId: string; sottocantiereId?: string | null; tipo: 'ingresso' | 'uscita'; pausa: boolean; ms: number }[] = [];
  let anteprimaErrore: string | null = null;
  if (modo?.tipo === 'chiusura' && vive.length <= 1) {
    // Chiusura secca sul cantiere del turno: nessuna divisione da far
    // quadrare, la giornata e' «dall'apertura ad adesso» e basta.
    eventi = [
      { cantiereId: modo.turno.cantiereId, sottocantiereId: modo.turno.sottocantiereId, tipo: 'ingresso', pausa: false, ms: inizioMs },
      { cantiereId: modo.turno.cantiereId, sottocantiereId: modo.turno.sottocantiereId, tipo: 'uscita', pausa: false, ms: fineMs },
    ];
  } else if (vive.length > 0 && vive.every((r) => r.cantiereId)) {
    const esito =
      modo?.tipo === 'scatola'
        ? riempiScatola({
            intervalli: modo.vista.intervalli.map((i) => ({ inizioMs: Date.parse(i.inizioIso), fineMs: Date.parse(i.fineIso) })),
            segmenti,
            viaggioPrima,
            andataMin: andataDentro ? andataMin : 0,
            ritornoMin: ritornoDentro ? ritornoMin : 0,
            pausaDichiarataMin: pausaMin,
            pausaDopoIndice: pausaDopoVivo,
          })
        : (() => {
            const c = calcolaSegmentiSplit({ ingressoMs: inizioMs, uscitaMs: fineMs, pausaMin, segmenti, viaggioPrima, pausaDopoIndice: pausaDopoVivo });
            return c.ok ? { ok: true as const, eventi: [{ cantiereId: segmenti[0]!.cantiereId, sottocantiereId: segmenti[0]!.sottocantiereId, tipo: 'ingresso' as const, pausa: false, ms: inizioMs }, ...c.eventi], nettoMin: c.nettoMin } : c;
          })();
    if (esito.ok) eventi = esito.eventi;
    else anteprimaErrore = esito.error === 'SOMMA_NON_TORNA' ? 'Le ore dei cantieri superano il tempo disponibile.' : 'Nessun tempo da ripartire.';
  }
  // «Cantiere › Fase» quando la riga e' per fase.
  const nomeCantiere = (id: string, faseId?: string | null) => {
    const c = dati.cantieri.find((x) => x.id === id);
    return etichettaLuogo(c?.nome ?? 'Cantiere', faseId ? (c?.sottocantieri?.find((f) => f.id === faseId)?.nome ?? null) : null);
  };
  const nomeSede = (id: string) => dati.sedi.find((s) => s.id === id)?.nome ?? 'Sede';
  const nomeLuogo = (k: string) => (k.startsWith('s:') ? nomeSede(k.slice(2)) : nomeCantiere(k.slice(2)));

  type RigaAnteprima = { ora: string; testo: string; tono: 'lavoro' | 'pausa' | 'viaggio'; blocco?: number; trascinabile?: boolean };
  const righeAnteprima: RigaAnteprima[] = [];
  if (eventi.length > 0) {
    const primoIngresso = eventi[0]!.ms;
    if (trattaAndata) {
      const da = andataDentro ? inizioMs : primoIngresso - andataMin * 60_000;
      righeAnteprima.push({ ora: hmRome(new Date(da).toISOString()), testo: `Partenza da ${nomeSede(partenza)} · ${hm(andataMin)}${kmTratta(trattaAndata) ? ` · ${Math.round(kmTratta(trattaAndata))} km` : ''}`, tono: 'viaggio' });
    }
    // Ogni ingresso che non continua lo stesso blocco dopo una pausa e' un blocco nuovo.
    let blocco = -1;
    let chiaveAperta: string | null = null;
    for (let i = 0; i < eventi.length; i++) {
      const e = eventi[i]!;
      if (e.tipo === 'ingresso') {
        const chiave = `${e.cantiereId}/${e.sottocantiereId ?? ''}`;
        if (!e.pausa || chiave !== chiaveAperta) blocco += 1;
        chiaveAperta = chiave;
        const u = eventi.slice(i + 1).find((x) => x.tipo === 'uscita');
        const r = vive[blocco];
        righeAnteprima.push({
          ora: `${hmRome(new Date(e.ms).toISOString())}–${u ? hmRome(new Date(u.ms).toISOString()) : '…'}`,
          testo: nomeCantiere(e.cantiereId, e.sottocantiereId) + (r?.inSede ? ' · in sede' : ''),
          tono: 'lavoro',
          blocco: Math.min(blocco, vive.length - 1),
          trascinabile: vive.length > 1,
        });
      } else {
        const n = eventi[i + 1];
        if (n && n.tipo === 'ingresso' && n.ms > e.ms) {
          const gap = Math.round((n.ms - e.ms) / 60_000);
          const ePausa = e.pausa || n.pausa;
          righeAnteprima.push({
            ora: `${hmRome(new Date(e.ms).toISOString())}–${hmRome(new Date(n.ms).toISOString())}`,
            testo: ePausa ? `Pausa · ${hm(gap)}` : `Strada ${nomeCantiere(e.cantiereId)} → ${nomeCantiere(n.cantiereId)} · ${hm(gap)}`,
            tono: ePausa ? 'pausa' : 'viaggio',
            // La pausa dichiarata si trascina; quella timbrata no (nella scatola il buco timbrato dura il suo).
            trascinabile: ePausa && pausaMin > 0 && vive.length > 1 && (modo?.tipo !== 'scatola' || modo.vista.pausaTimbrataMin === 0 || gap === pausaMin || gap === pausaMin + minutiTratta(tratteFra[blocco + 1] ?? null)),
          });
        }
      }
    }
    const ultimaUscita = [...eventi].reverse().find((x) => x.tipo === 'uscita');
    if (trattaRitorno && ultimaUscita) {
      righeAnteprima.push({ ora: hmRome(new Date(ultimaUscita.ms).toISOString()), testo: `Rientro a ${nomeSede(rientro)} · ${hm(ritornoMin)}${kmTratta(trattaRitorno) ? ` · ${Math.round(kmTratta(trattaRitorno))} km` : ''}`, tono: 'viaggio' });
    }
  }
  const lavoroTot = eventi.length > 0 ? (() => { let t = 0; let ap: number | null = null; for (const e of eventi) { if (e.tipo === 'ingresso') ap = e.ms; else if (ap != null) { t += (e.ms - ap) / 60_000; ap = null; } } return Math.round(t); })() : 0;
  const viaggioTot = andataMin + ritornoMin + fraMin;
  const kmTot = Math.round(kmTratta(trattaAndata) + kmTratta(trattaRitorno) + tratteFra.reduce((a, k) => a + kmTratta(k), 0));

  // ── riordino: un solo stato, due viste ─────────────────────────────────────
  const bloccabile = (i: number) => (modo?.tipo === 'scatola' && !!modo.vista.primoCantiere && i === 0) || (modo?.tipo === 'chiusura' && i === 0);
  const spostaRiga = React.useCallback(
    (da: number, a: number) => {
      setRighe((p) => {
        if (da === a || da < 0 || a < 0 || da >= p.length || a >= p.length) return p;
        // Il primo blocco di un turno aperto non si muove e nessuno gli passa davanti.
        if (bloccabile(da) || bloccabile(a)) return p;
        return sposta(p, da, a);
      });
      // La pausa segue il blocco a cui era attaccata.
      setPausaDopo((pd) => {
        if (pd === null) return pd;
        if (pd === da) return a;
        if (da < a && pd > da && pd <= a) return pd - 1;
        if (da > a && pd >= a && pd < da) return pd + 1;
        return pd;
      });
      setAnnuncio(`Blocco spostato in posizione ${a + 1}.`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [modo],
  );
  const spostaPausa = React.useCallback(
    (dopoRiga: number) => {
      const tetto = Math.max(0, righe.length - 2);
      const v = Math.min(tetto, Math.max(0, dopoRiga));
      setPausaDopo(v);
      const r = righe[v];
      setAnnuncio(r ? `Pausa dopo ${nomeCantiere(r.cantiereId, r.sottocantiereId)}.` : 'Pausa spostata.');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [righe],
  );
  // Dopo il rilascio la card che si e' mossa si accende un attimo: senza, con
  // due blocchi simili non si capisce se e dove sia finita.
  const [lampo, setLampo] = React.useState<number | null>(null);
  const accendi = React.useCallback((i: number) => {
    setLampo(i);
    window.setTimeout(() => setLampo((p) => (p === i ? null : p)), 900);
  }, []);
  const spostaRigaConLampo = React.useCallback(
    (da: number, a: number) => {
      spostaRiga(da, a);
      accendi(indiceDopoRiordino(righe.length, da, a));
    },
    [spostaRiga, accendi, righe.length],
  );
  const trascina = useTrascina({
    spostaRiga: spostaRigaConLampo,
    spostaPausa,
    // Dove il rilascio non avverrebbe, la linea non si accende: prometterebbe
    // una cosa che non succede.
    // ⚠️ `spostaRiga` rifiuta se la destinazione e' bloccata (turno aperto);
    // `spostaPausa` taglia al penultimo blocco, perche' una pausa dopo
    // l'ultimo starebbe a fine giornata. Prima quel taglio era muto: si
    // trascinava la pausa in fondo e non succedeva niente, senza un perche'.
    puoRilasciare: (zona, indice) =>
      zona === 'pausa' ? indice <= Math.max(0, righe.length - 2) : !bloccabile(indice),
  });

  /** Il lato su cui disegnare la linea per la riga `i`, o niente. */
  const latoDiRilascio = React.useCallback(
    (stato: StatoTrascina | null, i: number): LatoRilascio | null => {
      if (!stato || stato.sopra !== i) return null;
      return stato.zona === 'blocchi'
        ? latoRilascioRiordino(stato.da, i)
        : latoRilascioInserimento(stato.sotto);
    },
    [],
  );

  // ── salvataggio ────────────────────────────────────────────────────────────
  const chiudi = (ok: boolean) => {
    onOpenChange(false);
    if (ok) router.refresh();
  };
  function salva() {
    if (!modo) return;
    setErrore(null);
    if (vive.length === 0 || righe.some((r) => !r.cantiereId)) return setErrore('Scegli un cantiere per ogni riga.');
    if (inAttesa) return setErrore('Calcolo dei tempi di viaggio in corso: riprova fra un istante.');
    if (anteprimaErrore) return setErrore(anteprimaErrore);
    const guideConStrada = [trattaAndata, trattaRitorno, ...tratteFra].filter((k): k is string => !!k).map(guidaTratta);
    if (guideConStrada.some((g) => g.autista && dati.mezzi.length > 0 && !g.mezzoId)) return setErrore('Per chi guida va indicato il mezzo.');
    for (const k of tratteFra) {
      if (!k) continue;
      const d = tratte[k];
      const stima = stimaTratta(k);
      if (d?.minuti != null && stima !== null && d.minuti !== stima && (d.motivo ?? '').trim().length < 3) {
        return setErrore('Un tempo di strada diverso dalla stima vuole un motivo.');
      }
    }
    if ((modo.tipo === 'registra' || modo.tipo === 'registra_altro') && vive.some((r) => r.minuti <= 0)) return setErrore('Ogni cantiere deve avere delle ore.');
    if (ultimaAssorbe && vive.slice(0, -1).some((r) => r.minuti <= 0)) return setErrore('Indicare le ore di ogni cantiere: all’ultimo va il tempo residuo.');

    const tratta = (k: string | null, sedeId: string) => {
      const s = k ? stime[k] : null;
      const st = s && s !== 'attesa' ? s : null;
      const g = guidaTratta(k);
      return k
        ? { sedeId, durataStimataMin: st ? Math.round(st.minuti) : null, durataConfermataMin: minutiTratta(k), distanzaKm: st?.km ?? null, autista: g.autista, mezzoId: g.autista ? g.mezzoId : null }
        : null;
    };
    const split = segmenti.map((s) => ({ cantiereId: s.cantiereId, sottocantiereId: s.sottocantiereId, minuti: s.minuti, daSede: righe.find((r) => r.cantiereId === s.cantiereId)?.inSede || undefined }));
    // Le strade fra un blocco e l'altro: chi guidava, e il tempo se corretto.
    const passaggi = tratteFra.flatMap((k, i) => {
      if (!k) return [];
      const da = vive[i - 1]!;
      const a = vive[i]!;
      if (da.cantiereId === a.cantiereId) return [];
      const g = guidaTratta(k);
      const d = tratte[k];
      return [{
        da: da.cantiereId,
        a: a.cantiereId,
        via: 'diretto' as const,
        autista: g.autista,
        mezzoId: g.autista ? g.mezzoId : null,
        ...(d?.minuti != null ? { durataConfermataMin: d.minuti, ...(d.motivo?.trim() ? { giustificazione: d.motivo.trim() } : {}) } : {}),
      }];
    });
    const percorso = {
      andata: chiediAndata && partenza !== 'casa' ? tratta(trattaAndata, partenza) : null,
      ritorno: rientro !== 'casa' ? tratta(trattaRitorno, rientro) : null,
      autista: guidaGiornata.autista,
      mezzoId: guidaGiornata.autista ? guidaGiornata.mezzoId : null,
      passaggi,
    };
    const pausaDopoIndice = pausaDopoVivo ?? undefined;
    startTransition(async () => {
      let res: { ok: true } | { ok: false; error: string };
      if (modo.tipo === 'registra') {
        res = await registraGiornataDaZero({ inizioIso: new Date(inizioMs).toISOString(), fineIso: new Date(fineMs).toISOString(), pausaMin, pausaDopoIndice, split, percorso });
      } else if (modo.tipo === 'registra_altro') {
        res = await registraGiornataPerDipendente({ dipendenteId: modo.dipendenteId, giorno: modo.giorno, inizioIso: new Date(inizioMs).toISOString(), fineIso: new Date(fineMs).toISOString(), pausaMin, pausaDopoIndice, split, percorso });
      } else if (modo.tipo === 'scatola') {
        res = await ripartisciGiornataTimbro({ giorno: modo.vista.giorno, dipendenteId: modo.dipendenteId, pausaMin, pausaDopoIndice, split, percorso });
      } else {
        const ritornoViaggio = percorso.ritorno;
        res = await terminaTurnoMio({
          cantiereId: modo.turno.cantiereId,
          dispositivo: 'pc',
          ...(pausaMin > 0 ? { pausaPranzoMin: pausaMin } : {}),
          ...(pausaDopoIndice !== undefined ? { pausaDopoIndice } : {}),
          ...(ritornoViaggio ? { viaggio: ritornoViaggio } : {}),
          ...(split.length >= 2 ? { split: split.map((s) => ({ cantiereId: s.cantiereId, sottocantiereId: s.sottocantiereId, minuti: s.minuti })) } : {}),
        });
      }
      if (!res.ok) {
        setErrore(messaggioErrore(res.error));
        return;
      }
      chiudi(true);
    });
  }

  if (!modo) return null;
  const titolo =
    modo.tipo === 'registra' ? 'Registra la mia giornata' : modo.tipo === 'registra_altro' ? `Compila la giornata di ${modo.dipendenteNome}` : modo.tipo === 'scatola' ? (modo.dipendenteNome ? `Ripartisci la giornata di ${modo.dipendenteNome}` : 'Inserisci le commesse sulle quali hai lavorato') : 'Chiudi il turno';
  const sottotitolo =
    modo.tipo === 'scatola'
      ? `${fmtGiorno.format(new Date(`${modo.vista.giorno}T12:00:00Z`))} · ${modo.vista.primoCantiere ? `turno dall’app ${inizio}, ${modo.vista.dalTerminale ? 'badge' : 'uscita'} in sede ${modo.vista.fineIso ? hmRome(modo.vista.fineIso) : ''}` : `${modo.vista.dalTerminale ? 'badge' : 'presenza'} in sede ${inizio} → ${modo.vista.fineIso ? hmRome(modo.vista.fineIso) : ''}`}${modo.vista.pausaTimbrataMin > 0 ? ` · pausa ${hm(modo.vista.pausaTimbrataMin)}` : ''}`
      : modo.tipo === 'chiusura'
        ? `${modo.turno.cantiereNome} · dalle ${inizio} · chiusura adesso, ${hmRome(new Date(fineMs).toISOString())}`
        : `${fmtGiorno.format(new Date(`${giorno}T12:00:00Z`))} · senza timbrature`;
  const sediDi = (cantiereId: string | undefined) => dati.sedi.filter((s) => s.isDefault || (cantiereId && (dati.sediPerCantiere[cantiereId] ?? []).includes(s.id)));
  const puoAggiungere = modo.tipo !== 'chiusura' || (modo.turno.giornataPulita && dati.impostazioni.splitAttivo);
  // Le fasi come figli: il valore di una fase e' `<cantiere>/<fase>`.
  const opzioniCantieri = dati.cantieri.map((c) => ({
    valore: c.id,
    etichetta: c.nome,
    dettaglio: [c.codice, c.cliente].filter(Boolean).join(' · ') || undefined,
    ...(c.sottocantieri && c.sottocantieri.length > 0
      ? { figli: c.sottocantieri.map((f) => ({ valore: valoreLuogo(c.id, f.id), etichetta: f.codice ? `${f.codice} · ${f.nome}` : f.nome })) }
      : {}),
  }));
  const mostraPercorso = vive.some((r) => !r.inSede) || !sedeDefault;
  const tettoRiga = (r: Riga) => (ultimaAssorbe ? Math.max(0, r.minuti + resto) : undefined);
  const pausaDove = pausaDopo === null ? null : righe[pausaDopo];

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : chiudi(false))}>
      {/* La larghezza in stile: la classe base del dialog (640px) e' un valore arbitrario e vincerebbe sulle utility. */}
      <DialogContent className="sm:max-w-none" style={{ maxWidth: 'min(76rem, calc(100vw - 2rem))' }}>
        <DialogHeader>
          <DialogTitle>{titolo}</DialogTitle>
          <DialogDescription className="first-letter:uppercase">{sottotitolo}</DialogDescription>
        </DialogHeader>
        <p aria-live="polite" className="sr-only">{annuncio}</p>

        {/* Due colonne da 1100px in su; sotto, l'anteprima scende sotto il modulo. */}
        <div className="grid gap-6 min-[1100px]:min-h-[26rem] min-[1100px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          {/* ── sinistra: si compila ── */}
          <div className="space-y-4">
            {modo.tipo === 'scatola' ? (
              <div className="rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2">
                <TimbriTerminale timbri={modo.vista.timbri} />
              </div>
            ) : null}

            <section className="flex flex-wrap items-end gap-4">
              <label className="w-28 space-y-1 text-xs">
                <span className="font-medium text-muted-foreground">{modo.tipo === 'scatola' ? (modo.vista.dalTerminale ? 'Badge alle' : 'In sede dalle') : 'Inizio'}</span>
                <input
                  type="time"
                  value={inizio}
                  step={passoTimbri > 0 ? passoTimbri * 60 : 60}
                  disabled={pending || modo.tipo === 'scatola' || modo.tipo === 'chiusura'}
                  onChange={(e) => setInizio(e.target.value || '08:00')}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm tabular-nums disabled:opacity-70"
                />
              </label>
              <div className="w-28 space-y-1 text-xs">
                <span className="font-medium text-muted-foreground">{modo.tipo === 'scatola' ? (modo.vista.dalTerminale ? 'Badge alle' : 'Uscita alle') : modo.tipo === 'chiusura' ? 'Chiusura' : 'Fine · calcolata'}</span>
                <div className="flex h-8 items-center rounded-md border border-dashed border-primary/30 bg-primary/[0.04] px-2 text-sm font-semibold tabular-nums">
                  {vive.length > 0 || modo.tipo !== 'registra' ? hmRome(new Date(fineMs).toISOString()) : '--:--'}
                </div>
              </div>
              <div className="min-w-[16rem] flex-1 space-y-1 text-xs">
                <span className="flex items-center gap-1 font-medium text-amber-700">
                  <Coffee className="h-3 w-3" aria-hidden="true" /> Pausa pranzo
                  {pausaMin > 0 && vive.length > 1 ? (
                    <span className="ml-2 inline-flex items-center gap-1 font-normal text-muted-foreground">
                      {pausaDove ? <>dopo {nomeCantiere(pausaDove.cantiereId, pausaDove.sottocantiereId)}</> : 'posizione automatica'}
                      {pausaDove ? (
                        <button type="button" onClick={() => setPausaDopo(null)} className="inline-flex items-center gap-0.5 rounded px-1 text-[11px] text-primary hover:bg-primary/10" title="Torna alla posizione automatica">
                          <Undo2 className="h-3 w-3" aria-hidden="true" /> automatica
                        </button>
                      ) : null}
                    </span>
                  ) : null}
                </span>
                {modo.tipo === 'scatola' && modo.vista.pausaTimbrataMin > 0 ? (
                  <div className="flex h-8 items-center text-sm text-muted-foreground">timbrata · {hm(modo.vista.pausaTimbrataMin)}</div>
                ) : (
                  <PausaScrivania valore={pausaMin} onChange={setPausaMin} disabled={pending} />
                )}
              </div>
            </section>

            <section className="space-y-2">
              <div className="flex items-baseline justify-between">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Lavori della giornata</p>
                {ultimaAssorbe ? (
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {hm(assegnato)} / {hm(Math.max(0, nettoMin))}
                    {resto > 0 && vive.length > 0 ? ` · ${hm(resto)} all’ultimo` : ''}
                  </p>
                ) : (
                  <p className="text-xs tabular-nums text-muted-foreground">{hm(assegnato)} di lavoro</p>
                )}
              </div>
              {mostraPercorso && chiediAndata ? (
                <EstremoCard
                  titolo="Si parte da"
                  verso="partenza"
                  valore={partenza}
                  opzioni={sediDi(primo?.cantiereId)}
                  stima={stimaTratta(trattaAndata)}
                  attesa={!!trattaAndata && (stime[trattaAndata] === 'attesa' || stime[trattaAndata] === undefined)}
                  km={kmTratta(trattaAndata)}
                  senzaStrada={partenza !== 'casa' && !trattaAndata}
                  guida={trattaAndata ? guidaTratta(trattaAndata) : null}
                  mezzi={dati.mezzi}
                  disabled={pending}
                  onValore={setPartenza}
                  onGuida={(g) => trattaAndata && setTratte((p) => ({ ...p, [trattaAndata]: { ...p[trattaAndata], guida: g } }))}
                />
              ) : null}
              <ol className="space-y-1.5" aria-label="Blocchi di lavoro, in ordine">
                {righe.map((r, i) => {
                  const bloccata = bloccabile(i);
                  const kVivo = vive.findIndex((v) => v.id === r.id);
                  const kTratta = kVivo > 0 ? tratteFra[kVivo] ?? null : null;
                  const precedente = kVivo > 0 ? vive[kVivo - 1]! : null;
                  const t = tinta(i);
                  const inDrag = trascina.stato?.zona === 'blocchi' && trascina.stato.da === i;
                  const presaQui = inDrag && trascina.stato?.colonna === 'sx';
                  const lato = latoDiRilascio(trascina.stato, i);
                  return (
                    <React.Fragment key={r.id}>
                      {kTratta && precedente ? (
                        <TrattaCard
                          testo={`${nomeLuogo(luogoDi(precedente))} → ${nomeLuogo(luogoDi(r))}`}
                          stima={stimaTratta(kTratta)}
                          attesa={stime[kTratta] === 'attesa' || stime[kTratta] === undefined}
                          km={kmTratta(kTratta)}
                          detta={tratte[kTratta] ?? {}}
                          guida={guidaTratta(kTratta)}
                          mezzi={dati.mezzi}
                          passo={dati.impostazioni.stepViaggio}
                          disabled={pending}
                          onDetta={(d) => setTratte((p) => ({ ...p, [kTratta]: { ...p[kTratta], ...d } }))}
                        />
                      ) : null}
                      <li
                        data-drop-zona="blocchi"
                        data-indice={i}
                        data-lato-rilascio={lato ?? undefined}
                        style={stilePresa(trascina.stato, !!presaQui)}
                        className={cn(
                          'relative grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-2 rounded-md border border-border border-l-4 py-1 pl-1 pr-2 transition-all duration-150',
                          t.bordo,
                          t.fondo,
                          presaQui && 'shadow-lg ring-2 ring-primary/40',
                          inDrag && !presaQui && 'opacity-40 outline-dashed outline-1 outline-primary/50',
                          lampo === i && 'ring-2 ring-primary',
                        )}
                      >
                        <LineaRilascio lato={lato} />
                        <button
                          type="button"
                          aria-label={`Sposta il blocco ${i + 1}`}
                          title="Trascina, o frecce su e giù"
                          disabled={pending || bloccata || righe.length < 2}
                          onPointerDown={(e) => trascina.inizia(e, 'blocchi', i, 'sx')}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowUp') { e.preventDefault(); spostaRigaConLampo(i, i - 1); }
                            if (e.key === 'ArrowDown') { e.preventDefault(); spostaRigaConLampo(i, i + 1); }
                          }}
                          className="flex h-8 w-7 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-black/5 active:cursor-grabbing disabled:cursor-default disabled:opacity-30"
                        >
                          <GripVertical className="h-4 w-4" aria-hidden="true" />
                        </button>
                        {bloccata ? (
                          <span className="flex h-8 items-center truncate rounded-md border border-border bg-background/70 px-3 text-sm">
                            {nomeCantiere(r.cantiereId, r.sottocantiereId)}&nbsp;<span className="text-[10px] uppercase text-muted-foreground">turno aperto</span>
                          </span>
                        ) : (
                          <Scelta
                            opzioni={opzioniCantieri}
                            valore={r.cantiereId ? valoreLuogo(r.cantiereId, r.sottocantiereId) : null}
                            onCambia={(v) => {
                              const l = luogoDaValore(v);
                              setRighe((p) => p.map((x) => (x.id === r.id ? { ...x, cantiereId: l?.cantiereId ?? '', sottocantiereId: l?.sottocantiereId ?? null } : x)));
                            }}
                            segnaposto="Cantiere…"
                            segnapostoRicerca="Cerca cantiere, fase, codice…"
                            disabilitato={pending}
                            className="h-8 [&>button]:h-8 [&>button]:min-h-0 [&>button]:bg-background [&>button]:py-0"
                          />
                        )}
                        {sedeDefault ? (
                          <div role="radiogroup" aria-label="Dove" className="inline-flex h-8 overflow-hidden rounded-md border border-border bg-background text-xs">
                            {([[true, 'In sede'], [false, 'In cantiere']] as [boolean, string][]).map(([v, et]) => (
                              <button key={et} type="button" role="radio" aria-checked={r.inSede === v} disabled={pending || (modo.tipo === 'chiusura' && i === 0)} onClick={() => setRighe((p) => p.map((x) => (x.id === r.id ? { ...x, inSede: v } : x)))} className={cn('h-full px-3', r.inSede === v ? 'bg-primary font-semibold text-white' : 'text-muted-foreground')}>
                                {et}
                              </button>
                            ))}
                          </div>
                        ) : <span />}
                        {/* Con un contenitore (scatola, chiusura) la somma non supera la presenza. */}
                        <OreInput
                          minuti={r.minuti}
                          passo={dati.impostazioni.passoMinuti}
                          max={tettoRiga(r)}
                          disabled={pending}
                          ariaLabel="Ore"
                          onChange={(m) => setRighe((p) => p.map((x) => (x.id === r.id ? { ...x, minuti: m } : x)))}
                        />
                        <Button variant="ghost" size="sm" className="h-8 w-10 p-0" disabled={pending || bloccata || righe.length === 1} onClick={() => { setRighe((p) => p.filter((x) => x.id !== r.id)); setPausaDopo((pd) => (pd === null ? pd : pd >= i ? Math.max(0, pd - 1) : pd)); }} aria-label="Togli">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    </React.Fragment>
                  );
                })}
              </ol>
              {mostraPercorso ? (
                <EstremoCard
                  titolo="Si rientra a"
                  verso="rientro"
                  valore={rientro}
                  opzioni={sediDi(ultimo?.cantiereId)}
                  stima={stimaTratta(trattaRitorno)}
                  attesa={!!trattaRitorno && (stime[trattaRitorno] === 'attesa' || stime[trattaRitorno] === undefined)}
                  km={kmTratta(trattaRitorno)}
                  senzaStrada={rientro !== 'casa' && !trattaRitorno}
                  guida={trattaRitorno ? guidaTratta(trattaRitorno) : null}
                  mezzi={dati.mezzi}
                  disabled={pending}
                  onValore={setRientro}
                  onGuida={(g) => trattaRitorno && setTratte((p) => ({ ...p, [trattaRitorno]: { ...p[trattaRitorno], guida: g } }))}
                />
              ) : null}
              {puoAggiungere ? (
                <Button variant="outline" size="sm" disabled={pending || righe.length >= 12} onClick={() => setRighe((p) => [...p, nuovaRiga({ cantiereId: '', sottocantiereId: null, minuti: 0, inSede: inUfficio && !!sedeDefault })])}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Aggiungi cantiere
                </Button>
              ) : (
                <p className="text-[11px] text-muted-foreground">La giornata ha già più eventi: si chiude sul cantiere del turno, senza dividerla.</p>
              )}
            </section>

            {mostraPercorso && viaggioTot > 0 ? (
              <p className="text-[11px] text-muted-foreground">I km contano a chi guida. Chi guidava si indica tratta per tratta.</p>
            ) : !mostraPercorso && sedeDefault ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Building2 className="h-3.5 w-3.5" aria-hidden="true" /> Tutto il giorno in {sedeDefault.nome}: nessun viaggio.</p>
            ) : null}

            {errore ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">{errore}</p> : null}
          </div>

          {/* ── destra: cosa verra' scritto, e si puo' muovere anche da qui ── */}
          <aside className="min-[1100px]:border-l min-[1100px]:border-border min-[1100px]:pl-6">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Come verrà scritta</p>
            {righeAnteprima.length === 0 ? (
              <div className="mt-3 rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                {anteprimaErrore ?? 'Anteprima della giornata come verrà registrata: orari di ogni cantiere, pause e tratte.'}
              </div>
            ) : (
              <ol className="mt-2 space-y-1.5" aria-label="La giornata come verrà scritta">
                {righeAnteprima.map((r, i) => {
                  const t = r.blocco != null ? tinta(indiceRiga[r.blocco] ?? r.blocco) : null;
                  const indice = r.blocco != null ? indiceRiga[r.blocco] ?? null : null;
                  const inDrag = r.tono === 'lavoro' ? trascina.stato?.zona === 'blocchi' && trascina.stato.da === indice : r.tono === 'pausa' && trascina.stato?.zona === 'pausa';
                  const lato = r.tono === 'lavoro' && indice !== null ? latoDiRilascio(trascina.stato, indice) : null;
                  return (
                    <li
                      key={i}
                      data-drop-zona={r.tono === 'lavoro' && indice !== null ? 'blocchi' : undefined}
                      data-indice={r.tono === 'lavoro' && indice !== null ? indice : undefined}
                      className={cn(
                        'relative flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-xs transition-all duration-150',
                        r.tono === 'lavoro' && cn('border-l-4 bg-card', t?.bordo, t?.fondo),
                        r.tono === 'lavoro' && !t && 'border-border',
                        r.tono === 'pausa' && 'border-amber-200 bg-amber-50 text-amber-800',
                        r.tono === 'viaggio' && 'border-sky-100 bg-sky-50 text-sky-800',
                        inDrag && 'opacity-40 outline-dashed outline-1 outline-primary/50',
                        lampo != null && indice === lampo && 'ring-2 ring-primary',
                      )}
                    >
                      <LineaRilascio lato={lato} />
                      {r.trascinabile ? (
                        <button
                          type="button"
                          aria-label={r.tono === 'pausa' ? 'Sposta la pausa' : 'Sposta il blocco'}
                          title="Trascina, o frecce su e giù"
                          disabled={pending}
                          onPointerDown={(e) => trascina.inizia(e, r.tono === 'pausa' ? 'pausa' : 'blocchi', r.tono === 'pausa' ? (pausaDopo ?? -1) : (indice ?? 0), 'dx')}
                          onKeyDown={(e) => {
                            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                            e.preventDefault();
                            const passo = e.key === 'ArrowUp' ? -1 : 1;
                            if (r.tono === 'pausa') {
                              // Senza una posizione scelta si parte da dove il motore l'ha messa.
                              const attuale = pausaDopo ?? (() => { const k = righeAnteprima.slice(0, i).filter((x) => x.tono === 'lavoro').length - 1; return indiceRiga[Math.max(0, k)] ?? 0; })();
                              spostaPausa(attuale + passo);
                            } else if (indice !== null) {
                              spostaRigaConLampo(indice, indice + passo);
                            }
                          }}
                          className="flex h-6 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-current/60 hover:bg-black/5 active:cursor-grabbing"
                        >
                          <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      ) : (
                        <span className="w-5 shrink-0" />
                      )}
                      <span className="w-[5.75rem] shrink-0 font-mono tabular-nums">{r.ora}</span>
                      <span className="flex min-w-0 items-start gap-1">
                        {r.tono === 'lavoro' ? <MapPin className="mt-0.5 h-3 w-3 shrink-0 opacity-60" aria-hidden="true" /> : r.tono === 'viaggio' ? <Car className="mt-0.5 h-3 w-3 shrink-0 opacity-60" aria-hidden="true" /> : <Coffee className="mt-0.5 h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />}
                        <span className="break-words">{r.testo}</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              {([['Lavoro', hm(lavoroTot)], ['Viaggio', hm(viaggioTot)], ['Km', String(kmTot)]] as [string, string][]).map(([k, v]) => (
                <div key={k} className="rounded-md border border-border bg-card px-2 py-1.5">
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</dt>
                  <dd className="font-mono text-sm font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            {inAttesa ? <p className="mt-2 text-[11px] text-muted-foreground">Calcolo dei tempi di viaggio…</p> : null}
            {righeAnteprima.length > 0 && vive.length > 1 ? <p className="mt-2 text-[11px] text-muted-foreground">I blocchi e la pausa si trascinano anche da qui: l’ordine è lo stesso delle due colonne.</p> : null}
          </aside>
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => chiudi(false)} disabled={pending}>Annulla</Button>
          <Button size="sm" onClick={salva} disabled={pending}>
            {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {modo.tipo === 'chiusura' ? 'Chiudi il turno' : 'Salva la giornata'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Lo stile della card mentre la si trascina. ⭐ Non sbiadisce sul posto: si
 * **alza e segue il dito**. Sbiadire dice «questa non conta»; alzarsi dice
 * «la sto portando io», che e' quello che sta succedendo.
 *
 * ⚠️ Solo la card della colonna da cui e' partito il gesto: le due colonne
 * mostrano le stesse righe, e farle volare entrambe sarebbe due card per un
 * gesto solo.
 *
 * ⚠️⚠️ **Solo la colonna di SINISTRA**, ed e' un limite dichiarato, non una
 * dimenticanza: alzando anche le righe dell'anteprima, il trascinamento della
 * **pausa** smette di spostarla. Misurato isolando l'animazione (col freno e
 * senza, con `pointer-events: none` e senza): col sollevamento acceso la
 * pausa resta dov'e', spento torna a muoversi. La causa non e' il colpo di
 * mano sul bersaglio ne' il mio freno sul rilascio, e non l'ho trovata: a
 * destra le righe sono basse e l'alzata vale poco, quindi si lascia la resa
 * di prima invece di spedire una pausa che non si muove.
 */
function stilePresa(stato: StatoTrascina | null, mia: boolean): React.CSSProperties | undefined {
  if (!stato || !mia) return undefined;
  return {
    transform: `translate3d(${stato.dx}px, ${stato.dy}px, 0) rotate(0.6deg) scale(1.015)`,
    willChange: 'transform',
    zIndex: 30,
    position: 'relative',
    cursor: 'grabbing',
    // ⚠️⚠️ Da quando la card segue il dito, sta LEI sotto il puntatore: senza
    // questo, `elementsFromPoint` trova se stessa invece della riga di
    // destinazione, e il rilascio non sposta niente. Si vede solo sulle
    // distanze corte (la pausa), ed e' il difetto che ha introdotto
    // l'animazione.
    pointerEvents: 'none',
  };
}

/**
 * La linea che dice DOVE finira' la card. Il lato lo decide
 * `latoRilascioRiordino` / `latoRilascioInserimento`, pure e provate: la
 * direzione e' la cosa che si inverte senza accorgersene.
 */
function LineaRilascio({ lato }: { lato: LatoRilascio | null }) {
  if (!lato) return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-x-0 z-10 flex items-center',
        lato === 'sopra' ? '-top-[3px]' : '-bottom-[3px]',
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
      <span className="h-[2px] flex-1 rounded-full bg-primary" />
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
    </span>
  );
}

// ── il trascinamento, a mano: due zone, lo stesso stato ─────────────────────

type ZonaTrascina = 'blocchi' | 'pausa';
/** `colonna` = da dove si e' presa la card: solo QUELLA si alza e segue il
    dito. Le due colonne mostrano le stesse righe, e farle volare entrambe
    sarebbe due card per un gesto solo. */
type StatoTrascina = {
  zona: ZonaTrascina;
  da: number;
  sopra: number | null;
  sotto: boolean;
  colonna: 'sx' | 'dx';
  dx: number;
  dy: number;
};

/**
 * Pointer events senza librerie (nel repo non ce n'e' una): si prende la
 * maniglia, si cerca sotto il puntatore una riga `[data-drop-zona="blocchi"]`
 * e si lascia. Per i blocchi la riga trovata e' la destinazione; per la
 * pausa conta se si e' nella meta' alta o bassa della riga (prima o dopo
 * quel blocco). Le due colonne hanno le stesse righe con gli stessi indici,
 * quindi si puo' partire da una e lasciare sull'altra.
 */
function useTrascina({
  spostaRiga,
  spostaPausa,
  puoRilasciare,
}: {
  spostaRiga: (da: number, a: number) => void;
  spostaPausa: (dopoRiga: number) => void;
  /** ⚠️ Una riga su cui `spostaRiga` rifiuterebbe non deve nemmeno accendersi:
      una linea di rilascio dove il rilascio non avviene e' un comando che
      promette e non fa niente. */
  puoRilasciare: (zona: ZonaTrascina, indice: number) => boolean;
}) {
  const [stato, setStato] = React.useState<StatoTrascina | null>(null);
  const rif = React.useRef<StatoTrascina | null>(null);
  const aggiorna = (s: StatoTrascina | null) => {
    rif.current = s;
    setStato(s);
  };
  const inizia = (e: React.PointerEvent, zona: ZonaTrascina, da: number, colonna: 'sx' | 'dx' = 'sx') => {
    if (e.button !== 0) return;
    e.preventDefault();
    const partenzaX = e.clientX;
    const partenzaY = e.clientY;
    aggiorna({ zona, da, sopra: null, sotto: false, colonna, dx: 0, dy: 0 });
    // Mentre si trascina il cursore lo dice, e il testo non si seleziona.
    const cursorePrima = document.body.style.cursor;
    const selezionePrima = document.body.style.userSelect;
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    const muovi = (ev: PointerEvent) => {
      const s = rif.current;
      if (!s) return;
      const dx = ev.clientX - partenzaX;
      const dy = ev.clientY - partenzaY;
      const el = document.elementsFromPoint(ev.clientX, ev.clientY).find((x) => (x as HTMLElement).dataset?.dropZona === 'blocchi') as HTMLElement | undefined;
      if (!el) {
        aggiorna({ ...s, sopra: null, dx, dy });
        return;
      }
      const indice = Number(el.dataset.indice);
      if (!Number.isInteger(indice) || !puoRilasciare(s.zona, indice)) {
        aggiorna({ ...s, sopra: null, dx, dy });
        return;
      }
      const r = el.getBoundingClientRect();
      const sotto = ev.clientY > r.top + r.height / 2;
      aggiorna({ ...s, sopra: indice, sotto, dx, dy });
    };
    const lascia = () => {
      window.removeEventListener('pointermove', muovi);
      window.removeEventListener('pointerup', lascia);
      window.removeEventListener('pointercancel', lascia);
      document.body.style.cursor = cursorePrima;
      document.body.style.userSelect = selezionePrima;
      const s = rif.current;
      aggiorna(null);
      if (!s || s.sopra === null) return;
      if (s.zona === 'blocchi') spostaRiga(s.da, s.sopra);
      else spostaPausa(s.sotto ? s.sopra : s.sopra - 1);
    };
    window.addEventListener('pointermove', muovi);
    window.addEventListener('pointerup', lascia);
    window.addEventListener('pointercancel', lascia);
  };
  return { stato, inizia };
}

// ── le card della strada ────────────────────────────────────────────────────

const fmtKm = (km: number) => (km > 0 ? `${Math.round(km)} km` : null);

/** Chi guidava, come sul telefono: due scelte affiancate e il mezzo se si guida. */
function ChipGuida({ guida, mezzi, disabled, onGuida }: { guida: Guida; mezzi: DatiCompila['mezzi']; disabled?: boolean; onGuida: (g: Guida) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div role="radiogroup" aria-label="Chi guidava" className="inline-flex h-7 overflow-hidden rounded-md border border-border bg-background text-[11px]">
        {([[false, 'Passeggero'], [true, 'Conducente']] as [boolean, string][]).map(([v, et]) => (
          <button key={et} type="button" role="radio" aria-checked={guida.autista === v} disabled={disabled} onClick={() => onGuida({ autista: v, mezzoId: v ? guida.mezzoId : null })} className={cn('h-full px-2', guida.autista === v ? 'bg-sky-700 font-semibold text-white' : 'text-muted-foreground')}>
            {et}
          </button>
        ))}
      </div>
      {guida.autista && mezzi.length > 0 ? (
        <select value={guida.mezzoId ?? ''} disabled={disabled} aria-label="Mezzo" onChange={(e) => onGuida({ autista: true, mezzoId: e.target.value || null })} className={cn('h-7 rounded-md border bg-background px-1.5 text-[11px]', guida.mezzoId ? 'border-input' : 'border-amber-400')}>
          <option value="">Mezzo…</option>
          {ordinaMezzi(mezzi).map((m) => <option key={m.id} value={m.id}>{etichettaMezzoEstesa(m)}</option>)}
        </select>
      ) : null}
    </div>
  );
}

/**
 * La strada fra due blocchi, «stile telefono»: da dove a dove, la stima con i
 * km, chi guidava con il mezzo, e il tempo correggibile con un motivo se si
 * scosta dalla stima (la stessa regola del server).
 */
function TrattaCard({
  testo, stima, attesa, km, detta, guida, mezzi, passo, disabled, onDetta,
}: {
  testo: string; stima: number | null; attesa: boolean; km: number; detta: TrattaDetta; guida: Guida; mezzi: DatiCompila['mezzi']; passo: number; disabled?: boolean; onDetta: (d: TrattaDetta) => void;
}) {
  const minuti = detta.minuti ?? stima ?? 0;
  const corretta = detta.minuti != null && stima !== null && detta.minuti !== stima;
  return (
    <li className="ml-7 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 rounded-md border border-dashed border-sky-200 bg-sky-50/70 px-2.5 py-1 text-xs leading-tight text-sky-900" aria-label="Strada fra i due blocchi">
      <Car className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
      <div className="min-w-0">
        <p className="truncate font-medium">{testo}</p>
        <p className="text-[11px] text-sky-800/80">
          {attesa ? 'stima in corso…' : stima === null ? 'nessuna stima: indica il tempo' : <>stima {hm(stima)}{fmtKm(km) ? ` · ${fmtKm(km)}` : ''}</>}
          {corretta ? ' · corretto a mano' : ''}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <OreInput minuti={minuti} passo={passo} disabled={disabled || attesa} ariaLabel="Tempo di strada" onChange={(m) => onDetta({ minuti: m === stima ? null : m })} className="h-8 [&>button]:w-6 [&>input]:w-14 [&>input]:text-xs" />
        <ChipGuida guida={guida} mezzi={mezzi} disabled={disabled} onGuida={(g) => onDetta({ guida: g })} />
      </div>
      {corretta ? (
        <input
          type="text"
          value={detta.motivo ?? ''}
          disabled={disabled}
          onChange={(e) => onDetta({ motivo: e.target.value })}
          placeholder="Motivo del tempo diverso dalla stima (obbligatorio)"
          aria-label="Motivo"
          className={cn('col-span-3 h-8 rounded-md border bg-background px-2 text-xs', (detta.motivo ?? '').trim().length >= 3 ? 'border-input' : 'border-amber-400')}
        />
      ) : null}
    </li>
  );
}

/** Partenza o rientro: la sede (o l'abitazione), la stima, chi guidava. */
/**
 * Un estremo della giornata. ⭐ **Partenza in cima, rientro in fondo**: la
 * giornata si legge dall'alto in basso, e i due affiancati sotto l'elenco
 * (com'erano) non dicevano piu' quale veniva prima. Contorni diversi apposta:
 * si parte di slancio (sky, freccia in su), si rientra alla fine (ardesia,
 * freccia in giu').
 */
function EstremoCard({
  titolo, verso, valore, opzioni, stima, attesa, km, senzaStrada, guida, mezzi, disabled, onValore, onGuida,
}: {
  titolo: string; verso: 'partenza' | 'rientro'; valore: string; opzioni: DatiCompila['sedi']; stima: number | null; attesa: boolean; km: number; senzaStrada: boolean; guida: Guida | null; mezzi: DatiCompila['mezzi']; disabled?: boolean; onValore: (v: string) => void; onGuida: (g: Guida) => void;
}) {
  const parte = verso === 'partenza';
  const Freccia = parte ? ArrowUpRight : ArrowDownLeft;
  const detto =
    valore === 'casa'
      ? 'nessun viaggio di lavoro'
      : senzaStrada
        ? 'stessa sede: nessuna strada'
        : attesa
          ? 'stima in corso…'
          : stima === null
            ? 'nessuna stima'
            : `${hm(stima)}${fmtKm(km) ? ` · ${fmtKm(km)}` : ''}`;
  return (
    <div
      className={cn(
        // ⭐ Un estremo NON e' un blocco di lavoro: niente barra piena a
        // sinistra, che qui vuol dire «cantiere». E' viaggio, quindi parla la
        // lingua delle tratte fra i blocchi: tratteggio sky, fondo tenue.
        'flex min-h-[2.25rem] flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-dashed px-2 py-1 text-xs',
        parte ? 'border-sky-300 bg-sky-50/60' : 'border-slate-300 bg-slate-50/70',
      )}
    >
      {/* Il punto: e' un capolinea, non un blocco. Pieno si parte, vuoto si rientra. */}
      <span
        className={cn(
          'ml-0.5 h-2 w-2 shrink-0 rounded-full border-2',
          parte ? 'border-sky-600 bg-sky-600' : 'border-slate-500 bg-transparent',
        )}
        aria-hidden="true"
      />
      <span className={cn('flex shrink-0 items-center gap-1 font-semibold', parte ? 'text-sky-900' : 'text-slate-700')}>
        <Freccia className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {titolo}
      </span>
      <select
        value={valore}
        disabled={disabled}
        aria-label={titolo}
        onChange={(e) => onValore(e.target.value)}
        className="h-7 min-w-0 flex-1 rounded border border-input bg-background px-1.5 text-[13px]"
      >
        {opzioni.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
        <option value="casa">Abitazione privata</option>
      </select>
      <span className={cn('shrink-0 whitespace-nowrap tabular-nums text-[11px]', parte ? 'text-sky-800/80' : 'text-slate-600')}>
        {detto}
      </span>
      {guida && valore !== 'casa' && !senzaStrada ? (
        <ChipGuida guida={guida} mezzi={mezzi} disabled={disabled} onGuida={onGuida} />
      ) : null}
    </div>
  );
}

/** La pausa pranzo da scrivania: quattro scelte in fila e un campo libero, tutto alto uguale. */
function PausaScrivania({ valore, onChange, disabled }: { valore: number; onChange: (m: number) => void; disabled?: boolean }) {
  const rapide = [0, 30, 45, 60];
  const libera = !rapide.includes(valore);
  return (
    <div className="flex h-8 items-center gap-2">
      <div role="radiogroup" aria-label="Pausa pranzo" className="inline-flex h-8 overflow-hidden rounded-md border border-border text-xs">
        {rapide.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={valore === m} disabled={disabled} onClick={() => onChange(m)} className={cn('h-full px-3', valore === m ? 'bg-amber-600 font-semibold text-white' : 'bg-background text-muted-foreground')}>
            {m === 0 ? 'Nessuna' : m === 60 ? '1 h' : `${m} min`}
          </button>
        ))}
      </div>
      <OreInput minuti={libera ? valore : 0} passo={5} max={240} disabled={disabled} ariaLabel="Altra durata" onChange={(m) => onChange(m)} className="[&>input]:w-16" />
    </div>
  );
}

function messaggioErrore(code: string): string {
  switch (code) {
    case 'GIORNATA_NON_VUOTA': return 'Quel giorno ha già delle timbrature: si corregge da «Modifica giornata».';
    case 'ORA_NON_VALIDA': return 'Controlla gli orari: inizio e fine devono stare nello stesso giorno.';
    case 'SPLIT_SOMMA': case 'SPLIT_NETTO': return 'Le ore dei cantieri non tornano con il tempo disponibile.';
    case 'SPLIT_NON_APPLICABILE': return 'La giornata ha già più eventi: si chiude senza dividerla.';
    case 'RIPRENDI_PRIMA': return 'Pausa in corso: riprendere il turno prima della chiusura.';
    case 'NESSUN_TURNO_APERTO': return 'Il turno risulta già chiuso. Ricarica la pagina.';
    case 'SCATOLA_NON_DISPONIBILE': return 'La giornata timbrata è cambiata nel frattempo: ricarica la pagina.';
    case 'SEDE_PREDEFINITA_MANCANTE': return 'Manca la sede predefinita: impostala in Sedi.';
    case 'REGISTRA_OFF': return 'La registrazione della giornata è disattivata nelle impostazioni.';
    case 'CANTIERE_CHIUSO': return 'Uno dei cantieri è chiuso e non accetta ore.';
    case 'FASE_RICHIESTA': return 'Questo cantiere ha delle fasi: indica su quale hai lavorato.';
    case 'GIUSTIFICAZIONE_RICHIESTA': return 'Un tempo di strada diverso dalla stima vuole un motivo.';
    case 'MEZZO_NON_VALIDO': return 'Il mezzo indicato non esiste più: scegline un altro.';
    case 'TIMBRO_OFF': return 'La timbratrice non è attiva per questa azienda.';
    case 'NON_AUTORIZZATO': return 'Non puoi compilare la giornata di un’altra persona.';
    default: return `Non salvato: ${code}`;
  }
}

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Car, Coffee, Loader2, MapPin, Plus, Trash2 } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, cn } from '@kommessa/ui';
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
import { TimbriTerminale } from './timbri-terminale';

/**
 * «Compila giornata» da scrivania: la stessa cosa che il telefono fa in
 * «Registra giornata» e nella scatola timbrata, riadattata al PC. A sinistra
 * si compila (orari, pausa, lavori con «in sede / in cantiere», percorso); a
 * destra si vede **la giornata come verra' scritta**: orari veri di ogni
 * cantiere, pausa, tratte, totali. Nessun conto resta nascosto.
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
  impostazioni: { passoMinuti: number; stepViaggio: number; sogliaPausaPranzoOre: number; splitAttivo: boolean; tolleranzaChiusuraMin: number };
}

type Riga = { cantiereId: string; minuti: number; inSede: boolean };
type Stima = { minuti: number; km: number | null } | null;

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
  const [righe, setRighe] = React.useState<Riga[]>([]);
  const [partenza, setPartenza] = React.useState<string>('casa');
  const [rientro, setRientro] = React.useState<string>('casa');
  const [autista, setAutista] = React.useState(false);
  const [mezzoId, setMezzoId] = React.useState<string>('');
  const [stime, setStime] = React.useState<Record<string, Stima | 'attesa'>>({});
  const [errore, setErrore] = React.useState<string | null>(null);

  const sedeDefault = dati.sedi.find((s) => s.isDefault) ?? null;
  const inUfficio = dati.modalitaLavoro === 'ufficio';
  const giorno =
    modo?.tipo === 'registra_altro' ? modo.giorno : modo?.tipo === 'scatola' ? modo.vista.giorno : oggiRome();

  // Reset a ogni apertura, dal modo.
  React.useEffect(() => {
    if (!open || !modo) return;
    setErrore(null);
    setAutista(false);
    setMezzoId(dati.ultimoMezzoId ?? '');
    const sede = sedeDefault?.id ?? 'casa';
    if (modo.tipo === 'scatola') {
      setInizio(modo.vista.inizioIso ? hmRome(modo.vista.inizioIso) : '08:00');
      setPausaMin(modo.vista.pausaTimbrataMin > 0 ? 0 : modo.vista.nettoMin > 5 * 60 ? 60 : 0);
      setRighe(
        modo.vista.primoCantiere
          ? [{ cantiereId: modo.vista.primoCantiere.id, minuti: 0, inSede: false }]
          : [{ cantiereId: '', minuti: 0, inSede: inUfficio }],
      );
      setPartenza(sede);
      setRientro(sede);
    } else if (modo.tipo === 'chiusura') {
      setInizio(hmRome(modo.turno.inizioTs));
      setPausaMin(0);
      setRighe([{ cantiereId: modo.turno.cantiereId, minuti: 0, inSede: modo.turno.inSede }]);
      setPartenza(sede);
      setRientro(sede);
    } else {
      setInizio('08:00');
      setPausaMin(60);
      setRighe([{ cantiereId: '', minuti: 0, inSede: inUfficio }]);
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
  const minutiTratta = (k: string | null): number => {
    if (!k) return 0;
    const s = stime[k];
    return s && s !== 'attesa' ? arrotondaA(Math.round(s.minuti), dati.impostazioni.stepViaggio) : 0;
  };
  const kmTratta = (k: string | null): number => {
    if (!k) return 0;
    const s = stime[k];
    return s && s !== 'attesa' && s.km ? s.km : 0;
  };
  const inAttesa = richieste.some((k) => stime[k] === 'attesa' || stime[k] === undefined);
  const andataMin = minutiTratta(trattaAndata);
  const ritornoMin = minutiTratta(trattaRitorno);
  const viaggioPrima = tratteFra.map(minutiTratta);
  const fraMin = viaggioPrima.reduce((a, b) => a + b, 0);

  // ── i conti ────────────────────────────────────────────────────────────────
  const assegnato = vive.reduce((a, r) => a + r.minuti, 0);
  let nettoMin: number; // lavoro da versare
  let inizioMs: number;
  let fineMs: number;
  const adesso = Date.now();
  if (modo?.tipo === 'scatola') {
    nettoMin = modo.vista.nettoMin - pausaMin - fraMin - (andataDentro ? andataMin : 0) - (ritornoDentro ? ritornoMin : 0);
    inizioMs = modo.vista.inizioIso ? Date.parse(modo.vista.inizioIso) : adesso;
    fineMs = modo.vista.fineIso ? Date.parse(modo.vista.fineIso) : adesso;
  } else if (modo?.tipo === 'chiusura') {
    inizioMs = Date.parse(modo.turno.inizioTs);
    fineMs = adesso;
    nettoMin = Math.round((fineMs - inizioMs) / 60_000) - pausaMin - fraMin;
  } else {
    inizioMs = Date.parse(isoDi(giorno, inizio));
    nettoMin = assegnato;
    fineMs = inizioMs + (assegnato + pausaMin + fraMin) * 60_000;
  }
  const resto = modo?.tipo === 'registra' || modo?.tipo === 'registra_altro' ? 0 : nettoMin - assegnato;
  const ultimaAssorbe = modo?.tipo === 'scatola' || modo?.tipo === 'chiusura';

  // ── l'anteprima: la giornata come verra' scritta ───────────────────────────
  const segmenti = vive.map((r, i) => ({ cantiereId: r.cantiereId, minuti: ultimaAssorbe && i === vive.length - 1 ? r.minuti + Math.max(0, resto) : r.minuti }));
  let eventi: { cantiereId: string; tipo: 'ingresso' | 'uscita'; pausa: boolean; ms: number }[] = [];
  let anteprimaErrore: string | null = null;
  if (modo?.tipo === 'chiusura' && vive.length <= 1) {
    // Chiusura secca sul cantiere del turno: nessuna divisione da far
    // quadrare, la giornata e' «dall'apertura ad adesso» e basta.
    eventi = [
      { cantiereId: modo.turno.cantiereId, tipo: 'ingresso', pausa: false, ms: inizioMs },
      { cantiereId: modo.turno.cantiereId, tipo: 'uscita', pausa: false, ms: fineMs },
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
          })
        : (() => {
            const c = calcolaSegmentiSplit({ ingressoMs: inizioMs, uscitaMs: fineMs, pausaMin, segmenti, viaggioPrima });
            return c.ok ? { ok: true as const, eventi: [{ cantiereId: segmenti[0]!.cantiereId, tipo: 'ingresso' as const, pausa: false, ms: inizioMs }, ...c.eventi], nettoMin: c.nettoMin } : c;
          })();
    if (esito.ok) eventi = esito.eventi;
    else anteprimaErrore = esito.error === 'SOMMA_NON_TORNA' ? 'Le ore dei cantieri superano il tempo disponibile.' : 'Nessun tempo da ripartire.';
  }
  const nomeCantiere = (id: string) => dati.cantieri.find((c) => c.id === id)?.nome ?? 'Cantiere';
  const nomeSede = (id: string) => dati.sedi.find((s) => s.id === id)?.nome ?? 'Sede';
  const righeAnteprima: { ora: string; testo: string; tono: 'lavoro' | 'pausa' | 'viaggio' }[] = [];
  if (eventi.length > 0) {
    const primoIngresso = eventi[0]!.ms;
    if (trattaAndata) {
      const da = andataDentro ? inizioMs : primoIngresso - andataMin * 60_000;
      righeAnteprima.push({ ora: hmRome(new Date(da).toISOString()), testo: `Partenza da ${nomeSede(partenza)} · ${hm(andataMin)}${kmTratta(trattaAndata) ? ` · ${Math.round(kmTratta(trattaAndata))} km` : ''}`, tono: 'viaggio' });
    }
    for (let i = 0; i < eventi.length; i++) {
      const e = eventi[i]!;
      if (e.tipo === 'ingresso') {
        const u = eventi.slice(i + 1).find((x) => x.tipo === 'uscita');
        righeAnteprima.push({ ora: `${hmRome(new Date(e.ms).toISOString())}–${u ? hmRome(new Date(u.ms).toISOString()) : '…'}`, testo: nomeCantiere(e.cantiereId) + (righe.find((r) => r.cantiereId === e.cantiereId)?.inSede ? ' · in sede' : ''), tono: 'lavoro' });
      } else {
        const n = eventi[i + 1];
        if (n && n.tipo === 'ingresso' && n.ms > e.ms) {
          const gap = Math.round((n.ms - e.ms) / 60_000);
          righeAnteprima.push({ ora: `${hmRome(new Date(e.ms).toISOString())}–${hmRome(new Date(n.ms).toISOString())}`, testo: e.pausa || n.pausa ? `Pausa · ${hm(gap)}` : `Strada ${nomeCantiere(e.cantiereId)} → ${nomeCantiere(n.cantiereId)} · ${hm(gap)}`, tono: e.pausa || n.pausa ? 'pausa' : 'viaggio' });
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
    if (autista && dati.mezzi.length > 0 && !mezzoId) return setErrore('In caso di guida, indicare il mezzo.');
    if ((modo.tipo === 'registra' || modo.tipo === 'registra_altro') && vive.some((r) => r.minuti <= 0)) return setErrore('Ogni cantiere deve avere delle ore.');
    if (ultimaAssorbe && vive.slice(0, -1).some((r) => r.minuti <= 0)) return setErrore('Indicare le ore di ogni cantiere: all’ultimo va il tempo residuo.');

    const tratta = (k: string | null, sedeId: string) => {
      const s = k ? stime[k] : null;
      const st = s && s !== 'attesa' ? s : null;
      return k
        ? { sedeId, durataStimataMin: st ? Math.round(st.minuti) : null, durataConfermataMin: minutiTratta(k), distanzaKm: st?.km ?? null, autista, mezzoId: autista ? mezzoId || null : null }
        : null;
    };
    const split = segmenti.map((s) => ({ cantiereId: s.cantiereId, minuti: s.minuti, daSede: righe.find((r) => r.cantiereId === s.cantiereId)?.inSede || undefined }));
    const percorso = {
      andata: chiediAndata && partenza !== 'casa' ? tratta(trattaAndata, partenza) : null,
      ritorno: rientro !== 'casa' ? tratta(trattaRitorno, rientro) : null,
      autista,
      mezzoId: autista ? mezzoId || null : null,
      passaggi: [] as never[],
    };
    startTransition(async () => {
      let res: { ok: true } | { ok: false; error: string };
      if (modo.tipo === 'registra') {
        res = await registraGiornataDaZero({ inizioIso: new Date(inizioMs).toISOString(), fineIso: new Date(fineMs).toISOString(), pausaMin, split, percorso });
      } else if (modo.tipo === 'registra_altro') {
        res = await registraGiornataPerDipendente({ dipendenteId: modo.dipendenteId, giorno: modo.giorno, inizioIso: new Date(inizioMs).toISOString(), fineIso: new Date(fineMs).toISOString(), pausaMin, split, percorso });
      } else if (modo.tipo === 'scatola') {
        res = await ripartisciGiornataTimbro({ giorno: modo.vista.giorno, dipendenteId: modo.dipendenteId, pausaMin, split, percorso });
      } else {
        const ritornoViaggio = percorso.ritorno;
        res = await terminaTurnoMio({
          cantiereId: modo.turno.cantiereId,
          dispositivo: 'pc',
          ...(pausaMin > 0 ? { pausaPranzoMin: pausaMin } : {}),
          ...(ritornoViaggio ? { viaggio: ritornoViaggio } : {}),
          ...(split.length >= 2 ? { split: split.map((s) => ({ cantiereId: s.cantiereId, minuti: s.minuti })) } : {}),
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
  const opzioniCantieri = dati.cantieri.map((c) => ({ valore: c.id, etichetta: c.cliente ? `${c.nome} · ${c.cliente}` : c.nome }));
  const mostraPercorso = vive.some((r) => !r.inSede) || !sedeDefault;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : chiudi(false))}>
      {/* La larghezza in stile: la classe base del dialog (640px) e' un valore arbitrario e vincerebbe sulle utility. */}
      <DialogContent className="sm:max-w-none" style={{ maxWidth: 'min(74rem, calc(100vw - 2rem))' }}>
        <DialogHeader>
          <DialogTitle>{titolo}</DialogTitle>
          <DialogDescription className="first-letter:uppercase">{sottotitolo}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:min-h-[26rem] md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
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
                  disabled={pending || modo.tipo === 'scatola' || modo.tipo === 'chiusura'}
                  onChange={(e) => setInizio(e.target.value || '08:00')}
                  className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm tabular-nums disabled:opacity-70"
                />
              </label>
              <div className="w-28 space-y-1 text-xs">
                <span className="font-medium text-muted-foreground">{modo.tipo === 'scatola' ? (modo.vista.dalTerminale ? 'Badge alle' : 'Uscita alle') : modo.tipo === 'chiusura' ? 'Chiusura' : 'Fine · calcolata'}</span>
                <div className="flex h-10 items-center rounded-md border border-dashed border-primary/30 bg-primary/[0.04] px-2 text-sm font-semibold tabular-nums">
                  {vive.length > 0 || modo.tipo !== 'registra' ? hmRome(new Date(fineMs).toISOString()) : '--:--'}
                </div>
              </div>
              <div className="min-w-[16rem] flex-1 space-y-1 text-xs">
                <span className="flex items-center gap-1 font-medium text-amber-700">
                  <Coffee className="h-3 w-3" aria-hidden="true" /> Pausa pranzo
                </span>
                {modo.tipo === 'scatola' && modo.vista.pausaTimbrataMin > 0 ? (
                  <div className="flex h-10 items-center text-sm text-muted-foreground">timbrata · {hm(modo.vista.pausaTimbrataMin)}</div>
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
              {righe.map((r, i) => {
                const bloccata = (modo.tipo === 'scatola' && !!modo.vista.primoCantiere && i === 0) || (modo.tipo === 'chiusura' && i === 0);
                return (
                  <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3">
                    {bloccata ? (
                      <span className="flex h-10 items-center truncate rounded-md border border-border bg-muted/30 px-3 text-sm">
                        {nomeCantiere(r.cantiereId)}&nbsp;<span className="text-[10px] uppercase text-muted-foreground">turno aperto</span>
                      </span>
                    ) : (
                      <Scelta opzioni={opzioniCantieri} valore={r.cantiereId || null} onCambia={(v) => setRighe((p) => p.map((x, j) => (j === i ? { ...x, cantiereId: v ?? '' } : x)))} segnaposto="Cantiere…" disabilitato={pending} className="h-10 [&>button]:h-10 [&>button]:min-h-0 [&>button]:py-0" />
                    )}
                    {sedeDefault ? (
                      <div role="radiogroup" aria-label="Dove" className="inline-flex h-10 overflow-hidden rounded-md border border-border text-xs">
                        {([[true, 'In sede'], [false, 'In cantiere']] as [boolean, string][]).map(([v, et]) => (
                          <button key={et} type="button" role="radio" aria-checked={r.inSede === v} disabled={pending || (modo.tipo === 'chiusura' && i === 0)} onClick={() => setRighe((p) => p.map((x, j) => (j === i ? { ...x, inSede: v } : x)))} className={cn('h-full px-3', r.inSede === v ? 'bg-primary font-semibold text-white' : 'bg-background text-muted-foreground')}>
                            {et}
                          </button>
                        ))}
                      </div>
                    ) : <span />}
                    <div className="flex h-10 items-center gap-1">
                      {/* Con un contenitore (scatola, chiusura) la somma non supera la presenza. */}
                      <input type="number" min={0} max={modo.tipo === 'scatola' || modo.tipo === 'chiusura' ? Math.max(0, r.minuti + resto) : undefined} step={dati.impostazioni.passoMinuti} value={r.minuti} disabled={pending} onChange={(e) => { const tetto = modo.tipo === 'scatola' || modo.tipo === 'chiusura' ? Math.max(0, r.minuti + resto) : Infinity; setRighe((p) => p.map((x, j) => (j === i ? { ...x, minuti: Math.min(tetto, Math.max(0, parseInt(e.target.value || '0', 10))) } : x))); }} className="h-10 w-24 rounded-md border border-input bg-background px-2 text-right text-sm tabular-nums" aria-label="Minuti" />
                      <span className="w-7 text-[11px] text-muted-foreground">min</span>
                    </div>
                    <Button variant="ghost" size="sm" className="h-10 w-10 p-0" disabled={pending || bloccata || righe.length === 1} onClick={() => setRighe((p) => p.filter((_, j) => j !== i))} aria-label="Togli">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
              {puoAggiungere ? (
                <Button variant="outline" size="sm" disabled={pending || righe.length >= 12} onClick={() => setRighe((p) => [...p, { cantiereId: '', minuti: 0, inSede: inUfficio && !!sedeDefault }])}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Aggiungi cantiere
                </Button>
              ) : (
                <p className="text-[11px] text-muted-foreground">La giornata ha già più eventi: si chiude sul cantiere del turno, senza dividerla.</p>
              )}
            </section>

            {mostraPercorso ? (
              <section className="space-y-2">
                <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Car className="h-3 w-3" aria-hidden="true" /> Il viaggio
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {chiediAndata ? (
                    <label className="space-y-1 text-xs">
                      <span className="font-medium text-muted-foreground">Partenza</span>
                      <select value={partenza} disabled={pending} onChange={(e) => setPartenza(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                        {sediDi(primo?.cantiereId).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                        <option value="casa">Abitazione privata</option>
                      </select>
                    </label>
                  ) : <div />}
                  <label className="space-y-1 text-xs">
                    <span className="font-medium text-muted-foreground">Rientro</span>
                    <select value={rientro} disabled={pending} onChange={(e) => setRientro(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                      {sediDi(ultimo?.cantiereId).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                      <option value="casa">Abitazione privata</option>
                    </select>
                  </label>
                </div>
                {viaggioTot > 0 ? (
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" className="h-3.5 w-3.5 accent-primary" checked={autista} disabled={pending} onChange={(e) => setAutista(e.target.checked)} />
                      Conducente
                    </label>
                    {autista && dati.mezzi.length > 0 ? (
                      <select value={mezzoId} disabled={pending} onChange={(e) => setMezzoId(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
                        <option value="">Mezzo…</option>
                        {dati.mezzi.map((m) => <option key={m.id} value={m.id}>{m.targa}{m.modello ? ` · ${m.modello}` : ''}</option>)}
                      </select>
                    ) : null}
                    <span className="text-muted-foreground">I km contano a chi guida.</span>
                  </div>
                ) : null}
              </section>
            ) : sedeDefault ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Building2 className="h-3.5 w-3.5" aria-hidden="true" /> Tutto il giorno in {sedeDefault.nome}: nessun viaggio.</p>
            ) : null}

            {errore ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">{errore}</p> : null}
          </div>

          {/* ── destra: cosa verra' scritto ── */}
          <aside className="md:border-l md:border-border md:pl-6">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Come verrà scritta</p>
            {righeAnteprima.length === 0 ? (
              <div className="mt-3 rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                {anteprimaErrore ?? 'Anteprima della giornata come verrà registrata: orari di ogni cantiere, pause e tratte.'}
              </div>
            ) : (
              <ol className="mt-2 space-y-1.5">
                {righeAnteprima.map((r, i) => (
                  <li key={i} className={cn('flex items-start gap-2 rounded-md px-2 py-1 text-xs', r.tono === 'lavoro' && 'bg-card border border-border', r.tono === 'pausa' && 'bg-amber-50 text-amber-800', r.tono === 'viaggio' && 'bg-sky-50 text-sky-800')}>
                    <span className="w-[5.75rem] shrink-0 font-mono tabular-nums">{r.ora}</span>
                    <span className="flex min-w-0 items-start gap-1">
                      {r.tono === 'lavoro' ? <MapPin className="mt-0.5 h-3 w-3 shrink-0 opacity-60" aria-hidden="true" /> : r.tono === 'viaggio' ? <Car className="mt-0.5 h-3 w-3 shrink-0 opacity-60" aria-hidden="true" /> : <Coffee className="mt-0.5 h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />}
                      <span className="break-words">{r.testo}</span>
                    </span>
                  </li>
                ))}
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

/** La pausa pranzo da scrivania: quattro scelte in fila e un campo libero, tutto alto uguale. */
function PausaScrivania({ valore, onChange, disabled }: { valore: number; onChange: (m: number) => void; disabled?: boolean }) {
  const rapide = [0, 30, 45, 60];
  const libera = !rapide.includes(valore);
  return (
    <div className="flex h-10 items-center gap-2">
      <div role="radiogroup" aria-label="Pausa pranzo" className="inline-flex h-10 overflow-hidden rounded-md border border-border text-xs">
        {rapide.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={valore === m} disabled={disabled} onClick={() => onChange(m)} className={cn('h-full px-3', valore === m ? 'bg-amber-600 font-semibold text-white' : 'bg-background text-muted-foreground')}>
            {m === 0 ? 'Nessuna' : m === 60 ? '1 h' : `${m} min`}
          </button>
        ))}
      </div>
      <input
        type="number"
        min={0}
        max={240}
        step={5}
        placeholder="altra"
        value={libera ? valore : ''}
        disabled={disabled}
        onChange={(e) => onChange(Math.max(0, Math.min(240, parseInt(e.target.value || '0', 10))))}
        className="h-10 w-20 rounded-md border border-input bg-background px-2 text-right text-sm tabular-nums placeholder:italic"
        aria-label="Altra durata in minuti"
      />
      <span className="text-[11px] text-muted-foreground">min</span>
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
    case 'TIMBRO_OFF': return 'La timbratrice non è attiva per questa azienda.';
    case 'NON_AUTORIZZATO': return 'Non puoi compilare la giornata di un’altra persona.';
    default: return `Non salvato: ${code}`;
  }
}

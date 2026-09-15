'use client';

import { Fragment, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CalendarClock, Car, CheckCircle2, Clock, Coffee, Loader2, Minus, Plus, X } from 'lucide-react';

import {
  MEZZO_NON_IN_ELENCO,
  chiaveCoppia,
  ciSonoViaggi,
  datiMancanti,
  minutiTratta,
  passaggioDaVia,
  segmentiBarraGiornata,
  spostaOrario,
  trattaModificata,
  tratteIntermedie,
  viaggioFraCantieri,
  type DatoMancante,
  type Estremo,
  type Passaggio,
  type TrattaEstrema,
} from '@kommessa/api/kantiere-percorso';
import { arrotondaA } from '@kommessa/api/kantiere-ore';
import { Portal } from '@/app/mobile/_components/portal';
import { titoloCase } from '@/app/mobile/_lib/display-case';
import { codiceCantiereMostrato } from '@/app/_lib/cantiere-categoria';
import { useConfermaPasseggero } from '@/app/_components/conferma-passeggero';
import { CantiereSearchSheet, type PickerCantiere } from '../../_components/cantiere-picker';
import { registraGiornataDaZero, elencoCantieriTurno } from '@/app/_actions/kantiere-timbra';
import {
  BarraGiornata,
  CardEstremo,
  NodoAggiungi,
  NodoCantiere,
  NodoLuogo,
  NodoTratta,
  RigaGuida,
  Tappa,
  TrattaFraCantieri,
  coloreCantiere,
  fmtHM,
  fmtKm,
  type MezzoOpzione,
  type OpzioneLuogo,
  type StatoLavoro,
  type StatoStima,
  type VistaEstremo,
  type VistaTratta,
} from './percorso-giornata';

/** ISO di oggi (fuso device = Italia) da "HH:MM". */
function isoOggi(hhmm: string): string {
  const [hh, mm] = hhmm.split(':').map((x) => parseInt(x, 10));
  const d = new Date();
  d.setHours(hh ?? 0, mm ?? 0, 0, 0);
  return d.toISOString();
}

function messaggioErrore(code: string): string {
  switch (code) {
    case 'GIORNATA_NON_VUOTA':
      return 'Hai già delle timbrature di oggi: qui si registra solo una giornata senza timbrature.';
    case 'ORA_NON_VALIDA':
      return 'Controlla inizio e fine: devono essere di oggi e la fine dopo l’inizio.';
    case 'SPLIT_SOMMA':
    case 'SPLIT_NETTO':
      return 'Le ore dei cantieri non tornano con il totale della giornata.';
    case 'REGISTRA_OFF':
      return 'La registrazione giornata è disattivata dall’ufficio.';
    case 'CANTIERE_NON_VALIDO':
      return 'Un cantiere selezionato non è valido.';
    case 'SEDE_NON_VALIDA':
      return 'Una sede scelta non è ammessa per quel cantiere. Controlla partenza, rientro e tratte.';
    case 'SEDE_PREDEFINITA_MANCANTE':
      return 'Nessuna sede predefinita impostata: l’ufficio la indica in Impostazioni → Sedi.';
    case 'MEZZO_NON_VALIDO':
    case 'MEZZO_NON_VALIDA':
      return 'Il mezzo scelto non è valido. Ricarica la pagina e riprova.';
    case 'GIUSTIFICAZIONE_RICHIESTA':
      return 'Hai modificato un tempo di viaggio: indica il motivo.';
    case 'VIAGGIO_NON_SALVATO':
      return 'Il viaggio non è stato salvato, quindi la giornata non è stata registrata. Riprova.';
    default:
      return 'Registrazione non riuscita. Riprova.';
  }
}

const PAROLE_MANCANTI: Record<DatoMancante, string> = {
  partenza: 'la partenza',
  rientro: 'il rientro',
  tempo_andata: 'il tempo di viaggio',
  tempo_ritorno: 'il tempo di viaggio',
  motivo_andata: 'il motivo della modifica del tempo',
  motivo_ritorno: 'il motivo della modifica del tempo',
  mezzo: 'il mezzo',
};

function testoMancanti(m: DatoMancante[]): string {
  const parole = [...new Set(m.map((x) => PAROLE_MANCANTI[x]))];
  const elenco = parole.length > 1 ? `${parole.slice(0, -1).join(', ')} e ${parole[parole.length - 1]}` : parole[0];
  return `Per registrare indica ${elenco}.`;
}

// Pause tipiche in cantiere: coprono di fatto tutti i casi reali. Se serve un
// valore fuori scala lo sistema l'ufficio in fase di verifica.
const PAUSE_CHIPS: { min: number; label: string }[] = [
  { min: 0, label: 'Nessuna' },
  { min: 30, label: '30 min' },
  { min: 45, label: '45 min' },
  { min: 60, label: '1 h' },
];

function StepperMin({
  minuti,
  passo,
  disabled,
  onChange,
}: {
  minuti: number;
  passo: number;
  disabled?: boolean;
  onChange: (m: number) => void;
}) {
  const h = Math.floor(minuti / 60);
  const m = minuti % 60;
  const set = (nh: number, nm: number) => onChange(Math.max(0, Math.min(23 * 60 + 59, nh * 60 + nm)));
  const inputCls =
    'w-8 rounded border border-border bg-background px-0.5 py-1 text-center font-mono text-sm font-semibold tabular-nums focus:border-primary focus:outline-none disabled:opacity-50';
  const btnCls =
    'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground active:scale-95 disabled:opacity-40';
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-background/70 p-1">
      <button type="button" disabled={disabled || minuti <= 0} onClick={() => onChange(Math.max(0, minuti - passo))} className={btnCls} aria-label={`Meno ${passo} minuti`}>
        <Minus className="h-4 w-4" />
      </button>
      <input type="number" inputMode="numeric" min={0} max={23} value={h} disabled={disabled} onChange={(e) => set(parseInt(e.target.value, 10) || 0, m)} aria-label="ore" className={inputCls} />
      <span className="text-[11px] font-semibold text-muted-foreground">h</span>
      <input type="number" inputMode="numeric" min={0} max={59} value={String(m).padStart(2, '0')} disabled={disabled} onChange={(e) => set(h, Math.min(59, parseInt(e.target.value, 10) || 0))} aria-label="minuti" className={inputCls} />
      <span className="text-[11px] font-semibold text-muted-foreground">min</span>
      <button type="button" disabled={disabled} onClick={() => onChange(minuti + passo)} className={btnCls} aria-label={`Più ${passo} minuti`}>
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Campo ora robusto su iOS: display formattato + <input type=time> nativo
 * INVISIBILE sopra. iOS disegna il time alla larghezza intrinseca ignorando
 * width (resta inline-flex) → sforerebbe la colonna. Così la larghezza la
 * decide il display, e il picker nativo si apre comunque al tap.
 */
function TimeField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <label className="block font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{label}</label>
      <div className="relative">
        <div
          aria-hidden="true"
          className={`pointer-events-none flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2 py-2 text-[15px] font-semibold tabular-nums ${
            disabled ? 'opacity-50' : 'text-foreground'
          }`}
        >
          <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 truncate">{value}</span>
        </div>
        <input
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-label={label}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
      </div>
    </div>
  );
}

export interface SedeOpzione {
  id: string;
  nome: string;
  tipo: string;
  isDefault: boolean;
}

/** `daSede` = «Lavoro dalla sede sul progetto»: ore del cantiere, luogo la sede predefinita. */
type RigaCantiere = { cantiereId: string; nome: string; codice: string | null; minuti: number; daSede: boolean };

/**
 * Partenza o rientro come li ha scelti l'utente. La correzione del tempo vale
 * solo per la tratta su cui è stata fatta: cambiando sede o primo cantiere la
 * tratta è un'altra, e il tempo torna quello stimato.
 */
type SceltaEstremo = {
  luogo: Estremo | null;
  correzione: { chiave: string; minuti: number; motivo: string } | null;
};

type Apribile = 'partenza' | 'rientro' | `tratta:${string}`;

/** Dove si trova fisicamente la persona: una sede o un cantiere. */
type Luogo = { tipo: 'sede' | 'cantiere'; id: string };
const inSede = (sedeId: string): Luogo => ({ tipo: 'sede', id: sedeId });
const stessoPosto = (da: Luogo, a: Luogo) => da.tipo === a.tipo && da.id === a.id;
/** Chiave della stima di una tratta, nel verso in cui si percorre. */
const chiaveTra = (da: Luogo, a: Luogo) =>
  `${da.tipo === 'sede' ? 's' : 'c'}:${da.id}>${a.tipo === 'sede' ? 's' : 'c'}:${a.id}`;
/** Il corpo della richiesta a `/api/routing/stima` per una tratta. */
function corpoStima(da: Luogo, a: Luogo): Record<string, string> {
  if (da.tipo === 'sede' && a.tipo === 'sede') return { daSedeId: da.id, aSedeId: a.id };
  if (da.tipo === 'cantiere' && a.tipo === 'cantiere') return { daCantiereId: da.id, aCantiereId: a.id };
  return da.tipo === 'sede'
    ? { sedeId: da.id, cantiereId: a.id, direzione: 'andata' }
    : { sedeId: a.id, cantiereId: da.id, direzione: 'ritorno' };
}

const stessoLuogo = (a: Estremo | null, b: Estremo | null) =>
  a?.tipo === b?.tipo && (a?.tipo !== 'sede' || (b?.tipo === 'sede' && a.sedeId === b.sedeId));

const tipoLuogoSede = (tipo: string | undefined) => (tipo === 'hotel' ? 'hotel' : 'sede') as 'hotel' | 'sede';

/**
 * Registra una giornata SENZA timbrature: orario, pausa, cantieri con le ore e
 * il percorso (partenza, tratte fra cantieri, rientro, guida e mezzo).
 *
 * La pagina è per chi vuole compilare tutto in un colpo. Chi salta il percorso
 * non viene bloccato: premendo «Registra giornata» sale il foglio «Il viaggio»,
 * che chiede solo quello che manca, con la barra dei tempi sempre visibile sotto.
 * Regole del percorso in `@kommessa/api/kantiere-percorso`.
 */
export function RegistraGiornataDialog({
  open,
  onClose,
  tolleranzaMin,
  passoMinuti,
  stepViaggio,
  sedi,
  sediPerCantiere,
  mezzi,
  ultimoMezzoId,
}: {
  open: boolean;
  onClose: () => void;
  tolleranzaMin: number;
  passoMinuti: number;
  /** Arrotondamento del tempo di viaggio (min): lo stesso che applica il server. */
  stepViaggio: number;
  sedi: SedeOpzione[];
  /** cantiere_id → sedi associate: si propongono solo la predefinita e queste. */
  sediPerCantiere: Record<string, string[]>;
  mezzi: MezzoOpzione[];
  ultimoMezzoId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const passeggero = useConfermaPasseggero();

  const [inizio, setInizio] = useState('08:00');
  const [fine, setFine] = useState('17:00');
  const [pausaMin, setPausaMin] = useState(60);
  const [righe, setRighe] = useState<RigaCantiere[]>([]);
  const [cantieri, setCantieri] = useState<PickerCantiere[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [fatto, setFatto] = useState(false);

  const [partenza, setPartenza] = useState<SceltaEstremo>({ luogo: null, correzione: null });
  const [rientro, setRientro] = useState<SceltaEstremo>({ luogo: null, correzione: null });
  const [rientroToccato, setRientroToccato] = useState(false);
  const [autista, setAutista] = useState(false);
  const [mezzo, setMezzo] = useState<string | null>(null);
  const [passaggi, setPassaggi] = useState<Record<string, Passaggio>>({});
  const [stime, setStime] = useState<Record<string, StatoStima>>({});
  const [aperto, setAperto] = useState<Apribile | null>(null);
  const [foglio, setFoglio] = useState(false);
  const [evidenzia, setEvidenzia] = useState(false);
  const inVolo = useRef(new Set<string>());

  // Carica cantieri all'apertura (una volta).
  useEffect(() => {
    if (!open || cantieri != null) return;
    void elencoCantieriTurno().then((res) => {
      if (res.ok) setCantieri(res.cantieri);
    });
  }, [open, cantieri]);

  // Reset dello stato "fatto" a ogni riapertura.
  useEffect(() => {
    if (open) setFatto(false);
  }, [open]);

  // ── orario e ore ─────────────────────────────────────────────────────────────
  const grossMin = Math.max(0, Math.round((Date.parse(isoOggi(fine)) - Date.parse(isoOggi(inizio))) / 60000));
  const nettoMin = grossMin - pausaMin;
  const assegnato = righe.reduce((a, r) => a + r.minuti, 0);
  const disponibili = (cantieri ?? []).filter((c) => !righe.some((r) => r.cantiereId === c.id));

  // ── percorso ─────────────────────────────────────────────────────────────────
  // Regola sedi↔cantiere: la predefinita sempre, più quelle associate al cantiere.
  const sediAmmesse = (cantiereId: string | null) => {
    const assoc = new Set(cantiereId ? (sediPerCantiere[cantiereId] ?? []) : []);
    return sedi
      .filter((s) => s.isDefault || assoc.has(s.id))
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.nome.localeCompare(b.nome, 'it'));
  };
  const primo = righe[0]?.cantiereId ?? null;
  const ultimo = righe.length > 0 ? righe[righe.length - 1]!.cantiereId : null;
  const sediAndata = sediAmmesse(primo);
  const sediRitorno = sediAmmesse(ultimo);

  /** Una sede che il cantiere non ammette più (cantieri cambiati) va riscelta. */
  const luogoValido = (l: Estremo | null, ammesse: SedeOpzione[]): Estremo | null => {
    if (ammesse.length === 0) return { tipo: 'casa' }; // nessuna sede: resta solo casa
    if (l?.tipo === 'sede' && !ammesse.some((s) => s.id === l.sedeId)) return null;
    return l;
  };
  const luogoAndata = luogoValido(partenza.luogo, sediAndata);
  const luogoRitorno = luogoValido(rientro.luogo, sediRitorno);

  // Dove si lavora su ogni cantiere: in cantiere, oppure nella sede predefinita
  // con «Lavoro dalla sede sul progetto». Le tratte partono e arrivano da lì.
  const sedeDefault = sedi.find((s) => s.isDefault) ?? null;
  const luogoCantiere = new Map<string, Luogo>(
    righe.map((r) => [
      r.cantiereId,
      r.daSede && sedeDefault ? inSede(sedeDefault.id) : { tipo: 'cantiere', id: r.cantiereId },
    ]),
  );
  const luogoDi = (cantiereId: string): Luogo => luogoCantiere.get(cantiereId) ?? { tipo: 'cantiere', id: cantiereId };
  const andataSenzaViaggio =
    luogoAndata?.tipo === 'sede' && primo != null && stessoPosto(inSede(luogoAndata.sedeId), luogoDi(primo));
  const ritornoSenzaViaggio =
    luogoRitorno?.tipo === 'sede' && ultimo != null && stessoPosto(luogoDi(ultimo), inSede(luogoRitorno.sedeId));
  const chiaveAndata =
    luogoAndata?.tipo === 'sede' && primo && !andataSenzaViaggio
      ? chiaveTra(inSede(luogoAndata.sedeId), luogoDi(primo))
      : null;
  const chiaveRitorno =
    luogoRitorno?.tipo === 'sede' && ultimo && !ritornoSenzaViaggio
      ? chiaveTra(luogoDi(ultimo), inSede(luogoRitorno.sedeId))
      : null;

  const trattaEstrema = (
    scelta: SceltaEstremo,
    luogo: Estremo | null,
    chiave: string | null,
    senzaViaggio: boolean,
  ): TrattaEstrema => {
    const s = chiave ? stime[chiave] : undefined;
    const corr = scelta.correzione && scelta.correzione.chiave === chiave ? scelta.correzione : null;
    return {
      luogo,
      stimaMin: s?.stato === 'ok' ? s.minuti : null,
      inArrivo: chiave != null && (!s || s.stato === 'arrivo'),
      minutiCorretti: corr ? corr.minuti : null,
      motivo: corr?.motivo ?? '',
      senzaViaggio,
    };
  };
  const teAndata = trattaEstrema(partenza, luogoAndata, chiaveAndata, andataSenzaViaggio);
  const teRitorno = trattaEstrema(rientro, luogoRitorno, chiaveRitorno, ritornoSenzaViaggio);

  const coppie = righe.slice(1).map((r, i) => ({ da: righe[i]!.cantiereId, a: r.cantiereId }));
  const sediComuni = (da: string, a: string) => {
    const inB = new Set(sediAmmesse(a).map((s) => s.id));
    return sediAmmesse(da).filter((s) => inB.has(s.id));
  };
  const passaggiValidi: Record<string, Passaggio> = {};
  for (const c of coppie) {
    const k = chiaveCoppia(c);
    const p = passaggi[k];
    if (!p) continue;
    if (typeof p === 'object' && !sediComuni(c.da, c.a).some((s) => s.id === p.sedeId)) continue;
    passaggiValidi[k] = p;
  }
  const intermedie = tratteIntermedie(coppie, passaggiValidi);
  // Fra due cantieri seguiti dalla stessa sede non c'è strada.
  const intermedieConStrada = intermedie.filter(
    (t) => t.tipo === 'via_sede' || !stessoPosto(luogoDi(t.da), luogoDi(t.a)),
  );

  const conViaggi = ciSonoViaggi({ andata: teAndata, ritorno: teRitorno, intermedie: intermedieConStrada });
  // La riga guida sparisce solo quando è sicuro che viaggi non ce ne sono.
  const mostraGuida = !(
    (luogoAndata?.tipo === 'casa' || teAndata.senzaViaggio) &&
    (luogoRitorno?.tipo === 'casa' || teRitorno.senzaViaggio) &&
    !intermedieConStrada.some((t) => t.tipo !== 'via_casa')
  );
  const mancanti = datiMancanti({
    andata: teAndata,
    ritorno: teRitorno,
    intermedie: intermedieConStrada,
    autista,
    mezzo: autista ? mezzo : null,
    mezziDisponibili: mezzi.length,
  });

  // ── stime km e tempo, chieste mentre si compila ─────────────────────────────
  const richieste: [string, Record<string, string>][] = [];
  const chiedi = (da: Luogo, a: Luogo) => {
    if (!stessoPosto(da, a)) richieste.push([chiaveTra(da, a), corpoStima(da, a)]);
  };
  if (chiaveAndata && luogoAndata?.tipo === 'sede' && primo) chiedi(inSede(luogoAndata.sedeId), luogoDi(primo));
  if (chiaveRitorno && luogoRitorno?.tipo === 'sede' && ultimo) chiedi(luogoDi(ultimo), inSede(luogoRitorno.sedeId));
  for (const t of intermedie) {
    chiedi(luogoDi(t.da), luogoDi(t.a));
    if (t.tipo === 'via_sede') {
      chiedi(luogoDi(t.da), inSede(t.sedeId));
      chiedi(inSede(t.sedeId), luogoDi(t.a));
    }
  }
  const firmaRichieste = richieste.map(([k]) => k).join('|');

  useEffect(() => {
    if (!open) return;
    for (const [chiave, body] of richieste) {
      if (stime[chiave] || inVolo.current.has(chiave)) continue;
      inVolo.current.add(chiave);
      setStime((p) => ({ ...p, [chiave]: { stato: 'arrivo' } }));
      fetch('/api/routing/stima', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
        .then((r) => r.json() as Promise<{ ok?: boolean; minuti?: number | null; km?: number | null }>)
        .then((j) => ({
          stato: 'ok' as const,
          minuti: j.ok && typeof j.minuti === 'number' ? j.minuti : null,
          km: j.ok && typeof j.km === 'number' ? j.km : null,
        }))
        .catch(() => ({ stato: 'ok' as const, minuti: null, km: null }))
        .then((esito) => {
          inVolo.current.delete(chiave);
          setStime((p) => ({ ...p, [chiave]: esito }));
        });
    }
    // Le richieste cambiano solo quando cambia la loro firma.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, firmaRichieste]);

  // ── lavoro da assegnare ──────────────────────────────────────────────────────
  // Le tratte fra cantieri stanno dentro l'orario ma sono viaggio, non lavoro:
  // si tolgono dalle ore da assegnare. Stesse stime e stesso arrotondamento del
  // server (`viaggioFraCantieri`), così le ore coincidono.
  const minutiTra = (da: Luogo, a: Luogo): number | null => {
    if (stessoPosto(da, a)) return 0;
    const s = stime[chiaveTra(da, a)];
    if (!s || s.stato === 'arrivo') return null;
    return s.stato === 'ok' && s.minuti != null ? arrotondaA(Math.round(s.minuti), stepViaggio) : 0;
  };
  const fraCantieri = viaggioFraCantieri(
    righe.map((r) => r.cantiereId),
    intermedie,
    (pezzo) =>
      pezzo.tipo === 'fra_cantieri'
        ? minutiTra(luogoDi(pezzo.da), luogoDi(pezzo.a))
        : pezzo.tipo === 'verso_sede'
          ? minutiTra(luogoDi(pezzo.cantiereId), inSede(pezzo.sedeId))
          : minutiTra(inSede(pezzo.sedeId), luogoDi(pezzo.cantiereId)),
  );
  const trasferimentiMin = fraCantieri.totale;
  const lavoroMin = nettoMin - trasferimentiMin;
  const restano = lavoroMin - assegnato;
  const entroTolleranza = Math.abs(restano) <= tolleranzaMin;
  const statoLavoro: StatoLavoro =
    righe.length === 0 || assegnato === 0 ? 'vuoto' : entroTolleranza ? 'completa' : restano > 0 ? 'restano' : 'troppo';

  // ── barra dei tempi ──────────────────────────────────────────────────────────
  const andataMin = minutiTratta(teAndata);
  const ritornoMin = minutiTratta(teRitorno);
  const viaggioTotaleMin = andataMin + ritornoMin + trasferimentiMin;
  const segmenti = segmentiBarraGiornata({
    andataMin,
    ritornoMin,
    minutiCantieri: righe.map((r) => r.minuti),
    trasferimentiMin: fraCantieri.prima,
    pausaMin,
    nettoMin: Math.max(0, lavoroMin),
  });
  const viaggioNoto =
    luogoAndata != null && luogoRitorno != null && !teAndata.inArrivo && !teRitorno.inArrivo && !fraCantieri.inArrivo;

  // ── viste ────────────────────────────────────────────────────────────────────
  const nomeSede = (id: string) => sedi.find((s) => s.id === id);

  function vistaEstremo(quale: 'partenza' | 'rientro'): VistaEstremo {
    const isP = quale === 'partenza';
    const luogo = isP ? luogoAndata : luogoRitorno;
    const te = isP ? teAndata : teRitorno;
    const chiave = isP ? chiaveAndata : chiaveRitorno;
    const ammesse = isP ? sediAndata : sediRitorno;
    const sede = luogo?.tipo === 'sede' ? nomeSede(luogo.sedeId) : undefined;
    const mancante: VistaEstremo['mancante'] = !evidenzia
      ? null
      : mancanti.includes(isP ? 'partenza' : 'rientro')
        ? 'luogo'
        : mancanti.includes(isP ? 'tempo_andata' : 'tempo_ritorno')
          ? 'tempo'
          : mancanti.includes(isP ? 'motivo_andata' : 'motivo_ritorno')
            ? 'motivo'
            : null;
    const opzioni: OpzioneLuogo[] = [
      { valore: 'casa', luogo: { tipo: 'casa' }, nome: 'Abitazione privata', tipo: 'casa' },
      ...ammesse.map((s) => ({
        valore: s.id,
        luogo: { tipo: 'sede' as const, sedeId: s.id },
        nome: s.nome,
        tipo: tipoLuogoSede(s.tipo),
      })),
    ];
    return {
      titolo: isP ? 'Partenza' : 'Rientro',
      segnaposto: isP ? 'Indica la partenza' : 'Indica il rientro',
      scelta: luogo ? (luogo.tipo === 'casa' ? 'casa' : luogo.sedeId) : null,
      nome: luogo ? (luogo.tipo === 'casa' ? 'Abitazione privata' : (sede?.nome ?? 'Sede')) : null,
      tipo: luogo ? (luogo.tipo === 'casa' ? 'casa' : tipoLuogoSede(sede?.tipo)) : null,
      opzioni,
      stima: !chiave ? { stato: 'nessuna' } : (stime[chiave] ?? { stato: 'arrivo' }),
      minuti: minutiTratta(te),
      corretta: trattaModificata(te),
      motivo: te.motivo,
      mancante,
      senzaCantiere: righe.length === 0,
      senzaViaggio: te.senzaViaggio === true,
    };
  }

  const vistaTratte: VistaTratta[] = intermedie.map((t, i) => {
    const daL = luogoDi(t.da);
    const aL = luogoDi(t.a);
    const stessaSede = stessoPosto(daL, aL);
    const stimaTra = (da: Luogo, a: Luogo): StatoStima | undefined =>
      stessoPosto(da, a) ? { stato: 'ok', minuti: 0, km: 0 } : stime[chiaveTra(da, a)];
    const diretta = stessaSede ? undefined : stimaTra(daL, aL);
    const kmTempo = (s: StatoStima | undefined) =>
      s?.stato === 'ok' && s.minuti != null ? [fmtKm(s.km), fmtHM(s.minuti)].filter(Boolean).join(' · ') : '';
    let stima: StatoStima;
    if (t.tipo === 'diretta') stima = stessaSede ? { stato: 'nessuna' } : (diretta ?? { stato: 'arrivo' });
    else if (t.tipo === 'via_casa') stima = { stato: 'nessuna' };
    else {
      const s1 = stimaTra(daL, inSede(t.sedeId));
      const s2 = stimaTra(inSede(t.sedeId), aL);
      if (s1?.stato !== 'ok' || s2?.stato !== 'ok') stima = { stato: 'arrivo' };
      else
        stima = {
          stato: 'ok',
          minuti: s1.minuti != null && s2.minuti != null ? s1.minuti + s2.minuti : null,
          km: s1.km != null && s2.km != null ? s1.km + s2.km : null,
        };
    }
    const sedeScelta = t.tipo === 'via_sede' ? nomeSede(t.sedeId) : undefined;
    return {
      chiave: chiaveCoppia(t),
      daNome: righe[i]?.nome ?? '',
      aNome: righe[i + 1]?.nome ?? '',
      scelta: t.tipo === 'diretta' ? 'diretto' : t.tipo === 'via_casa' ? 'casa' : t.sedeId,
      titolo:
        t.tipo === 'diretta'
          ? stessaSede
            ? 'Nella stessa sede'
            : 'Diretta'
          : t.tipo === 'via_casa'
            ? 'Passando da casa'
            : `Passando da ${sedeScelta?.nome ?? 'sede'}`,
      stima,
      opzioni: [
        { via: 'diretto', titolo: 'Diretta', dettaglio: stessaSede ? 'Nessun viaggio' : kmTempo(diretta) },
        ...sediComuni(t.da, t.a).map((s) => ({
          via: s.id,
          titolo: `Passando da ${s.nome}`,
          dettaglio: s.tipo === 'hotel' ? 'Hotel' : 'Sede',
        })),
        { via: 'casa', titolo: 'Passando da casa', dettaglio: 'Nessun viaggio di lavoro' },
      ],
    };
  });

  const mezziOrdinati = ultimoMezzoId
    ? [...mezzi].sort((a, b) => Number(b.id === ultimoMezzoId) - Number(a.id === ultimoMezzoId))
    : mezzi;

  // ── azioni ───────────────────────────────────────────────────────────────────
  function apriChiudi(id: Apribile) {
    setAperto((p) => (p === id ? null : id));
  }

  function scegliLuogo(quale: 'partenza' | 'rientro', luogo: Estremo) {
    setAperto(null);
    setErrore(null);
    if (quale === 'partenza') {
      setPartenza((p) => ({ luogo, correzione: stessoLuogo(p.luogo, luogo) ? p.correzione : null }));
      // Chi non ha ancora toccato il rientro di solito torna da dove è partito.
      if (!rientroToccato) setRientro({ luogo, correzione: null });
    } else {
      setRientroToccato(true);
      setRientro((p) => ({ luogo, correzione: stessoLuogo(p.luogo, luogo) ? p.correzione : null }));
    }
  }

  function correggi(quale: 'partenza' | 'rientro', patch: { minuti?: number; motivo?: string }) {
    const chiave = quale === 'partenza' ? chiaveAndata : chiaveRitorno;
    if (!chiave) return;
    const attuali = minutiTratta(quale === 'partenza' ? teAndata : teRitorno);
    (quale === 'partenza' ? setPartenza : setRientro)((p) => {
      const base = p.correzione?.chiave === chiave ? p.correzione : { chiave, minuti: attuali, motivo: '' };
      return { ...p, correzione: { ...base, ...patch } };
    });
  }

  function cambiaAutista(on: boolean) {
    passeggero.spegniEvidenza();
    setAutista(on);
    if (on && mezzo == null && ultimoMezzoId && mezzi.some((m) => m.id === ultimoMezzoId)) {
      setMezzo(ultimoMezzoId);
    }
  }

  function aggiungi(id: string) {
    const c = (cantieri ?? []).find((x) => x.id === id);
    setPickerOpen(false);
    if (!c) return;
    const nome = titoloCase(c.nome ?? '') || codiceCantiereMostrato(c) || 'Cantiere';
    setRighe((prev) =>
      prev.some((r) => r.cantiereId === id)
        ? prev
        : [...prev, { cantiereId: id, nome, codice: codiceCantiereMostrato(c), minuti: 0, daSede: false }],
    );
    setErrore(null);
  }

  async function salva() {
    setErrore(null);
    if (righe.length === 0) return setErrore('Aggiungi almeno un cantiere.');
    if (nettoMin <= 0) return setErrore('La fine del lavoro deve essere dopo l’inizio, pausa esclusa.');
    if (righe.some((r) => r.minuti <= 0)) return setErrore('Ogni cantiere deve avere delle ore.');
    // Le ore da assegnare dipendono dalle tratte: prima si aspettano le stime.
    if (teAndata.inArrivo || teRitorno.inArrivo || fraCantieri.inArrivo) {
      return setErrore('Calcolo dei tempi di viaggio in corso: riprova tra un istante.');
    }
    if (lavoroMin <= 0) {
      return setErrore('Il viaggio fra i cantieri occupa tutto l’orario: controlla inizio, fine e tratte.');
    }
    if (!entroTolleranza) {
      return setErrore(restano > 0 ? `Restano ${fmtHM(restano)} da assegnare.` : `${fmtHM(-restano)} di troppo.`);
    }

    // Quello che manca si chiede nel foglio «Il viaggio», aperto sul primo punto.
    if (mancanti.length > 0) {
      const primoMancante = mancanti[0]!;
      setEvidenzia(true);
      setAperto(
        primoMancante === 'mezzo'
          ? null
          : primoMancante === 'partenza' || primoMancante.endsWith('andata')
            ? 'partenza'
            : 'rientro',
      );
      setFoglio(true);
      return;
    }

    // Chi non guidava conferma di essere passeggero: i km contano a chi guida.
    if (conViaggi && !autista && !(await passeggero.conferma(false))) return;

    const trattaPayload = (te: TrattaEstrema, chiave: string | null) => {
      if (te.luogo?.tipo !== 'sede' || te.senzaViaggio) return null;
      const s = chiave ? stime[chiave] : undefined;
      return {
        sedeId: te.luogo.sedeId,
        durataStimataMin: te.stimaMin,
        durataConfermataMin: minutiTratta(te),
        giustificazione: trattaModificata(te) ? te.motivo.trim() : undefined,
        distanzaKm: s?.stato === 'ok' ? s.km : null,
      };
    };
    const guida = conViaggi && autista;

    startTransition(async () => {
      const res = await registraGiornataDaZero({
        inizioIso: isoOggi(inizio),
        fineIso: isoOggi(fine),
        pausaMin,
        split: righe.map((r) => ({ cantiereId: r.cantiereId, minuti: r.minuti, daSede: r.daSede || undefined })),
        percorso: {
          andata: trattaPayload(teAndata, chiaveAndata),
          ritorno: trattaPayload(teRitorno, chiaveRitorno),
          autista: guida,
          mezzoId: guida && mezzo && mezzo !== MEZZO_NON_IN_ELENCO ? mezzo : null,
          passaggi: intermedie.map((t) => ({
            da: t.da,
            a: t.a,
            via: t.tipo === 'diretta' ? 'diretto' : t.tipo === 'via_casa' ? 'casa' : t.sedeId,
          })),
        },
      });
      if (res.ok) {
        // Conferma "premium": mostra l'effetto di successo, poi chiudi e ricarica.
        setFoglio(false);
        setFatto(true);
        setTimeout(() => {
          onClose();
          router.refresh();
        }, 1100);
      } else {
        setErrore(messaggioErrore(res.error));
      }
    });
  }

  if (!open) return null;

  const vistaPartenza = vistaEstremo('partenza');
  const vistaRientro = vistaEstremo('rientro');
  const oggiEsteso = new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  /**
   * Il percorso, uguale nella pagina e nel foglio. `compatto` = nel foglio: i
   * cantieri sono una riga sola (le ore si danno nella pagina).
   */
  function percorso(compatto: boolean) {
    // L'alone della conferma passeggero va sulla riga visibile, non su quella coperta.
    const evidenzaGuida =
      compatto === foglio ? { ref: passeggero.propsEvidenza.ref, attiva: passeggero.evidenzia } : undefined;
    return (
      <ol>
        <Tappa inizio nodoTop={14} nodo={<NodoLuogo tipo={vistaPartenza.tipo} allarme={vistaPartenza.mancante != null} />}>
          <CardEstremo
            vista={vistaPartenza}
            aperto={aperto === 'partenza'}
            disabled={pending}
            onApri={() => apriChiudi('partenza')}
            onScegli={(l) => scegliLuogo('partenza', l)}
            onMinuti={(m) => correggi('partenza', { minuti: m })}
            onMotivo={(t) => correggi('partenza', { motivo: t })}
          >
            {mostraGuida ? (
              <RigaGuida
                autista={autista}
                mezzo={mezzo}
                mezzi={mezziOrdinati}
                ultimoMezzoId={ultimoMezzoId}
                mancaMezzo={evidenzia && mancanti.includes('mezzo')}
                evidenza={evidenzaGuida}
                disabled={pending}
                onAutista={cambiaAutista}
                onMezzo={setMezzo}
              />
            ) : null}
          </CardEstremo>
        </Tappa>

        {righe.map((r, i) => {
          const colore = coloreCantiere(i);
          const tratta = vistaTratte[i];
          return (
            <Fragment key={r.cantiereId}>
              <Tappa nodoTop={compatto ? 8 : 7} nodo={<NodoCantiere indice={i} />}>
                {compatto ? (
                  <div
                    className={`flex min-h-[38px] items-center gap-2 rounded-xl border border-border border-l-4 ${colore.border} ${colore.tint} px-3`}
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">{r.nome}</span>
                    {r.daSede ? (
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-primary">In sede</span>
                    ) : null}
                    <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-muted-foreground">
                      {fmtHM(r.minuti)}
                    </span>
                  </div>
                ) : (
                  <section
                    className={`rounded-2xl border border-border border-l-4 ${colore.border} ${colore.tint} px-3 py-2 shadow-[0_4px_16px_-6px_rgba(20,40,90,0.20)]`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className="truncate text-sm font-semibold leading-tight text-foreground">{r.nome}</p>
                        {r.codice ? (
                          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{r.codice}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setRighe((prev) => prev.filter((_, j) => j !== i));
                          setAperto(null);
                        }}
                        disabled={pending}
                        aria-label={`Rimuovi ${r.nome}`}
                        className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive active:scale-95 disabled:opacity-40"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">Ore lavorate</span>
                      <StepperMin
                        minuti={r.minuti}
                        passo={passoMinuti}
                        disabled={pending}
                        onChange={(m) => setRighe((prev) => prev.map((x, j) => (j === i ? { ...x, minuti: m } : x)))}
                      />
                    </div>
                    {sedeDefault ? (
                      <label className="mt-1.5 flex cursor-pointer items-center gap-2 select-none">
                        <input
                          type="checkbox"
                          checked={r.daSede}
                          disabled={pending}
                          onChange={(e) =>
                            setRighe((prev) => prev.map((x, j) => (j === i ? { ...x, daSede: e.target.checked } : x)))
                          }
                          className="h-4 w-4 rounded border-input accent-primary"
                        />
                        <span className="text-xs text-muted-foreground">Lavoro dalla sede sul progetto</span>
                      </label>
                    ) : null}
                  </section>
                )}
              </Tappa>
              {tratta ? (
                <Tappa nodoTop={10} nodo={<NodoTratta />}>
                  <TrattaFraCantieri
                    vista={tratta}
                    aperto={aperto === `tratta:${tratta.chiave}`}
                    disabled={pending}
                    onApri={() => apriChiudi(`tratta:${tratta.chiave}`)}
                    onScegli={(via) => {
                      setAperto(null);
                      setPassaggi((p) => ({ ...p, [tratta.chiave]: passaggioDaVia(via) }));
                    }}
                  />
                </Tappa>
              ) : null}
            </Fragment>
          );
        })}

        {!compatto && disponibili.length > 0 ? (
          <Tappa nodoTop={8} nodo={<NodoAggiungi />}>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={pending}
              className="flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-muted-foreground/30 bg-muted/30 text-sm font-medium text-muted-foreground hover:bg-muted/50 active:scale-[0.99] disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> {righe.length === 0 ? 'Aggiungi il cantiere' : 'Aggiungi cantiere'}
            </button>
          </Tappa>
        ) : null}

        <Tappa fine nodoTop={14} nodo={<NodoLuogo tipo={vistaRientro.tipo} allarme={vistaRientro.mancante != null} />}>
          <CardEstremo
            vista={vistaRientro}
            aperto={aperto === 'rientro'}
            disabled={pending}
            onApri={() => apriChiudi('rientro')}
            onScegli={(l) => scegliLuogo('rientro', l)}
            onMinuti={(m) => correggi('rientro', { minuti: m })}
            onMotivo={(t) => correggi('rientro', { motivo: t })}
          />
        </Tappa>
      </ol>
    );
  }

  const conPartenza = andataMin > 0;
  const conRientro = ritornoMin > 0;

  return (
    <Portal>
      <div className="fixed inset-0 z-[80] flex flex-col overflow-hidden bg-background" role="dialog" aria-modal="true" aria-label="Registra giornata">
        <div className="relative flex min-h-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
            <button type="button" onClick={onClose} aria-label="Chiudi" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted active:scale-95">
              <X className="h-[18px] w-[18px]" />
            </button>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold leading-tight tracking-tight">Registra giornata</h2>
              <p className="truncate text-[11px] leading-tight text-muted-foreground first-letter:uppercase">
                {oggiEsteso} · senza timbrature
              </p>
            </div>
          </header>

          {fatto ? (
            /* ── Conferma "premium" ─────────────────────────────────────────── */
            <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
              <span className="relative flex h-16 w-16 items-center justify-center">
                <span aria-hidden="true" className="animate-success-glow absolute inset-[-45%] rounded-full bg-emerald-400/30 blur-xl" />
                <span aria-hidden="true" className="animate-success-ring absolute inset-0 rounded-full bg-emerald-400/40" />
                <span aria-hidden="true" className="animate-success-ring absolute inset-0 rounded-full border-2 border-emerald-500/50 [animation-delay:0.16s]" />
                <span className="animate-success-pop relative flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 shadow-[0_8px_24px_-6px_rgba(16,185,129,0.5)]">
                  <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
                </span>
              </span>
              <div className="animate-fade-up space-y-1">
                <p className="text-lg font-semibold text-foreground">Giornata registrata</p>
                <p className="text-sm tabular-nums text-muted-foreground">
                  Lavoro {fmtHM(assegnato)}
                  {viaggioTotaleMin > 0 ? ` · Viaggio ${fmtHM(viaggioTotaleMin)}` : ''}
                </p>
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden px-4 pb-5 pt-2.5">
              {/* ── La giornata: orari + pausa + netto ───────────────────────── */}
              <section className="space-y-2.5 rounded-2xl border-2 border-primary/25 bg-gradient-to-b from-primary/[0.06] to-transparent p-3 shadow-soft">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                      <CalendarClock className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="text-sm font-semibold text-foreground">La giornata</span>
                  </span>
                  <span className="flex flex-col items-end leading-none">
                    <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Ore nette</span>
                    <span className="mt-0.5 font-mono text-base font-bold tabular-nums text-primary">{fmtHM(Math.max(0, nettoMin))}</span>
                    {trasferimentiMin > 0 ? (
                      <span className="mt-1 text-[10px] font-medium tabular-nums text-sky-700">
                        di cui viaggio {fmtHM(trasferimentiMin)}
                      </span>
                    ) : null}
                  </span>
                </div>

                {/* Inizio / Fine: 2 colonne 50/50 (min-w-0 sui grid item, così il
                    time nativo iOS non allarga la traccia). */}
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2.5">
                  <TimeField label="Inizio lavoro" value={inizio} onChange={setInizio} disabled={pending} />
                  <TimeField label="Fine lavoro" value={fine} onChange={setFine} disabled={pending} />
                </div>

                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                    <Coffee className="h-3 w-3" aria-hidden="true" /> Pausa pranzo
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {PAUSE_CHIPS.map((p) => {
                      const attivo = pausaMin === p.min;
                      return (
                        <button
                          key={p.min}
                          type="button"
                          disabled={pending}
                          onClick={() => setPausaMin(p.min)}
                          className={`rounded-lg border px-1 py-1.5 text-[13px] font-semibold tabular-nums transition-colors disabled:opacity-50 ${
                            attivo
                              ? 'border-primary bg-primary text-primary-foreground shadow-soft'
                              : 'border-border bg-background text-foreground hover:bg-muted/40'
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* ── Il percorso: partenza, cantieri e tratte, rientro ────────── */}
              <section className="space-y-2" aria-label="Il percorso">
                <p className="px-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Il percorso
                </p>
                {percorso(false)}
              </section>
            </div>
          )}

          {/* ── Il foglio «Il viaggio»: sale sopra la pagina, la barra resta sotto ── */}
          {foglio && !fatto ? (
            <div className="absolute inset-0 z-20 flex flex-col justify-end">
              <button
                type="button"
                aria-label="Chiudi il viaggio"
                onClick={() => setFoglio(false)}
                className="animate-content-in absolute inset-0 bg-slate-900/45 backdrop-blur-[2px]"
              />
              <section
                role="dialog"
                aria-label="Il viaggio"
                className="animate-sheet-up relative flex max-h-[calc(100%-2.5rem)] flex-col overflow-hidden rounded-t-[28px] bg-background shadow-[0_-24px_48px_-16px_rgba(15,23,42,0.45)]"
              >
                <div className="shrink-0 px-4 pb-2.5 pt-2">
                  <span aria-hidden="true" className="mx-auto mb-2 block h-1 w-10 rounded-full bg-muted-foreground/25" />
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                      <Car className="h-[18px] w-[18px]" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[15px] font-semibold leading-tight text-foreground">Il viaggio</h3>
                      <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                        {righe.length > 1
                          ? 'Partenza, rientro e mezzo. Le tratte fra i cantieri sono già calcolate.'
                          : 'Partenza, rientro e mezzo della giornata.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFoglio(false)}
                      aria-label="Torna alla giornata"
                      className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted active:scale-95"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden border-t border-border/70 px-4 pb-4 pt-3">
                  {percorso(true)}
                  {evidenzia && mancanti.length > 0 ? (
                    <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-800">
                      <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {testoMancanti(mancanti)}
                    </p>
                  ) : null}
                </div>
              </section>
            </div>
          ) : null}
        </div>

        {/* ── Footer: la barra dei tempi + il tasto, visibili anche col foglio aperto ── */}
        {!fatto ? (
          <div className="relative z-30 shrink-0 border-t border-emerald-600/15 bg-emerald-50 px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-10px_28px_-14px_rgba(20,40,90,0.35)]">
            <BarraGiornata
              segmenti={segmenti}
              assegnatoMin={assegnato}
              nettoMin={lavoroMin}
              stato={statoLavoro}
              restanoMin={restano}
              viaggioMin={viaggioTotaleMin}
              viaggioNoto={viaggioNoto}
              sinistra={conPartenza ? { etichetta: 'Partenza', ora: spostaOrario(inizio, -andataMin) } : { etichetta: 'Inizio', ora: inizio }}
              destra={conRientro ? { etichetta: 'Rientro', ora: spostaOrario(fine, ritornoMin) } : { etichetta: 'Fine', ora: fine }}
            />
            {errore ? (
              <p role="alert" className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs leading-snug text-destructive">
                {errore}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void salva()}
              disabled={pending}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-[15px] font-semibold text-white shadow-[0_8px_24px_-8px_rgba(16,185,129,0.6)] transition-transform hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <CheckCircle2 className="h-[18px] w-[18px]" aria-hidden="true" />}
              Registra giornata
            </button>
          </div>
        ) : null}

        {/* Dentro la pagina: un secondo dialog la chiuderebbe. */}
        {passeggero.pannello}
      </div>

      <CantiereSearchSheet
        open={pickerOpen}
        title="Aggiungi cantiere"
        cantieri={disponibili}
        onPick={aggiungi}
        onClose={() => setPickerOpen(false)}
      />
    </Portal>
  );
}

'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CalendarClock,
  Car,
  CheckCircle2,
  Clock,
  Coffee,
  Loader2,
  Minus,
  Plus,
  X,
} from 'lucide-react';

import {
  MEZZO_NON_IN_ELENCO,
  chiaveCoppia,
  datiMancanti,
  guidaDi,
  scegliGuidaTratta,
  minutiTratta,
  passaggioDaVia,
  segmentiBarraGiornata,
  spostaOrario,
  trattaModificata,
  tratteConStrada,
  tratteIntermedie,
  viaggioFraCantieri,
  type DatoMancante,
  type Estremo,
  type Guida,
  type IdTratta,
  type Passaggio,
  type TrattaEstrema,
  type TrattaIntermedia,
} from '@kommessa/api/kantiere-percorso';
import { arrotondaA } from '@kommessa/api/kantiere-ore';
import { Portal } from '@/app/mobile/_components/portal';
import { SceltaPausaPranzo } from '@/app/_components/scelta-pausa-pranzo';
import { titoloCase } from '@/app/mobile/_lib/display-case';
import { codiceCantiereMostrato } from '@/app/_lib/cantiere-categoria';
import { useConfermaPasseggero } from '@/app/_components/conferma-passeggero';
import { CantiereSearchSheet, type PickerCantiere } from '../../_components/cantiere-picker';
import { registraGiornataDaZero, elencoCantieriTurno } from '@/app/_actions/kantiere-timbra';
import {
  BarraGiornata,
  CardEstremo,
  ChipGuida,
  NodoAggiungi,
  NodoCantiere,
  NodoLuogo,
  NodoTratta,
  Tappa,
  TrattaFraCantieri,
  coloreCantiere,
  fmtHM,
  fmtKm,
  type MezzoOpzione,
  type OpzioneLuogo,
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
      return 'Controlla l’ora di inizio: la giornata deve iniziare e finire oggi.';
    case 'SPLIT_SOMMA':
    case 'SPLIT_NETTO':
      return 'Le ore dei cantieri non tornano con il totale della giornata.';
    case 'REGISTRA_OFF':
      return 'La registrazione giornata è disattivata dall’ufficio.';
    case 'CANTIERE_NON_VALIDO':
      return 'Un cantiere selezionato non è valido.';
    case 'CANTIERE_CHIUSO':
      return 'Uno dei cantieri scelti è chiuso: non accetta più ore. Se ci hai lavorato, dillo all’ufficio.';
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

function parolaMancante(m: DatoMancante): string {
  if (m.startsWith('guida:')) return 'chi guidava';
  if (m.startsWith('mezzo:')) return 'il mezzo';
  if (m === 'partenza') return 'la partenza';
  if (m === 'rientro') return 'il rientro';
  if (m === 'tempo_andata' || m === 'tempo_ritorno') return 'il tempo di viaggio';
  return 'il motivo della modifica del tempo';
}

function testoMancanti(m: DatoMancante[]): string {
  const parole = [...new Set(m.map(parolaMancante))];
  const elenco =
    parole.length > 1
      ? `${parole.slice(0, -1).join(', ')} e ${parole[parole.length - 1]}`
      : parole[0];
  return `Per registrare indica ${elenco}.`;
}


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
  const set = (nh: number, nm: number) =>
    onChange(Math.max(0, Math.min(23 * 60 + 59, nh * 60 + nm)));
  const inputCls =
    'w-8 rounded border border-border bg-background px-0.5 py-1 text-center font-mono text-sm font-semibold tabular-nums focus:border-primary focus:outline-none disabled:opacity-50';
  const btnCls =
    'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground active:scale-95 disabled:opacity-40';
  return (
    <div className="border-border bg-background/70 flex shrink-0 items-center gap-1 rounded-lg border p-1">
      <button
        type="button"
        disabled={disabled || minuti <= 0}
        onClick={() => onChange(Math.max(0, minuti - passo))}
        className={btnCls}
        aria-label={`Meno ${passo} minuti`}
      >
        <Minus className="h-4 w-4" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={23}
        value={h}
        disabled={disabled}
        onChange={(e) => set(parseInt(e.target.value, 10) || 0, m)}
        aria-label="ore"
        className={inputCls}
      />
      <span className="text-muted-foreground text-[11px] font-semibold">h</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={59}
        value={String(m).padStart(2, '0')}
        disabled={disabled}
        onChange={(e) => set(h, Math.min(59, parseInt(e.target.value, 10) || 0))}
        aria-label="minuti"
        className={inputCls}
      />
      <span className="text-muted-foreground text-[11px] font-semibold">min</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(minuti + passo)}
        className={btnCls}
        aria-label={`Più ${passo} minuti`}
      >
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
    <div className="min-w-0 space-y-0.5">
      <label className="text-muted-foreground block font-mono text-[9px] uppercase tracking-[0.14em]">
        {label}
      </label>
      <div className="relative">
        <div
          aria-hidden="true"
          className={`border-border bg-background pointer-events-none flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[15px] font-semibold tabular-nums ${
            disabled ? 'opacity-50' : 'text-foreground'
          }`}
        >
          <Clock className="text-muted-foreground h-3.5 w-3.5 shrink-0" aria-hidden="true" />
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

/** La fine del lavoro: si legge come un campo, ma la calcola la pagina. */
function FineCalcolata({ ora }: { ora: string | null }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <span className="text-muted-foreground block font-mono text-[9px] uppercase tracking-[0.14em]">
        Fine lavoro · calcolata
      </span>
      <div
        aria-label="Fine lavoro calcolata"
        className="border-primary/30 bg-primary/[0.04] flex items-center justify-center gap-1.5 rounded-lg border border-dashed px-2 py-1.5 text-[15px] font-semibold tabular-nums"
      >
        <Clock className="text-muted-foreground h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className={ora ? 'text-foreground' : 'text-muted-foreground'}>{ora ?? '--:--'}</span>
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
type RigaCantiere = {
  cantiereId: string;
  nome: string;
  codice: string | null;
  minuti: number;
  daSede: boolean;
};

/**
 * Partenza o rientro come li ha scelti l'utente. La correzione del tempo vale
 * solo per la tratta su cui è stata fatta: cambiando sede o primo cantiere la
 * tratta è un'altra, e il tempo torna quello stimato.
 */
type SceltaEstremo = {
  luogo: Estremo | null;
  correzione: { chiave: string; minuti: number; motivo: string } | null;
};

type Apribile = 'partenza' | 'rientro' | `tratta:${string}` | `guida:${IdTratta}`;

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
  if (da.tipo === 'cantiere' && a.tipo === 'cantiere')
    return { daCantiereId: da.id, aCantiereId: a.id };
  return da.tipo === 'sede'
    ? { sedeId: da.id, cantiereId: a.id, direzione: 'andata' }
    : { sedeId: a.id, cantiereId: da.id, direzione: 'ritorno' };
}

const stessoLuogo = (a: Estremo | null, b: Estremo | null) =>
  a?.tipo === b?.tipo && (a?.tipo !== 'sede' || (b?.tipo === 'sede' && a.sedeId === b.sedeId));

const tipoLuogoSede = (tipo: string | undefined) =>
  (tipo === 'hotel' ? 'hotel' : 'sede') as 'hotel' | 'sede';

/**
 * Registra una giornata SENZA timbrature: ora di inizio, pausa, cantieri con le
 * ore e il percorso (partenza, tratte fra cantieri, rientro, chi guidava).
 *
 * Si indica solo l'inizio: la fine si calcola da ore dei cantieri, pausa e
 * tratte, così non ci sono due totali da far quadrare. Chi salta il percorso non
 * viene bloccato: premendo «Registra giornata» sale il foglio «Il viaggio», che
 * chiede solo quello che manca, con la barra dei tempi sempre visibile sotto.
 * Regole del percorso in `@kommessa/api/kantiere-percorso`.
 *
 * Con `inUfficio` la stessa schermata gira al contrario, per chi lavora quasi
 * sempre in sede: un lavoro nasce «dalla sede» e il flag dice l'eccezione
 * («Lavoro presso il cliente»), che è quella che fa comparire il percorso.
 * Stessi pezzi e stesso salvataggio: cambia solo da che parte sta il caso
 * normale. Chi lavora fuori non vede nessuna differenza.
 */
export function RegistraGiornataDialog({
  open,
  onClose,
  passoMinuti,
  stepViaggio,
  sedi,
  sediPerCantiere,
  mezzi,
  ultimoMezzoId,
  inUfficio = false,
}: {
  open: boolean;
  onClose: () => void;
  passoMinuti: number;
  /** Arrotondamento del tempo di viaggio (min): lo stesso che applica il server. */
  stepViaggio: number;
  sedi: SedeOpzione[];
  /** cantiere_id → sedi associate: si propongono solo la predefinita e queste. */
  sediPerCantiere: Record<string, string[]>;
  mezzi: MezzoOpzione[];
  ultimoMezzoId: string | null;
  /** Modalità di lavoro «ufficio» (scheda dipendente): il flag va al contrario. */
  inUfficio?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const passeggero = useConfermaPasseggero();

  const [inizio, setInizio] = useState('08:00');
  const [pausaMin, setPausaMin] = useState(60);
  const [righe, setRighe] = useState<RigaCantiere[]>([]);
  const [cantieri, setCantieri] = useState<PickerCantiere[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [fatto, setFatto] = useState(false);

  const [partenza, setPartenza] = useState<SceltaEstremo>({ luogo: null, correzione: null });
  const [rientro, setRientro] = useState<SceltaEstremo>({ luogo: null, correzione: null });
  const [rientroToccato, setRientroToccato] = useState(false);
  // Chi guidava: la scelta fatta su ogni tratta e l'ultima scelta, che vale per
  // le tratte non ancora toccate.
  const [guide, setGuide] = useState<Partial<Record<IdTratta, Guida>>>({});
  const [ultimaGuida, setUltimaGuida] = useState<Guida | null>(null);
  const [passaggi, setPassaggi] = useState<Record<string, Passaggio>>({});
  // Tempo delle tratte fra cantieri corretto a mano. `firma` = la tratta su cui è
  // stato corretto: cambiando via o luoghi torna la stima.
  const [correzioniTratte, setCorrezioniTratte] = useState<
    Record<string, { firma: string; minuti: number; motivo: string }>
  >({});
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

  const assegnato = righe.reduce((a, r) => a + r.minuti, 0);
  const disponibili = (cantieri ?? []).filter((c) => !righe.some((r) => r.cantiereId === c.id));

  // ── percorso ─────────────────────────────────────────────────────────────────
  // Regola sedi↔cantiere: la predefinita sempre, più quelle associate al cantiere.
  const sediAmmesse = (cantiereId: string | null) => {
    const assoc = new Set(cantiereId ? (sediPerCantiere[cantiereId] ?? []) : []);
    return sedi
      .filter((s) => s.isDefault || assoc.has(s.id))
      .sort(
        (a, b) => Number(b.isDefault) - Number(a.isDefault) || a.nome.localeCompare(b.nome, 'it'),
      );
  };
  const primo = righe[0]?.cantiereId ?? null;
  const ultimo = righe.length > 0 ? righe[righe.length - 1]!.cantiereId : null;
  const sediAndata = sediAmmesse(primo);
  const sediRitorno = sediAmmesse(ultimo);

  // Dove si lavora su ogni cantiere: in cantiere, oppure nella sede predefinita
  // con «Lavoro dalla sede sul progetto». Le tratte partono e arrivano da lì.
  const sedeDefault = sedi.find((s) => s.isDefault) ?? null;
  const sedeDefaultLuogo: Estremo | null = sedeDefault
    ? { tipo: 'sede', sedeId: sedeDefault.id }
    : null;
  // Tutto il giorno dalla sede: partenza e rientro non si chiedono.
  // In modalità ufficio la giornata è in sede da subito, anche prima di scegliere
  // il primo lavoro: altrimenti il dialog appena aperto accoglierebbe con
  // «Partenza» e «Rientro», cioè con la domanda che qui è l'eccezione. Per chi
  // lavora fuori serve almeno una riga, come è sempre stato.
  const tuttoInSede =
    sedeDefault != null && (inUfficio || righe.length > 0) && righe.every((r) => r.daSede);
  const mostraPartenza = !tuttoInSede && sediAndata.length > 0;
  const mostraRientro = !tuttoInSede && sediRitorno.length > 0;

  /**
   * Partenza e rientro: di default la sede predefinita (in Registra giornata non
   * c'è l'abitazione privata). Una sede che il cantiere non ammette più torna
   * alla predefinita. Quando l'estremo non si mostra non c'è viaggio da indicare.
   */
  const luogoEstremo = (
    scelto: Estremo | null,
    ammesse: SedeOpzione[],
    mostra: boolean,
  ): Estremo => {
    const predefinito: Estremo = sedeDefaultLuogo ?? { tipo: 'casa' };
    if (!mostra) return predefinito;
    if (scelto?.tipo === 'sede' && ammesse.some((s) => s.id === scelto.sedeId)) return scelto;
    return predefinito;
  };
  const luogoAndata = luogoEstremo(partenza.luogo, sediAndata, mostraPartenza);
  const luogoRitorno = luogoEstremo(rientro.luogo ?? partenza.luogo, sediRitorno, mostraRientro);
  const luogoCantiere = new Map<string, Luogo>(
    righe.map((r) => [
      r.cantiereId,
      r.daSede && sedeDefault ? inSede(sedeDefault.id) : { tipo: 'cantiere', id: r.cantiereId },
    ]),
  );
  const luogoDi = (cantiereId: string): Luogo =>
    luogoCantiere.get(cantiereId) ?? { tipo: 'cantiere', id: cantiereId };
  const andataSenzaViaggio =
    luogoAndata?.tipo === 'sede' &&
    primo != null &&
    stessoPosto(inSede(luogoAndata.sedeId), luogoDi(primo));
  const ritornoSenzaViaggio =
    luogoRitorno?.tipo === 'sede' &&
    ultimo != null &&
    stessoPosto(luogoDi(ultimo), inSede(luogoRitorno.sedeId));
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
    const corr =
      scelta.correzione && scelta.correzione.chiave === chiave ? scelta.correzione : null;
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

  // Le tratte con strada sono quelle su cui si chiede chi guidava: da e verso
  // casa no, e nemmeno fra due cantieri seguiti dalla stessa sede.
  const stradaFra = (t: TrattaIntermedia) =>
    t.tipo === 'via_sede'
      ? !(
          stessoPosto(luogoDi(t.da), inSede(t.sedeId)) &&
          stessoPosto(luogoDi(t.a), inSede(t.sedeId))
        )
      : !stessoPosto(luogoDi(t.da), luogoDi(t.a));
  const conStrada = tratteConStrada({
    andata: teAndata,
    ritorno: teRitorno,
    intermedie,
    strada: stradaFra,
  });
  const guida = (id: IdTratta) => guidaDi(id, guide, ultimaGuida);
  const primoPasseggero = conStrada.find((id) => guida(id)?.autista === false) ?? null;

  // ── stime km e tempo, chieste mentre si compila ─────────────────────────────
  const richieste: [string, Record<string, string>][] = [];
  const chiedi = (da: Luogo, a: Luogo) => {
    if (!stessoPosto(da, a)) richieste.push([chiaveTra(da, a), corpoStima(da, a)]);
  };
  if (chiaveAndata && luogoAndata?.tipo === 'sede' && primo)
    chiedi(inSede(luogoAndata.sedeId), luogoDi(primo));
  if (chiaveRitorno && luogoRitorno?.tipo === 'sede' && ultimo)
    chiedi(luogoDi(ultimo), inSede(luogoRitorno.sedeId));
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
        .then(
          (r) => r.json() as Promise<{ ok?: boolean; minuti?: number | null; km?: number | null }>,
        )
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

  // ── orario ───────────────────────────────────────────────────────────────────
  // Le tratte fra cantieri stanno dentro l'orario ma sono viaggio, non lavoro.
  // Stesse stime e stesso arrotondamento del server (`viaggioFraCantieri`).
  const minutiTra = (da: Luogo, a: Luogo): number | null => {
    if (stessoPosto(da, a)) return 0;
    const s = stime[chiaveTra(da, a)];
    if (!s || s.stato === 'arrivo') return null;
    return s.stato === 'ok' && s.minuti != null ? arrotondaA(Math.round(s.minuti), stepViaggio) : 0;
  };
  /** L'identità di una tratta fra cantieri: via e luoghi in cui si lavora. */
  const firmaTratta = (t: TrattaIntermedia) =>
    `${t.tipo === 'via_sede' ? t.sedeId : t.tipo}|${chiaveTra(luogoDi(t.da), luogoDi(t.a))}`;
  const correzioneDi = (t: TrattaIntermedia) => {
    const c = correzioniTratte[chiaveCoppia(t)];
    return c && c.firma === firmaTratta(t) ? c : null;
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
    (t) => correzioneDi(t)?.minuti ?? null,
  );
  const trasferimentiMin = fraCantieri.totale;
  // Si indica solo l'inizio: la fine è inizio + ore dei cantieri + pausa + tratte.
  const [hhInizio, mmInizio] = inizio.split(':').map((x) => parseInt(x, 10));
  const inizioMin = (hhInizio ?? 0) * 60 + (mmInizio ?? 0);
  const durataMin = assegnato + pausaMin + trasferimentiMin;
  const fine = spostaOrario(inizio, durataMin);
  const oltreMezzanotte = assegnato > 0 && inizioMin + durataMin >= 24 * 60;

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
    nettoMin: assegnato,
  });
  const viaggioNoto =
    luogoAndata != null &&
    luogoRitorno != null &&
    !teAndata.inArrivo &&
    !teRitorno.inArrivo &&
    !fraCantieri.inArrivo;

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
    const opzioni: OpzioneLuogo[] = ammesse.map((s) => ({
      valore: s.id,
      luogo: { tipo: 'sede' as const, sedeId: s.id },
      nome: s.nome,
      tipo: tipoLuogoSede(s.tipo),
    }));
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
      s?.stato === 'ok' && s.minuti != null
        ? [fmtKm(s.km), fmtHM(s.minuti)].filter(Boolean).join(' · ')
        : '';
    let stima: StatoStima;
    if (t.tipo === 'diretta')
      stima = stessaSede ? { stato: 'nessuna' } : (diretta ?? { stato: 'arrivo' });
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
    // Minuti stimati (arrotondati come sul server) e correzione a mano.
    const conStima = stima.stato === 'ok' && stima.minuti != null;
    const stimaMin =
      t.tipo === 'diretta'
        ? stessaSede
          ? 0
          : minutiTra(daL, aL)
        : t.tipo === 'via_sede'
          ? (() => {
              const x = minutiTra(daL, inSede(t.sedeId));
              const y = minutiTra(inSede(t.sedeId), aL);
              return x == null || y == null ? null : x + y;
            })()
          : 0;
    const corr = correzioneDi(t);
    // La seconda scelta: passando dalla sede predefinita (o da quella già scelta,
    // o dalla prima sede ammessa per entrambi i cantieri). Non c'è se uno dei due
    // cantieri si segue già da quella sede.
    const comuni = sediComuni(t.da, t.a);
    const sedeTappa = stessaSede
      ? undefined
      : ((t.tipo === 'via_sede' ? comuni.find((s) => s.id === t.sedeId) : undefined) ??
        comuni.find((s) => s.isDefault) ??
        comuni[0]);
    const tappa =
      sedeTappa && !stessoPosto(daL, inSede(sedeTappa.id)) && !stessoPosto(aL, inSede(sedeTappa.id))
        ? sedeTappa
        : undefined;
    const viaTappa = ((): StatoStima | undefined => {
      if (!tappa) return undefined;
      const s1 = stimaTra(daL, inSede(tappa.id));
      const s2 = stimaTra(inSede(tappa.id), aL);
      if (s1?.stato !== 'ok' || s2?.stato !== 'ok' || s1.minuti == null || s2.minuti == null)
        return undefined;
      return {
        stato: 'ok',
        minuti: s1.minuti + s2.minuti,
        km: s1.km != null && s2.km != null ? s1.km + s2.km : null,
      };
    })();
    return {
      minuti: corr ? corr.minuti : (stimaMin ?? 0),
      corretta: corr != null && conStima && corr.minuti !== stimaMin,
      motivo: corr?.motivo ?? '',
      mancante: null,
      modificabile: t.tipo !== 'via_casa' && stradaFra(t),
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
        {
          via: 'diretto',
          titolo: 'Diretta',
          dettaglio: stessaSede ? 'Nessun viaggio' : kmTempo(diretta),
        },
        ...(tappa
          ? [
              {
                via: tappa.id,
                titolo: 'Passando da',
                sottotitolo: tappa.nome,
                dettaglio: kmTempo(viaTappa) || (tappa.tipo === 'hotel' ? 'Hotel' : 'Sede'),
              },
            ]
          : []),
      ],
    };
  });

  const mancanti = datiMancanti({
    andata: teAndata,
    ritorno: teRitorno,
    conStrada,
    guida,
    mezziDisponibili: mezzi.length,
    modificheTratte: vistaTratte
      .filter((v) => v.modificabile)
      .map((v) => ({
        id: `tratta:${v.chiave}` as IdTratta,
        modificata: v.corretta,
        motivo: v.motivo,
      })),
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
      setPartenza((p) => ({
        luogo,
        correzione: stessoLuogo(p.luogo, luogo) ? p.correzione : null,
      }));
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
      const base =
        p.correzione?.chiave === chiave ? p.correzione : { chiave, minuti: attuali, motivo: '' };
      return { ...p, correzione: { ...base, ...patch } };
    });
  }

  function correggiTratta(chiave: string, patch: { minuti?: number; motivo?: string }) {
    const t = intermedie.find((x) => chiaveCoppia(x) === chiave);
    const v = vistaTratte.find((x) => x.chiave === chiave);
    if (!t || !v) return;
    const firma = firmaTratta(t);
    setErrore(null);
    setCorrezioniTratte((p) => {
      const base =
        p[chiave]?.firma === firma ? p[chiave]! : { firma, minuti: v.minuti, motivo: '' };
      return { ...p, [chiave]: { ...base, ...patch } };
    });
  }

  function scegliGuida(id: IdTratta, scelta: Guida) {
    passeggero.spegniEvidenza();
    setErrore(null);
    let valore = scelta;
    // Chi dice «guidavo io» ritrova il mezzo appena scelto, o l'ultimo guidato.
    if (scelta.autista && scelta.mezzo == null) {
      const precedente = ultimaGuida?.autista ? ultimaGuida.mezzo : null;
      const ultimoValido =
        ultimoMezzoId && mezzi.some((m) => m.id === ultimoMezzoId) ? ultimoMezzoId : null;
      valore = { autista: true, mezzo: precedente ?? ultimoValido };
    }
    setGuide((p) => scegliGuidaTratta(conStrada, p, ultimaGuida, id, valore));
    setUltimaGuida(valore);
    // Scelta completa: il menu si chiude. Se manca il mezzo resta aperto sul selettore.
    if (!valore.autista || valore.mezzo != null || mezzi.length === 0) {
      setAperto((a) => (a === `guida:${id}` ? null : a));
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
        : [
            ...prev,
            {
              cantiereId: id,
              nome,
              codice: codiceCantiereMostrato(c),
              minuti: 0,
              // In modalità ufficio il caso normale è lavorare dalla sede: il
              // lavoro nasce così, e il flag serve a dire quando si è usciti.
              daSede: inUfficio && sedeDefault != null,
            },
          ],
    );
    setErrore(null);
  }

  async function salva() {
    setErrore(null);
    if (righe.length === 0) return setErrore('Aggiungi almeno un cantiere.');
    if (righe.some((r) => r.minuti <= 0)) return setErrore('Ogni cantiere deve avere delle ore.');
    // La fine dipende dalle tratte: prima si aspettano le stime.
    if (teAndata.inArrivo || teRitorno.inArrivo || fraCantieri.inArrivo) {
      return setErrore('Calcolo dei tempi di viaggio in corso: riprova tra un istante.');
    }
    if (oltreMezzanotte)
      return setErrore('La giornata supera la mezzanotte: controlla l’ora di inizio e le ore.');

    // Quello che manca si chiede nel foglio «Il viaggio», aperto sul primo punto.
    if (mancanti.length > 0) {
      const primoMancante = mancanti[0]!;
      setEvidenzia(true);
      setAperto(
        primoMancante.startsWith('guida:') || primoMancante.startsWith('mezzo:')
          ? (`guida:${primoMancante.slice(6)}` as Apribile)
          : primoMancante.startsWith('motivo:')
            ? (primoMancante.slice(7) as Apribile)
            : primoMancante === 'partenza' || primoMancante.endsWith('andata')
              ? 'partenza'
              : 'rientro',
      );
      setFoglio(true);
      return;
    }

    // Chi era passeggero su una tratta lo conferma: i km contano a chi guida.
    if (primoPasseggero && !(await passeggero.conferma(false))) {
      setAperto(`guida:${primoPasseggero}`);
      return;
    }

    const guidaPayload = (id: IdTratta) => {
      const g = guida(id);
      return g?.autista
        ? { autista: true, mezzoId: g.mezzo && g.mezzo !== MEZZO_NON_IN_ELENCO ? g.mezzo : null }
        : { autista: false, mezzoId: null };
    };
    const trattaPayload = (te: TrattaEstrema, chiave: string | null, id: IdTratta) => {
      if (te.luogo?.tipo !== 'sede' || te.senzaViaggio) return null;
      const s = chiave ? stime[chiave] : undefined;
      return {
        sedeId: te.luogo.sedeId,
        durataStimataMin: te.stimaMin,
        durataConfermataMin: minutiTratta(te),
        giustificazione: trattaModificata(te) ? te.motivo.trim() : undefined,
        distanzaKm: s?.stato === 'ok' ? s.km : null,
        ...guidaPayload(id),
      };
    };

    startTransition(async () => {
      const res = await registraGiornataDaZero({
        inizioIso: isoOggi(inizio),
        fineIso: isoOggi(fine),
        pausaMin,
        split: righe.map((r) => ({
          cantiereId: r.cantiereId,
          minuti: r.minuti,
          daSede: r.daSede || undefined,
        })),
        percorso: {
          andata: trattaPayload(teAndata, chiaveAndata, 'andata'),
          ritorno: trattaPayload(teRitorno, chiaveRitorno, 'ritorno'),
          passaggi: intermedie.map((t) => ({
            da: t.da,
            a: t.a,
            via: t.tipo === 'diretta' ? 'diretto' : t.tipo === 'via_casa' ? 'casa' : t.sedeId,
            ...guidaPayload(`tratta:${chiaveCoppia(t)}`),
            ...(() => {
              const c = correzioneDi(t);
              const v = vistaTratte.find((x) => x.chiave === chiaveCoppia(t));
              return c && v?.modificabile
                ? {
                    durataConfermataMin: c.minuti,
                    giustificazione: v.corretta ? c.motivo.trim() : undefined,
                  }
                : {};
            })(),
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
    // L'alone della conferma passeggero va sulla copia visibile, non su quella coperta.
    const visibile = compatto === foglio;
    const chipGuida = (id: IdTratta, inCard: boolean) =>
      conStrada.includes(id) ? (
        <ChipGuida
          id={id}
          guida={guida(id)}
          aperto={aperto === `guida:${id}`}
          mezzi={mezziOrdinati}
          ultimoMezzoId={ultimoMezzoId}
          mancante={
            !evidenzia
              ? null
              : mancanti.includes(`guida:${id}`)
                ? 'guida'
                : mancanti.includes(`mezzo:${id}`)
                  ? 'mezzo'
                  : null
          }
          evidenza={
            visibile && id === primoPasseggero
              ? { ref: passeggero.propsEvidenza.ref, attiva: passeggero.evidenzia }
              : undefined
          }
          disabled={pending}
          inCard={inCard}
          onApri={() => apriChiudi(`guida:${id}`)}
          onScegli={(g) => scegliGuida(id, g)}
        />
      ) : null;

    const tappe: { key: string; nodo: ReactNode; nodoTop: number; contenuto: ReactNode }[] = [];
    if (tuttoInSede) {
      tappe.push({
        key: 'in-sede',
        nodo: <NodoLuogo tipo="sede" />,
        nodoTop: 8,
        contenuto: (
          <p className="border-border bg-card text-muted-foreground flex min-h-[38px] items-center rounded-xl border px-3 text-xs leading-snug">
            <span className="min-w-0 truncate">
              <span className="text-foreground font-semibold">{sedeDefault?.nome ?? 'Sede'}</span> ·
              tutto il giorno in sede, nessun viaggio
            </span>
          </p>
        ),
      });
    }
    if (mostraPartenza) {
      tappe.push({
        key: 'partenza',
        nodo: <NodoLuogo tipo={vistaPartenza.tipo} allarme={vistaPartenza.mancante != null} />,
        nodoTop: 14,
        contenuto: (
          <CardEstremo
            vista={vistaPartenza}
            aperto={aperto === 'partenza'}
            disabled={pending}
            onApri={() => apriChiudi('partenza')}
            onScegli={(l) => scegliLuogo('partenza', l)}
            onMinuti={(m) => correggi('partenza', { minuti: m })}
            onMotivo={(t) => correggi('partenza', { motivo: t })}
          >
            {chipGuida('andata', true)}
          </CardEstremo>
        ),
      });
    }
    righe.forEach((r, i) => {
      const colore = coloreCantiere(i);
      tappe.push({
        key: `cantiere:${r.cantiereId}`,
        nodo: <NodoCantiere indice={i} />,
        nodoTop: compatto ? 8 : 7,
        contenuto: compatto ? (
          <div
            className={`border-border flex min-h-[38px] items-center gap-2 rounded-xl border border-l-4 ${colore.border} ${colore.tint} px-3`}
          >
            <span className="text-foreground min-w-0 flex-1 truncate text-[13px] font-semibold">
              {r.nome}
            </span>
            {/* Si segna l'eccezione, non la regola: fuori è «in sede», in
                ufficio è l'uscita dal cliente. Senza sede predefinita non c'è
                nessuna eccezione da segnare: la casella non esiste nemmeno. */}
            {(inUfficio ? sedeDefault != null && !r.daSede : r.daSede) ? (
              <span className="text-primary shrink-0 text-[10px] font-semibold uppercase tracking-wide">
                {inUfficio ? 'Dal cliente' : 'In sede'}
              </span>
            ) : null}
            <span className="text-muted-foreground shrink-0 font-mono text-xs font-semibold tabular-nums">
              {fmtHM(r.minuti)}
            </span>
          </div>
        ) : (
          <section
            className={`border-border rounded-2xl border border-l-4 ${colore.border} ${colore.tint} px-3 py-2 shadow-[0_4px_16px_-6px_rgba(20,40,90,0.20)]`}
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-foreground truncate text-sm font-semibold leading-tight">
                  {r.nome}
                </p>
                {r.codice ? (
                  <p className="text-muted-foreground mt-0.5 truncate font-mono text-[11px]">
                    {r.codice}
                  </p>
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
                className="text-muted-foreground hover:bg-muted hover:text-destructive -mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full active:scale-95 disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-xs font-medium">Ore lavorate</span>
              <StepperMin
                minuti={r.minuti}
                passo={passoMinuti}
                disabled={pending}
                onChange={(m) =>
                  setRighe((prev) => prev.map((x, j) => (j === i ? { ...x, minuti: m } : x)))
                }
              />
            </div>
            {sedeDefault ? (
              <label className="mt-1.5 flex cursor-pointer select-none items-center gap-2">
                <input
                  type="checkbox"
                  checked={inUfficio ? !r.daSede : r.daSede}
                  disabled={pending}
                  onChange={(e) =>
                    setRighe((prev) =>
                      prev.map((x, j) =>
                        j === i
                          ? { ...x, daSede: inUfficio ? !e.target.checked : e.target.checked }
                          : x,
                      ),
                    )
                  }
                  className="border-input accent-primary h-4 w-4 rounded"
                />
                <span className="text-muted-foreground text-xs">
                  {inUfficio ? 'Lavoro presso il cliente' : 'Lavoro dalla sede sul progetto'}
                </span>
              </label>
            ) : null}
          </section>
        ),
      });
      const tratta = vistaTratte[i];
      // Due lavori seguiti dallo stesso posto non hanno una tratta in mezzo. In
      // modalità ufficio è il caso normale di ogni giornata su più lavori: la
      // riga «Nella stessa sede · Nessun viaggio» sarebbe rumore, tappabile per
      // niente, sotto il nodo che lo dice già. Per chi lavora fuori resta dove
      // era. I dati non cambiano: il percorso si manda da `intermedie`.
      const fra = intermedie[i];
      const senzaTratta =
        inUfficio && fra != null && stessoPosto(luogoDi(fra.da), luogoDi(fra.a));
      if (tratta && !senzaTratta) {
        tappe.push({
          key: `tratta:${tratta.chiave}`,
          nodo: <NodoTratta />,
          nodoTop: 10,
          contenuto: (
            <TrattaFraCantieri
              vista={{
                ...tratta,
                mancante:
                  evidenzia && mancanti.includes(`motivo:tratta:${tratta.chiave}`)
                    ? 'motivo'
                    : null,
              }}
              aperto={aperto === `tratta:${tratta.chiave}`}
              disabled={pending}
              onApri={() => apriChiudi(`tratta:${tratta.chiave}`)}
              onScegli={(via) => {
                setPassaggi((p) => ({ ...p, [tratta.chiave]: passaggioDaVia(via) }));
              }}
              onMinuti={(m) => correggiTratta(tratta.chiave, { minuti: m })}
              onMotivo={(t) => correggiTratta(tratta.chiave, { motivo: t })}
            >
              {chipGuida(`tratta:${tratta.chiave}`, false)}
            </TrattaFraCantieri>
          ),
        });
      }
    });
    if (!compatto && disponibili.length > 0) {
      tappe.push({
        key: 'aggiungi',
        nodo: <NodoAggiungi />,
        nodoTop: 8,
        contenuto: (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={pending}
            className="border-muted-foreground/30 bg-muted/30 text-muted-foreground hover:bg-muted/50 flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-xl border border-dashed text-sm font-medium active:scale-[0.99] disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />{' '}
            {righe.length === 0 ? 'Aggiungi il cantiere' : 'Aggiungi cantiere'}
          </button>
        ),
      });
    }
    if (mostraRientro) {
      tappe.push({
        key: 'rientro',
        nodo: <NodoLuogo tipo={vistaRientro.tipo} allarme={vistaRientro.mancante != null} />,
        nodoTop: 14,
        contenuto: (
          <CardEstremo
            vista={vistaRientro}
            aperto={aperto === 'rientro'}
            disabled={pending}
            onApri={() => apriChiudi('rientro')}
            onScegli={(l) => scegliLuogo('rientro', l)}
            onMinuti={(m) => correggi('rientro', { minuti: m })}
            onMotivo={(t) => correggi('rientro', { motivo: t })}
          >
            {chipGuida('ritorno', true)}
          </CardEstremo>
        ),
      });
    }

    return (
      <ol>
        {tappe.map((tp, i) => (
          <Tappa
            key={tp.key}
            inizio={i === 0}
            fine={i === tappe.length - 1}
            nodoTop={tp.nodoTop}
            nodo={tp.nodo}
          >
            {tp.contenuto}
          </Tappa>
        ))}
      </ol>
    );
  }

  const conPartenza = andataMin > 0;
  const conRientro = ritornoMin > 0;
  const fineMostrata = assegnato > 0 ? fine : null;

  return (
    <Portal>
      <div
        className="bg-background fixed inset-0 z-[80] flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Registra giornata"
      >
        <div className="relative flex min-h-0 flex-1 flex-col">
          <header className="border-border flex shrink-0 items-center gap-2 border-b px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
            <button
              type="button"
              onClick={onClose}
              aria-label="Chiudi"
              className="text-muted-foreground hover:bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-full active:scale-95"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold leading-tight tracking-tight">
                Registra giornata
              </h2>
              <p className="text-muted-foreground truncate text-[11px] leading-tight first-letter:uppercase">
                {oggiEsteso} · senza timbrature
              </p>
            </div>
          </header>

          {fatto ? (
            /* ── Conferma "premium" ─────────────────────────────────────────── */
            <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
              <span className="relative flex h-16 w-16 items-center justify-center">
                <span
                  aria-hidden="true"
                  className="animate-success-glow absolute inset-[-45%] rounded-full bg-emerald-400/30 blur-xl"
                />
                <span
                  aria-hidden="true"
                  className="animate-success-ring absolute inset-0 rounded-full bg-emerald-400/40"
                />
                <span
                  aria-hidden="true"
                  className="animate-success-ring absolute inset-0 rounded-full border-2 border-emerald-500/50 [animation-delay:0.16s]"
                />
                <span className="animate-success-pop relative flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 shadow-[0_8px_24px_-6px_rgba(16,185,129,0.5)]">
                  <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
                </span>
              </span>
              <div className="animate-fade-up space-y-1">
                <p className="text-foreground text-lg font-semibold">Giornata registrata</p>
                <p className="text-muted-foreground text-sm tabular-nums">
                  Lavoro {fmtHM(assegnato)}
                  {viaggioTotaleMin > 0 ? ` · Viaggio ${fmtHM(viaggioTotaleMin)}` : ''}
                </p>
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden px-4 pb-5 pt-2.5">
              {/* ── La giornata: inizio, fine calcolata, pausa ─────────────────── */}
              <section className="border-primary/25 from-primary/[0.06] shadow-soft space-y-2 rounded-2xl border-2 bg-gradient-to-b to-transparent px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="bg-primary/12 text-primary flex h-6 w-6 shrink-0 items-center justify-center rounded-md">
                      <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <span className="text-foreground text-sm font-semibold">La giornata</span>
                  </span>
                  <span className="flex items-baseline gap-1.5 leading-none">
                    <span className="text-muted-foreground font-mono text-[9px] uppercase tracking-[0.14em]">
                      Lavoro
                    </span>
                    <span className="text-primary font-mono text-base font-bold tabular-nums">
                      {fmtHM(assegnato)}
                    </span>
                  </span>
                </div>

                {/* Inizio / Fine: 2 colonne 50/50 (min-w-0 sui grid item, così il
                    time nativo iOS non allarga la traccia). */}
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
                  <TimeField
                    label="Inizio lavoro"
                    value={inizio}
                    onChange={setInizio}
                    disabled={pending}
                  />
                  <FineCalcolata ora={fineMostrata} />
                </div>
                <p
                  className="text-muted-foreground -mt-0.5 line-clamp-2 h-[2.75em] text-[11px] leading-snug"
                  aria-live="polite"
                >
                  {fineMostrata ? (
                    <>
                      <span className="tabular-nums">{inizio}</span> + {fmtHM(assegnato)} di lavoro
                      {pausaMin > 0 ? (
                        <>
                          {' '}
                          + <span className="text-amber-700">{fmtHM(pausaMin)} di pausa</span>
                        </>
                      ) : null}
                      {trasferimentiMin > 0 ? (
                        <>
                          {' '}
                          +{' '}
                          <span className="text-sky-700">{fmtHM(trasferimentiMin)} di tratte</span>
                        </>
                      ) : null}
                      {' = '}
                      <span className="text-foreground font-semibold tabular-nums">
                        {fineMostrata}
                      </span>
                    </>
                  ) : (
                    'La fine si calcola dalle ore dei cantieri, dalla pausa e dalle tratte fra cantieri.'
                  )}
                </p>

                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-amber-700">
                    <Coffee className="h-3 w-3" aria-hidden="true" /> Pausa pranzo
                  </label>
                  <SceltaPausaPranzo
                    valore={pausaMin}
                    onChange={setPausaMin}
                    conNessuna
                    disabled={pending}
                    tono="tenue"
                  />
                </div>
              </section>

              {/* ── Il percorso: partenza, cantieri e tratte, rientro ────────── */}
              <section className="space-y-2" aria-label="Il percorso">
                <p className="text-muted-foreground px-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
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
                className="animate-sheet-up bg-background relative flex max-h-[calc(100%-2.5rem)] flex-col overflow-hidden rounded-t-[28px] shadow-[0_-24px_48px_-16px_rgba(15,23,42,0.45)]"
              >
                <div className="shrink-0 px-4 pb-2.5 pt-2">
                  <span
                    aria-hidden="true"
                    className="bg-muted-foreground/25 mx-auto mb-2 block h-1 w-10 rounded-full"
                  />
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                      <Car className="h-[18px] w-[18px]" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-foreground text-[15px] font-semibold leading-tight">
                        Il viaggio
                      </h3>
                      <p className="text-muted-foreground mt-0.5 text-xs leading-snug">
                        Partenza, rientro e chi guidava su ogni tratta.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFoglio(false)}
                      aria-label="Torna alla giornata"
                      className="text-muted-foreground hover:bg-muted -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full active:scale-95"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                <div className="border-border/70 min-h-0 flex-1 overflow-y-auto overflow-x-hidden border-t px-4 pb-4 pt-3">
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
          <div className="relative z-30 shrink-0 border-t border-emerald-600/15 bg-emerald-50 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_28px_-14px_rgba(20,40,90,0.35)]">
            <BarraGiornata
              segmenti={segmenti}
              lavoroMin={assegnato}
              pausaMin={pausaMin}
              viaggioMin={viaggioTotaleMin}
              viaggioNoto={viaggioNoto}
              sinistra={
                conPartenza
                  ? { etichetta: 'Partenza', ora: spostaOrario(inizio, -andataMin) }
                  : { etichetta: 'Inizio', ora: inizio }
              }
              destra={
                !fineMostrata
                  ? { etichetta: 'Fine', ora: '--:--' }
                  : conRientro
                    ? { etichetta: 'Rientro', ora: spostaOrario(fineMostrata, ritornoMin) }
                    : { etichetta: 'Fine', ora: fineMostrata }
              }
            />
            {errore ? (
              <p
                role="alert"
                className="border-destructive/30 bg-destructive/10 text-destructive mt-2 rounded-lg border px-3 py-1.5 text-xs leading-snug"
              >
                {errore}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void salva()}
              disabled={pending}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-[15px] font-semibold text-white shadow-[0_8px_24px_-8px_rgba(16,185,129,0.6)] transition-transform hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-50"
            >
              {pending ? (
                <Loader2 className="h-[18px] w-[18px] animate-spin" />
              ) : (
                <CheckCircle2 className="h-[18px] w-[18px]" aria-hidden="true" />
              )}
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

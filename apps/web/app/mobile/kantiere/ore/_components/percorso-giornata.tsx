'use client';

import * as React from 'react';
import {
  BedDouble,
  Building2,
  Car,
  Check,
  CheckCircle2,
  ChevronDown,
  Home,
  Loader2,
  MapPin,
  Minus,
  Plus,
} from 'lucide-react';

import { MEZZO_NON_IN_ELENCO, type Estremo, type SegmentoBarra } from '@kommessa/api/kantiere-percorso';

/**
 * I pezzi del percorso di «Registra giornata»: partenza e rientro, guida e
 * mezzo, le tratte fra cantieri, la barra dei tempi.
 *
 * Solo presentazione. Lo stato vive nel dialog, che usa questi pezzi due volte
 * con gli stessi dati: nella pagina e nel foglio «Il viaggio». Quello che si
 * sceglie in un posto si ritrova identico nell'altro.
 */

// ── formati ─────────────────────────────────────────────────────────────────

/** "H:MM" da minuti (valori di una giornata). */
export function fmtHM(min: number): string {
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** "8,5 km" sotto i 10 km, "34 km" sopra. */
export function fmtKm(km: number | null | undefined): string | null {
  if (km == null) return null;
  const v =
    km < 10
      ? km.toLocaleString('it-IT', { maximumFractionDigits: 1 })
      : Math.round(km).toLocaleString('it-IT');
  return `${v} km`;
}

// ── colori dei cantieri ─────────────────────────────────────────────────────
// Lo STESSO colore tinge il segmento nella barra, il pallino sul percorso e il
// bordo della card: «questo cantiere = questa fetta di giornata». Classi come
// stringhe letterali, così il JIT di Tailwind le include.

const CANTIERE_COLORS = [
  { bar: 'bg-primary', border: 'border-l-primary', tint: 'bg-primary/[0.045]' },
  { bar: 'bg-teal-500', border: 'border-l-teal-500', tint: 'bg-teal-500/[0.06]' },
  { bar: 'bg-indigo-500', border: 'border-l-indigo-500', tint: 'bg-indigo-500/[0.06]' },
  { bar: 'bg-amber-500', border: 'border-l-amber-500', tint: 'bg-amber-500/[0.07]' },
  { bar: 'bg-sky-500', border: 'border-l-sky-500', tint: 'bg-sky-500/[0.06]' },
  { bar: 'bg-rose-500', border: 'border-l-rose-500', tint: 'bg-rose-500/[0.06]' },
];

export function coloreCantiere(i: number) {
  return CANTIERE_COLORS[i % CANTIERE_COLORS.length] ?? CANTIERE_COLORS[0]!;
}

/** Tratteggio azzurro del viaggio: stesso segno nella barra e sul percorso. */
const RIGHE_VIAGGIO = 'repeating-linear-gradient(135deg, #38bdf8 0 4px, #7dd3fc 4px 8px)';

// ── tipi della vista ────────────────────────────────────────────────────────

export type StatoStima =
  | { stato: 'nessuna' }
  | { stato: 'arrivo' }
  | { stato: 'ok'; minuti: number | null; km: number | null };

export type TipoLuogo = 'casa' | 'sede' | 'hotel';

export interface OpzioneLuogo {
  valore: string;
  luogo: Estremo;
  nome: string;
  tipo: TipoLuogo;
}

export interface VistaEstremo {
  titolo: string;
  segnaposto: string;
  scelta: string | null;
  nome: string | null;
  tipo: TipoLuogo | null;
  opzioni: OpzioneLuogo[];
  stima: StatoStima;
  /** Minuti che verranno registrati (la correzione vince sulla stima). */
  minuti: number;
  corretta: boolean;
  motivo: string;
  mancante: 'luogo' | 'tempo' | 'motivo' | null;
  /** Senza cantieri non c'è una tratta da stimare. */
  senzaCantiere: boolean;
}

export interface VistaTratta {
  chiave: string;
  daNome: string;
  aNome: string;
  scelta: string;
  titolo: string;
  stima: StatoStima;
  opzioni: { via: string; titolo: string; dettaglio: string }[];
}

export interface MezzoOpzione {
  id: string;
  targa: string;
  modello: string | null;
}

// ── il binario del percorso ─────────────────────────────────────────────────

/**
 * Una tappa del percorso: il pallino sul binario a sinistra e il contenuto a
 * destra. La linea è fatta di pezzi, uno per tappa, così resta continua anche
 * quando una card si apre e cambia altezza.
 */
export function Tappa({
  nodo,
  nodoTop,
  inizio,
  fine,
  children,
}: {
  nodo: React.ReactNode;
  /** Distanza del pallino (alto 24px) dal bordo alto della tappa. */
  nodoTop: number;
  inizio?: boolean;
  fine?: boolean;
  children: React.ReactNode;
}) {
  const centro = nodoTop + 12;
  return (
    <li className={`relative pl-[36px] ${fine ? '' : 'pb-2'}`}>
      <span
        aria-hidden="true"
        className="absolute left-[11px] border-l-2 border-dashed border-sky-300"
        style={inizio ? { top: centro, bottom: 0 } : fine ? { top: 0, height: centro } : { top: 0, bottom: 0 }}
      />
      <span className="absolute left-0" style={{ top: nodoTop }}>
        {nodo}
      </span>
      {children}
    </li>
  );
}

const ICONA_LUOGO = { casa: Home, sede: Building2, hotel: BedDouble } as const;

export function NodoLuogo({ tipo, allarme }: { tipo: TipoLuogo | null; allarme?: boolean }) {
  const Icona = tipo ? ICONA_LUOGO[tipo] : MapPin;
  return (
    <span
      className={`flex h-6 w-6 items-center justify-center rounded-full border-2 bg-background ring-4 ring-background ${
        allarme
          ? 'border-amber-400 text-amber-600'
          : tipo
            ? 'border-sky-500 text-sky-600'
            : 'border-dashed border-muted-foreground/45 text-muted-foreground'
      }`}
    >
      <Icona className="h-3 w-3" aria-hidden="true" />
    </span>
  );
}

export function NodoCantiere({ indice }: { indice: number }) {
  return (
    <span
      className={`flex h-6 w-6 items-center justify-center rounded-full ${coloreCantiere(indice).bar} text-[11px] font-bold text-white ring-4 ring-background`}
    >
      {indice + 1}
    </span>
  );
}

export function NodoTratta() {
  return (
    <span className="ml-[3px] flex h-[18px] w-[18px] items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-sky-600 ring-[3px] ring-background">
      <Car className="h-2.5 w-2.5" aria-hidden="true" />
    </span>
  );
}

export function NodoAggiungi() {
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-muted-foreground/45 bg-background text-muted-foreground ring-4 ring-background">
      <Plus className="h-3 w-3" aria-hidden="true" />
    </span>
  );
}

// ── partenza e rientro ──────────────────────────────────────────────────────

function IconaOpzione({ tipo, attiva }: { tipo: TipoLuogo; attiva: boolean }) {
  const Icona = ICONA_LUOGO[tipo];
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
        attiva ? 'bg-sky-100 text-sky-700' : 'border border-border bg-background text-muted-foreground'
      }`}
    >
      <Icona className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  );
}

/** A destra della card: tempo e km della tratta, o cosa manca. */
function TempoTratta({ vista }: { vista: VistaEstremo }) {
  if (vista.tipo === 'casa') {
    return <span className="shrink-0 text-[11px] font-medium text-muted-foreground">Nessun viaggio</span>;
  }
  if (vista.tipo == null || vista.senzaCantiere) return null;
  if (vista.stima.stato === 'arrivo') {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Stima
      </span>
    );
  }
  if (vista.minuti <= 0) {
    return (
      <span className={`shrink-0 text-[11px] font-semibold ${vista.mancante ? 'text-amber-700' : 'text-muted-foreground'}`}>
        Indica il tempo
      </span>
    );
  }
  const km = vista.stima.stato === 'ok' ? fmtKm(vista.stima.km) : null;
  const sotto = [km, vista.corretta ? 'modificato' : null].filter(Boolean).join(' · ');
  return (
    <span className="flex shrink-0 flex-col items-end leading-none">
      <span className="font-mono text-sm font-bold tabular-nums text-sky-700">{fmtHM(vista.minuti)}</span>
      {sotto ? <span className="mt-1 text-[10px] tabular-nums text-muted-foreground">{sotto}</span> : null}
    </span>
  );
}

const PASSO_VIAGGIO = 5;

function EditorTempo({
  vista,
  disabled,
  onMinuti,
  onMotivo,
}: {
  vista: VistaEstremo;
  disabled?: boolean;
  onMinuti: (m: number) => void;
  onMotivo: (t: string) => void;
}) {
  const s = vista.stima;
  const stima =
    s.stato === 'arrivo'
      ? 'Stima in corso'
      : s.stato === 'ok' && s.minuti != null
        ? ['Stima', fmtHM(s.minuti), fmtKm(s.km)].filter(Boolean).join(' · ').replace('Stima · ', 'Stima ')
        : 'Stima non disponibile';
  const btn =
    'flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-border bg-background text-foreground active:scale-95 disabled:opacity-40';
  return (
    <div className="space-y-2 border-t border-border/70 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">Tempo di viaggio</p>
          <p className="truncate text-[11px] text-muted-foreground">{stima}</p>
        </div>
        <div
          className={`flex shrink-0 items-center gap-1 rounded-xl border p-1 ${
            vista.mancante === 'tempo' ? 'border-amber-400 bg-amber-50' : 'border-border bg-muted/30'
          }`}
        >
          <button
            type="button"
            className={btn}
            disabled={disabled || vista.minuti <= 0}
            onClick={() => onMinuti(Math.max(0, vista.minuti - PASSO_VIAGGIO))}
            aria-label={`Meno ${PASSO_VIAGGIO} minuti`}
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-12 text-center font-mono text-base font-bold tabular-nums text-foreground">
            {fmtHM(vista.minuti)}
          </span>
          <button
            type="button"
            className={btn}
            disabled={disabled}
            onClick={() => onMinuti(vista.minuti + PASSO_VIAGGIO)}
            aria-label={`Più ${PASSO_VIAGGIO} minuti`}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
      {vista.corretta || vista.mancante === 'motivo' ? (
        <input
          type="text"
          value={vista.motivo}
          onChange={(e) => onMotivo(e.target.value)}
          maxLength={200}
          disabled={disabled}
          placeholder="Motivo della modifica, es. traffico"
          className={`w-full rounded-lg border bg-background px-3 py-2 text-base focus:border-primary focus:outline-none ${
            vista.mancante === 'motivo' ? 'border-amber-400' : 'border-border'
          }`}
        />
      ) : null}
    </div>
  );
}

/**
 * Partenza o rientro: una card che si apre come un menu. Dentro, i luoghi
 * ammessi (abitazione privata, sede predefinita, sedi del cantiere) e, per una
 * sede, il tempo di viaggio con la stima.
 */
export function CardEstremo({
  vista,
  aperto,
  disabled,
  onApri,
  onScegli,
  onMinuti,
  onMotivo,
  children,
}: {
  vista: VistaEstremo;
  aperto: boolean;
  disabled?: boolean;
  onApri: () => void;
  onScegli: (luogo: Estremo) => void;
  onMinuti: (m: number) => void;
  onMotivo: (t: string) => void;
  children?: React.ReactNode;
}) {
  const inViaggio = vista.tipo === 'sede' || vista.tipo === 'hotel';
  const allarme = vista.mancante != null;
  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-card shadow-[0_4px_16px_-8px_rgba(20,40,90,0.28)] transition-shadow ${
        allarme ? 'border-amber-400 ring-2 ring-amber-300/50' : 'border-border'
      }`}
    >
      <button
        type="button"
        onClick={onApri}
        disabled={disabled}
        aria-expanded={aperto}
        className="flex min-h-[54px] w-full items-center gap-2.5 px-3 py-2 text-left transition-colors active:bg-muted/40 disabled:opacity-60"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {vista.titolo}
          </span>
          <span
            className={`mt-0.5 block truncate text-[15px] font-semibold leading-tight ${
              vista.nome ? 'text-foreground' : allarme ? 'text-amber-700' : 'text-muted-foreground/80'
            }`}
          >
            {vista.nome ?? vista.segnaposto}
          </span>
        </span>
        <TempoTratta vista={vista} />
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${aperto ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {aperto ? (
        <div className="animate-fade-up border-t border-border/70 bg-muted/25">
          <ul className="py-1" role="listbox" aria-label={vista.titolo}>
            {vista.opzioni.map((o) => {
              const sel = vista.scelta === o.valore;
              return (
                <li key={o.valore}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={sel}
                    disabled={disabled}
                    onClick={() => onScegli(o.luogo)}
                    className="flex min-h-[46px] w-full items-center gap-2.5 px-3 text-left transition-colors active:bg-muted/70"
                  >
                    <IconaOpzione tipo={o.tipo} attiva={sel} />
                    <span className={`min-w-0 flex-1 truncate text-sm text-foreground ${sel ? 'font-semibold' : 'font-medium'}`}>
                      {o.nome}
                    </span>
                    <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {o.tipo === 'casa' ? 'Nessun viaggio' : o.tipo === 'hotel' ? 'Hotel' : 'Sede'}
                    </span>
                    <Check className={`h-4 w-4 shrink-0 text-primary ${sel ? '' : 'invisible'}`} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
          {inViaggio && vista.senzaCantiere ? (
            <p className="border-t border-border/70 px-3 py-2 text-[11px] text-muted-foreground">
              Aggiungi un cantiere per calcolare km e tempo.
            </p>
          ) : inViaggio ? (
            <EditorTempo vista={vista} disabled={disabled} onMinuti={onMinuti} onMotivo={onMotivo} />
          ) : null}
        </div>
      ) : null}

      {children}
    </div>
  );
}

// ── guida e mezzo ───────────────────────────────────────────────────────────

/**
 * «Guidavo io» e il mezzo: si dicono una volta e valgono per tutte le tratte
 * della giornata. Il mezzo si sceglie con il selettore del telefono (sull'iPhone
 * la rotella), che con quindici furgoni è più comodo di qualsiasi elenco.
 */
export function RigaGuida({
  autista,
  mezzo,
  mezzi,
  ultimoMezzoId,
  mancaMezzo,
  evidenza,
  disabled,
  onAutista,
  onMezzo,
}: {
  autista: boolean;
  mezzo: string | null;
  mezzi: MezzoOpzione[];
  ultimoMezzoId: string | null;
  mancaMezzo: boolean;
  /**
   * Ancora della conferma «hai viaggiato da passeggero?» e se evidenziare la
   * riga. L'alone è interno: un anello esterno verrebbe tagliato dalla card.
   */
  evidenza?: { ref: React.Ref<HTMLDivElement>; attiva: boolean };
  disabled?: boolean;
  onAutista: (on: boolean) => void;
  onMezzo: (id: string | null) => void;
}) {
  const scelto = mezzi.find((m) => m.id === mezzo);
  const etichetta =
    mezzo === MEZZO_NON_IN_ELENCO
      ? 'Mezzo non in elenco'
      : scelto
        ? `${scelto.targa}${scelto.modello ? ` · ${scelto.modello}` : ''}`
        : 'Scegli il mezzo';
  return (
    <div
      ref={evidenza?.ref}
      className={`border-t border-border/70 px-3 pb-1 transition-colors ${
        evidenza?.attiva ? 'bg-amber-50 shadow-[inset_0_0_0_2px_#f59e0b]' : ''
      }`}
    >
      <button
        type="button"
        role="switch"
        aria-checked={autista}
        disabled={disabled}
        onClick={() => onAutista(!autista)}
        className="flex min-h-[48px] w-full items-center gap-2.5 text-left"
      >
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
            autista ? 'bg-sky-100 text-sky-700' : 'bg-muted text-muted-foreground'
          }`}
        >
          <Car className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">Guidavo io</span>
          <span className="block truncate text-[11px] leading-tight text-muted-foreground">
            {autista ? 'Vale per tutte le tratte della giornata' : 'Spento: risulti passeggero'}
          </span>
        </span>
        <span
          aria-hidden="true"
          className={`relative inline-flex h-[26px] w-[46px] shrink-0 items-center rounded-full transition-colors ${
            autista ? 'bg-sky-600' : 'bg-muted-foreground/30'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
              autista ? 'translate-x-[23px]' : 'translate-x-[3px]'
            }`}
          />
        </span>
      </button>

      {autista && mezzi.length > 0 ? (
        <div className="relative mb-2">
          <div
            aria-hidden="true"
            className={`flex min-h-[44px] items-center gap-2 rounded-xl border px-3 text-sm ${
              mancaMezzo
                ? 'border-amber-400 bg-amber-50 font-medium text-amber-800'
                : scelto || mezzo === MEZZO_NON_IN_ELENCO
                  ? 'border-border bg-background font-medium text-foreground'
                  : 'border-dashed border-muted-foreground/40 bg-background text-muted-foreground'
            }`}
          >
            <span className="min-w-0 flex-1 truncate">{etichetta}</span>
            {scelto && scelto.id === ultimoMezzoId ? (
              <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Ultimo usato
              </span>
            ) : null}
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
          <select
            value={mezzo ?? ''}
            disabled={disabled}
            onChange={(e) => onMezzo(e.target.value || null)}
            aria-label="Mezzo"
            className="absolute inset-0 h-full w-full cursor-pointer text-base opacity-0"
          >
            <option value="" disabled>
              Scegli il mezzo
            </option>
            {mezzi.map((m) => (
              <option key={m.id} value={m.id}>
                {m.targa}
                {m.modello ? ` · ${m.modello}` : ''}
                {m.id === ultimoMezzoId ? ' (ultimo usato)' : ''}
              </option>
            ))}
            <option value={MEZZO_NON_IN_ELENCO}>Mezzo non in elenco</option>
          </select>
        </div>
      ) : null}
    </div>
  );
}

// ── tratta fra due cantieri ─────────────────────────────────────────────────

/**
 * La tratta fra due cantieri: una riga piccola con km e tempo calcolati, che si
 * apre come un menu per dire che non era diretta. La useranno in pochi.
 */
export function TrattaFraCantieri({
  vista,
  aperto,
  disabled,
  onApri,
  onScegli,
}: {
  vista: VistaTratta;
  aperto: boolean;
  disabled?: boolean;
  onApri: () => void;
  onScegli: (via: string) => void;
}) {
  const s = vista.stima;
  const destra =
    s.stato === 'nessuna' ? (
      <span className="text-muted-foreground">Nessun viaggio</span>
    ) : s.stato === 'arrivo' ? (
      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Stima in corso" />
    ) : s.minuti == null ? (
      <span className="text-muted-foreground">Senza stima</span>
    ) : (
      <span className="font-semibold tabular-nums text-sky-700">
        {[fmtKm(s.km), fmtHM(s.minuti)].filter(Boolean).join(' · ')}
      </span>
    );
  return (
    <div>
      <button
        type="button"
        onClick={onApri}
        disabled={disabled}
        aria-expanded={aperto}
        className={`flex min-h-[40px] w-full items-center gap-2 rounded-xl px-2.5 text-left text-xs transition-colors active:bg-sky-50 disabled:opacity-60 ${
          aperto ? 'bg-sky-50' : ''
        }`}
      >
        <span className="min-w-0 flex-1 truncate font-medium text-muted-foreground">{vista.titolo}</span>
        <span className="shrink-0">{destra}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${aperto ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {aperto ? (
        <div className="animate-fade-up mt-1 overflow-hidden rounded-xl border border-border bg-card shadow-[0_8px_22px_-10px_rgba(20,40,90,0.35)]">
          <p className="line-clamp-2 px-3 pb-1 pt-2.5 text-[11px] leading-snug text-muted-foreground">
            Da <span className="font-semibold text-foreground">{vista.daNome}</span> a{' '}
            <span className="font-semibold text-foreground">{vista.aNome}</span>
          </p>
          <ul className="pb-1" role="listbox" aria-label="Come sei passato da un cantiere all'altro">
            {vista.opzioni.map((o) => {
              const sel = o.via === vista.scelta;
              return (
                <li key={o.via}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={sel}
                    disabled={disabled}
                    onClick={() => onScegli(o.via)}
                    className="flex min-h-[46px] w-full items-center gap-2.5 px-3 text-left transition-colors active:bg-muted/60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm text-foreground ${sel ? 'font-semibold' : 'font-medium'}`}>
                        {o.titolo}
                      </span>
                      {o.dettaglio ? (
                        <span className="block truncate text-[11px] text-muted-foreground">{o.dettaglio}</span>
                      ) : null}
                    </span>
                    <Check className={`h-4 w-4 shrink-0 text-primary ${sel ? '' : 'invisible'}`} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="border-t border-border/70 bg-muted/25 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
            Il tempo fra un cantiere e l&apos;altro è già compreso nell&apos;orario di lavoro.
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ── la barra dei tempi ──────────────────────────────────────────────────────

export type StatoLavoro = 'vuoto' | 'completa' | 'restano' | 'troppo';

/** "45 min" / "1 h" / "1 h 30 min", per il residuo da assegnare. */
function fmtDurataUmana(min: number): string {
  const tot = Math.max(0, Math.round(min));
  const h = Math.floor(tot / 60);
  const m = tot % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/**
 * La giornata da un capo all'altro: viaggio d'andata, lavoro sui cantieri con
 * la pausa, viaggio di ritorno. Sotto, gli orari agli estremi: partenza e
 * rientro quando il viaggio c'è, inizio e fine lavoro altrimenti.
 */
export function BarraGiornata({
  segmenti,
  assegnatoMin,
  nettoMin,
  stato,
  restanoMin,
  viaggioMin,
  viaggioNoto,
  sinistra,
  destra,
}: {
  segmenti: SegmentoBarra[];
  assegnatoMin: number;
  nettoMin: number;
  stato: StatoLavoro;
  restanoMin: number;
  viaggioMin: number;
  viaggioNoto: boolean;
  sinistra: { etichetta: string; ora: string };
  destra: { etichetta: string; ora: string };
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border bg-card px-3 pb-2.5 pt-2.5 shadow-[0_6px_18px_-5px_rgba(20,40,90,0.28)]">
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-baseline gap-1.5">
          <span className="text-[15px] font-bold tabular-nums text-foreground">{fmtHM(assegnatoMin)}</span>
          <span className="truncate text-xs text-muted-foreground">di {fmtHM(Math.max(0, nettoMin))} di lavoro</span>
        </p>
        {stato === 'vuoto' ? (
          <span className="shrink-0 text-xs font-semibold text-muted-foreground">Assegna le ore</span>
        ) : stato === 'completa' ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Completa
          </span>
        ) : stato === 'restano' ? (
          <span className="shrink-0 text-xs font-semibold text-amber-600">Restano {fmtDurataUmana(restanoMin)}</span>
        ) : (
          <span className="shrink-0 text-xs font-semibold text-amber-600">{fmtDurataUmana(-restanoMin)} di troppo</span>
        )}
      </div>

      <div className="flex h-3 w-full items-stretch gap-[2px] overflow-hidden rounded-full bg-muted" aria-hidden="true">
        {segmenti.map((s, i) => (
          <span
            key={i}
            className={`min-w-[3px] ${
              s.tipo === 'cantiere'
                ? coloreCantiere(s.indice).bar
                : s.tipo === 'pausa'
                  ? 'bg-slate-300'
                  : s.tipo === 'da_assegnare'
                    ? 'rounded-sm border border-dashed border-amber-400 bg-amber-50'
                    : ''
            }`}
            style={{
              flexGrow: s.minuti,
              flexBasis: 0,
              ...(s.tipo === 'andata' || s.tipo === 'ritorno' ? { backgroundImage: RIGHE_VIAGGIO } : null),
            }}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="tabular-nums">
          {sinistra.etichetta} <span className="font-semibold text-foreground">{sinistra.ora}</span>
        </span>
        <span
          className={`inline-flex items-center gap-1 font-semibold ${viaggioNoto ? 'text-sky-700' : 'text-muted-foreground'}`}
        >
          <Car className="h-3 w-3" aria-hidden="true" />
          {viaggioNoto ? `Viaggio ${fmtHM(viaggioMin)}` : 'Viaggio da indicare'}
        </span>
        <span className="tabular-nums">
          {destra.etichetta} <span className="font-semibold text-foreground">{destra.ora}</span>
        </span>
      </div>
    </div>
  );
}

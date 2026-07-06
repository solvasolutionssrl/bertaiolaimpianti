'use client';

import { useEffect, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Car, Loader2, Utensils, X, Home, Plus, Minus } from 'lucide-react';
import { Button } from '@kommessa/ui';
import {
  CantiereSearchSheet,
  type PickerCantiere,
} from '@/app/mobile/kantiere/_components/cantiere-picker';
import { titoloCase } from '@/app/mobile/_lib/display-case';

/** Sentinel: "rientro a casa" → nessun viaggio di lavoro (0 km, 0 tempo). */
const CASA_ID = '__casa__';

// ─── tipi ─────────────────────────────────────────────────────────────────────

export interface ViaggioRitornoSede {
  id: string;
  nome: string;
  tipo: string;
}

export interface ViaggioRitornoMezzo {
  id: string;
  targa: string;
  modello: string | null;
}

/** Payload viaggio inviato al server (direzione 'ritorno' è implicita lato action). */
export interface ViaggioRitornoPayload {
  sedeId: string;
  durataStimataMin: number | null;
  durataConfermataMin: number;
  giustificazione?: string;
  autista: boolean;
  mezzoId: string | null;
  distanzaKm: number | null;
}

export interface ViaggioRitornoConfirm {
  viaggio: ViaggioRitornoPayload | null;
  pausaPranzoMin?: 30 | 45 | 60;
  /** Split "cosa hai fatto oggi": ore per cantiere (somma = netto). */
  split?: { cantiereId: string; minuti: number }[];
}

/** Contesto per lo split "cosa hai fatto oggi" (solo giornata pulita, self). */
export interface SplitContesto {
  /** Chiusura (snapshot ISO) e inizio turno → netto = (chiusura-inizio)-pausa. */
  closeIso: string;
  inizioIso: string;
  cantiereCorrente: { id: string; nome: string };
  cantieri: PickerCantiere[];
  /** Tolleranza (min) sulla somma: se |restano| ≤ tolleranza si salva (l'ultimo
   *  cantiere assorbe il piccolo resto), così i minuti dispari non bloccano. */
  tolleranzaMin: number;
  /** Passo (min) dei +/- dello stepper. */
  passoMinuti: number;
}

export interface ViaggioRitornoDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cantiereId: string;
  sedi: ViaggioRitornoSede[];
  sedeDefaultId: string | null;
  mezzi: ViaggioRitornoMezzo[];
  /** Se presente, mostra il box "pausa pranzo non rilevata" (durata turno in min). */
  pausaPrompt: { durataMin: number } | null;
  /** Titolo opzionale (es. wizard caposquadra "Rientro 2 di 4 · Mario Rossi"). */
  intestazione?: string;
  /** Se presente, offre lo split "cosa hai fatto oggi" (solo self, giornata pulita). */
  splitContesto?: SplitContesto | null;
  onConfirm: (
    payload: ViaggioRitornoConfirm,
  ) => Promise<{ ok: boolean; error?: string }>;
}

// ─── format ────────────────────────────────────────────────────────────────────

function formatKm(km: number | null): string {
  if (km === null) return 'km n.d.';
  return `${km.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

function formatDurata(min: number): string {
  if (min <= 0) return '0min';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

function tipoSedeLabel(tipo: string): string {
  switch (tipo) {
    case 'sede_principale':
    case 'sede_secondaria':
      return 'Sede';
    case 'hotel':
      return 'Hotel';
    default:
      return '';
  }
}

/** minuti → "H:MM". */
function fmtHM(min: number): string {
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** Stepper minuti compatto: input H:MM editabile + −/+ passo (per lo split). */
function MinutiStepper({
  minuti,
  passo = 15,
  disabled,
  onChange,
}: {
  minuti: number;
  passo?: number;
  disabled?: boolean;
  onChange: (m: number) => void;
}) {
  const h = Math.floor(minuti / 60);
  const m = minuti % 60;
  const set = (nh: number, nm: number) => onChange(Math.max(0, Math.min(23 * 60 + 59, nh * 60 + nm)));
  const inputCls =
    'w-9 rounded border border-border bg-background px-0.5 py-1 text-center font-mono text-sm font-semibold tabular-nums focus:border-primary focus:outline-none disabled:opacity-50';
  const btnCls =
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground active:scale-95 disabled:opacity-40';
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
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
      <span className="text-[11px] font-semibold text-muted-foreground">h</span>
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
      <span className="text-[11px] font-semibold text-muted-foreground">min</span>
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

// ─── mappa errori ───────────────────────────────────────────────────────────────

function messaggioErrore(code: string): string {
  switch (code) {
    case 'SEDE_NON_VALIDA':
      return 'Sede di partenza non valida. Riprova.';
    case 'GIUSTIFICAZIONE_RICHIESTA':
      return 'Hai modificato la stima: inserisci una giustificazione.';
    case 'MEZZO_NON_VALIDA':
    case 'MEZZO_NON_VALIDO':
      return 'Mezzo non valido. Riprova.';
    case 'AZIONE_NON_VALIDA':
      return 'Il turno è cambiato nel frattempo. Ricarica la pagina e riprova.';
    case 'ORA_NON_VALIDA':
      return "L'ora deve essere di oggi e dopo l'ultima timbratura.";
    case 'NESSUN_TURNO_APERTO':
      return 'Nessun turno aperto.';
    case 'SPLIT_NON_APPLICABILE':
      return 'La giornata non è più divisibile (è cambiata nel frattempo). Ricarica la pagina.';
    case 'SPLIT_SOMMA':
    case 'SPLIT_NETTO':
      return 'Le ore dei cantieri non tornano col totale della giornata. Ricontrolla.';
    case 'SPLIT_PRIMO_CANTIERE':
      return 'Errore nella divisione. Ricarica la pagina e riprova.';
    case 'CANTIERE_NON_VALIDO':
      return 'Un cantiere selezionato non è valido. Riprova.';
    default:
      return 'Operazione non riuscita. Riprova.';
  }
}

// ─── componente ─────────────────────────────────────────────────────────────────

/**
 * Bottom sheet "Viaggio di ritorno + pausa" per il termina turno IN-APP.
 *
 * Presentazionale: raccoglie sede di ritorno, stima viaggio (con ±5 e
 * giustificazione se modificata), autista + mezzo, e l'eventuale pausa pranzo
 * dichiarata, poi emette tutto via `onConfirm`. NON chiama direttamente l'action:
 * il chiamante decide cosa farne (così è riusabile anche dal flusso capo).
 *
 * Replica fedele del box viaggio del QR (`/t/[token]`), ma emesso via callback.
 */
export function ViaggioRitornoDialog({
  open,
  onOpenChange,
  cantiereId,
  sedi,
  sedeDefaultId,
  mezzi,
  pausaPrompt,
  intestazione,
  splitContesto,
  onConfirm,
}: ViaggioRitornoDialogProps) {
  const usaViaggio = sedi.length > 0;

  const [isPending, startTransition] = useTransition();
  const [erroreMsg, setErroreMsg] = useState<string | null>(null);
  const [errLocale, setErrLocale] = useState<string | null>(null);

  // Split "cosa hai fatto oggi" (solo se splitContesto presente).
  const [dividi, setDividi] = useState(false);
  const [righeSplit, setRigheSplit] = useState<{ cantiereId: string; nome: string; minuti: number }[]>([]);
  const [pickerSplitOpen, setPickerSplitOpen] = useState(false);

  // Viaggio
  const [sedeId, setSedeId] = useState<string>(sedeDefaultId ?? sedi[0]?.id ?? '');
  const [stimaMin, setStimaMin] = useState<number | null>(null);
  const [stimaKm, setStimaKm] = useState<number | null>(null);
  const [stimaLoading, setStimaLoading] = useState(false);
  const [confermMin, setConfermMin] = useState<number>(0);
  const [giustificazione, setGiustificazione] = useState('');
  const [autista, setAutista] = useState(false);
  const [mezzoId, setMezzoId] = useState<string>('');

  // Pausa pranzo dichiarata (ripiego se non timbrata)
  const [pausaFatta, setPausaFatta] = useState(false);
  const [pausaMin, setPausaMin] = useState<30 | 45 | 60>(30);

  // Portal su body: dentro la shell mobile un `fixed` resta intrappolato nello
  // stacking context e finisce SOTTO la bottom-nav. Su body compete al livello
  // radice → sta davvero sopra tutto (z-[70]).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const casa = sedeId === CASA_ID;
  const modificato = !casa && stimaMin != null && confermMin !== stimaMin;
  const giustObbligatoria = modificato;

  async function calcolaStima(targetSedeId: string) {
    if (!usaViaggio) return;
    setStimaLoading(true);
    setStimaMin(null);
    setStimaKm(null);
    try {
      const res = await fetch('/api/routing/stima', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sedeId: targetSedeId, cantiereId, direzione: 'ritorno' }),
      });
      const j = (await res.json()) as { ok: boolean; minuti: number | null; km?: number | null };
      if (j.ok && typeof j.minuti === 'number') {
        setStimaMin(j.minuti);
        setConfermMin(j.minuti);
        setStimaKm(typeof j.km === 'number' ? j.km : null);
      } else {
        setStimaMin(null);
        setStimaKm(null);
      }
    } catch {
      setStimaMin(null);
      setStimaKm(null);
    } finally {
      setStimaLoading(false);
    }
  }

  function selezionaSede(id: string) {
    setSedeId(id);
    setGiustificazione('');
    setErrLocale(null);
    if (id === CASA_ID) {
      // Rientro a casa: nessun viaggio di lavoro → 0 km, 0 tempo, niente stima.
      setStimaMin(null);
      setStimaKm(null);
      setConfermMin(0);
      setStimaLoading(false);
      return;
    }
    void calcolaStima(id);
  }

  // All'apertura calcola subito km + tempo per la sede preselezionata.
  useEffect(() => {
    if (open && usaViaggio && sedeId) void calcolaStima(sedeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Split: init all'apertura (reset scelta + prima riga = cantiere corrente).
  useEffect(() => {
    if (open && splitContesto) {
      setDividi(false);
      setPickerSplitOpen(false);
      setRigheSplit([
        {
          cantiereId: splitContesto.cantiereCorrente.id,
          nome: splitContesto.cantiereCorrente.nome,
          minuti: 0,
        },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Netto disponibile per lo split = (chiusura - inizio) - pausa dichiarata.
  const grossSplitMin = splitContesto
    ? Math.max(0, Math.round((Date.parse(splitContesto.closeIso) - Date.parse(splitContesto.inizioIso)) / 60000))
    : 0;
  const pausaEffettivaMin = pausaPrompt && pausaFatta ? pausaMin : 0;
  const nettoSplitMin = grossSplitMin - pausaEffettivaMin;
  const assegnatoSplit = righeSplit.reduce((a, r) => a + r.minuti, 0);
  const restanoSplit = nettoSplitMin - assegnatoSplit;
  // Tolleranza: entro N min si salva (l'ultimo cantiere assorbe il resto).
  const tolleranzaSplit = splitContesto?.tolleranzaMin ?? 0;
  const entroTolleranza = Math.abs(restanoSplit) <= tolleranzaSplit;
  const cantieriSplitDisponibili = splitContesto
    ? splitContesto.cantieri.filter((c) => !righeSplit.some((r) => r.cantiereId === c.id))
    : [];

  function aggiornaRigaSplit(idx: number, minuti: number) {
    setRigheSplit((prev) => prev.map((r, i) => (i === idx ? { ...r, minuti } : r)));
    setErrLocale(null);
  }
  function rimuoviRigaSplit(idx: number) {
    setRigheSplit((prev) => prev.filter((_, i) => i !== idx));
    setErrLocale(null);
  }
  function aggiungiCantiereSplit(id: string) {
    const c = splitContesto?.cantieri.find((x) => x.id === id);
    setPickerSplitOpen(false);
    if (!c) return;
    const nome = titoloCase(c.nome ?? '') || c.codice_commessa || c.codice || 'Cantiere';
    setRigheSplit((prev) =>
      prev.some((r) => r.cantiereId === id) ? prev : [...prev, { cantiereId: id, nome, minuti: 0 }],
    );
    setErrLocale(null);
  }

  function step(delta: number) {
    setConfermMin((m) => Math.max(0, m + delta));
  }

  function handleConferma() {
    setErrLocale(null);
    // Casa = nessun viaggio: si salta ogni validazione viaggio.
    if (usaViaggio && !casa) {
      if (!sedeId) {
        setErrLocale('Seleziona dove vai adesso.');
        return;
      }
      if (confermMin <= 0) {
        setErrLocale('Indica il tempo di viaggio.');
        return;
      }
      if (giustObbligatoria && giustificazione.trim().length < 3) {
        setErrLocale('Hai modificato la stima: scrivi una breve giustificazione.');
        return;
      }
    }
    // Split: se "dividi", la somma deve fare esattamente il netto.
    if (splitContesto && dividi) {
      if (righeSplit.length < 2) {
        setErrLocale('Aggiungi un altro cantiere o scegli "Solo qui".');
        return;
      }
      if (righeSplit.some((r) => r.minuti <= 0)) {
        setErrLocale('Ogni cantiere deve avere delle ore.');
        return;
      }
      if (!entroTolleranza) {
        setErrLocale(
          restanoSplit > 0
            ? `Restano ${fmtHM(restanoSplit)} da assegnare.`
            : `Hai assegnato ${fmtHM(-restanoSplit)} di troppo.`,
        );
        return;
      }
    }
    startTransition(async () => {
      setErroreMsg(null);
      const res = await onConfirm({
        viaggio:
          usaViaggio && !casa
            ? {
                sedeId,
                durataStimataMin: stimaMin,
                durataConfermataMin: confermMin,
                giustificazione: giustificazione.trim() || undefined,
                autista,
                mezzoId: autista ? mezzoId || null : null,
                distanzaKm: stimaKm,
              }
            : null,
        pausaPranzoMin: pausaPrompt && pausaFatta ? pausaMin : undefined,
        split:
          splitContesto && dividi
            ? righeSplit.map((r) => ({ cantiereId: r.cantiereId, minuti: r.minuti }))
            : undefined,
      });
      if (res.ok) onOpenChange(false);
      else setErroreMsg(messaggioErrore(res.error ?? ''));
    });
  }

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col justify-end" role="dialog" aria-modal="true">
      {/* overlay */}
      <button
        type="button"
        aria-label="Chiudi"
        onClick={() => !isPending && onOpenChange(false)}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
      />

      {/* sheet */}
      <div
        className="relative z-10 max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl border-t border-border bg-background shadow-lg"
        style={{ paddingBottom: 'max(1rem, calc(env(safe-area-inset-bottom, 0px) + 1rem))' }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="mx-auto h-1 w-10 shrink-0 rounded-full bg-muted" aria-hidden />
            <h2 className="truncate text-base font-semibold tracking-tight text-foreground">
              {intestazione ?? 'Termina turno'}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => !isPending && onOpenChange(false)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-50"
            disabled={isPending}
            aria-label="Chiudi"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {usaViaggio && (
            <>
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <MapPin className="h-4 w-4 text-primary" strokeWidth={1.75} />
                  Dove vai adesso?
                </p>
                <div className="grid gap-2">
                  {sedi.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => selezionaSede(s.id)}
                      className={[
                        'flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                        sedeId === s.id
                          ? 'border-primary bg-primary/5 font-medium text-foreground'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted/40',
                      ].join(' ')}
                    >
                      <span className="truncate">{s.nome}</span>
                      <span className="ml-2 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
                        {tipoSedeLabel(s.tipo)}
                      </span>
                    </button>
                  ))}
                  {/* Rientro a casa: sempre disponibile → 0 km, 0 tempo. */}
                  <button
                    type="button"
                    onClick={() => selezionaSede(CASA_ID)}
                    className={[
                      'flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                      casa
                        ? 'border-primary bg-primary/5 font-medium text-foreground'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted/40',
                    ].join(' ')}
                  >
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <Home className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                      <span className="truncate">Abitazione privata</span>
                    </span>
                    <span className="ml-2 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
                      no viaggio
                    </span>
                  </button>
                </div>
              </div>

              {casa ? (
                <p className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
                  Rientro a casa: nessun km né tempo di viaggio da registrare.
                </p>
              ) : (
                <>
              <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Tempo di viaggio
                  </span>
                  {stimaLoading ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> stima...
                    </span>
                  ) : stimaMin != null ? (
                    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                      <span>stimato {formatDurata(stimaMin)}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">
                        {formatKm(stimaKm)}
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">stima non disponibile</span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => step(-5)}
                    disabled={stimaLoading || confermMin <= 0}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background text-lg font-semibold text-foreground hover:bg-muted disabled:opacity-40"
                    aria-label="Meno 5 minuti"
                  >
                    −
                  </button>
                  <span className="flex-1 text-center text-xl font-bold tabular-nums text-foreground">
                    {formatDurata(confermMin)}
                  </span>
                  <button
                    type="button"
                    onClick={() => step(5)}
                    disabled={stimaLoading}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background text-lg font-semibold text-foreground hover:bg-muted disabled:opacity-40"
                    aria-label="Più 5 minuti"
                  >
                    +
                  </button>
                </div>
                {giustObbligatoria && (
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      Hai modificato la stima. Motivo (es. traffico):
                    </label>
                    <input
                      type="text"
                      value={giustificazione}
                      onChange={(e) => setGiustificazione(e.target.value)}
                      placeholder="es. traffico in tangenziale"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="flex cursor-pointer items-center gap-2.5 select-none">
                  <input
                    type="checkbox"
                    checked={autista}
                    onChange={(e) => setAutista(e.target.checked)}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                    <Car className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
                    Sarò io l&apos;autista del mezzo
                  </span>
                </label>
                {autista && (
                  <select
                    value={mezzoId}
                    onChange={(e) => setMezzoId(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  >
                    <option value="">Seleziona il mezzo...</option>
                    {mezzi.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.targa}
                        {m.modello ? ` ${m.modello}` : ''}
                      </option>
                    ))}
                  </select>
                )}
                {autista && mezzi.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Nessun mezzo configurato. L&apos;ufficio può aggiungerli nel parco mezzi.
                  </p>
                )}
              </div>
                </>
              )}
            </>
          )}

          {/* Pausa pranzo non rilevata (solo turni lunghi senza pausa timbrata) */}
          {pausaPrompt ? (
            <div className="space-y-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3.5">
              <p className="flex items-start gap-1.5 text-sm font-semibold text-amber-900">
                <Utensils className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
                Pausa pranzo non rilevata
              </p>
              <p className="text-[13px] leading-snug text-amber-800">
                Hai lavorato {formatDurata(pausaPrompt.durataMin)} senza timbrare una pausa. Ricorda:{' '}
                <strong>timbrare la pausa è il modo corretto</strong>; questa è solo una correzione.
              </p>
              <label className="flex cursor-pointer items-center gap-2 select-none">
                <input
                  type="checkbox"
                  checked={pausaFatta}
                  onChange={(e) => setPausaFatta(e.target.checked)}
                  className="h-4 w-4 rounded border-amber-400 accent-amber-600"
                />
                <span className="text-sm font-medium text-amber-900">Ho fatto la pausa pranzo</span>
              </label>
              {pausaFatta ? (
                <div className="flex gap-2">
                  {([30, 45, 60] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPausaMin(m)}
                      className={[
                        'flex-1 rounded-lg border py-2 text-sm font-semibold transition-colors',
                        pausaMin === m
                          ? 'border-amber-500 bg-amber-500 text-white'
                          : 'border-amber-300 bg-white text-amber-900 hover:bg-amber-100',
                      ].join(' ')}
                    >
                      {m === 60 ? '1h' : `${m} min`}
                    </button>
                  ))}
                </div>
              ) : null}
              {pausaFatta ? (
                <p className="text-[11px] text-amber-700">
                  Verranno tolti {pausaMin === 60 ? '1h' : `${pausaMin} min`} dal turno.
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Split "cosa hai fatto oggi" — solo self, giornata pulita */}
          {splitContesto ? (
            <div className="space-y-2.5 rounded-xl border border-primary/20 bg-primary/[0.05] p-3">
              <p className="text-sm font-semibold text-foreground">Cosa hai fatto oggi?</p>
              <p className="text-xs text-muted-foreground">
                Hai <strong className="text-foreground">{fmtHM(nettoSplitMin)}</strong> netti da
                assegnare.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDividi(false)}
                  className={[
                    'rounded-lg border px-2 py-2 text-sm font-semibold transition-colors',
                    !dividi
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-background text-muted-foreground',
                  ].join(' ')}
                >
                  Solo qui
                </button>
                <button
                  type="button"
                  onClick={() => setDividi(true)}
                  className={[
                    'rounded-lg border px-2 py-2 text-sm font-semibold transition-colors',
                    dividi
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-background text-muted-foreground',
                  ].join(' ')}
                >
                  Più cantieri
                </button>
              </div>
              {dividi ? (
                <div className="space-y-2 pt-0.5">
                  {righeSplit.map((r, i) => (
                    <div key={r.cantiereId} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{r.nome}</span>
                      <MinutiStepper
                        minuti={r.minuti}
                        passo={splitContesto.passoMinuti}
                        disabled={isPending}
                        onChange={(m) => aggiornaRigaSplit(i, m)}
                      />
                      {i > 0 ? (
                        <button
                          type="button"
                          onClick={() => rimuoviRigaSplit(i)}
                          aria-label="Rimuovi cantiere"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : (
                        <span className="w-4 shrink-0" aria-hidden />
                      )}
                    </div>
                  ))}
                  {cantieriSplitDisponibili.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setPickerSplitOpen(true)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-sm font-medium text-muted-foreground hover:bg-muted/40"
                    >
                      <Plus className="h-4 w-4" /> Aggiungi cantiere
                    </button>
                  ) : null}
                  <p
                    className={`text-center text-xs font-semibold ${entroTolleranza ? 'text-emerald-600' : 'text-amber-600'}`}
                  >
                    {entroTolleranza
                      ? restanoSplit === 0
                        ? 'Tutto assegnato ✓'
                        : `OK · l'ultimo cantiere aggiusta ${fmtHM(Math.abs(restanoSplit))}`
                      : restanoSplit > 0
                        ? `Restano ${fmtHM(restanoSplit)} da assegnare`
                        : `${fmtHM(-restanoSplit)} di troppo`}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {errLocale && <p className="text-sm text-destructive">{errLocale}</p>}
          {erroreMsg && <p className="text-sm text-destructive">{erroreMsg}</p>}

          <Button
            className="w-full py-3 text-base"
            size="lg"
            variant="outline"
            onClick={handleConferma}
            disabled={isPending || stimaLoading}
          >
            {isPending ? 'Attendere...' : 'Termina turno'}
          </Button>
        </div>
      </div>

      {/* Foglio ricerca per aggiungere un cantiere allo split (Portal, sopra). */}
      <CantiereSearchSheet
        open={pickerSplitOpen}
        title="Aggiungi cantiere"
        cantieri={cantieriSplitDisponibili}
        onPick={aggiungiCantiereSplit}
        onClose={() => setPickerSplitOpen(false)}
      />
    </div>,
    document.body,
  );
}

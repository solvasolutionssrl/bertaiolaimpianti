'use client';

import { useEffect, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Car, Loader2, Utensils, X } from 'lucide-react';
import { Button } from '@kommessa/ui';

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
  onConfirm,
}: ViaggioRitornoDialogProps) {
  const usaViaggio = sedi.length > 0;

  const [isPending, startTransition] = useTransition();
  const [erroreMsg, setErroreMsg] = useState<string | null>(null);
  const [errLocale, setErrLocale] = useState<string | null>(null);

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

  const modificato = stimaMin != null && confermMin !== stimaMin;
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
    void calcolaStima(id);
  }

  // All'apertura calcola subito km + tempo per la sede preselezionata.
  useEffect(() => {
    if (open && usaViaggio && sedeId) void calcolaStima(sedeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function step(delta: number) {
    setConfermMin((m) => Math.max(0, m + delta));
  }

  function handleConferma() {
    setErrLocale(null);
    if (usaViaggio) {
      if (!sedeId) {
        setErrLocale('Seleziona la sede di partenza.');
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
    startTransition(async () => {
      setErroreMsg(null);
      const res = await onConfirm({
        viaggio: usaViaggio
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
                </div>
              </div>

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
    </div>,
    document.body,
  );
}

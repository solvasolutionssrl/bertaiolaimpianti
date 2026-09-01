'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Car, Loader2, Home, ArrowLeft, X, Play } from 'lucide-react';
import { useConfermaPasseggero } from '@/app/_components/conferma-passeggero';

import type {
  ViaggioRitornoSede,
  ViaggioRitornoMezzo,
  ViaggioRitornoPayload,
} from '@/app/_components/viaggio-ritorno-dialog';

/** Sentinel: "parto da casa" → nessun viaggio di lavoro (0 km, 0 tempo). */
const CASA_ID = '__casa__';

// ─── format (piccoli helper, gemelli del dialog di ritorno) ─────────────────────

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

export interface PartenzaViaggioSheetProps {
  open: boolean;
  /** Cantiere scelto allo step precedente (per la stima andata sede → cantiere). */
  cantiereId: string;
  /** Nome del cantiere (title-case) da mostrare come sottotitolo. */
  cantiereNome: string;
  /** true finché le opzioni (sedi/mezzi) sono in caricamento. */
  loading: boolean;
  sedi: ViaggioRitornoSede[];
  sedeDefaultId: string | null;
  mezzi: ViaggioRitornoMezzo[];
  /** true mentre l'avvio turno è in corso (gestito dal parent). */
  pending: boolean;
  /** Errore dall'action di avvio (gestito dal parent). */
  errore: string | null;
  /** Torna allo step "scegli cantiere". */
  onBack: () => void;
  /** Chiudi tutto (annulla l'avvio). */
  onClose: () => void;
  /** Conferma: viaggio di andata, oppure null = "Abitazione privata" (0 km/0 tempo). */
  onConfirm: (viaggio: ViaggioRitornoPayload | null) => void;
}

/**
 * Step 2 dell'avvio turno da app: "Da dove parti?".
 *
 * Bottom sheet gemello del `ViaggioRitornoDialog` (stesso linguaggio visivo per
 * "scegli sede + km"), ma per l'ANDATA (partenza) e con conferma PIÙ TOLLERANTE:
 * l'avvio del turno è la priorità, quindi una stima km non disponibile NON deve
 * impedire di iniziare (a differenza del ritorno, dove il tempo è obbligatorio).
 *
 * Le opzioni ammesse sono: "Abitazione privata" (0 km / 0 tempo), la sede
 * predefinita del tenant e le sedi associate al cantiere (regola sedi↔cantiere,
 * già filtrata lato server). Portal su body → sopra la bottom-nav.
 */
export function PartenzaViaggioSheet({
  open,
  cantiereId,
  cantiereNome,
  loading,
  sedi,
  sedeDefaultId,
  mezzi,
  pending,
  errore,
  onBack,
  onClose,
  onConfirm,
}: PartenzaViaggioSheetProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [sedeId, setSedeId] = useState<string>('');
  const [stimaMin, setStimaMin] = useState<number | null>(null);
  const [stimaKm, setStimaKm] = useState<number | null>(null);
  const [stimaLoading, setStimaLoading] = useState(false);
  const [confermMin, setConfermMin] = useState<number>(0);
  const [giustificazione, setGiustificazione] = useState('');
  const [autista, setAutista] = useState(false);
  const passeggero = useConfermaPasseggero();
  const [mezzoId, setMezzoId] = useState<string>('');
  const [errLocale, setErrLocale] = useState<string | null>(null);

  const casa = sedeId === CASA_ID;
  const modificato = !casa && stimaMin != null && confermMin !== stimaMin;
  const giustObbligatoria = modificato;

  // Sede predefinita ("sede FPM") in cima, poi le sedi collegate al cantiere.
  const sediOrdinate = useMemo(() => {
    if (!sedeDefaultId) return sedi;
    const def = sedi.filter((s) => s.id === sedeDefaultId);
    const rest = sedi.filter((s) => s.id !== sedeDefaultId);
    return [...def, ...rest];
  }, [sedi, sedeDefaultId]);

  // Guardia anti-race: ogni stima incrementa il contatore. Una risposta obsoleta
  // (l'utente ha cambiato sede nel frattempo) viene ignorata, così km/tempo non
  // restano quelli di un'ALTRA sede. Il tempo confermato riparte SEMPRE da 0 a
  // ogni nuova stima → mai un tempo di viaggio "ereditato" da una sede precedente
  // se la nuova stima non è disponibile (che scriverebbe minuti fasulli).
  const reqSeq = useRef(0);

  async function calcolaStima(targetSedeId: string) {
    const seq = ++reqSeq.current;
    setStimaLoading(true);
    setStimaMin(null);
    setStimaKm(null);
    setConfermMin(0);
    try {
      const res = await fetch('/api/routing/stima', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sedeId: targetSedeId, cantiereId, direzione: 'andata' }),
      });
      const j = (await res.json()) as { ok: boolean; minuti: number | null; km?: number | null };
      if (seq !== reqSeq.current) return; // risposta obsoleta: la sede è cambiata
      if (j.ok && typeof j.minuti === 'number') {
        setStimaMin(j.minuti);
        setConfermMin(j.minuti);
        setStimaKm(typeof j.km === 'number' ? j.km : null);
      } else {
        setStimaMin(null);
        setStimaKm(null);
        setConfermMin(0);
      }
    } catch {
      if (seq !== reqSeq.current) return;
      setStimaMin(null);
      setStimaKm(null);
      setConfermMin(0);
    } finally {
      if (seq === reqSeq.current) setStimaLoading(false);
    }
  }

  function selezionaSede(id: string) {
    setSedeId(id);
    setGiustificazione('');
    setErrLocale(null);
    if (id === CASA_ID) {
      // Parto da casa: nessun viaggio di lavoro → 0 km, 0 tempo, niente stima.
      reqSeq.current += 1; // invalida eventuali stime ancora in volo
      setStimaMin(null);
      setStimaKm(null);
      setConfermMin(0);
      setStimaLoading(false);
      return;
    }
    void calcolaStima(id);
  }

  // All'apertura (o quando arrivano le opzioni): preseleziona la sede predefinita
  // — coerente con lo scan QR — e calcola subito km + tempo. Se non c'è nessuna
  // sede si parte da "Abitazione privata".
  useEffect(() => {
    if (!open) {
      setSedeId('');
      setStimaMin(null);
      setStimaKm(null);
      setConfermMin(0);
      setGiustificazione('');
      setAutista(false);
      setMezzoId('');
      setErrLocale(null);
      return;
    }
    if (loading) return;
    const def = sedeDefaultId ?? sedi[0]?.id ?? CASA_ID;
    setSedeId(def);
    if (def !== CASA_ID) void calcolaStima(def);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loading]);

  function step(delta: number) {
    setConfermMin((m) => Math.max(0, m + delta));
  }

  async function handleConferma() {
    setErrLocale(null);
    if (casa) {
      onConfirm(null);
      return;
    }
    if (!sedeId) {
      setErrLocale('Seleziona da dove parti.');
      return;
    }
    if (giustObbligatoria && giustificazione.trim().length < 3) {
      setErrLocale('Hai modificato la stima: scrivi una breve giustificazione.');
      return;
    }
    // Passeggero dichiarato: i km non glieli conta nessuno, meglio chiedere.
    if (!(await passeggero.conferma(autista))) return;

    onConfirm({
      sedeId,
      durataStimataMin: stimaMin,
      durataConfermataMin: confermMin,
      giustificazione: giustificazione.trim() || undefined,
      autista,
      mezzoId: autista ? mezzoId || null : null,
      distanzaKm: stimaKm,
    });
  }

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col justify-end" role="dialog" aria-modal="true">
      {/* overlay */}
      <button
        type="button"
        aria-label="Chiudi"
        onClick={() => !pending && onClose()}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
      />

      {/* sheet */}
      <div
        className="relative z-10 max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl border-t border-border bg-background shadow-lg"
        style={{ paddingBottom: 'max(1rem, calc(env(safe-area-inset-bottom, 0px) + 1rem))' }}
      >
        {/* Dentro il foglio: un secondo dialog lo chiuderebbe. */}
        {passeggero.pannello}
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background px-3 py-3">
          <button
            type="button"
            onClick={() => !pending && onBack()}
            disabled={pending}
            aria-label="Torna alla scelta cantiere"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold leading-tight tracking-tight text-foreground">
              Da dove parti?
            </h2>
            <p className="truncate text-xs leading-tight text-muted-foreground">
              Turno su {cantiereNome}
            </p>
          </div>
          <button
            type="button"
            onClick={() => !pending && onClose()}
            disabled={pending}
            aria-label="Chiudi"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carico le sedi...
          </div>
        ) : (
          <div className="space-y-4 p-4">
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <MapPin className="h-4 w-4 text-primary" strokeWidth={1.75} />
                Sede di partenza
              </p>
              <div className="grid gap-2">
                {/* Abitazione privata: sempre disponibile → 0 km, 0 tempo. */}
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
                {sediOrdinate.map((s) => (
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

            {casa ? (
              <p className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
                Parti da casa: nessun km né tempo di viaggio da registrare.
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
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-base focus:border-primary focus:outline-none"
                      />
                    </div>
                  )}
                </div>

                <div
                  ref={passeggero.propsEvidenza.ref}
                  className={'space-y-2 ' + passeggero.propsEvidenza.className}
                >
                  <label className="flex cursor-pointer items-center gap-2.5 select-none">
                    <input
                      type="checkbox"
                      checked={autista}
                      onChange={(e) => {
                        passeggero.spegniEvidenza();
                        setAutista(e.target.checked);
                      }}
                      className="h-4 w-4 rounded border-input accent-primary"
                    />
                    <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                      <Car className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
                      Sono io l&apos;autista del mezzo
                    </span>
                  </label>
                  {autista && (
                    <select
                      value={mezzoId}
                      onChange={(e) => setMezzoId(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-base focus:border-primary focus:outline-none"
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

            {errLocale && <p className="text-sm text-destructive">{errLocale}</p>}
            {errore && <p className="text-sm text-destructive">{errore}</p>}

            <button
              type="button"
              onClick={handleConferma}
              disabled={pending || stimaLoading}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-emerald-600 px-4 py-3.5 text-base font-semibold text-white shadow-soft transition-all active:scale-[0.99] hover:bg-emerald-700 disabled:opacity-50"
            >
              {pending ? (
                <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
              ) : (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20">
                  <Play className="h-3.5 w-3.5" strokeWidth={2.75} fill="currentColor" />
                </span>
              )}
              Avvia turno
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

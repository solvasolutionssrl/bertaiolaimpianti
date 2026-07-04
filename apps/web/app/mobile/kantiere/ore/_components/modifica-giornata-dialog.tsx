'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Coffee, Info, Loader2 } from 'lucide-react';
import { Button } from '@kommessa/ui';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@kommessa/ui';
import {
  caricaMiaGiornata,
  modificaMiaGiornata,
  type RigaGiornataModifica,
} from '@/app/_actions/kantiere-rapportino';

// ── props ────────────────────────────────────────────────────────────────────

export interface ModificaGiornataDialogProps {
  open: boolean;
  onClose: () => void;
  /** Giornata da modificare, 'YYYY-MM-DD' (Europe/Rome). */
  data: string;
}

// ── stato riga editabile (ore in H + MM) ─────────────────────────────────────

interface RigaEdit {
  commessa_id: string | null;
  cantiere_id: string | null;
  target_label: string;
  lavoroH: number;
  lavoroM: number;
  viaggioH: number;
  viaggioM: number;
}

const PAUSA_OPZIONI = [30, 45, 60] as const;

// ── helper ────────────────────────────────────────────────────────────────────

function fmtGiorno(data: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${data}T12:00:00Z`));
}

/** Ore decimali -> { h, m } (arrotondato al minuto). */
function decToHM(dec: number): { h: number; m: number } {
  const tot = Math.max(0, Math.round(dec * 60));
  return { h: Math.floor(tot / 60), m: tot % 60 };
}

/** { h, m } -> ore decimali. */
function hmToDec(h: number, m: number): number {
  return h + m / 60;
}

function rigaFromPayload(r: RigaGiornataModifica): RigaEdit {
  const lav = decToHM(r.ore_lavoro);
  const via = decToHM(r.ore_viaggio);
  return {
    commessa_id: r.commessa_id,
    cantiere_id: r.cantiere_id,
    target_label: r.target_label,
    lavoroH: lav.h,
    lavoroM: lav.m,
    viaggioH: via.h,
    viaggioM: via.m,
  };
}

function messaggioErrore(code: string): string {
  switch (code) {
    case 'FUORI_FINESTRA':
      return 'Questa giornata non e piu modificabile (oltre 3 giorni fa).';
    case 'NON_MODIFICABILE':
      return 'La giornata e stata gestita dall ufficio e non e piu modificabile.';
    case 'GIORNATA_NON_CHIUSA':
      return 'Per aggiungere la pausa la giornata deve avere ingresso e uscita.';
    case 'PAUSA_TROPPO_LUNGA':
      return 'La pausa non puo essere piu lunga del turno.';
    case 'NESSUN_DIPENDENTE':
      return 'Nessun profilo dipendente collegato a questo account.';
    case 'NON_AUTENTICATO':
      return 'Devi essere autenticato per modificare le ore.';
    case 'MODULO_OFF':
      return 'Il modulo Kantiere non e abilitato per questo spazio.';
    default:
      return 'Modifica non riuscita. Riprova.';
  }
}

function clampInt(v: string, min: number, max: number): number {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

// ── stepper ore editabile (tap e scrivi + −/+ 15 min) ────────────────────────
// Due per riga (Lavoro · Viaggio). I numeri sono INPUT (si scrivono a mano →
// qualsiasi valore, es. da 0:32); i tasti −/+ nudge di 15 min. Label "h"/"min"
// così è chiaro cosa sono i numeri.

function StepperHM({
  label,
  tone,
  h,
  m,
  disabled,
  onChange,
}: {
  label: string;
  tone: 'work' | 'travel';
  h: number;
  m: number;
  disabled: boolean;
  onChange: (h: number, m: number) => void;
}) {
  const total = h * 60 + m;
  const nudge = (delta: number) => {
    const t = Math.max(0, Math.min(23 * 60 + 59, total + delta));
    onChange(Math.floor(t / 60), t % 60);
  };
  const box = tone === 'travel' ? 'border-sky-200 bg-sky-50/70' : 'border-border bg-muted/40';
  const inputCls =
    'w-9 rounded border border-border bg-background px-0.5 py-1 text-center font-mono text-sm font-semibold tabular-nums text-foreground focus:border-primary focus:outline-none disabled:opacity-50';
  const btnCls =
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-lg font-semibold text-foreground active:scale-95 disabled:opacity-40';
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <div className={`flex min-w-0 flex-1 items-center gap-1 rounded-lg border p-1 ${box}`}>
        <button
          type="button"
          onClick={() => nudge(-15)}
          disabled={disabled || total <= 0}
          aria-label={`${label} meno 15 minuti`}
          className={btnCls}
        >
          −
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-1">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={23}
            value={h}
            onChange={(e) => onChange(clampInt(e.target.value, 0, 23), m)}
            disabled={disabled}
            aria-label={`${label} ore`}
            className={inputCls}
          />
          <span className="text-[11px] font-semibold text-muted-foreground">h</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={59}
            value={String(m).padStart(2, '0')}
            onChange={(e) => onChange(h, clampInt(e.target.value, 0, 59))}
            disabled={disabled}
            aria-label={`${label} minuti`}
            className={inputCls}
          />
          <span className="text-[11px] font-semibold text-muted-foreground">min</span>
        </div>
        <button
          type="button"
          onClick={() => nudge(15)}
          disabled={disabled}
          aria-label={`${label} più 15 minuti`}
          className={btnCls}
        >
          +
        </button>
      </div>
    </div>
  );
}

// ── componente principale ─────────────────────────────────────────────────────

export function ModificaGiornataDialog({ open, onClose, data }: ModificaGiornataDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [loading, setLoading] = useState(true);
  const [righe, setRighe] = useState<RigaEdit[]>([]);
  const [pausaPresente, setPausaPresente] = useState(false);
  const [giornataChiusa, setGiornataChiusa] = useState(false);
  const [modificabile, setModificabile] = useState(true);
  // Durata pausa caricata dal server (per confronto/prefill) + selezione corrente.
  const [pausaMinutiEsistente, setPausaMinutiEsistente] = useState<number | null>(null);
  const [pausaMinuti, setPausaMinuti] = useState<number | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore(null);
    setPausaMinuti(null);
    setPausaMinutiEsistente(null);
    const res = await caricaMiaGiornata({ data });
    if (res.ok) {
      setRighe(res.righe.map(rigaFromPayload));
      setPausaPresente(res.pausaPresente);
      setGiornataChiusa(res.giornataChiusa);
      setModificabile(res.modificabile);
      // Prefill: la selezione parte dalla pausa già registrata (se c'è).
      setPausaMinutiEsistente(res.pausaMinutiEsistente);
      setPausaMinuti(res.pausaMinutiEsistente);
    } else {
      setErrore(messaggioErrore(res.error));
      setRighe([]);
    }
    setLoading(false);
  }, [data]);

  useEffect(() => {
    if (open) void carica();
  }, [open, carica]);

  function patchRiga(idx: number, patch: Partial<RigaEdit>) {
    setRighe((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    setErrore(null);
  }

  function handleSalva() {
    setErrore(null);
    // Invio la pausa solo se cambiata: aggiunta (era assente) o durata diversa.
    const pausaDaInviare =
      pausaMinuti !== null && pausaMinuti !== pausaMinutiEsistente ? pausaMinuti : null;
    startTransition(async () => {
      const res = await modificaMiaGiornata({
        data,
        righe: righe.map((r) => ({
          commessa_id: r.commessa_id,
          cantiere_id: r.cantiere_id,
          ore_lavoro: hmToDec(r.lavoroH, r.lavoroM),
          ore_viaggio: hmToDec(r.viaggioH, r.viaggioM),
        })),
        pausaMinuti: pausaDaInviare,
      });
      if (res.ok) {
        router.refresh();
        onClose();
      } else {
        setErrore(messaggioErrore(res.error));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        // Altezza CAPATA a schermo (mai sbordare) + colonne min-w-0. Con tanti
        // cantieri il corpo scrolla (min-h-0 sul body), il footer "Salva" resta
        // fisso in fondo. Non cresce a caso: si ferma al bordo e scorre.
        className="flex max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-1rem)] grid-cols-[minmax(0,1fr)] flex-col gap-0 overflow-x-hidden p-0 sm:max-w-[520px]"
      >
        <DialogHeader className="border-b border-border px-4 py-3 sm:px-6">
          <DialogTitle>Modifica giornata</DialogTitle>
          <p className="text-xs capitalize text-muted-foreground">{fmtGiorno(data)}</p>
        </DialogHeader>

        {/* Body scrollabile (min-h-0 = il flex-1 può restringersi e scrollare
            invece di far sbordare il dialog). */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Caricamento...
            </div>
          ) : (
            <>
              {!modificabile && (
                <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                  Questa giornata e oltre la finestra di modifica (fino a 3 giorni fa).
                </p>
              )}

              {righe.length === 0 ? (
                <p className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
                  Nessuna ora registrata per questa giornata.
                </p>
              ) : (
                <div className="space-y-2">
                  {/* Un cantiere = una riga: Lavoro · Viaggio inline con −/+ */}
                  {righe.map((r, idx) => (
                    <div
                      key={r.cantiere_id ?? r.commessa_id ?? idx}
                      className="min-w-0 rounded-xl border border-border bg-card p-2.5 shadow-soft"
                    >
                      <p className="truncate text-[13px] font-semibold text-foreground">
                        {r.target_label || 'Cantiere'}
                      </p>
                      <div className="mt-2 space-y-1.5">
                        <StepperHM
                          label="Lavoro"
                          tone="work"
                          h={r.lavoroH}
                          m={r.lavoroM}
                          disabled={isPending || !modificabile}
                          onChange={(h, m) => patchRiga(idx, { lavoroH: h, lavoroM: m })}
                        />
                        <StepperHM
                          label="Viaggio"
                          tone="travel"
                          h={r.viaggioH}
                          m={r.viaggioM}
                          disabled={isPending || !modificabile}
                          onChange={(h, m) => patchRiga(idx, { viaggioH: h, viaggioM: m })}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pausa pranzo — zona gialla dedicata */}
              <div className="space-y-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3">
                <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-amber-800">
                  <Coffee className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Pausa pranzo
                </p>

                {pausaPresente ? (
                  <p className="text-xs font-medium text-amber-900">
                    Pausa già registrata
                    {pausaMinutiEsistente ? ` di ${pausaMinutiEsistente} min` : ''}.
                    {giornataChiusa ? ' Puoi modificarla qui sotto.' : ''}
                  </p>
                ) : giornataChiusa ? (
                  <p className="text-xs text-amber-800/90">
                    Nessuna pausa registrata. Aggiungila se hai fatto la pausa pranzo.
                  </p>
                ) : (
                  <p className="text-xs text-amber-800/90">
                    Nessuna pausa registrata. Puoi aggiungerla solo su una giornata con ingresso e
                    uscita timbrati.
                  </p>
                )}

                {giornataChiusa && (
                  <div className="grid grid-cols-3 gap-2">
                    {PAUSA_OPZIONI.map((min) => {
                      const attivo = pausaMinuti === min;
                      return (
                        <button
                          key={min}
                          type="button"
                          onClick={() => setPausaMinuti(attivo ? null : min)}
                          disabled={isPending || !modificabile}
                          className={[
                            'rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors',
                            attivo
                              ? 'border-amber-500 bg-amber-200/70 text-amber-900'
                              : 'border-amber-300 bg-white/70 text-amber-800 hover:bg-amber-100',
                          ].join(' ')}
                        >
                          {min} min
                        </button>
                      );
                    })}
                  </div>
                )}

                {pausaMinuti !== null && pausaMinuti !== pausaMinutiEsistente && (
                  <p className="text-[11px] font-medium text-amber-800">
                    {pausaPresente
                      ? `La pausa verrà aggiornata a ${pausaMinuti} minuti.`
                      : `Verrà aggiunta una pausa di ${pausaMinuti} minuti al centro del turno.`}
                  </p>
                )}
              </div>

              {/* Nota informativa */}
              <p className="flex items-start gap-1.5 rounded-md border border-blue-500/25 bg-blue-500/5 px-3 py-2 text-[11px] text-blue-700">
                <Info className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                La modifica avvisa l&apos;ufficio.
              </p>

              {errore && (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {errore}
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer sticky con azione primaria */}
        <div className="sticky bottom-0 flex flex-col gap-2 border-t border-border bg-background px-4 py-3 sm:flex-row-reverse sm:px-6">
          <Button
            type="button"
            onClick={handleSalva}
            disabled={isPending || loading || !modificabile}
            className="w-full sm:w-auto"
          >
            {isPending ? 'Salvataggio...' : 'Salva'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isPending}
            className="w-full sm:w-auto"
          >
            Annulla
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

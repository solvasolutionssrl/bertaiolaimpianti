'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Minus, X, Loader2, CalendarClock, Coffee, Clock, MapPin, CheckCircle2 } from 'lucide-react';

import { Portal } from '@/app/mobile/_components/portal';
import { titoloCase } from '@/app/mobile/_lib/display-case';
import { codiceCantiereMostrato } from '@/app/_lib/cantiere-categoria';
import {
  CantiereSearchSheet,
  type PickerCantiere,
} from '../../_components/cantiere-picker';
import { registraGiornataDaZero, elencoCantieriTurno } from '@/app/_actions/kantiere-timbra';

/** "H:MM" da minuti. */
function fmtHM(min: number): string {
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

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
      return 'Le ore dei cantieri non tornano col totale della giornata.';
    case 'REGISTRA_OFF':
      return 'La registrazione giornata è disattivata dall’ufficio.';
    case 'CANTIERE_NON_VALIDO':
      return 'Un cantiere selezionato non è valido.';
    default:
      return 'Registrazione non riuscita. Riprova.';
  }
}

// Pause tipiche in cantiere: coprono di fatto tutti i casi reali. Se serve un
// valore fuori scala lo sistema l'ufficio in fase di verifica.
const PAUSE_CHIPS: { min: number; label: string }[] = [
  { min: 0, label: 'Nessuna' },
  { min: 30, label: '30 min' },
  { min: 45, label: '45 min' },
  { min: 60, label: '1 h' },
];

// Palette "corporate" per cantiere (ciclica): lo STESSO colore tinge il
// segmento nella barra panoramica E il bordo/sfondino della card, così
// colleghi a colpo d'occhio "questo cantiere = questa fetta di giornata".
// Classi come stringhe letterali → il JIT di Tailwind le include.
const CANTIERE_COLORS = [
  { bar: 'bg-primary', border: 'border-l-primary', tint: 'bg-primary/[0.045]' },
  { bar: 'bg-teal-500', border: 'border-l-teal-500', tint: 'bg-teal-500/[0.06]' },
  { bar: 'bg-indigo-500', border: 'border-l-indigo-500', tint: 'bg-indigo-500/[0.06]' },
  { bar: 'bg-amber-500', border: 'border-l-amber-500', tint: 'bg-amber-500/[0.07]' },
  { bar: 'bg-sky-500', border: 'border-l-sky-500', tint: 'bg-sky-500/[0.06]' },
  { bar: 'bg-rose-500', border: 'border-l-rose-500', tint: 'bg-rose-500/[0.06]' },
];

function coloreCantiere(i: number) {
  return CANTIERE_COLORS[i % CANTIERE_COLORS.length] ?? CANTIERE_COLORS[0]!;
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
  const set = (nh: number, nm: number) => onChange(Math.max(0, Math.min(23 * 60 + 59, nh * 60 + nm)));
  const inputCls =
    'w-9 rounded border border-border bg-background px-0.5 py-1 text-center font-mono text-sm font-semibold tabular-nums focus:border-primary focus:outline-none disabled:opacity-50';
  const btnCls =
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground active:scale-95 disabled:opacity-40';
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
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
          className={`pointer-events-none flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2 py-2.5 text-base font-semibold tabular-nums ${
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

type RigaCantiere = { cantiereId: string; nome: string; codice: string | null; minuti: number };

/**
 * Registra una giornata SENZA timbrature (caso 4): inizio/fine + pausa +
 * cantieri/ore. Solo se non c'è nulla timbrato oggi. Sintetizza la giornata
 * lato server (calcolaSegmentiSplit → timbrature → ricalcolo rapportino).
 */
export function RegistraGiornataDialog({
  open,
  onClose,
  tolleranzaMin,
  passoMinuti,
}: {
  open: boolean;
  onClose: () => void;
  tolleranzaMin: number;
  passoMinuti: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [inizio, setInizio] = useState('08:00');
  const [fine, setFine] = useState('17:00');
  const [pausaMin, setPausaMin] = useState(60);
  const [righe, setRighe] = useState<RigaCantiere[]>([]);
  const [cantieri, setCantieri] = useState<PickerCantiere[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [fatto, setFatto] = useState(false);

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

  const grossMin = Math.max(0, Math.round((Date.parse(isoOggi(fine)) - Date.parse(isoOggi(inizio))) / 60000));
  const nettoMin = grossMin - pausaMin;
  const assegnato = righe.reduce((a, r) => a + r.minuti, 0);
  const restano = nettoMin - assegnato;
  const entroTolleranza = Math.abs(restano) <= tolleranzaMin;
  const disponibili = (cantieri ?? []).filter((c) => !righe.some((r) => r.cantiereId === c.id));
  // Panoramica compatta (footer): denominatore della barra = il piu grande fra
  // netto e assegnato, così la barra non sfora mai anche se metti ore di troppo.
  const baseBarra = Math.max(nettoMin, assegnato, 1);
  const pausaLabel = PAUSE_CHIPS.find((p) => p.min === pausaMin)?.label ?? `${pausaMin} min`;

  function aggiungi(id: string) {
    const c = (cantieri ?? []).find((x) => x.id === id);
    setPickerOpen(false);
    if (!c) return;
    const nome = titoloCase(c.nome ?? '') || codiceCantiereMostrato(c) || 'Cantiere';
    setRighe((prev) =>
      prev.some((r) => r.cantiereId === id)
        ? prev
        : [...prev, { cantiereId: id, nome, codice: codiceCantiereMostrato(c), minuti: 0 }],
    );
    setErrore(null);
  }

  function salva() {
    setErrore(null);
    if (righe.length === 0) {
      setErrore('Aggiungi almeno un cantiere.');
      return;
    }
    if (nettoMin <= 0) {
      setErrore('La fine deve essere dopo l’inizio (pausa esclusa).');
      return;
    }
    if (righe.some((r) => r.minuti <= 0)) {
      setErrore('Ogni cantiere deve avere delle ore.');
      return;
    }
    if (!entroTolleranza) {
      setErrore(restano > 0 ? `Restano ${fmtHM(restano)} da assegnare.` : `${fmtHM(-restano)} di troppo.`);
      return;
    }
    startTransition(async () => {
      const res = await registraGiornataDaZero({
        inizioIso: isoOggi(inizio),
        fineIso: isoOggi(fine),
        pausaMin,
        split: righe.map((r) => ({ cantiereId: r.cantiereId, minuti: r.minuti })),
      });
      if (res.ok) {
        // Conferma "premium": mostra l'effetto di successo, poi chiudi e ricarica.
        setFatto(true);
        setTimeout(() => {
          onClose();
          router.refresh();
        }, 950);
      } else {
        setErrore(messaggioErrore(res.error));
      }
    });
  }

  if (!open) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-[80] flex flex-col overflow-hidden bg-background" role="dialog" aria-modal="true">
        <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <button type="button" onClick={onClose} aria-label="Chiudi" className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted active:scale-95">
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-base font-semibold tracking-tight">Registra giornata</h2>
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
            <p className="animate-fade-up text-lg font-semibold text-foreground">Giornata registrata</p>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-4 py-4">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Per una giornata in cui non hai timbrato. Imposta orari e pausa, poi le ore su ogni cantiere.
              </p>

              {/* ── Card MAXIMA: la giornata (orari + pausa + netto) ───────── */}
              <section className="space-y-3 rounded-2xl border-2 border-primary/25 bg-gradient-to-b from-primary/[0.06] to-transparent p-4 shadow-soft">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                      <CalendarClock className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="text-sm font-semibold text-foreground">La giornata</span>
                  </span>
                  <span className="flex flex-col items-end leading-none">
                    <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Ore nette</span>
                    <span className="mt-0.5 font-mono text-lg font-bold tabular-nums text-primary">{fmtHM(Math.max(0, nettoMin))}</span>
                  </span>
                </div>

                {/* Inizio / Fine — 2 colonne 50/50 (min-w-0 sui grid item, così il
                    time nativo iOS non allarga la traccia) via TimeField. */}
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2.5">
                  <TimeField label="Inizio" value={inizio} onChange={setInizio} disabled={pending} />
                  <TimeField label="Fine" value={fine} onChange={setFine} disabled={pending} />
                </div>

                {/* Pausa — dentro la stessa card (chip robusti, niente overflow) */}
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
                          className={`rounded-lg border px-1 py-2 text-sm font-semibold tabular-nums transition-colors disabled:opacity-50 ${
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

              {/* ── Cantieri della giornata (card raggruppate) ─────────────── */}
              <div className="space-y-2.5">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Su quali cantieri
                </p>

                {righe.map((r, i) => (
                  <section
                    key={r.cantiereId}
                    className={`space-y-2.5 rounded-2xl border border-border border-l-4 ${coloreCantiere(i).border} ${coloreCantiere(i).tint} p-3.5 shadow-[0_4px_16px_-6px_rgba(20,40,90,0.20)]`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Cantiere {i + 1}
                        </p>
                        <p className="mt-0.5 truncate text-[15px] font-semibold leading-tight text-foreground">{r.nome}</p>
                        {r.codice ? (
                          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{r.codice}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => setRighe((prev) => prev.filter((_, j) => j !== i))}
                        disabled={pending}
                        aria-label="Rimuovi cantiere"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive active:scale-95 disabled:opacity-40"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
                      <span className="text-xs font-medium text-muted-foreground">Ore lavorate</span>
                      <StepperMin
                        minuti={r.minuti}
                        passo={passoMinuti}
                        disabled={pending}
                        onChange={(m) => setRighe((prev) => prev.map((x, j) => (j === i ? { ...x, minuti: m } : x)))}
                      />
                    </div>
                  </section>
                ))}

                {disponibili.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    disabled={pending}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/40 active:scale-[0.99] disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" /> Aggiungi cantiere
                  </button>
                ) : null}

              </div>

              {errore ? (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{errore}</p>
              ) : null}
            </div>

            {/* ── Footer sticky: panoramica compatta + tastone VERDE ─────────── */}
            <div className="shrink-0 border-t border-emerald-600/15 bg-emerald-50 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-10px_28px_-14px_rgba(20,40,90,0.35)]">
              {/* Panoramica: sempre sopra il tasto, così con tanti cantieri vedi
                  a colpo d'occhio a che punto sei senza scrollare la lista. */}
              <div className="mb-3 space-y-2 rounded-xl border border-border bg-card p-3 shadow-[0_6px_18px_-5px_rgba(20,40,90,0.28)]">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {fmtHM(assegnato)}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">di {fmtHM(Math.max(0, nettoMin))}</span>
                  </span>
                  {righe.length === 0 || assegnato === 0 ? (
                    <span className="text-xs font-semibold text-muted-foreground">Assegna le ore</span>
                  ) : entroTolleranza ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Completa
                    </span>
                  ) : restano > 0 ? (
                    <span className="text-xs font-semibold text-amber-600">Restano {fmtHM(restano)}</span>
                  ) : (
                    <span className="text-xs font-semibold text-amber-600">{fmtHM(-restano)} di troppo</span>
                  )}
                </div>

                {/* Barra a segmenti: un colore per cantiere → riempimento + quanti sono */}
                <div className="flex h-2.5 w-full items-stretch gap-0.5 overflow-hidden rounded-full bg-muted">
                  {righe.map((r, i) =>
                    r.minuti > 0 ? (
                      <div
                        key={r.cantiereId}
                        className={coloreCantiere(i).bar}
                        style={{ width: `${(r.minuti / baseBarra) * 100}%` }}
                      />
                    ) : null,
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" aria-hidden="true" />
                    {righe.length} {righe.length === 1 ? 'cantiere' : 'cantieri'}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Coffee className="h-3 w-3" aria-hidden="true" />
                    {pausaMin > 0 ? `Pausa ${pausaLabel}` : 'Senza pausa'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={salva}
                disabled={pending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-base font-semibold text-white shadow-[0_8px_24px_-8px_rgba(16,185,129,0.6)] transition-transform hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
                Registra giornata
              </button>
            </div>
          </>
        )}
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

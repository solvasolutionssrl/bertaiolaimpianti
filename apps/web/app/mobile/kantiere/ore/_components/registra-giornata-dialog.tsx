'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Minus, X, Loader2 } from 'lucide-react';

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
 * Registra una giornata SENZA timbrature (caso 4): inizio/fine + cantieri/ore.
 * Solo se non c'è nulla timbrato oggi. Sintetizza la giornata lato server.
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
  const [righe, setRighe] = useState<{ cantiereId: string; nome: string; minuti: number }[]>([]);
  const [cantieri, setCantieri] = useState<PickerCantiere[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  // Carica cantieri all'apertura (una volta).
  useEffect(() => {
    if (!open || cantieri != null) return;
    void elencoCantieriTurno().then((res) => {
      if (res.ok) setCantieri(res.cantieri);
    });
  }, [open, cantieri]);

  const grossMin = Math.max(0, Math.round((Date.parse(isoOggi(fine)) - Date.parse(isoOggi(inizio))) / 60000));
  const nettoMin = grossMin - pausaMin;
  const assegnato = righe.reduce((a, r) => a + r.minuti, 0);
  const restano = nettoMin - assegnato;
  const entroTolleranza = Math.abs(restano) <= tolleranzaMin;
  const disponibili = (cantieri ?? []).filter((c) => !righe.some((r) => r.cantiereId === c.id));

  function aggiungi(id: string) {
    const c = (cantieri ?? []).find((x) => x.id === id);
    setPickerOpen(false);
    if (!c) return;
    const nome = titoloCase(c.nome ?? '') || codiceCantiereMostrato(c) || 'Cantiere';
    setRighe((prev) => (prev.some((r) => r.cantiereId === id) ? prev : [...prev, { cantiereId: id, nome, minuti: 0 }]));
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
        onClose();
        router.refresh();
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

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-4 py-4">
          <p className="text-xs text-muted-foreground">
            Per una giornata in cui non hai timbrato. Metti inizio, fine e i cantieri con le ore.
          </p>

          {/* Inizio / fine / pausa */}
          <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-muted/25 p-3">
            <div className="space-y-1">
              <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Inizio</label>
              <input type="time" value={inizio} onChange={(e) => setInizio(e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm tabular-nums focus:border-primary focus:outline-none" />
            </div>
            <div className="space-y-1">
              <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Fine</label>
              <input type="time" value={fine} onChange={(e) => setFine(e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm tabular-nums focus:border-primary focus:outline-none" />
            </div>
            <div className="space-y-1">
              <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Pausa min</label>
              <input type="number" inputMode="numeric" min={0} max={600} step={15} value={pausaMin} onChange={(e) => setPausaMin(Math.max(0, Math.min(600, parseInt(e.target.value, 10) || 0)))} className="w-full rounded-md border border-border bg-background px-2 py-2 text-center text-sm tabular-nums focus:border-primary focus:outline-none" />
            </div>
          </div>

          {/* Cantieri */}
          <div className="space-y-2">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Cantieri della giornata
            </p>
            {righe.map((r, i) => (
              <div key={r.cantiereId} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{r.nome}</span>
                <StepperMin minuti={r.minuti} passo={passoMinuti} disabled={pending} onChange={(m) => setRighe((prev) => prev.map((x, j) => (j === i ? { ...x, minuti: m } : x)))} />
                <button type="button" onClick={() => setRighe((prev) => prev.filter((_, j) => j !== i))} aria-label="Rimuovi" className="shrink-0 text-muted-foreground hover:text-destructive">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            {disponibili.length > 0 ? (
              <button type="button" onClick={() => setPickerOpen(true)} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-sm font-medium text-muted-foreground hover:bg-muted/40">
                <Plus className="h-4 w-4" /> Aggiungi cantiere
              </button>
            ) : null}
            <p className={`text-center text-xs font-semibold ${entroTolleranza ? 'text-emerald-600' : 'text-amber-600'}`}>
              {entroTolleranza
                ? restano === 0
                  ? `Tutto assegnato ✓ (netti ${fmtHM(nettoMin)})`
                  : `OK · l'ultimo cantiere aggiusta ${fmtHM(Math.abs(restano))}`
                : restano > 0
                  ? `Restano ${fmtHM(restano)} da assegnare (netti ${fmtHM(nettoMin)})`
                  : `${fmtHM(-restano)} di troppo`}
            </p>
          </div>

          {errore ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{errore}</p>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-border px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={salva} disabled={pending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-base font-semibold text-primary-foreground shadow-soft active:scale-[0.99] disabled:opacity-50">
            {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            Registra giornata
          </button>
        </div>
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

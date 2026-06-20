'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Car, ChevronDown, MapPin } from 'lucide-react';
import { Button } from '@kommessa/ui';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@kommessa/ui';
import { registraOreManuali } from '@/app/_actions/kantiere-rapportino';

// ── tipi ────────────────────────────────────────────────────────────────────

interface Cantiere {
  id: string;
  nome: string;
}

interface Sede {
  id: string;
  nome: string;
  tipo: string;
}

interface Mezzo {
  id: string;
  targa: string;
  modello: string | null;
}

export interface ManualeDialogProps {
  open: boolean;
  onClose: () => void;
  data: string;
  cantieri: Cantiere[];
  sedi: Sede[];
  mezzi: Mezzo[];
}

// ── stato tratta ────────────────────────────────────────────────────────────

interface TrattaState {
  attiva: boolean;
  sedeId: string;
  minuti: number;
  autista: boolean;
  mezzoId: string;
}

function trattaIniziale(sedi: Sede[]): TrattaState {
  return {
    attiva: false,
    sedeId: sedi[0]?.id ?? '',
    minuti: 0,
    autista: false,
    mezzoId: '',
  };
}

// ── helper ───────────────────────────────────────────────────────────────────

/** Minuti -> "2h 30min" / "45min" / "0min". */
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

function messaggioErrore(code: string): string {
  switch (code) {
    case 'CANTIERE_NON_VALIDO':
      return 'Cantiere non valido. Ricarica la pagina e riprova.';
    case 'SEDE_NON_VALIDA':
      return 'Sede selezionata non valida. Ricarica la pagina e riprova.';
    case 'MEZZO_NON_VALIDO':
      return 'Mezzo selezionato non valido. Ricarica la pagina e riprova.';
    case 'NON_MODIFICABILE':
      return 'Il rapportino non e piu modificabile (gia approvato).';
    case 'NESSUN_DIPENDENTE':
      return 'Nessun profilo dipendente collegato a questo account.';
    case 'NON_AUTENTICATO':
      return 'Devi essere autenticato per registrare le ore.';
    case 'MODULO_OFF':
      return 'Il modulo Kantiere non e abilitato per questo spazio.';
    default:
      return 'Registrazione non riuscita. Riprova.';
  }
}

// ── sezione tratta ───────────────────────────────────────────────────────────

function TrattaSection({
  label,
  tratta,
  sedi,
  mezzi,
  disabled,
  onChange,
}: {
  label: string;
  tratta: TrattaState;
  sedi: Sede[];
  mezzi: Mezzo[];
  disabled: boolean;
  onChange: (patch: Partial<TrattaState>) => void;
}) {
  function step(delta: number) {
    onChange({ minuti: Math.max(0, tratta.minuti + delta) });
  }

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-3">
      {/* Toggle attivazione */}
      <label className="flex cursor-pointer items-center gap-2.5 select-none">
        <input
          type="checkbox"
          checked={tratta.attiva}
          onChange={(e) => onChange({ attiva: e.target.checked })}
          disabled={disabled}
          className="h-4 w-4 rounded border-input accent-primary"
        />
        <span className="text-sm font-medium text-foreground">{label}</span>
      </label>

      {tratta.attiva && (
        <div className="space-y-3 pt-0.5">
          {/* Sede */}
          {sedi.length > 0 && (
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <MapPin className="h-3.5 w-3.5" strokeWidth={1.75} />
                Sede
              </p>
              <div className="grid gap-1.5">
                {sedi.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onChange({ sedeId: s.id })}
                    disabled={disabled}
                    className={[
                      'flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                      tratta.sedeId === s.id
                        ? 'border-primary bg-primary/5 font-medium text-foreground'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted/40',
                    ].join(' ')}
                  >
                    <span className="truncate">{s.nome}</span>
                    {tipoSedeLabel(s.tipo) && (
                      <span className="ml-2 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
                        {tipoSedeLabel(s.tipo)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Durata stepper */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Durata viaggio
            </p>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-background border border-border px-2 py-1.5">
              <button
                type="button"
                onClick={() => step(-15)}
                disabled={disabled || tratta.minuti <= 0}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted text-lg font-semibold text-foreground hover:bg-muted/80 disabled:opacity-40 transition-colors"
                aria-label="Meno 15 minuti"
              >
                -
              </button>
              <span className="flex-1 text-center text-xl font-bold tabular-nums text-foreground">
                {formatDurata(tratta.minuti)}
              </span>
              <button
                type="button"
                onClick={() => step(15)}
                disabled={disabled}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted text-lg font-semibold text-foreground hover:bg-muted/80 disabled:opacity-40 transition-colors"
                aria-label="Piu 15 minuti"
              >
                +
              </button>
            </div>
          </div>

          {/* Autista */}
          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-2.5 select-none">
              <input
                type="checkbox"
                checked={tratta.autista}
                onChange={(e) => onChange({ autista: e.target.checked })}
                disabled={disabled}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                <Car className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
                Ero io l&apos;autista del mezzo
              </span>
            </label>

            {tratta.autista && (
              <>
                {mezzi.length > 0 ? (
                  <div className="relative">
                    <select
                      value={tratta.mezzoId}
                      onChange={(e) => onChange({ mezzoId: e.target.value })}
                      disabled={disabled}
                      className="w-full appearance-none rounded-md border border-border bg-background py-2 pl-3 pr-8 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                    >
                      <option value="">Seleziona il mezzo...</option>
                      {mezzi.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.targa}
                          {m.modello ? ` (${m.modello})` : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Nessun mezzo configurato. L&apos;ufficio puo aggiungerli nel parco mezzi.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── componente principale ────────────────────────────────────────────────────

export function ManualeDialog({
  open,
  onClose,
  data,
  cantieri,
  sedi,
  mezzi,
}: ManualeDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [cantiereId, setCantiereId] = useState<string>(cantieri[0]?.id ?? '');
  const [oreOrdinarie, setOreOrdinarie] = useState<number>(0);
  const [oreStraordinarie, setOreStraordinarie] = useState<number>(0);
  const [andata, setAndata] = useState<TrattaState>(() => trattaIniziale(sedi));
  const [ritorno, setRitorno] = useState<TrattaState>(() => trattaIniziale(sedi));
  const [errore, setErrore] = useState<string | null>(null);

  function resetForm() {
    setCantiereId(cantieri[0]?.id ?? '');
    setOreOrdinarie(0);
    setOreStraordinarie(0);
    setAndata(trattaIniziale(sedi));
    setRitorno(trattaIniziale(sedi));
    setErrore(null);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function clampOre(v: number): number {
    const n = parseFloat(v.toString());
    return isNaN(n) ? 0 : Math.max(0, Math.min(24, n));
  }

  function handleRegistra() {
    setErrore(null);

    if (!cantiereId) {
      setErrore('Seleziona un cantiere.');
      return;
    }

    // Costruisce array viaggi solo per tratte attive con minuti > 0
    const viaggi: Array<{
      direzione: 'andata' | 'ritorno';
      sedeId: string;
      minuti: number;
      autista: boolean;
      mezzoId: string | null;
    }> = [];

    if (andata.attiva && andata.minuti > 0) {
      if (!andata.sedeId) {
        setErrore('Seleziona la sede per il viaggio di andata.');
        return;
      }
      viaggi.push({
        direzione: 'andata',
        sedeId: andata.sedeId,
        minuti: andata.minuti,
        autista: andata.autista,
        mezzoId: andata.autista && andata.mezzoId ? andata.mezzoId : null,
      });
    }

    if (ritorno.attiva && ritorno.minuti > 0) {
      if (!ritorno.sedeId) {
        setErrore('Seleziona la sede per il viaggio di ritorno.');
        return;
      }
      viaggi.push({
        direzione: 'ritorno',
        sedeId: ritorno.sedeId,
        minuti: ritorno.minuti,
        autista: ritorno.autista,
        mezzoId: ritorno.autista && ritorno.mezzoId ? ritorno.mezzoId : null,
      });
    }

    startTransition(async () => {
      const res = await registraOreManuali({
        data,
        cantiereId,
        ore_ordinarie: oreOrdinarie,
        ore_straordinarie: oreStraordinarie,
        viaggi,
      });

      if (res.ok) {
        router.refresh();
        handleClose();
      } else {
        setErrore(messaggioErrore(res.error));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aggiungi ore a mano</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Cantiere */}
          <div className="space-y-1.5">
            <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Cantiere <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <select
                value={cantiereId}
                onChange={(e) => { setCantiereId(e.target.value); setErrore(null); }}
                disabled={isPending}
                className="w-full appearance-none rounded-md border border-border bg-background py-2.5 pl-3 pr-8 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              >
                {cantieri.length === 0 && (
                  <option value="">Nessun cantiere disponibile</option>
                )}
                {cantieri.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
            </div>
          </div>

          {/* Ore */}
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Ore di lavoro
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-0.5">
                <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                  Ordinarie
                </label>
                <input
                  type="number"
                  min={0}
                  max={24}
                  step={0.5}
                  value={oreOrdinarie}
                  onChange={(e) => { setOreOrdinarie(clampOre(parseFloat(e.target.value))); setErrore(null); }}
                  disabled={isPending}
                  className="w-full rounded-md border border-border bg-background px-2 py-2 text-center font-mono text-sm tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                  Straordinarie
                </label>
                <input
                  type="number"
                  min={0}
                  max={24}
                  step={0.5}
                  value={oreStraordinarie}
                  onChange={(e) => { setOreStraordinarie(clampOre(parseFloat(e.target.value))); setErrore(null); }}
                  disabled={isPending}
                  className="w-full rounded-md border border-border bg-background px-2 py-2 text-center font-mono text-sm tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                />
              </div>
            </div>
          </div>

          {/* Viaggi */}
          {sedi.length > 0 && (
            <div className="space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Viaggio (opzionale)
              </p>
              <TrattaSection
                label="Viaggio di andata"
                tratta={andata}
                sedi={sedi}
                mezzi={mezzi}
                disabled={isPending}
                onChange={(patch) => setAndata((prev) => ({ ...prev, ...patch }))}
              />
              <TrattaSection
                label="Viaggio di ritorno"
                tratta={ritorno}
                sedi={sedi}
                mezzi={mezzi}
                disabled={isPending}
                onChange={(patch) => setRitorno((prev) => ({ ...prev, ...patch }))}
              />
            </div>
          )}

          {/* Errore */}
          {errore && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errore}
            </p>
          )}

          {/* Bottoni */}
          <div className="flex flex-col gap-2 pt-1">
            <Button
              type="button"
              onClick={handleRegistra}
              disabled={isPending || cantieri.length === 0}
              className="w-full"
            >
              {isPending ? 'Registrazione...' : 'Registra'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isPending}
              className="w-full"
            >
              Annulla
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

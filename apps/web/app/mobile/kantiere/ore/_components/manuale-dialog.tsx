'use client';

import { useState, useTransition, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Car, ChevronDown, Loader2, MapPin } from 'lucide-react';
import { useConfermaPasseggero } from '@/app/_components/conferma-passeggero';
import { Button } from '@kommessa/ui';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@kommessa/ui';
import { registraOreManuali } from '@/app/_actions/kantiere-rapportino';
import { CantierePicker, type PickerCantiere } from '../../_components/cantiere-picker';

// ── tipi ────────────────────────────────────────────────────────────────────

interface Sede {
  id: string;
  nome: string;
  tipo: string;
  isDefault: boolean;
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
  cantieri: PickerCantiere[];
  sedi: Sede[];
  /** cantiere_id → sede_id[] associate: il flusso viaggio mostra solo le sedi
   *  AMMESSE per il cantiere scelto (predefinita + associate), mai di altri. */
  sediPerCantiere: Record<string, string[]>;
  mezzi: Mezzo[];
}

// ── stato tratta ────────────────────────────────────────────────────────────

interface TrattaState {
  attiva: boolean;
  sedeId: string;
  minuti: number;
  autista: boolean;
  mezzoId: string;
  /** Km definitivi dalla stima API: non modificabili dall'utente. */
  distanzaKm: number | null;
}

function trattaIniziale(): TrattaState {
  return {
    // La sede si sceglie DOPO il cantiere (le sedi ammesse dipendono da esso).
    attiva: false,
    sedeId: '',
    minuti: 0,
    autista: false,
    mezzoId: '',
    distanzaKm: null,
  };
}

// ── helper ───────────────────────────────────────────────────────────────────

/** Km -> "12,3 km" / "km n.d." se null. */
function formatKm(km: number | null): string {
  if (km === null) return 'km n.d.';
  return `${km.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

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
  stimaLoading,
  onChange,
  onEvidenzaSpenta,
}: {
  label: string;
  tratta: TrattaState;
  sedi: Sede[];
  mezzi: Mezzo[];
  disabled: boolean;
  stimaLoading: boolean;
  onChange: (patch: Partial<TrattaState>) => void;
  /** Spegne l'alone sulla spunta autista appena l'utente ci mette mano. */
  onEvidenzaSpenta?: () => void;
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
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Durata viaggio
              </p>
              {stimaLoading ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> stima...
                </span>
              ) : (
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground">
                  {formatKm(tratta.distanzaKm)}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-background border border-border px-2 py-1.5">
              <button
                type="button"
                onClick={() => step(-15)}
                disabled={disabled || stimaLoading || tratta.minuti <= 0}
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
                disabled={disabled || stimaLoading}
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
                onChange={(e) => {
                  onEvidenzaSpenta?.();
                  onChange({ autista: e.target.checked });
                }}
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
  sediPerCantiere,
  mezzi,
}: ManualeDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const passeggero = useConfermaPasseggero();

  // Nessun cantiere pre-selezionato: con molti cantieri sceglierne uno a caso
  // sarebbe fuorviante. L'utente lo sceglie dal picker (Registra lo richiede).
  const [cantiereId, setCantiereId] = useState<string>('');
  // Un solo campo "ore di lavoro": lo split ordinario/straordinario lo fa
  // l'ufficio in fase di ricalcolo, non il tecnico.
  const [oreLavoro, setOreLavoro] = useState<number>(0);
  const [andata, setAndata] = useState<TrattaState>(() => trattaIniziale());
  const [ritorno, setRitorno] = useState<TrattaState>(() => trattaIniziale());
  const [errore, setErrore] = useState<string | null>(null);

  // Sedi AMMESSE per il cantiere scelto: la predefinita (sempre) + quelle
  // associate a quel cantiere. Mai le sedi collegate ad altri cantieri.
  const sediVisibili = useMemo(() => {
    if (!cantiereId) return [] as Sede[];
    const assoc = new Set(sediPerCantiere[cantiereId] ?? []);
    return sedi.filter((s) => s.isDefault || assoc.has(s.id));
  }, [cantiereId, sedi, sediPerCantiere]);

  // stima loading separati per non inquinare TrattaState con stato UI transiente
  const [stimaLoadingAndata, setStimaLoadingAndata] = useState(false);
  const [stimaLoadingRitorno, setStimaLoadingRitorno] = useState(false);

  /** Chiama l'API di stima per una tratta e aggiorna minuti + km. */
  const calcolaStima = useCallback(
    async (
      sedeId: string,
      cId: string,
      direzione: 'andata' | 'ritorno',
      setTratta: (fn: (prev: TrattaState) => TrattaState) => void,
      setStimaLoading: (v: boolean) => void,
    ) => {
      if (!sedeId || !cId) return;
      setStimaLoading(true);
      try {
        const res = await fetch('/api/routing/stima', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sedeId, cantiereId: cId, direzione }),
        });
        const j = (await res.json()) as { ok: boolean; minuti: number | null; km?: number | null };
        if (j.ok && typeof j.minuti === 'number') {
          setTratta((prev) => ({
            ...prev,
            minuti: j.minuti as number,
            distanzaKm: typeof j.km === 'number' ? j.km : null,
          }));
        } else {
          setTratta((prev) => ({ ...prev, distanzaKm: null }));
        }
      } catch {
        setTratta((prev) => ({ ...prev, distanzaKm: null }));
      } finally {
        setStimaLoading(false);
      }
    },
    [],
  );

  function resetForm() {
    setCantiereId('');
    setOreLavoro(0);
    setAndata(trattaIniziale());
    setRitorno(trattaIniziale());
    setErrore(null);
    setStimaLoadingAndata(false);
    setStimaLoadingRitorno(false);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function clampOre(v: number): number {
    const n = parseFloat(v.toString());
    return isNaN(n) ? 0 : Math.max(0, Math.min(24, n));
  }

  /** Gestisce cambio cantiere: le sedi ammesse cambiano, quindi azzera la sede
   *  scelta nelle tratte se non è più valida per il nuovo cantiere (evita di
   *  tenere una sede di un altro cantiere) e ricalcola la stima se ancora ok. */
  function handleCantiereChange(cId: string) {
    setCantiereId(cId);
    setErrore(null);
    if (!cId) {
      setAndata((p) => ({ ...p, sedeId: '', minuti: 0, distanzaKm: null }));
      setRitorno((p) => ({ ...p, sedeId: '', minuti: 0, distanzaKm: null }));
      return;
    }
    const ammesse = new Set(
      sedi.filter((s) => s.isDefault || (sediPerCantiere[cId] ?? []).includes(s.id)).map((s) => s.id),
    );
    const risolvi = (
      tratta: TrattaState,
      set: (fn: (prev: TrattaState) => TrattaState) => void,
      setLoading: (v: boolean) => void,
      dir: 'andata' | 'ritorno',
    ) => {
      if (tratta.sedeId && ammesse.has(tratta.sedeId)) {
        if (tratta.attiva) void calcolaStima(tratta.sedeId, cId, dir, set, setLoading);
      } else {
        set((p) => ({ ...p, sedeId: '', minuti: 0, distanzaKm: null }));
      }
    };
    risolvi(andata, setAndata, setStimaLoadingAndata, 'andata');
    risolvi(ritorno, setRitorno, setStimaLoadingRitorno, 'ritorno');
  }

  /** Gestisce patch andata: se cambia sedeId e cantiere e` gia` selezionato, ricalcola stima. */
  function handleAndataChange(patch: Partial<TrattaState>) {
    setAndata((prev) => {
      const next = { ...prev, ...patch };
      return next;
    });
    if ('sedeId' in patch && patch.sedeId && cantiereId) {
      void calcolaStima(patch.sedeId, cantiereId, 'andata', setAndata, setStimaLoadingAndata);
    }
  }

  /** Gestisce patch ritorno: se cambia sedeId e cantiere e` gia` selezionato, ricalcola stima. */
  function handleRitornoChange(patch: Partial<TrattaState>) {
    setRitorno((prev) => {
      const next = { ...prev, ...patch };
      return next;
    });
    if ('sedeId' in patch && patch.sedeId && cantiereId) {
      void calcolaStima(patch.sedeId, cantiereId, 'ritorno', setRitorno, setStimaLoadingRitorno);
    }
  }

  async function handleRegistra() {
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
      distanzaKm: number | null;
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
        distanzaKm: andata.distanzaKm,
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
        distanzaKm: ritorno.distanzaKm,
      });
    }

    // Basta una tratta dichiarata da passeggero: quei km non li conta nessuno.
    const qualcunaDaPasseggero = viaggi.some((v) => !v.autista);
    if (qualcunaDaPasseggero && !(await passeggero.conferma(false))) return;

    startTransition(async () => {
      const res = await registraOreManuali({
        data,
        cantiereId,
        ore_ordinarie: oreLavoro,
        ore_straordinarie: 0,
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
      {/* Modulo strutturato: header · contenuto (unico blocco scrollabile, così
          il dropdown assoluto del picker non viene tagliato) · footer coi tasti
          in basso (mt-auto). `min-h` = modulo più alto e arioso. flex (non grid)
          → niente crescita da min-content; overflow-x-hidden come rete. */}
      <DialogContent className="relative flex min-h-[64vh] flex-col gap-3 overflow-x-hidden">
        {/* Dentro il dialog: un secondo dialog Radix chiuderebbe questo. */}
        {passeggero.pannello}

        <DialogHeader className="shrink-0 pr-8 text-left">
          <DialogTitle>Aggiungi ore a mano</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Giornata senza timbrature: scegli il cantiere e indica le ore.
          </p>
        </DialogHeader>

        <div className="min-w-0 space-y-3">
          {/* Gruppo GIORNATA: Cantiere + Ore */}
          <div className="min-w-0 space-y-3 rounded-xl border border-border bg-muted/25 p-3">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
              Giornata
            </p>

            {/* Cantiere — picker con ricerca (si apre solo al tap). */}
            <div className="min-w-0 space-y-1.5">
              <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Cantiere <span className="text-destructive">*</span>
              </label>
              <CantierePicker
                cantieri={cantieri}
                value={cantiereId || null}
                onChange={handleCantiereChange}
                placeholder={cantieri.length === 0 ? 'Nessun cantiere disponibile' : 'Scegli cantiere'}
                disabled={isPending || cantieri.length === 0}
              />
            </div>

            {/* Ore di lavoro — un solo campo, lo split lo fa l'ufficio */}
            <div className="space-y-1.5">
              <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Ore di lavoro <span className="text-destructive">*</span>
              </label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={24}
                step={0.5}
                value={oreLavoro}
                onChange={(e) => { setOreLavoro(clampOre(parseFloat(e.target.value))); setErrore(null); }}
                disabled={isPending}
                className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-center font-mono text-base tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Ore di lavoro totali. Ordinario e straordinario li calcola l&apos;ufficio.
              </p>
            </div>
          </div>

          {/* Viaggi — le sedi dipendono dal cantiere: compaiono dopo la scelta */}
          {cantiereId && sediVisibili.length > 0 ? (
            <div
              ref={passeggero.propsEvidenza.ref}
              className={'space-y-2 ' + passeggero.propsEvidenza.className}
            >
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                Viaggio (opzionale)
              </p>
              <TrattaSection
                onEvidenzaSpenta={passeggero.spegniEvidenza}
                label="Viaggio di andata"
                tratta={andata}
                sedi={sediVisibili}
                mezzi={mezzi}
                disabled={isPending}
                stimaLoading={stimaLoadingAndata}
                onChange={handleAndataChange}
              />
              <TrattaSection
                onEvidenzaSpenta={passeggero.spegniEvidenza}
                label="Viaggio di ritorno"
                tratta={ritorno}
                sedi={sediVisibili}
                mezzi={mezzi}
                disabled={isPending}
                stimaLoading={stimaLoadingRitorno}
                onChange={handleRitornoChange}
              />
            </div>
          ) : null}

          {/* Errore */}
          {errore && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errore}
            </p>
          )}
        </div>

        {/* Footer coi tasti in basso (mt-auto spinge in fondo quando il
            contenuto è corto). */}
        <div className="mt-auto flex shrink-0 flex-col gap-2 border-t border-border pt-3">
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
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Utensils, Play, LogOut, Loader2 } from 'lucide-react';
import { SOGLIA_PAUSA_PRANZO_ORE } from '@kommessa/api/kantiere-ore';
import {
  pausaPranzoMia,
  riprendiTurnoMio,
  terminaTurnoMio,
} from '@/app/_actions/kantiere-timbra';
import {
  ViaggioRitornoDialog,
  type ViaggioRitornoSede,
  type ViaggioRitornoMezzo,
  type ViaggioRitornoConfirm,
} from '@/app/_components/viaggio-ritorno-dialog';

export interface TurnoAzioniCantiereProps {
  cantiereId: string;
  /** ISO inizio turno. */
  inizioTs: string;
  /** true se il turno è in pausa pranzo. */
  inPausa: boolean;
  /** ISO inizio pausa, o null. */
  inizioPausaTs: string | null;
  /** true se oggi risulta già una pausa pranzo timbrata su questo cantiere. */
  pausaOggiFatta?: boolean;
  /** Sedi selezionabili per il viaggio di ritorno (vuoto = niente viaggio). */
  sedi?: ViaggioRitornoSede[];
  /** Parco mezzi attivo del tenant. */
  mezzi?: ViaggioRitornoMezzo[];
  /** Sede preselezionata (default del tenant). */
  sedeDefaultId?: string | null;
  /** Soglia (ore) del prompt pausa pranzo (per-tenant). Default `SOGLIA_PAUSA_PRANZO_ORE`. */
  sogliaPausaPranzoOre?: number;
  /** Soglia (ore) di auto-spegnimento della pausa dimenticata (per-tenant). Default 1.5. */
  sogliaAutoSpegnimentoPausaOre?: number;
}

function ora(ts: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
}

function formatTrascorso(ms: number): string {
  const totMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totMin / 60);
  const m = totMin % 60;
  if (h === 0) return `${m}min`;
  return `${h}h ${String(m).padStart(2, '0')}min`;
}

/** Countdown "mm:ss" (minuti totali : secondi). */
function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "HH:MM" ora locale corrente (device = Italia). */
function oraLocaleNow(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** ISO da un "HH:MM" di oggi (fuso del device = Italia). */
function isoDaOraLocale(hhmm: string): string {
  const [hh, mm] = hhmm.split(':').map((x) => parseInt(x, 10));
  const d = new Date();
  d.setHours(hh ?? 0, mm ?? 0, 0, 0);
  return d.toISOString();
}

function messaggioErrore(code: string): string {
  switch (code) {
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

/**
 * Azioni turno in cima alla scheda cantiere: avvia/riprendi pausa pranzo e
 * termina turno (a ora attuale o a un orario scelto). Mostrata solo quando il
 * dipendente ha un turno aperto su QUESTO cantiere.
 */
export function TurnoAzioniCantiere({
  cantiereId,
  inizioTs,
  inPausa,
  inizioPausaTs,
  pausaOggiFatta = false,
  sedi = [],
  mezzi = [],
  sedeDefaultId = null,
  sogliaPausaPranzoOre = SOGLIA_PAUSA_PRANZO_ORE,
  sogliaAutoSpegnimentoPausaOre = 1.5,
}: TurnoAzioniCantiereProps) {
  const router = useRouter();
  // Seed deterministico (inizio turno) per evitare il mismatch di hydration;
  // l'effect passa al tempo reale dopo il mount (contatore/countdown live).
  const [now, setNow] = useState(() => Date.parse(inizioTs));
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  // Il dialog "Viaggio di ritorno + pausa" gestisce sia il viaggio sia la pausa
  // pranzo dichiarata; qui teniamo solo se è aperto e l'eventuale ora scelta.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tsScelto, setTsScelto] = useState<string | undefined>(undefined);
  const [cambiaOra, setCambiaOra] = useState(false);
  const [oraSel, setOraSel] = useState(oraLocaleNow());

  const durataTurnoMin = Math.max(0, Math.floor((now - Date.parse(inizioTs)) / 60000));
  // Prompt pausa: turno al lavoro (non in pausa), senza pausa oggi, oltre soglia.
  const promptPausa = !inPausa && !pausaOggiFatta && durataTurnoMin >= sogliaPausaPranzoOre * 60;

  // Auto-spegnimento pausa dimenticata: scadenza e tempo rimanente (mm:ss).
  const scadenzaPausaMs =
    inPausa && inizioPausaTs
      ? Date.parse(inizioPausaTs) + sogliaAutoSpegnimentoPausaOre * 3600000
      : null;
  const rimanentePausaMs = scadenzaPausaMs != null ? scadenzaPausaMs - now : null;

  // In pausa ticka al secondo (countdown preciso), altrimenti ogni 30s.
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), inPausa ? 1000 : 30_000);
    return () => clearInterval(id);
  }, [inPausa]);

  // Quando la pausa supera la soglia, riprende il turno da solo UNA volta (il
  // server resta la fonte di verità: qui è solo per l'app aperta).
  const autoRipresaRef = useRef(false);
  useEffect(() => {
    if (!inPausa) {
      autoRipresaRef.current = false;
      return;
    }
    if (scadenzaPausaMs != null && now >= scadenzaPausaMs && !autoRipresaRef.current) {
      autoRipresaRef.current = true;
      esegui(() => riprendiTurnoMio({ cantiereId }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, inPausa, scadenzaPausaMs, cantiereId]);

  function esegui(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErr(null);
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setCambiaOra(false);
        router.refresh();
      } else {
        setErr(messaggioErrore(res.error ?? ''));
      }
    });
  }

  /** Apre il dialog viaggio+pausa, ricordando l'eventuale ora di fine scelta. */
  function apriTermina(ts?: string) {
    setErr(null);
    setTsScelto(ts);
    setDialogOpen(true);
  }

  /** Conferma dal dialog: registra viaggio + pausa + ora scelta sul server. */
  async function confermaTermina(
    payload: ViaggioRitornoConfirm,
  ): Promise<{ ok: boolean; error?: string }> {
    const res = await terminaTurnoMio({
      cantiereId,
      ts: tsScelto,
      viaggio: payload.viaggio ?? undefined,
      pausaPranzoMin: payload.pausaPranzoMin,
    });
    if (res.ok) {
      setCambiaOra(false);
      router.refresh();
    }
    return res;
  }

  const trascorso = formatTrascorso(now - Date.parse(inizioTs));

  const palette = inPausa
    ? {
        ring: 'border-amber-400/50',
        bg: 'bg-gradient-to-br from-amber-50 via-amber-50/60 to-transparent',
        dot: 'bg-amber-500',
        tag: 'text-amber-700',
        sub: 'text-amber-800/80',
      }
    : {
        ring: 'border-emerald-500/30',
        bg: 'bg-gradient-to-br from-emerald-50 via-emerald-50/60 to-transparent',
        dot: 'bg-emerald-500',
        tag: 'text-emerald-700',
        sub: 'text-emerald-800/80',
      };

  return (
    <div className={`rounded-2xl border ${palette.ring} ${palette.bg} p-4 shadow-soft`}>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="relative flex h-2.5 w-2.5">
            {!inPausa && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/70" />
            )}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${palette.dot}`} />
          </span>
          <span className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.16em] ${palette.tag}`}>
            {inPausa && <Utensils className="h-3 w-3" strokeWidth={2.5} />}
            {inPausa ? 'In pausa pranzo' : 'Turno in corso'}
          </span>
        </span>
        {!inPausa && (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-emerald-800">
            {trascorso}
          </span>
        )}
      </div>
      <p className={`mt-1.5 text-xs ${palette.sub}`}>
        {inPausa
          ? `In pausa dalle ${inizioPausaTs ? ora(inizioPausaTs) : '--:--'}`
          : `Timbrato alle ${ora(inizioTs)}`}
      </p>
      {inPausa && rimanentePausaMs != null ? (
        <p className="mt-1 text-[11px] font-medium tabular-nums text-amber-800">
          La pausa si chiude tra {fmtCountdown(rimanentePausaMs)} · ricordati di interromperla a mano
        </p>
      ) : null}

      <div className="mt-3 space-y-2">
        {inPausa ? (
          <button
            type="button"
            onClick={() => esegui(() => riprendiTurnoMio({ cantiereId }))}
            disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-base font-semibold text-white shadow-soft active:scale-[0.99] transition-all hover:bg-emerald-700 disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" strokeWidth={2} />}
            Riprendi turno
          </button>
        ) : (
          <button
            type="button"
            onClick={() => esegui(() => pausaPranzoMia({ cantiereId }))}
            disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-100 py-3.5 text-base font-semibold text-amber-900 shadow-soft active:scale-[0.99] transition-all hover:bg-amber-200 disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Utensils className="h-5 w-5" strokeWidth={2} />}
            Avvia pausa pranzo
          </button>
        )}

        {/* La pausa pranzo dichiarata + il viaggio di ritorno vivono ora nel
            dialog "Termina turno" (apre su tap del pulsante qui sotto). */}
        {!cambiaOra ? (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => apriTermina(undefined)}
              disabled={pending}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background py-3 text-base font-semibold text-foreground active:scale-[0.99] transition-all hover:bg-muted disabled:opacity-60"
            >
              <LogOut className="h-5 w-5" strokeWidth={2} />
              Termina turno ({oraLocaleNow()})
            </button>
            <button
              type="button"
              onClick={() => setCambiaOra(true)}
              disabled={pending}
              className="text-center text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Sono uscito prima? Cambia l&apos;ora di fine
            </button>
          </div>
        ) : (
          <div className="space-y-2 rounded-lg bg-muted/40 p-3">
            <label className="text-xs font-medium text-muted-foreground">Ora di fine turno</label>
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={oraSel}
                onChange={(e) => setOraSel(e.target.value)}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums focus:border-primary focus:outline-none"
              />
              <button
                type="button"
                onClick={() => apriTermina(isoDaOraLocale(oraSel))}
                disabled={pending}
                className="rounded-md bg-foreground px-3 py-2 text-sm font-semibold text-background disabled:opacity-60"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Termina'}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setCambiaOra(false)}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Annulla
            </button>
          </div>
        )}

        {err && <p className="text-xs text-destructive">{err}</p>}
      </div>

      <ViaggioRitornoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        cantiereId={cantiereId}
        sedi={sedi}
        sedeDefaultId={sedeDefaultId}
        mezzi={mezzi}
        pausaPrompt={promptPausa ? { durataMin: durataTurnoMin } : null}
        onConfirm={confermaTermina}
      />
    </div>
  );
}

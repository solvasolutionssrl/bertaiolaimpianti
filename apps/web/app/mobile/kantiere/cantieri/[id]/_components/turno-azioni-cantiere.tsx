'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Utensils, Play, LogOut, Loader2 } from 'lucide-react';
import {
  pausaPranzoMia,
  riprendiTurnoMio,
  terminaTurnoMio,
} from '@/app/_actions/kantiere-timbra';

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
}: TurnoAzioniCantiereProps) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [cambiaOra, setCambiaOra] = useState(false);
  const [oraSel, setOraSel] = useState(oraLocaleNow());
  // Pausa pranzo dichiarata in uscita (ripiego se non timbrata).
  const [pausaFatta, setPausaFatta] = useState(false);
  const [pausaMin, setPausaMin] = useState<30 | 45 | 60>(30);

  const durataTurnoMin = Math.max(0, Math.floor((now - Date.parse(inizioTs)) / 60000));
  const promptPausa = !inPausa && !pausaOggiFatta && durataTurnoMin >= 6 * 60;
  const pausaPranzoMin = promptPausa && pausaFatta ? pausaMin : undefined;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

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

        {/* Pausa pranzo non rilevata su turno lungo */}
        {promptPausa ? (
          <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
            <p className="flex items-start gap-1.5 text-sm font-semibold text-amber-900">
              <Utensils className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
              Pausa pranzo non rilevata
            </p>
            <p className="text-[13px] leading-snug text-amber-800">
              Turno lungo senza pausa timbrata. Ricorda: <strong>timbrare la pausa
              è il modo corretto</strong>; questa è solo una correzione.
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
          </div>
        ) : null}

        {!cambiaOra ? (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => esegui(() => terminaTurnoMio({ cantiereId, pausaPranzoMin }))}
              disabled={pending}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background py-3 text-base font-semibold text-foreground active:scale-[0.99] transition-all hover:bg-muted disabled:opacity-60"
            >
              <LogOut className="h-5 w-5" strokeWidth={2} />
              Termina turno ora ({oraLocaleNow()})
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
                onClick={() =>
                  esegui(() =>
                    terminaTurnoMio({ cantiereId, ts: isoDaOraLocale(oraSel), pausaPranzoMin }),
                  )
                }
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
    </div>
  );
}

'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Utensils, LogOut, Loader2, MapPin } from 'lucide-react';
import { terminaTurnoMio } from '@/app/_actions/kantiere-timbra';

export interface TurnoAttivoCardProps {
  cantiereId: string;
  cantiereNome: string;
  /** ISO timestamp dell'inizio turno. */
  inizioTs: string;
  /** true se il turno è aperto ma in pausa pranzo. */
  inPausa?: boolean;
  /** ISO dell'inizio pausa in corso, o null. */
  inizioPausaTs?: string | null;
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

/** "HH:MM" ora locale corrente (per default dell'input time). */
function oraLocaleNow(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Costruisce un ISO da un orario "HH:MM" di oggi (fuso del device = Italia). */
function isoDaOraLocale(hhmm: string): string {
  const [hh, mm] = hhmm.split(':').map((x) => parseInt(x, 10));
  const d = new Date();
  d.setHours(hh ?? 0, mm ?? 0, 0, 0);
  return d.toISOString();
}

/**
 * Card "turno in corso" / "in pausa": il dipendente ha un turno aperto.
 * Verde se sta lavorando, giallo se in pausa pranzo. Tappando si apre un
 * pannello da cui aprire la scheda cantiere o terminare il turno (ora attuale
 * o orario scelto, utile se è uscito dimenticando di scansionare).
 */
export function TurnoAttivoCard({
  cantiereId,
  cantiereNome,
  inizioTs,
  inPausa = false,
  inizioPausaTs = null,
}: TurnoAttivoCardProps) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const [oraSel, setOraSel] = useState(oraLocaleNow());
  const [cambiaOra, setCambiaOra] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  function termina(usaOraSelezionata: boolean) {
    setErr(null);
    start(async () => {
      const res = await terminaTurnoMio({
        cantiereId,
        ts: usaOraSelezionata ? isoDaOraLocale(oraSel) : undefined,
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setErr(
          res.error === 'ORA_NON_VALIDA'
            ? "L'ora deve essere di oggi e dopo l'ultima timbratura."
            : res.error === 'NESSUN_TURNO_APERTO'
              ? 'Nessun turno aperto.'
              : 'Operazione non riuscita. Riprova.',
        );
      }
    });
  }

  const trascorso = formatTrascorso(now - Date.parse(inizioTs));

  // Palette in base allo stato.
  const c = inPausa
    ? {
        ring: 'border-amber-400/50',
        bg: 'bg-gradient-to-br from-amber-50 via-amber-50/70 to-transparent',
        dot: 'bg-amber-500',
        tag: 'text-amber-700',
        chip: 'bg-amber-500/15 text-amber-800',
        sub: 'text-amber-800/80',
        chevron: 'text-amber-700/70',
      }
    : {
        ring: 'border-emerald-500/30',
        bg: 'bg-gradient-to-br from-emerald-50 via-emerald-50/70 to-transparent',
        dot: 'bg-emerald-500',
        tag: 'text-emerald-700',
        chip: 'bg-emerald-500/15 text-emerald-800',
        sub: 'text-emerald-800/80',
        chevron: 'text-emerald-700/70',
      };

  return (
    <div className={`rounded-2xl border ${c.ring} ${c.bg} p-3.5 shadow-soft`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="block w-full text-left active:scale-[0.99] transition-transform"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="relative flex h-2.5 w-2.5">
              {!inPausa && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/70" />
              )}
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${c.dot}`} />
            </span>
            <span className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.16em] ${c.tag}`}>
              {inPausa && <Utensils className="h-3 w-3" strokeWidth={2.5} />}
              {inPausa ? 'In pausa pranzo' : 'Turno in corso'}
            </span>
          </span>
          {!inPausa && (
            <span className={`rounded-full px-2 py-0.5 font-mono text-xs font-semibold tabular-nums ${c.chip}`}>
              {trascorso}
            </span>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold leading-tight text-foreground">
              {cantiereNome}
            </p>
            <p className={`mt-0.5 text-xs ${c.sub}`}>
              {inPausa
                ? `In pausa dalle ${inizioPausaTs ? ora(inizioPausaTs) : '--:--'} · riprendi scansionando il QR.`
                : `Timbrato alle ${ora(inizioTs)} · tocca per terminare o gestire il turno.`}
            </p>
          </div>
          <ChevronRight
            className={`h-4 w-4 shrink-0 transition-transform ${c.chevron} ${open ? 'rotate-90' : ''}`}
            aria-hidden="true"
          />
        </div>
      </button>

      {open && (
        <div className="mt-3 space-y-2 border-t border-border/40 pt-3">
          <Link
            href={`/mobile/kantiere/cantieri/${cantiereId}`}
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium text-foreground active:scale-[0.99] transition-transform"
          >
            <MapPin className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
            Apri scheda cantiere
          </Link>

          {!cambiaOra ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => termina(false)}
                disabled={pending}
                className="flex items-center justify-center gap-2 rounded-lg bg-foreground py-2.5 text-sm font-semibold text-background active:scale-[0.99] transition-transform disabled:opacity-60"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
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
                  onClick={() => termina(true)}
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
      )}
    </div>
  );
}

'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Utensils, Play, Loader2, ChevronRight } from 'lucide-react';

import { pausaPranzoMia, riprendiTurnoMio } from '@/app/_actions/kantiere-timbra';

export interface TurnoPausaHomeProps {
  cantiereId: string;
  cantiereNome: string;
  /** ISO inizio turno. */
  inizioTs: string;
  /** true se il turno è in pausa pranzo. */
  inPausa: boolean;
  /** ISO inizio pausa, o null. */
  inizioPausaTs: string | null;
}

function ora(ts: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
}

function trascorsoLabel(ms: number): string {
  const totMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totMin / 60);
  const m = totMin % 60;
  if (h === 0) return `${m}min`;
  return `${h}h ${String(m).padStart(2, '0')}min`;
}

/**
 * Card "Turno in corso" sulla HOME Kantiere con l'azione pausa pranzo diretta
 * (senza QR). In pausa la card LAMPEGGIA per ricordare al tecnico di riprendere
 * il turno. La fine turno resta nel cantiere (link "Apri cantiere").
 */
export function TurnoPausaHome({
  cantiereId,
  cantiereNome,
  inizioTs,
  inPausa,
  inizioPausaTs,
}: TurnoPausaHomeProps) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  function esegui(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErr(null);
    start(async () => {
      const res = await fn();
      if (res.ok) router.refresh();
      else setErr('Operazione non riuscita. Riprova.');
    });
  }

  const trascorso = trascorsoLabel(now - Date.parse(inizioTs));

  // ── IN PAUSA: card che lampeggia + tasto riprendi ─────────────────────────
  if (inPausa) {
    return (
      <div className="animate-pulse rounded-2xl border-2 border-amber-400 bg-amber-50 p-5 shadow-soft motion-reduce:animate-none dark:border-amber-700 dark:bg-amber-950/30">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500/70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700">
            <Utensils className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
            In pausa pranzo
          </span>
        </div>
        <p className="mt-1.5 text-sm text-amber-800/90">
          {cantiereNome} · in pausa dalle {inizioPausaTs ? ora(inizioPausaTs) : '--:--'}
        </p>
        <p className="mt-1 text-xs font-medium text-amber-800">
          Ricordati di riprendere il turno quando rientri.
        </p>

        <button
          type="button"
          onClick={() => esegui(() => riprendiTurnoMio({ cantiereId }))}
          disabled={pending}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-base font-semibold text-white shadow-soft transition-all active:scale-[0.99] hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <Play className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          )}
          Riprendi turno
        </button>

        {err ? <p className="mt-2 text-xs text-destructive">{err}</p> : null}

        <Link
          href={`/mobile/kantiere/cantieri/${cantiereId}`}
          className="mt-2 flex items-center justify-center gap-1 text-xs font-medium text-amber-800/80 hover:text-amber-900"
        >
          Apri cantiere (termina turno)
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  // ── AL LAVORO: card turno + tasto avvia pausa ─────────────────────────────
  return (
    <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 shadow-soft dark:border-emerald-800 dark:bg-emerald-950/30">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">
            Turno in corso
          </span>
        </span>
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-emerald-800">
          {trascorso}
        </span>
      </div>
      <p className="mt-1.5 text-sm text-emerald-800/90">
        {cantiereNome} · timbrato alle {ora(inizioTs)}
      </p>

      <button
        type="button"
        onClick={() => esegui(() => pausaPranzoMia({ cantiereId }))}
        disabled={pending}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-100 py-3.5 text-base font-semibold text-amber-900 shadow-soft transition-all active:scale-[0.99] hover:bg-amber-200 disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        ) : (
          <Utensils className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        )}
        Avvia pausa pranzo
      </button>

      {err ? <p className="mt-2 text-xs text-destructive">{err}</p> : null}

      <Link
        href={`/mobile/kantiere/cantieri/${cantiereId}`}
        className="mt-2 flex items-center justify-center gap-1 text-xs font-medium text-emerald-800/80 hover:text-emerald-900"
      >
        Apri cantiere (termina turno)
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Utensils, Play, LogOut, LogIn, Loader2 } from 'lucide-react';
import { timbraMembro, timbraMembriBulk } from '@/app/_actions/kantiere-capo';
import type { CantiereSquadra, MembroStato, StatoMembro } from '../../_lib/capo';

function ora(ts: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
}

function messaggioErrore(code: string): string {
  switch (code) {
    case 'AZIONE_NON_VALIDA':
      return 'Lo stato è cambiato nel frattempo. Aggiorna e riprova.';
    case 'NON_AUTORIZZATO':
      return 'Non sei autorizzato per questo membro.';
    case 'MODULO_OFF':
      return 'Modulo Kantiere non attivo.';
    default:
      return 'Operazione non riuscita. Riprova.';
  }
}

const STATO_BADGE: Record<StatoMembro, { label: string; cls: string }> = {
  lavoro: { label: 'In turno', cls: 'bg-emerald-500/15 text-emerald-800' },
  pausa: { label: 'In pausa', cls: 'bg-amber-500/20 text-amber-900' },
  idle: { label: 'A casa', cls: 'bg-muted text-muted-foreground' },
};

export function GestioneSquadraClient({ gruppi }: { gruppi: CantiereSquadra[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; testo: string } | null>(null);

  function membro(
    cantiereId: string,
    dipendenteId: string,
    azione: 'inizio' | 'fine' | 'pausa' | 'ripresa',
    key: string,
  ) {
    setMsg(null);
    setBusy(key);
    start(async () => {
      const res = await timbraMembro({ cantiereId, dipendenteId, azione });
      setBusy(null);
      if (res.ok) router.refresh();
      else setMsg({ tipo: 'err', testo: messaggioErrore(res.error) });
    });
  }

  function bulk(cantiereId: string, azione: 'pausa' | 'ripresa' | 'fine', key: string) {
    setMsg(null);
    setBusy(key);
    start(async () => {
      const res = await timbraMembriBulk({ cantiereId, azione });
      setBusy(null);
      if (res.ok) {
        setMsg({
          tipo: 'ok',
          testo: res.toccati
            ? `${res.toccati} aggiornati${res.saltati ? `, ${res.saltati} già a posto` : ''}.`
            : 'Nessuno da aggiornare.',
        });
        router.refresh();
      } else {
        setMsg({ tipo: 'err', testo: messaggioErrore(res.error) });
      }
    });
  }

  if (gruppi.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card p-5 text-center text-sm text-muted-foreground shadow-soft">
        Nessuna squadra assegnata. Quando l&apos;ufficio ti assegna come capo di un cantiere,
        i tuoi membri compaiono qui.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {msg && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            msg.tipo === 'ok'
              ? 'bg-emerald-500/10 text-emerald-800'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          {msg.testo}
        </p>
      )}

      {gruppi.map((g) => {
        const inTurno = g.membri.filter((m) => m.stato === 'lavoro').length;
        const inPausa = g.membri.filter((m) => m.stato === 'pausa').length;
        const aCasa = g.membri.filter((m) => m.stato === 'idle').length;
        const attivi = inTurno + inPausa;

        return (
          <section key={g.cantiereId} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold leading-tight text-foreground">
                  {g.cantiereNome}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {inTurno} in turno · {inPausa} in pausa · {aCasa} a casa
                </p>
              </div>
            </div>

            {/* Azioni in blocco */}
            {attivi > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => bulk(g.cantiereId, 'pausa', `${g.cantiereId}:bulk:pausa`)}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900 active:scale-[0.98] transition-all hover:bg-amber-200 disabled:opacity-50"
                >
                  {busy === `${g.cantiereId}:bulk:pausa` ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Utensils className="h-3.5 w-3.5" />
                  )}
                  Pausa a tutti
                </button>
                <button
                  type="button"
                  onClick={() => bulk(g.cantiereId, 'ripresa', `${g.cantiereId}:bulk:ripresa`)}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-900 active:scale-[0.98] transition-all hover:bg-emerald-200 disabled:opacity-50"
                >
                  {busy === `${g.cantiereId}:bulk:ripresa` ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  Riprendi tutti
                </button>
                <button
                  type="button"
                  onClick={() => bulk(g.cantiereId, 'fine', `${g.cantiereId}:bulk:fine`)}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground active:scale-[0.98] transition-all hover:bg-muted disabled:opacity-50"
                >
                  {busy === `${g.cantiereId}:bulk:fine` ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <LogOut className="h-3.5 w-3.5" />
                  )}
                  Termina a tutti
                </button>
              </div>
            )}

            {/* Membri */}
            <ul className="mt-3 space-y-2">
              {g.membri.map((m) => (
                <MembroRiga
                  key={m.dipendenteId}
                  membro={m}
                  cantiereId={g.cantiereId}
                  busyKey={busy}
                  pending={pending}
                  onAzione={(az, key) => membro(g.cantiereId, m.dipendenteId, az, key)}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function MembroRiga({
  membro,
  cantiereId,
  busyKey,
  pending,
  onAzione,
}: {
  membro: MembroStato;
  cantiereId: string;
  busyKey: string | null;
  pending: boolean;
  onAzione: (azione: 'inizio' | 'fine' | 'pausa' | 'ripresa', key: string) => void;
}) {
  const badge = STATO_BADGE[membro.stato];
  const base = `${cantiereId}:${membro.dipendenteId}`;
  const Spin = <Loader2 className="h-4 w-4 animate-spin" />;

  return (
    <li className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
            {membro.nome}
            {membro.ruolo === 'capo' && (
              <span className="rounded-sm border border-border bg-muted/60 px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                tu
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {membro.stato === 'lavoro' && membro.inizioTs
              ? `Dalle ${ora(membro.inizioTs)}`
              : membro.stato === 'pausa' && membro.inizioPausa
                ? `In pausa dalle ${ora(membro.inizioPausa)}`
                : 'Non in turno'}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>
          {badge.label}
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-2">
        {membro.stato === 'idle' && (
          <button
            type="button"
            onClick={() => onAzione('inizio', `${base}:inizio`)}
            disabled={pending}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {busyKey === `${base}:inizio` ? Spin : <LogIn className="h-4 w-4" />}
            Ingresso
          </button>
        )}

        {membro.stato === 'lavoro' && (
          <>
            <button
              type="button"
              onClick={() => onAzione('pausa', `${base}:pausa`)}
              disabled={pending}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-amber-100 px-3 py-2.5 text-sm font-semibold text-amber-900 active:scale-[0.98] transition-all hover:bg-amber-200 disabled:opacity-50"
            >
              {busyKey === `${base}:pausa` ? Spin : <Utensils className="h-4 w-4" />}
              Pausa
            </button>
            <button
              type="button"
              onClick={() => onAzione('fine', `${base}:fine`)}
              disabled={pending}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-semibold text-foreground active:scale-[0.98] transition-all hover:bg-muted disabled:opacity-50"
            >
              {busyKey === `${base}:fine` ? Spin : <LogOut className="h-4 w-4" />}
              Esci
            </button>
          </>
        )}

        {membro.stato === 'pausa' && (
          <>
            <button
              type="button"
              onClick={() => onAzione('ripresa', `${base}:ripresa`)}
              disabled={pending}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white active:scale-[0.98] transition-all hover:bg-emerald-700 disabled:opacity-50"
            >
              {busyKey === `${base}:ripresa` ? Spin : <Play className="h-4 w-4" />}
              Riprendi
            </button>
            <button
              type="button"
              onClick={() => onAzione('fine', `${base}:fine`)}
              disabled={pending}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-semibold text-foreground active:scale-[0.98] transition-all hover:bg-muted disabled:opacity-50"
            >
              {busyKey === `${base}:fine` ? Spin : <LogOut className="h-4 w-4" />}
              Esci
            </button>
          </>
        )}
      </div>
    </li>
  );
}

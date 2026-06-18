'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@kommessa/ui';
import { timbra } from '@/app/_actions/kantiere-timbra';

// ─── tipi ───────────────────────────────────────────────────────────────────

type TipoTimbratura = 'ingresso' | 'uscita';

interface MembroProp {
  id: string;
  nome: string;
  prossimoTipo: TipoTimbratura;
}

export interface TimbraClientProps {
  token: string;
  commessaTitolo: string;
  me: { id: string; nome: string } | null;
  prossimoTipoSelf: TipoTimbratura | null;
  capo: boolean;
  membri: MembroProp[];
}

// ─── geo best-effort ─────────────────────────────────────────────────────────

function geo(): Promise<{ lat: number; lng: number } | undefined> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(undefined);
      return;
    }
    const timer = setTimeout(() => resolve(undefined), 4000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
      { timeout: 4000, maximumAge: 60000 },
    );
  });
}

// ─── format ts ───────────────────────────────────────────────────────────────

function formatOra(ts: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
}

// ─── mappa errori ────────────────────────────────────────────────────────────

function messaggioErrore(code: string): string {
  switch (code) {
    case 'NON_AUTENTICATO':
      return 'Devi essere autenticato per timbrare.';
    case 'MODULO_OFF':
      return 'Il modulo Kantiere non e abilitato per questo spazio.';
    case 'QR_NON_VALIDO':
      return 'QR non valido o revocato.';
    case 'QR_ALTRO_TENANT':
      return 'Questo QR appartiene a un altro spazio.';
    case 'NESSUN_DIPENDENTE':
      return 'Nessun profilo dipendente collegato a questo account.';
    case 'NON_CAPO':
      return 'Non sei autorizzato a timbrare per altri.';
    case 'NON_AUTORIZZATO':
      return 'Non sei autorizzato a timbrare per questo dipendente.';
    default:
      return 'Timbratura non riuscita. Riprova.';
  }
}

// ─── row membro ──────────────────────────────────────────────────────────────

function RigaMembro({
  token,
  membro,
}: {
  token: string;
  membro: MembroProp;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [stato, setStato] = useState<
    { tipo: 'ok'; ts: string; tipo_timbra: TipoTimbratura } | { tipo: 'errore'; msg: string } | null
  >(null);

  function handleTimbra() {
    startTransition(async () => {
      setStato(null);
      const g = await geo();
      const res = await timbra({ token, dipendenteId: membro.id, geo: g });
      if (res.ok) {
        setStato({ tipo: 'ok', ts: res.ts, tipo_timbra: res.tipo });
        router.refresh();
      } else {
        setStato({ tipo: 'errore', msg: messaggioErrore(res.error) });
      }
    });
  }

  const tipoLabel = stato?.tipo === 'ok'
    ? stato.tipo_timbra === 'ingresso'
      ? 'Ingresso'
      : 'Uscita'
    : membro.prossimoTipo === 'ingresso'
      ? 'Ingresso'
      : 'Uscita';

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-soft">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{membro.nome}</p>
        {stato?.tipo === 'ok' && (
          <p className="mt-0.5 text-xs text-emerald-600">
            {tipoLabel} registrato alle {formatOra(stato.ts)}
          </p>
        )}
        {stato?.tipo === 'errore' && (
          <p className="mt-0.5 text-xs text-destructive">{stato.msg}</p>
        )}
        {!stato && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Prossima timbratura: {membro.prossimoTipo === 'ingresso' ? 'ingresso' : 'uscita'}
          </p>
        )}
      </div>
      <Button
        size="sm"
        variant={membro.prossimoTipo === 'ingresso' ? 'default' : 'outline'}
        onClick={handleTimbra}
        disabled={isPending || stato?.tipo === 'ok'}
      >
        {isPending ? 'Attendere...' : stato?.tipo === 'ok' ? 'Fatto' : `Timbra ${tipoLabel}`}
      </Button>
    </div>
  );
}

// ─── componente principale ───────────────────────────────────────────────────

export function TimbraClient({
  token,
  commessaTitolo,
  me,
  prossimoTipoSelf,
  capo,
  membri,
}: TimbraClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [statoSelf, setStatoSelf] = useState<
    { tipo: 'ok'; ts: string; tipo_timbra: TipoTimbratura } | { tipo: 'errore'; msg: string } | null
  >(null);

  function handleTimbraSelf() {
    startTransition(async () => {
      setStatoSelf(null);
      const g = await geo();
      const res = await timbra({ token, geo: g });
      if (res.ok) {
        setStatoSelf({ tipo: 'ok', ts: res.ts, tipo_timbra: res.tipo });
        router.refresh();
      } else {
        setStatoSelf({ tipo: 'errore', msg: messaggioErrore(res.error) });
      }
    });
  }

  const tipoSelfLabel =
    statoSelf?.tipo === 'ok'
      ? statoSelf.tipo_timbra === 'ingresso'
        ? 'Ingresso'
        : 'Uscita'
      : prossimoTipoSelf === 'ingresso'
        ? 'Ingresso'
        : 'Uscita';

  return (
    <div className="space-y-6">
      {/* Titolo commessa */}
      <div className="text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Kantiere
        </p>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-foreground">
          {commessaTitolo}
        </h1>
      </div>

      {/* Sezione: timbratura personale */}
      {me && prossimoTipoSelf !== null && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            La mia timbratura
          </p>
          <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
            <p className="mb-1 text-sm text-muted-foreground">{me.nome}</p>
            {statoSelf?.tipo === 'ok' && (
              <p className="mb-3 text-sm font-medium text-emerald-600">
                {tipoSelfLabel} registrato alle {formatOra(statoSelf.ts)}
              </p>
            )}
            {statoSelf?.tipo === 'errore' && (
              <p className="mb-3 text-sm text-destructive">{statoSelf.msg}</p>
            )}
            <Button
              className="w-full py-3 text-base"
              size="lg"
              variant={prossimoTipoSelf === 'ingresso' ? 'default' : 'outline'}
              onClick={handleTimbraSelf}
              disabled={isPending || statoSelf?.tipo === 'ok'}
            >
              {isPending
                ? 'Attendere...'
                : statoSelf?.tipo === 'ok'
                  ? 'Timbratura registrata'
                  : `Timbra ${tipoSelfLabel}`}
            </Button>
          </div>
        </div>
      )}

      {/* Sezione: squadra (solo capo) */}
      {capo && membri.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            La mia squadra
          </p>
          <div className="space-y-2">
            {membri.map((m) => (
              <RigaMembro key={m.id} token={token} membro={m} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

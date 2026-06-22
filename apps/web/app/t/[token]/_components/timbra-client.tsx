'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@kommessa/ui';
import { Loader2, Car, MapPin } from 'lucide-react';
import { timbra } from '@/app/_actions/kantiere-timbra';

// ─── tipi ───────────────────────────────────────────────────────────────────

type TipoTimbratura = 'ingresso' | 'uscita';

interface MembroProp {
  id: string;
  nome: string;
  prossimoTipo: TipoTimbratura;
}

interface SedeProp {
  id: string;
  nome: string;
  tipo: string;
  hasCoord: boolean;
}

export interface ViaggioCtx {
  cantiereId: string;
  sedi: SedeProp[];
  sedeDefaultId: string | null;
  mezzi: { id: string; targa: string; modello: string | null }[];
}

export interface TimbraClientProps {
  token: string;
  commessaTitolo: string;
  me: { id: string; nome: string } | null;
  prossimoTipoSelf: TipoTimbratura | null;
  capo: boolean;
  membri: MembroProp[];
  viaggio?: ViaggioCtx | null;
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

// ─── format ──────────────────────────────────────────────────────────────────

/** Km → "12,3 km" / "km n.d." se null. */
function formatKm(km: number | null): string {
  if (km === null) return 'km n.d.';
  return `${km.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

function formatOra(ts: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
}

/** Minuti → "2h 30min" / "45min". */
function formatDurata(min: number): string {
  if (min <= 0) return '0min';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
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
    case 'GIUSTIFICAZIONE_RICHIESTA':
      return 'Hai modificato la stima: inserisci una giustificazione.';
    default:
      return 'Timbratura non riuscita. Riprova.';
  }
}

// ─── row membro (capo → squadra), invariato ──────────────────────────────────

function RigaMembro({ token, membro }: { token: string; membro: MembroProp }) {
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

  const tipoLabel =
    stato?.tipo === 'ok'
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
        {stato?.tipo === 'errore' && <p className="mt-0.5 text-xs text-destructive">{stato.msg}</p>}
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

// ─── timbratura personale con flusso viaggio ─────────────────────────────────

function TimbraSelf({
  token,
  nome,
  prossimoTipo,
  viaggio,
}: {
  token: string;
  nome: string;
  prossimoTipo: TipoTimbratura;
  viaggio: ViaggioCtx | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [stato, setStato] = useState<
    { tipo: 'ok'; ts: string; tipo_timbra: TipoTimbratura } | { tipo: 'errore'; msg: string } | null
  >(null);

  const tipoLabel = prossimoTipo === 'ingresso' ? 'Ingresso' : 'Uscita';
  const direzione = prossimoTipo === 'ingresso' ? 'andata' : 'ritorno';
  const usaViaggio = !!viaggio && viaggio.sedi.length > 0;

  // ── stato del viaggio ──
  const [sedeId, setSedeId] = useState<string>(
    viaggio?.sedeDefaultId ?? viaggio?.sedi[0]?.id ?? '',
  );
  const [stimaMin, setStimaMin] = useState<number | null>(null);
  const [stimaKm, setStimaKm] = useState<number | null>(null);
  const [stimaLoading, setStimaLoading] = useState(false);
  const [confermMin, setConfermMin] = useState<number>(0);
  const [giustificazione, setGiustificazione] = useState('');
  const [autista, setAutista] = useState(false);
  const [mezzoId, setMezzoId] = useState<string>('');
  const [errLocale, setErrLocale] = useState<string | null>(null);

  const modificato = stimaMin != null && confermMin !== stimaMin;
  const giustObbligatoria = modificato;

  async function calcolaStima(targetSedeId: string) {
    if (!viaggio) return;
    setStimaLoading(true);
    setStimaMin(null);
    setStimaKm(null);
    try {
      const res = await fetch('/api/routing/stima', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sedeId: targetSedeId, cantiereId: viaggio.cantiereId, direzione }),
      });
      const j = (await res.json()) as { ok: boolean; minuti: number | null; km?: number | null };
      if (j.ok && typeof j.minuti === 'number') {
        setStimaMin(j.minuti);
        setConfermMin(j.minuti);
        setStimaKm(typeof j.km === 'number' ? j.km : null);
      } else {
        setStimaMin(null);
        setStimaKm(null);
      }
    } catch {
      setStimaMin(null);
      setStimaKm(null);
    } finally {
      setStimaLoading(false);
    }
  }

  function selezionaSede(id: string) {
    setSedeId(id);
    setGiustificazione('');
    void calcolaStima(id);
  }

  function step(delta: number) {
    setConfermMin((m) => Math.max(0, m + delta));
  }

  function handleTimbra() {
    setErrLocale(null);
    if (usaViaggio) {
      if (!sedeId) {
        setErrLocale('Seleziona la sede di partenza.');
        return;
      }
      if (confermMin <= 0) {
        setErrLocale('Indica il tempo di viaggio.');
        return;
      }
      if (giustObbligatoria && giustificazione.trim().length < 3) {
        setErrLocale('Hai modificato la stima: scrivi una breve giustificazione.');
        return;
      }
    }
    startTransition(async () => {
      setStato(null);
      const g = await geo();
      const res = await timbra({
        token,
        geo: g,
        viaggio: usaViaggio
          ? {
              sedeId,
              durataStimataMin: stimaMin,
              durataConfermataMin: confermMin,
              giustificazione: giustificazione.trim() || undefined,
              autista,
              mezzoId: autista ? mezzoId || null : null,
              distanzaKm: stimaKm,
            }
          : undefined,
      });
      if (res.ok) {
        setStato({ tipo: 'ok', ts: res.ts, tipo_timbra: res.tipo });
        router.refresh();
      } else {
        setStato({ tipo: 'errore', msg: messaggioErrore(res.error) });
      }
    });
  }

  if (stato?.tipo === 'ok') {
    return (
      <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
        <p className="mb-1 text-sm text-muted-foreground">{nome}</p>
        <p className="text-sm font-medium text-emerald-600">
          {stato.tipo_timbra === 'ingresso' ? 'Ingresso' : 'Uscita'} registrato alle{' '}
          {formatOra(stato.ts)}
        </p>
        <Link
          href="/mobile/kantiere/ore"
          className="mt-3 inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 active:scale-[0.98] transition-all"
        >
          Le mie ore di oggi
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-soft">
      <p className="text-sm text-muted-foreground">{nome}</p>

      {usaViaggio && viaggio && (
        <>
          {/* Sede */}
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <MapPin className="h-4 w-4 text-primary" strokeWidth={1.75} />
              {prossimoTipo === 'ingresso' ? 'Da dove sei partito?' : 'Dove vai adesso?'}
            </p>
            <div className="grid gap-2">
              {viaggio.sedi.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => selezionaSede(s.id)}
                  className={[
                    'flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                    sedeId === s.id
                      ? 'border-primary bg-primary/5 font-medium text-foreground'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted/40',
                  ].join(' ')}
                >
                  <span className="truncate">{s.nome}</span>
                  <span className="ml-2 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
                    {tipoSedeLabel(s.tipo)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Stima / conferma tempo viaggio */}
          <div className="space-y-2 rounded-lg bg-muted/40 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Tempo di viaggio
              </span>
              {stimaLoading ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> stima...
                </span>
              ) : stimaMin != null ? (
                <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <span>stimato {formatDurata(stimaMin)}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">
                    {formatKm(stimaKm)}
                  </span>
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">stima non disponibile</span>
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => step(-15)}
                disabled={stimaLoading || confermMin <= 0}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background text-lg font-semibold text-foreground hover:bg-muted disabled:opacity-40"
                aria-label="Meno 15 minuti"
              >
                −
              </button>
              <span className="flex-1 text-center text-xl font-bold tabular-nums text-foreground">
                {formatDurata(confermMin)}
              </span>
              <button
                type="button"
                onClick={() => step(15)}
                disabled={stimaLoading}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background text-lg font-semibold text-foreground hover:bg-muted disabled:opacity-40"
                aria-label="Più 15 minuti"
              >
                +
              </button>
            </div>
            {giustObbligatoria && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  Hai modificato la stima. Motivo (es. traffico):
                </label>
                <input
                  type="text"
                  value={giustificazione}
                  onChange={(e) => setGiustificazione(e.target.value)}
                  placeholder="es. traffico in tangenziale"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Autista + mezzo */}
          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-2.5 select-none">
              <input
                type="checkbox"
                checked={autista}
                onChange={(e) => setAutista(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                <Car className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
                Ero io l&apos;autista del mezzo
              </span>
            </label>
            {autista && (
              <select
                value={mezzoId}
                onChange={(e) => setMezzoId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              >
                <option value="">Seleziona il mezzo...</option>
                {viaggio.mezzi.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.targa}
                    {m.modello ? ` — ${m.modello}` : ''}
                  </option>
                ))}
              </select>
            )}
            {autista && viaggio.mezzi.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nessun mezzo configurato. L&apos;ufficio può aggiungerli nel parco mezzi.
              </p>
            )}
          </div>
        </>
      )}

      {errLocale && <p className="text-sm text-destructive">{errLocale}</p>}
      {stato?.tipo === 'errore' && <p className="text-sm text-destructive">{stato.msg}</p>}

      <Button
        className="w-full py-3 text-base"
        size="lg"
        variant={prossimoTipo === 'ingresso' ? 'default' : 'outline'}
        onClick={handleTimbra}
        disabled={isPending || stimaLoading}
      >
        {isPending ? 'Attendere...' : `Timbra ${tipoLabel}`}
      </Button>
    </div>
  );
}

function tipoSedeLabel(tipo: string): string {
  switch (tipo) {
    case 'sede_principale':
      return 'Sede';
    case 'sede_secondaria':
      return 'Sede';
    case 'hotel':
      return 'Hotel';
    default:
      return '';
  }
}

// ─── componente principale ───────────────────────────────────────────────────

export function TimbraClient({
  token,
  commessaTitolo,
  me,
  prossimoTipoSelf,
  capo,
  membri,
  viaggio,
}: TimbraClientProps) {
  return (
    <div className="space-y-6">
      {/* Titolo */}
      <div className="text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Kantiere</p>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-foreground">{commessaTitolo}</h1>
      </div>

      {/* Timbratura personale */}
      {me && prossimoTipoSelf !== null && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            La mia timbratura
          </p>
          <TimbraSelf
            token={token}
            nome={me.nome}
            prossimoTipo={prossimoTipoSelf}
            viaggio={viaggio ?? null}
          />
        </div>
      )}

      {/* Squadra (solo capo) */}
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

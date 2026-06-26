'use client';

import { useTransition, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@kommessa/ui';
import { Loader2, Car, MapPin, Utensils, Play, LogOut, CheckCircle2, Home } from 'lucide-react';
import { timbra, type AzioneTimbra } from '@/app/_actions/kantiere-timbra';
import { SOGLIA_PAUSA_PRANZO_ORE } from '@kommessa/api/kantiere-ore';

// ─── tipi ───────────────────────────────────────────────────────────────────

type TipoTimbratura = 'ingresso' | 'uscita';

/** Stato turno self (idle = nessun turno, lavoro = in corso, pausa = in pausa). */
export interface StatoSelf {
  stato: 'idle' | 'lavoro' | 'pausa';
  ingressoAperto: string | null;
  inizioPausa: string | null;
}

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
  statoSelf: StatoSelf | null;
  capo: boolean;
  membri: MembroProp[];
  viaggio?: ViaggioCtx | null;
  /** true se oggi risulta già una pausa pranzo timbrata per questo target. */
  pausaOggiFatta?: boolean;
  /** Soglia (ore) del prompt pausa pranzo (per-tenant). Default `SOGLIA_PAUSA_PRANZO_ORE`. */
  sogliaPausaPranzoOre?: number;
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
    case 'AZIONE_NON_VALIDA':
      return 'Il turno è cambiato nel frattempo. Ricarica la pagina e riprova.';
    default:
      return 'Timbratura non riuscita. Riprova.';
  }
}

/** Etichetta di conferma dopo una timbratura andata a buon fine. */
function labelConferma(tipo: TipoTimbratura, pausa: boolean): string {
  if (tipo === 'uscita' && pausa) return 'Pausa pranzo registrata';
  if (tipo === 'ingresso' && pausa) return 'Turno ripreso';
  if (tipo === 'ingresso') return 'Ingresso registrato';
  return 'Uscita registrata';
}

// ─── row membro (capo → squadra), invariato (nessuna pausa per i membri) ──────

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

// ─── conferma post-timbratura (riusata da tutti i flussi self) ───────────────

function ContenutoOk({ testo, ts }: { testo: string; ts: string }) {
  const router = useRouter();
  const [sec, setSec] = useState(3);

  // Niente schermata bianca senza vie d'uscita: countdown + rientro automatico
  // nell'app (tab Cantieri, dove il turno appena avviato è già visibile).
  useEffect(() => {
    const tick = setInterval(() => setSec((s) => Math.max(0, s - 1)), 1000);
    const go = setTimeout(() => router.push('/mobile/kantiere/cantieri'), 3000);
    return () => {
      clearInterval(tick);
      clearTimeout(go);
    };
  }, [router]);

  return (
    <div className="space-y-4 rounded-xl border border-emerald-300/60 bg-emerald-50 p-5 text-center shadow-soft">
      <div className="flex justify-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-600" strokeWidth={1.75} />
      </div>
      <div>
        <p className="text-base font-semibold text-emerald-700">{testo}</p>
        <p className="mt-0.5 text-sm text-emerald-700/70">alle {formatOra(ts)}</p>
      </div>
      <button
        type="button"
        onClick={() => router.push('/mobile/kantiere/cantieri')}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-base font-semibold text-white shadow-soft transition-all hover:bg-emerald-700 active:scale-[0.99]"
      >
        <Home className="h-5 w-5" strokeWidth={2} />
        Vai alla home
      </button>
      <p className="text-xs text-muted-foreground">Torni alla home tra {sec}s…</p>
      <Link
        href="/mobile/kantiere/ore"
        className="inline-flex items-center justify-center gap-1 text-xs font-medium text-emerald-700 underline-offset-2 hover:underline"
      >
        Le mie ore di oggi
      </Link>
    </div>
  );
}

// ─── timbratura con flusso viaggio (inizio = andata, fine = ritorno) ─────────

function TimbraConViaggio({
  token,
  azione,
  viaggio,
  onOk,
  pausaPrompt,
}: {
  token: string;
  azione: 'inizio' | 'fine';
  viaggio: ViaggioCtx | null;
  onOk: (r: { ts: string; tipo: TipoTimbratura; pausa: boolean }) => void;
  /** Se presente (solo in uscita), mostra il box "pausa pranzo non rilevata". */
  pausaPrompt?: { durataMin: number } | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [erroreMsg, setErroreMsg] = useState<string | null>(null);
  // Pausa pranzo dichiarata (ripiego se il dipendente non l'ha timbrata).
  const [pausaFatta, setPausaFatta] = useState(false);
  const [pausaMin, setPausaMin] = useState<30 | 45 | 60>(30);

  const prossimoTipo: TipoTimbratura = azione === 'inizio' ? 'ingresso' : 'uscita';
  const direzione = azione === 'inizio' ? 'andata' : 'ritorno';
  const usaViaggio = !!viaggio && viaggio.sedi.length > 0;

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

  // All'apertura calcola subito km + tempo per la sede preselezionata: il
  // tecnico vede la stima già pronta (con spinner) senza dover toccare nulla.
  useEffect(() => {
    if (usaViaggio && sedeId) void calcolaStima(sedeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setErroreMsg(null);
      const g = await geo();
      const res = await timbra({
        token,
        azione,
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
        pausaPranzoMin: pausaPrompt && pausaFatta ? pausaMin : undefined,
      });
      if (res.ok) onOk({ ts: res.ts, tipo: res.tipo, pausa: res.pausa });
      else setErroreMsg(messaggioErrore(res.error));
    });
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-soft">
      {usaViaggio && viaggio && (
        <>
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <MapPin className="h-4 w-4 text-primary" strokeWidth={1.75} />
              {azione === 'inizio' ? 'Da dove sei partito?' : 'Dove vai adesso?'}
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
                onClick={() => step(-5)}
                disabled={stimaLoading || confermMin <= 0}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background text-lg font-semibold text-foreground hover:bg-muted disabled:opacity-40"
                aria-label="Meno 5 minuti"
              >
                −
              </button>
              <span className="flex-1 text-center text-xl font-bold tabular-nums text-foreground">
                {formatDurata(confermMin)}
              </span>
              <button
                type="button"
                onClick={() => step(5)}
                disabled={stimaLoading}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background text-lg font-semibold text-foreground hover:bg-muted disabled:opacity-40"
                aria-label="Più 5 minuti"
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
                {azione === 'inizio'
                  ? "Ero io l'autista del mezzo"
                  : "Sarò io l'autista del mezzo"}
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

      {/* Pausa pranzo non rilevata (solo turni lunghi senza pausa timbrata) */}
      {pausaPrompt ? (
        <div className="space-y-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3.5">
          <p className="flex items-start gap-1.5 text-sm font-semibold text-amber-900">
            <Utensils className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
            Pausa pranzo non rilevata
          </p>
          <p className="text-[13px] leading-snug text-amber-800">
            Hai lavorato {formatDurata(pausaPrompt.durataMin)} senza timbrare una
            pausa. Ricorda: <strong>timbrare la pausa è il modo corretto</strong> —
            questa è solo una correzione.
          </p>
          <label className="flex cursor-pointer items-center gap-2 select-none">
            <input
              type="checkbox"
              checked={pausaFatta}
              onChange={(e) => setPausaFatta(e.target.checked)}
              className="h-4 w-4 rounded border-amber-400 accent-amber-600"
            />
            <span className="text-sm font-medium text-amber-900">
              Ho fatto la pausa pranzo
            </span>
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
          {pausaFatta ? (
            <p className="text-[11px] text-amber-700">
              Verranno tolti {pausaMin === 60 ? '1h' : `${pausaMin} min`} dal turno.
            </p>
          ) : null}
        </div>
      ) : null}

      {errLocale && <p className="text-sm text-destructive">{errLocale}</p>}
      {erroreMsg && <p className="text-sm text-destructive">{erroreMsg}</p>}

      <Button
        className="w-full py-3 text-base"
        size="lg"
        variant={prossimoTipo === 'ingresso' ? 'default' : 'outline'}
        onClick={handleTimbra}
        disabled={isPending || stimaLoading}
      >
        {isPending ? 'Attendere...' : azione === 'inizio' ? 'Timbra ingresso' : 'Timbra uscita'}
      </Button>
    </div>
  );
}

// ─── azione rapida one-tap (pausa / ripresa) ─────────────────────────────────

function AzioneRapida({
  token,
  azione,
  label,
  icon,
  classi,
  onOk,
}: {
  token: string;
  azione: AzioneTimbra;
  label: string;
  icon: React.ReactNode;
  classi: string;
  onOk: (r: { ts: string; tipo: TipoTimbratura; pausa: boolean }) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function go() {
    startTransition(async () => {
      setErr(null);
      const g = await geo();
      const res = await timbra({ token, azione, geo: g });
      if (res.ok) onOk({ ts: res.ts, tipo: res.tipo, pausa: res.pausa });
      else setErr(messaggioErrore(res.error));
    });
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={go}
        disabled={isPending}
        className={[
          'flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-base font-semibold shadow-soft transition-all active:scale-[0.99] disabled:opacity-60',
          classi,
        ].join(' ')}
      >
        {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : icon}
        {isPending ? 'Attendere...' : label}
      </button>
      {err && <p className="text-sm text-destructive">{err}</p>}
    </div>
  );
}

// ─── flusso self a stati (idle / lavoro / pausa) ─────────────────────────────

function SelfFlow({
  token,
  nome,
  stato,
  viaggio,
  pausaOggiFatta,
  sogliaPausaPranzoOre,
}: {
  token: string;
  nome: string;
  stato: StatoSelf;
  viaggio: ViaggioCtx | null;
  pausaOggiFatta: boolean;
  sogliaPausaPranzoOre: number;
}) {
  const router = useRouter();
  // Conferma dopo una timbratura andata a buon fine.
  const [ok, setOk] = useState<{ testo: string; ts: string } | null>(null);
  // In lavoro/pausa: l'utente ha scelto "Termina turno" → mostra il flusso uscita.
  const [terminando, setTerminando] = useState(false);

  // Prompt pausa pranzo: turno al lavoro, senza pausa oggi, più lungo della soglia.
  const durataTurnoMin = stato.ingressoAperto
    ? Math.max(0, Math.floor((Date.now() - Date.parse(stato.ingressoAperto)) / 60000))
    : 0;
  const pausaPrompt =
    stato.stato === 'lavoro' &&
    !pausaOggiFatta &&
    durataTurnoMin >= sogliaPausaPranzoOre * 60
      ? { durataMin: durataTurnoMin }
      : null;

  function handleOk(r: { ts: string; tipo: TipoTimbratura; pausa: boolean }) {
    setOk({ testo: labelConferma(r.tipo, r.pausa), ts: r.ts });
    router.refresh();
  }

  if (ok) return <ContenutoOk testo={ok.testo} ts={ok.ts} />;

  // IDLE → inizio turno (con eventuale viaggio andata)
  if (stato.stato === 'idle') {
    return <TimbraConViaggio token={token} azione="inizio" viaggio={viaggio} onOk={handleOk} />;
  }

  // Se ha scelto "Termina turno" (da lavoro o pausa): flusso uscita con viaggio ritorno
  if (terminando) {
    return (
      <div className="space-y-3">
        <TimbraConViaggio
          token={token}
          azione="fine"
          viaggio={viaggio}
          onOk={handleOk}
          pausaPrompt={pausaPrompt}
        />
        <button
          type="button"
          onClick={() => setTerminando(false)}
          className="w-full text-center text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Annulla
        </button>
      </div>
    );
  }

  // LAVORO → scelta: Pausa pranzo (giallo) oppure Termina turno
  if (stato.stato === 'lavoro') {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-soft">
        <p className="text-sm text-muted-foreground">
          Turno in corso
          {stato.ingressoAperto ? <> · dalle {formatOra(stato.ingressoAperto)}</> : null}
        </p>
        <AzioneRapida
          token={token}
          azione="pausa"
          label="Pausa pranzo"
          icon={<Utensils className="h-5 w-5" strokeWidth={2} />}
          classi="border border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200"
          onOk={handleOk}
        />
        <button
          type="button"
          onClick={() => setTerminando(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background py-3 text-base font-semibold text-foreground hover:bg-muted active:scale-[0.99] transition-all"
        >
          <LogOut className="h-5 w-5" strokeWidth={2} />
          Termina turno
        </button>
      </div>
    );
  }

  // PAUSA → Riprendi turno (verde) oppure Termina turno
  return (
    <div className="space-y-3 rounded-xl border border-amber-300/70 bg-amber-50 p-5 shadow-soft">
      <p className="flex items-center gap-1.5 text-sm font-medium text-amber-800">
        <Utensils className="h-4 w-4" strokeWidth={2} />
        In pausa pranzo
        {stato.inizioPausa ? <> · dalle {formatOra(stato.inizioPausa)}</> : null}
      </p>
      <AzioneRapida
        token={token}
        azione="ripresa"
        label="Riprendi turno"
        icon={<Play className="h-5 w-5" strokeWidth={2} />}
        classi="bg-emerald-600 text-white hover:bg-emerald-700"
        onOk={handleOk}
      />
      <button
        type="button"
        onClick={() => setTerminando(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background py-3 text-sm font-medium text-foreground hover:bg-muted active:scale-[0.99] transition-all"
      >
        <LogOut className="h-4 w-4" strokeWidth={2} />
        Termina turno
      </button>
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
  statoSelf,
  capo,
  membri,
  viaggio,
  pausaOggiFatta = false,
  sogliaPausaPranzoOre = SOGLIA_PAUSA_PRANZO_ORE,
}: TimbraClientProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Kantiere</p>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-foreground">{commessaTitolo}</h1>
      </div>

      {me && statoSelf && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {me.nome}
          </p>
          <SelfFlow
            token={token}
            nome={me.nome}
            stato={statoSelf}
            viaggio={viaggio ?? null}
            pausaOggiFatta={pausaOggiFatta}
            sogliaPausaPranzoOre={sogliaPausaPranzoOre}
          />
        </div>
      )}

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

'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Utensils, Play, LogOut, LogIn, Loader2 } from 'lucide-react';
import { SOGLIA_PAUSA_PRANZO_ORE } from '@kommessa/api/kantiere-ore';
import { timbraMembro, timbraMembriBulk } from '@/app/_actions/kantiere-capo';
import {
  ViaggioRitornoDialog,
  type ViaggioRitornoConfirm,
  type ViaggioRitornoMezzo,
  type ViaggioRitornoSede,
} from '@/app/_components/viaggio-ritorno-dialog';
import type { CantiereSquadra, MembroStato, StatoMembro } from '../../_lib/capo';

/** Contesto viaggio (sedi + sede di default) per un singolo cantiere. */
export interface ViaggioContestoCantiere {
  sedi: ViaggioRitornoSede[];
  sedeDefaultId: string | null;
}

function ora(ts: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
}

/**
 * Durata del turno aperto in minuti (now − inizio). Usata per decidere se
 * mostrare il box "pausa pranzo non rilevata" nel dialog di fine turno.
 * Calcolata al volo all'apertura del dialog (device = ora Italia).
 */
function durataTurnoMin(inizioTs: string | null): number {
  if (!inizioTs) return 0;
  return Math.max(0, Math.floor((Date.now() - Date.parse(inizioTs)) / 60000));
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

/** Un membro da chiudere nel wizard sequenziale di fine turno. */
interface DaChiudere {
  cantiereId: string;
  membro: MembroStato;
}

export function GestioneSquadraClient({
  gruppi,
  viaggioByCantiere,
  mezzi,
  sogliaPausaPranzoOre = SOGLIA_PAUSA_PRANZO_ORE,
  sogliaAutoSpegnimentoPausaOre = 1.5,
}: {
  gruppi: CantiereSquadra[];
  viaggioByCantiere: Record<string, ViaggioContestoCantiere>;
  mezzi: ViaggioRitornoMezzo[];
  /** Soglia (ore) del prompt pausa pranzo (per-tenant). Default `SOGLIA_PAUSA_PRANZO_ORE`. */
  sogliaPausaPranzoOre?: number;
  /** Soglia (ore) di auto-spegnimento della pausa dimenticata (per-tenant). Default 1.5. */
  sogliaAutoSpegnimentoPausaOre?: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; testo: string } | null>(null);

  // ── Wizard "Termina turno" sequenziale ────────────────────────────────────
  // Coda dei membri da chiudere (uno o più) e indice corrente. Il dialog si
  // apre per il membro `coda[idx]`; alla conferma si avanza al successivo.
  const [coda, setCoda] = useState<DaChiudere[]>([]);
  const [idx, setIdx] = useState(0);
  const dialogAperto = coda.length > 0 && idx < coda.length;
  const corrente = dialogAperto ? coda[idx] : null;
  // Conteggio dei membri confermati nel wizard corrente. Ref (non state) perché
  // viene letto subito dopo l'incremento, nello stesso tick della chiusura.
  const chiusi = useRef(0);
  // Il dialog chiama `onOpenChange(false)` dopo OGNI conferma riuscita: questo
  // flag distingue l'avanzamento al membro successivo (non chiudere il wizard,
  // basta remontare con la nuova key) dalla chiusura/annulla manuale del capo.
  const avanzamento = useRef(false);

  function membro(
    cantiereId: string,
    dipendenteId: string,
    azione: 'inizio' | 'pausa' | 'ripresa',
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

  /** Avvia il wizard di fine turno per uno o più membri (in stato chiudibile). */
  function avviaFine(membri: DaChiudere[]) {
    const chiudibili = membri.filter(
      (x) => x.membro.stato === 'lavoro' || x.membro.stato === 'pausa',
    );
    if (chiudibili.length === 0) return;
    setMsg(null);
    chiusi.current = 0;
    avanzamento.current = false;
    setIdx(0);
    setCoda(chiudibili);
  }

  /** Chiude il wizard e aggiorna la pagina (membri già confermati restano fatti). */
  function chiudiWizard() {
    const fatti = chiusi.current;
    chiusi.current = 0;
    avanzamento.current = false;
    setCoda([]);
    setIdx(0);
    if (fatti > 0) {
      setMsg({
        tipo: 'ok',
        testo: `${fatti} ${fatti === 1 ? 'turno terminato' : 'turni terminati'}.`,
      });
      router.refresh();
    }
  }

  /** Conferma dal dialog per il membro corrente: timbra fine + avanza. */
  async function confermaFine(
    payload: ViaggioRitornoConfirm,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!corrente) return { ok: false, error: 'AZIONE_NON_VALIDA' };
    const res = await timbraMembro({
      cantiereId: corrente.cantiereId,
      dipendenteId: corrente.membro.dipendenteId,
      azione: 'fine',
      viaggio: payload.viaggio ?? undefined,
      pausaPranzoMin: payload.pausaPranzoMin,
    });
    if (res.ok) {
      const ultimo = idx >= coda.length - 1;
      chiusi.current += 1;
      // Se restano membri, è un avanzamento: il dialog chiamerà onOpenChange(false)
      // ma noi NON chiudiamo il wizard, ci limitiamo a passare al successivo.
      if (!ultimo) avanzamento.current = true;
      setIdx((i) => i + 1);
    }
    return res;
  }

  // Chiusura del dialog. Dopo una conferma riuscita non-finale è un avanzamento
  // (remount sul membro dopo) → non chiudere. Altrimenti (ultimo confermato o
  // annulla manuale a metà) chiudiamo il wizard tenendo i già confermati.
  function onOpenChange(o: boolean) {
    if (o) return;
    if (avanzamento.current) {
      avanzamento.current = false;
      return;
    }
    chiudiWizard();
  }

  if (gruppi.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card p-5 text-center text-sm text-muted-foreground shadow-soft">
        Nessuna squadra assegnata. Quando l&apos;ufficio ti assegna come capo di un cantiere,
        i tuoi membri compaiono qui.
      </p>
    );
  }

  const ctxCorrente = corrente ? viaggioByCantiere[corrente.cantiereId] : undefined;
  // Pausa dichiarata: turno aperto > 6h senza pausa timbrata oggi.
  const promptPausaCorrente =
    corrente &&
    !corrente.membro.pausaOggiFatta &&
    durataTurnoMin(corrente.membro.inizioTs) >= sogliaPausaPranzoOre * 60
      ? { durataMin: durataTurnoMin(corrente.membro.inizioTs) }
      : null;

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
                  onClick={() => bulkPausaRipresa(g.cantiereId, 'pausa', `${g.cantiereId}:bulk:pausa`)}
                  disabled={pending || dialogAperto}
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
                  onClick={() => bulkPausaRipresa(g.cantiereId, 'ripresa', `${g.cantiereId}:bulk:ripresa`)}
                  disabled={pending || dialogAperto}
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
                  onClick={() =>
                    avviaFine(
                      g.membri.map((m) => ({ cantiereId: g.cantiereId, membro: m })),
                    )
                  }
                  disabled={pending || dialogAperto}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground active:scale-[0.98] transition-all hover:bg-muted disabled:opacity-50"
                >
                  <LogOut className="h-3.5 w-3.5" />
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
                  busyKey={busy}
                  pending={pending || dialogAperto}
                  sogliaAutoSpegnimentoPausaOre={sogliaAutoSpegnimentoPausaOre}
                  onAzione={(az, key) => membro(g.cantiereId, m.dipendenteId, az, key)}
                  onFine={() => avviaFine([{ cantiereId: g.cantiereId, membro: m }])}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {/* Wizard "Termina turno" sequenziale: un dialog per ogni membro. */}
      {corrente ? (
        <ViaggioRitornoDialog
          key={`${corrente.cantiereId}:${corrente.membro.dipendenteId}`}
          open={dialogAperto}
          onOpenChange={onOpenChange}
          cantiereId={corrente.cantiereId}
          sedi={ctxCorrente?.sedi ?? []}
          sedeDefaultId={ctxCorrente?.sedeDefaultId ?? null}
          mezzi={mezzi}
          pausaPrompt={promptPausaCorrente}
          intestazione={
            coda.length > 1
              ? `Rientro ${idx + 1} di ${coda.length} · ${corrente.membro.nome}`
              : `Termina turno · ${corrente.membro.nome}`
          }
          onConfirm={confermaFine}
        />
      ) : null}
    </div>
  );

  // ── helper interno: pausa/ripresa in blocco (invariato, niente viaggio) ────
  function bulkPausaRipresa(cantiereId: string, azione: 'pausa' | 'ripresa', key: string) {
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
}

function MembroRiga({
  membro,
  busyKey,
  pending,
  sogliaAutoSpegnimentoPausaOre,
  onAzione,
  onFine,
}: {
  membro: MembroStato;
  busyKey: string | null;
  pending: boolean;
  sogliaAutoSpegnimentoPausaOre: number;
  onAzione: (azione: 'inizio' | 'pausa' | 'ripresa', key: string) => void;
  onFine: () => void;
}) {
  const badge = STATO_BADGE[membro.stato];
  const base = membro.dipendenteId;
  const Spin = <Loader2 className="h-4 w-4 animate-spin" />;

  // Minuti mancanti all'auto-spegnimento della pausa dimenticata (informativo).
  const minAutoChiusura =
    membro.stato === 'pausa' && membro.inizioPausa
      ? Math.ceil(
          (Date.parse(membro.inizioPausa) + sogliaAutoSpegnimentoPausaOre * 3600000 - Date.now()) /
            60000,
        )
      : null;

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
          {minAutoChiusura != null && minAutoChiusura > 0 ? (
            <p className="mt-0.5 text-[11px] font-medium text-amber-700">
              La pausa si chiude da sola tra ~{minAutoChiusura} min
            </p>
          ) : null}
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
              onClick={onFine}
              disabled={pending}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-semibold text-foreground active:scale-[0.98] transition-all hover:bg-muted disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" />
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
              onClick={onFine}
              disabled={pending}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-semibold text-foreground active:scale-[0.98] transition-all hover:bg-muted disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" />
              Esci
            </button>
          </>
        )}
      </div>
    </li>
  );
}

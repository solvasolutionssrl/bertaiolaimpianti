'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Loader2, LogOut, Play, Route, Utensils } from 'lucide-react';

import { SOGLIA_PAUSA_PRANZO_ORE } from '@kommessa/api/kantiere-ore';
import {
  pausaPranzoMia,
  riprendiTurnoMio,
  terminaTurnoMio,
} from '@/app/_actions/kantiere-timbra';
import {
  ViaggioRitornoDialog,
  type ViaggioRitornoConfirm,
  type ViaggioRitornoMezzo,
  type ViaggioRitornoSede,
} from '@/app/_components/viaggio-ritorno-dialog';

/**
 * La giornata in corso di chi lavora in sede.
 *
 * Il gemello di chi sta in cantiere (`TurnoAzioniCantiere`) apre SEMPRE il
 * foglio del viaggio di ritorno alla chiusura: giusto per chi la mattina e'
 * partito da qualche parte, inutile per chi non si e' mosso dalla scrivania.
 *
 * Qui la chiusura e' **un tocco**, e il foglio compare solo quando c'e'
 * davvero una domanda da fare:
 *  - la persona dichiara di aver fatto un viaggio (il flag al contrario: non
 *    si chiede, si dice quando c'e');
 *  - la giornata e' lunga e non risulta nessuna pausa timbrata, e allora la
 *    pausa va chiesta comunque, come agli altri.
 *
 * Card a parte e non un terzo assetto di quella dei cantieri: quella e' gia'
 * lunga e porta cambio cantiere, split di fine giornata e viaggio: roba che
 * qui non serve, e che a spegnerla con dei flag renderebbe illeggibili tutti e
 * due i casi.
 */

export interface TurnoAzioniUfficioProps {
  cantiereId: string;
  /** Il lavoro su cui sono le ore di oggi. */
  cantiereNome?: string;
  cantiereHref?: string;
  /** ISO inizio giornata. */
  inizioTs: string;
  inPausa: boolean;
  inizioPausaTs: string | null;
  /** Oggi risulta già una pausa timbrata su questo lavoro. */
  pausaOggiFatta?: boolean;
  /** Sedi e mezzi: servono solo se dichiara un viaggio. */
  sedi?: ViaggioRitornoSede[];
  mezzi?: ViaggioRitornoMezzo[];
  sedeDefaultId?: string | null;
  /** La sede in cui sta lavorando (è la predefinita, salvo eccezioni). */
  sedeLavoro?: { id: string; nome: string } | null;
  sogliaPausaPranzoOre?: number;
}

function ora(ts: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
}

function trascorso(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h === 0 ? `${m}min` : `${h}h ${String(m).padStart(2, '0')}min`;
}

function oraLocaleNow(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function isoDaOraLocale(hhmm: string): string {
  const [hh, mm] = hhmm.split(':').map((x) => parseInt(x, 10));
  const d = new Date();
  d.setHours(hh ?? 0, mm ?? 0, 0, 0);
  return d.toISOString();
}

function messaggioErrore(code: string): string {
  switch (code) {
    case 'ORA_NON_VALIDA':
      return 'L’ora deve essere di oggi e dopo l’ultima timbratura.';
    case 'NESSUN_TURNO_APERTO':
      return 'Nessuna giornata aperta.';
    case 'RIPRENDI_PRIMA':
      return 'Sei in pausa: riprendi prima di chiudere.';
    case 'AZIONE_NON_VALIDA':
      return 'La giornata è cambiata nel frattempo. Ricarica e riprova.';
    default:
      return 'Operazione non riuscita. Riprova.';
  }
}

export function TurnoAzioniUfficio({
  cantiereId,
  cantiereNome,
  cantiereHref,
  inizioTs,
  inPausa,
  inizioPausaTs,
  pausaOggiFatta = false,
  sedi = [],
  mezzi = [],
  sedeDefaultId = null,
  sedeLavoro = null,
  sogliaPausaPranzoOre = SOGLIA_PAUSA_PRANZO_ORE,
}: TurnoAzioniUfficioProps) {
  const router = useRouter();
  // Seed deterministico: il tempo reale arriva dopo il mount, altrimenti il
  // server e il browser scrivono due numeri diversi (mismatch di hydration).
  const [now, setNow] = useState(() => Date.parse(inizioTs));
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tsScelto, setTsScelto] = useState<string | undefined>(undefined);
  const [cambiaOra, setCambiaOra] = useState(false);
  const [oraSel, setOraSel] = useState(oraLocaleNow());

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const durataMin = Math.max(0, Math.floor((now - Date.parse(inizioTs)) / 60000));
  /** Giornata lunga senza pausa timbrata: allora la domanda va fatta. */
  const pausaDaChiedere = !inPausa && !pausaOggiFatta && durataMin >= sogliaPausaPranzoOre * 60;

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

  /** Chiusura secca: nessun foglio, nessuna domanda. È il caso normale. */
  function chiudi(ts?: string) {
    esegui(() => terminaTurnoMio({ cantiereId, ...(ts ? { ts } : {}) }));
  }

  /** Apre il foglio: viaggio dichiarato, oppure pausa da chiedere. */
  function apriFoglio(ts?: string) {
    setErr(null);
    setTsScelto(ts ?? new Date().toISOString());
    setDialogOpen(true);
  }

  async function confermaDalFoglio(
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

  const palette = inPausa
    ? { ring: 'border-amber-400/50', bg: 'bg-gradient-to-br from-amber-50 via-amber-50/60 to-transparent', dot: 'bg-amber-500', tag: 'text-amber-700', sub: 'text-amber-800/80' }
    : { ring: 'border-sky-500/30', bg: 'bg-gradient-to-br from-sky-50 via-sky-50/60 to-transparent', dot: 'bg-sky-500', tag: 'text-sky-700', sub: 'text-sky-800/80' };

  return (
    <div className={`rounded-2xl border ${palette.ring} ${palette.bg} p-5 shadow-soft`}>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="relative flex h-2.5 w-2.5">
            {!inPausa && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-500/70" />
            )}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${palette.dot}`} />
          </span>
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.16em] ${palette.tag}`}
          >
            {inPausa && <Utensils className="h-3 w-3" strokeWidth={2.5} />}
            {inPausa ? 'In pausa pranzo' : 'Giornata in corso'}
          </span>
        </span>
        {!inPausa && (
          <span className="rounded-full bg-sky-500/15 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-sky-800">
            {trascorso(now - Date.parse(inizioTs))}
          </span>
        )}
      </div>

      {cantiereHref ? (
        <Link
          href={cantiereHref}
          className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-black/5 bg-white/40 px-3 py-2.5 transition-transform active:scale-[0.99]"
        >
          <span className="min-w-0">
            <span className="block truncate text-base font-semibold leading-tight text-foreground">
              {cantiereNome ?? 'Lavoro'}
            </span>
            <span className={`mt-0.5 block text-xs ${palette.sub}`}>
              {inPausa
                ? `In pausa dalle ${inizioPausaTs ? ora(inizioPausaTs) : '--:--'}`
                : `Dalle ${ora(inizioTs)}${sedeLavoro ? ` · ${sedeLavoro.nome}` : ''}`}
            </span>
          </span>
          <ChevronRight className={`h-4 w-4 shrink-0 ${palette.tag}`} aria-hidden="true" />
        </Link>
      ) : (
        <p className={`mt-1.5 text-xs ${palette.sub}`}>
          {inPausa
            ? `In pausa dalle ${inizioPausaTs ? ora(inizioPausaTs) : '--:--'}`
            : `Dalle ${ora(inizioTs)}${sedeLavoro ? ` · ${sedeLavoro.nome}` : ''}`}
        </p>
      )}

      <div className="mt-3 space-y-2">
        {inPausa ? (
          <button
            type="button"
            onClick={() => esegui(() => riprendiTurnoMio({ cantiereId }))}
            disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-base font-semibold text-white shadow-soft transition-all active:scale-[0.99] hover:bg-emerald-700 disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" strokeWidth={2} />}
            Riprendi
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => esegui(() => pausaPranzoMia({ cantiereId }))}
              disabled={pending}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-100 py-3.5 text-base font-semibold text-amber-900 shadow-soft transition-all active:scale-[0.99] hover:bg-amber-200 disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Utensils className="h-5 w-5" strokeWidth={2} />}
              Avvia pausa pranzo
            </button>

            {!cambiaOra ? (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => (pausaDaChiedere ? apriFoglio(undefined) : chiudi(undefined))}
                  disabled={pending}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background py-3 text-base font-semibold text-foreground transition-all active:scale-[0.99] hover:bg-muted disabled:opacity-60"
                >
                  {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" strokeWidth={2} />}
                  Chiudi giornata ({oraLocaleNow()})
                </button>

                {/* Il flag al contrario: il viaggio non si chiede, si dichiara
                    quando c'è. Di qui si entra nel foglio di sempre. */}
                <button
                  type="button"
                  onClick={() => apriFoglio(undefined)}
                  disabled={pending}
                  className="flex items-center justify-center gap-1.5 text-center text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <Route className="h-3.5 w-3.5" aria-hidden="true" />
                  Oggi ho fatto un viaggio
                </button>
                <button
                  type="button"
                  onClick={() => setCambiaOra(true)}
                  disabled={pending}
                  className="text-center text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Sono uscito prima? Cambia l&apos;ora
                </button>
              </div>
            ) : (
              <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="ora-fine-ufficio">
                  Ora di fine
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="ora-fine-ufficio"
                    type="time"
                    value={oraSel}
                    onChange={(e) => setOraSel(e.target.value)}
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-base tabular-nums focus:border-primary focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const ts = isoDaOraLocale(oraSel);
                      if (pausaDaChiedere) apriFoglio(ts);
                      else chiudi(ts);
                    }}
                    disabled={pending}
                    className="rounded-md bg-foreground px-3 py-2 text-sm font-semibold text-background disabled:opacity-60"
                  >
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Chiudi'}
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
          </>
        )}

        {err ? <p className="text-xs text-destructive">{err}</p> : null}
      </div>

      <ViaggioRitornoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        cantiereId={cantiereId}
        sedi={sedi}
        sedeDefaultId={sedeDefaultId}
        sedeLavoroId={sedeLavoro?.id ?? null}
        mezzi={mezzi}
        pausaPrompt={pausaDaChiedere ? { durataMin } : null}
        splitContesto={null}
        onConfirm={confermaDalFoglio}
      />
    </div>
  );
}

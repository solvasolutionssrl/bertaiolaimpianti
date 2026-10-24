'use client';

import * as React from 'react';
import { etichettaMezzo, ordinaMezzi } from '@kommessa/api/mezzi';
import { ZONA_MIA } from '@kommessa/api/zone-dati';
import { TagTu } from '@/app/_components/tag-tu';
import { useRouter } from 'next/navigation';
import { CalendarClock, ChevronDown, Coffee, Fingerprint, Loader2, MapPin, Play, Smartphone, Square, QrCode } from 'lucide-react';
import { Button, cn } from '@kommessa/ui';

import { avviaTurnoMio, pausaPranzoMia, riprendiTurnoMio, segnaPresenzaInSede } from '@/app/_actions/kantiere-timbra';
import { Scelta } from '@/app/_components/scelta';
import { CompilaGiornataDialog, type ModoCompila } from '../kantiere/_components/compila-giornata-dialog';
import type { MiaGiornata as MiaGiornataDati } from '../_lib/mia-giornata';
import { oraMostrata } from '@kommessa/api/ora-mostrata';

/**
 * «La mia giornata» nell'header dell'ufficio: per chi gestisce le presenze
 * da PC e timbra anche per se'. Una pillola che dice com'e' messa la
 * giornata, e le scorciatoie: pausa, ripresa, chiusura, avvio, registrazione,
 * ripartizione della giornata timbrata. I dialog sono gli stessi del mondo
 * presenze, riadattati alla scrivania.
 */

const hm = (min: number) => `${Math.floor(Math.max(0, min) / 60)}:${String(Math.max(0, min) % 60).padStart(2, '0')}`;

const COME: Record<string, { testo: string; Icona: React.ComponentType<{ className?: string }> }> = {
  app: { testo: 'dall’app', Icona: Smartphone },
  qr: { testo: 'dal QR', Icona: QrCode },
  terminale: { testo: 'dal terminale', Icona: Fingerprint },
  ufficio: { testo: 'dall’ufficio', Icona: CalendarClock },
  altro: { testo: '', Icona: MapPin },
};

/** Com'e' messa la giornata, in una riga: testo, colore e icona della pillola. */
export function statoMiaGiornata(dati: MiaGiornataDati): {
  testo: string;
  colore: string;
  Icona: React.ComponentType<{ className?: string }>;
  /** Turno in corso: il pallino pulsa. */
  pulsa: boolean;
} {
  const t = dati.turno;
  const scatola = dati.timbro && (dati.timbro.stato === 'da_ripartire' || dati.timbro.stato === 'da_chiudere') ? dati.timbro : null;
  const presenzaAperta = dati.timbro?.stato === 'presenza_aperta' && !t;
  let colore = 'bg-muted text-muted-foreground border-border';
  let testo = 'Nessun turno';
  let Icona: React.ComponentType<{ className?: string }> = Square;
  if (t) {
    const c = COME[t.come] ?? COME.altro!;
    Icona = c.Icona;
    colore = t.inPausa ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-emerald-300 bg-emerald-50 text-emerald-800';
    testo = `${t.inPausa ? 'In pausa' : 'In turno'} · ${t.cantiereNome} · ${oraMostrata(t.inizioTs)}`;
  } else if (scatola) {
    Icona = Fingerprint;
    colore = 'border-sky-300 bg-sky-50 text-sky-800';
    testo = `${scatola.dalTerminale ? 'Timbrato' : 'In sede'} · ${hm(scatola.nettoMin)} da ripartire`;
  } else if (presenzaAperta) {
    Icona = Fingerprint;
    colore = 'border-emerald-300 bg-emerald-50 text-emerald-800';
    testo = `In sede · dalle ${dati.timbro?.inizioIso ? oraMostrata(dati.timbro.inizioIso) : ''}`;
  } else if (dati.lavoratiOggiMin > 0) {
    testo = `Oggi ${hm(dati.lavoratiOggiMin)} di lavoro`;
  }
  return { testo, colore, Icona, pulsa: !!t && !t.inPausa };
}

/**
 * Le azioni sulla mia giornata (pausa, ripresa, chiusura, avvio, registra,
 * inserisci le commesse) e i dialog che aprono. Un hook, non un componente:
 * nella pillola i tasti stanno dentro un menu che si smonta al clic, e un
 * dialog montato li' dentro morirebbe con lui. Chi usa l'hook mette `corpo`
 * dove vuole e `dialoghi` fuori da tutto cio' che si smonta.
 */
export function useMiaGiornata(dati: MiaGiornataDati, { dopo }: { dopo?: () => void } = {}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [modo, setModo] = React.useState<ModoCompila | null>(null);
  const [avvio, setAvvio] = React.useState(false);
  const [errore, setErrore] = React.useState<string | null>(null);

  const t = dati.turno;
  const scatola = dati.timbro && (dati.timbro.stato === 'da_ripartire' || dati.timbro.stato === 'da_chiudere') ? dati.timbro : null;
  const presenzaAperta = dati.timbro?.stato === 'presenza_aperta' && !t;
  // La presenza nel registro e' di oggi e l'ultimo segno e' un'uscita: si puo' riprendere.
  const ultimoSegno = dati.timbro?.giorno === dati.giorno ? (dati.timbro.timbri.filter((x) => !x.scartato).pop() ?? null) : null;
  const puoRiprendere = !t && ultimoSegno?.tipo === 'uscita';

  const azione = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setErrore(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setErrore(r.error ?? 'Non riuscito');
      else {
        dopo?.();
        router.refresh();
      }
    });
  };
  const presenza = (az: 'inizio' | 'pausa' | 'ripresa' | 'fine') => azione(() => segnaPresenzaInSede({ azione: az }));
  const apri = (fn: () => void) => {
    dopo?.();
    fn();
  };

  const datiDialog = {
    cantieri: dati.cantieri,
    sedi: dati.sedi,
    sediPerCantiere: dati.sediPerCantiere,
    mezzi: dati.mezzi,
    ultimoMezzoId: dati.ultimoMezzoId,
    modalitaLavoro: dati.modalitaLavoro,
    impostazioni: dati.impostazioni,
  };

  const corpo = (
    <>
      {t ? (
        <div className="space-y-2">
          <p className="text-sm">
            <span className="font-semibold">{t.cantiereNome}</span>
            <span className="text-muted-foreground"> · dalle {oraMostrata(t.inizioTs)} {COME[t.come]?.testo ?? ''}{t.inSede ? ' · in sede' : ''}</span>
            {t.inPausa && t.inizioPausaTs ? <span className="block text-xs text-amber-700">In pausa dalle {oraMostrata(t.inizioPausaTs)}</span> : null}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {t.inPausa ? (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => azione(() => riprendiTurnoMio({ cantiereId: t.cantiereId }))}>
                <Play className="mr-1.5 h-3.5 w-3.5" /> Riprendi
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled={pending || t.pausaOggiFatta} onClick={() => azione(() => pausaPranzoMia({ cantiereId: t.cantiereId }))}>
                <Coffee className="mr-1.5 h-3.5 w-3.5" /> Pausa pranzo
              </Button>
            )}
            <Button size="sm" disabled={pending || t.inPausa} onClick={() => apri(() => setModo({ tipo: 'chiusura', turno: t }))}>
              <Square className="mr-1.5 h-3.5 w-3.5" /> Chiudi il turno
            </Button>
          </div>
          {t.inPausa ? <p className="text-[11px] text-muted-foreground">Durante la pausa il turno non si chiude: riprenderlo prima.</p> : null}
        </div>
      ) : scatola ? (
        <div className="space-y-2">
          <p className="text-sm">
            {scatola.dalTerminale ? 'Badge' : 'In sede'} {scatola.inizioIso ? oraMostrata(scatola.inizioIso) : ''} → {scatola.fineIso ? oraMostrata(scatola.fineIso) : ''}
            <span className="block text-xs text-muted-foreground">{hm(scatola.nettoMin)} di presenza{scatola.giorno !== dati.giorno ? ` · ${scatola.giorno}` : ''}. Ore da attribuire alle commesse.</span>
          </p>
          {/* «Riprendi» prende la sua larghezza, il tasto lungo tutto il resto:
              a due colonne uguali «Inserisci le commesse» usciva dal bordo. */}
          <div className={cn('grid gap-2', puoRiprendere ? 'grid-cols-[auto_minmax(0,1fr)]' : 'grid-cols-1')}>
            {puoRiprendere ? (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => presenza('ripresa')}>
                <Play className="mr-1.5 h-3.5 w-3.5" /> Riprendi
              </Button>
            ) : null}
            <Button size="sm" onClick={() => apri(() => setModo({ tipo: 'scatola', vista: scatola }))}>
              <CalendarClock className="mr-1.5 h-3.5 w-3.5" /> Inserisci le commesse
            </Button>
          </div>
        </div>
      ) : presenzaAperta ? (
        <div className="space-y-2">
          <p className="text-sm">
            In sede dalle {dati.timbro?.inizioIso ? oraMostrata(dati.timbro.inizioIso) : ''}
            <span className="block text-xs text-muted-foreground">Presenza senza cantiere: le ore si attribuiscono alla chiusura.</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" disabled={pending} onClick={() => presenza('pausa')}>
              <Coffee className="mr-1.5 h-3.5 w-3.5" /> Pausa
            </Button>
            <Button size="sm" disabled={pending} onClick={() => presenza('fine')}>
              <Square className="mr-1.5 h-3.5 w-3.5" /> Fine giornata
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {dati.lavoratiOggiMin > 0 ? <p className="text-sm text-muted-foreground">Oggi {hm(dati.lavoratiOggiMin)} di lavoro già registrate.</p> : <p className="text-sm text-muted-foreground">Nessun turno aperto.</p>}
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" disabled={pending} onClick={() => apri(() => setAvvio(true))}>
              <Play className="mr-1.5 h-3.5 w-3.5" /> Inizia giornata
            </Button>
            <Button size="sm" variant="outline" disabled={pending || dati.haTimbratureOggi || !dati.impostazioni.registraGiornataAttivo} title={dati.haTimbratureOggi ? 'Timbrature già presenti per oggi' : undefined} onClick={() => apri(() => setModo({ tipo: 'registra' }))}>
              <CalendarClock className="mr-1.5 h-3.5 w-3.5" /> Registra giornata
            </Button>
          </div>
        </div>
      )}
      {errore ? <p className="mt-2 text-xs text-destructive">{errore}</p> : null}
      {pending ? <Loader2 className="mt-2 h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
    </>
  );

  const dialoghi = (
    <>
      <CompilaGiornataDialog open={modo != null} onOpenChange={(o) => { if (!o) setModo(null); }} modo={modo} dati={datiDialog} />
      <AvviaGiornataDialog open={avvio} onClose={() => setAvvio(false)} dati={dati} />
    </>
  );

  return { stato: statoMiaGiornata(dati), corpo, dialoghi, pending };
}

export function MiaGiornata({ dati }: { dati: MiaGiornataDati }) {
  const [aperto, setAperto] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const { stato, corpo, dialoghi } = useMiaGiornata(dati, { dopo: () => setAperto(false) });
  const { Icona } = stato;

  React.useEffect(() => {
    if (!aperto) return;
    const fuori = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAperto(false);
    };
    document.addEventListener('mousedown', fuori);
    return () => document.removeEventListener('mousedown', fuori);
  }, [aperto]);

  return (
    <div ref={ref} className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setAperto((v) => !v)}
        aria-expanded={aperto}
        aria-haspopup="menu"
        title={ZONA_MIA.giornata}
        className={cn('inline-flex h-9 max-w-[22rem] items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors hover:brightness-95', stato.colore)}
      >
        {/* La pillola parla di chi guarda: in una barra piena di dati di tutti, lo dice. */}
        <TagTu className="ml-0" />
        {stato.pulsa ? (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
        ) : (
          <Icona className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="truncate">{stato.testo}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />
      </button>

      {aperto ? (
        <div role="menu" className="absolute right-0 top-11 z-50 w-96 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-3 shadow-lg">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{ZONA_MIA.giornata}</p>
          {corpo}
        </div>
      ) : null}

      {/* Fuori dal menu: nel menu stanno i tasti, non lo stato. */}
      {dialoghi}
    </div>
  );
}

/** Inizia la giornata da PC: cantiere, da dove si parte, in sede o in cantiere. */
function AvviaGiornataDialog({ open, onClose, dati }: { open: boolean; onClose: () => void; dati: MiaGiornataDati }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [cantiereId, setCantiereId] = React.useState<string | null>(null);
  const [inSede, setInSede] = React.useState(dati.modalitaLavoro === 'ufficio');
  const [partenza, setPartenza] = React.useState<string>(dati.sedi.find((s) => s.isDefault)?.id ?? 'casa');
  const [autista, setAutista] = React.useState(false);
  const [mezzoId, setMezzoId] = React.useState(dati.ultimoMezzoId ?? '');
  const [errore, setErrore] = React.useState<string | null>(null);
  const sedeDefault = dati.sedi.find((s) => s.isDefault) ?? null;
  const sediAmmesse = dati.sedi.filter((s) => s.isDefault || (cantiereId && (dati.sediPerCantiere[cantiereId] ?? []).includes(s.id)));

  React.useEffect(() => {
    if (!open) return;
    setErrore(null);
    setCantiereId(null);
    setInSede(dati.modalitaLavoro === 'ufficio' && !!sedeDefault);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function avvia() {
    if (!cantiereId && !inSede) return setErrore('Scegli il cantiere, o segna «In sede».');
    setErrore(null);
    startTransition(async () => {
      // In sede senza un progetto: si segna solo la presenza, le ore si
      // assegnano ai cantieri alla fine della giornata.
      if (!cantiereId) {
        const r0 = await segnaPresenzaInSede({ azione: 'inizio' });
        if (!r0.ok) return setErrore(`Non avviato: ${r0.error}`);
        onClose();
        router.refresh();
        return;
      }
      let viaggio: { sedeId: string; durataStimataMin: number | null; durataConfermataMin: number; distanzaKm: number | null; autista: boolean; mezzoId: string | null } | undefined;
      const sedePartenza = inSede ? null : partenza !== 'casa' ? partenza : null;
      if (sedePartenza) {
        const st = await fetch('/api/routing/stima', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sedeId: sedePartenza, cantiereId, direzione: 'andata' }) })
          .then((r) => r.json() as Promise<{ ok?: boolean; minuti?: number | null; km?: number | null }>)
          .catch((): { ok?: boolean; minuti?: number | null; km?: number | null } => ({ ok: false }));
        const minuti = st.ok && typeof st.minuti === 'number' ? Math.round(st.minuti) : 0;
        viaggio = { sedeId: sedePartenza, durataStimataMin: st.ok && typeof st.minuti === 'number' ? minuti : null, durataConfermataMin: Math.round(minuti / dati.impostazioni.stepViaggio) * dati.impostazioni.stepViaggio, distanzaKm: st.ok && typeof st.km === 'number' ? st.km : null, autista, mezzoId: autista ? mezzoId || null : null };
      }
      const r = await avviaTurnoMio({ cantiereId, daSede: inSede || undefined, ...(viaggio ? { viaggio } : {}) });
      if (!r.ok) return setErrore(`Non avviato: ${r.error}`);
      onClose();
      router.refresh();
    });
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label="Inizia giornata">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-5 shadow-xl">
        <div>
          <h2 className="text-base font-semibold">Inizia la giornata</h2>
          <p className="text-xs text-muted-foreground">Cantiere e luogo di partenza.</p>
        </div>
        <div className="space-y-1 text-xs">
          <span className="font-medium text-muted-foreground">Cantiere{inSede ? ' · facoltativo' : ''}</span>
          <Scelta opzioni={dati.cantieri.map((c) => ({ valore: c.id, etichetta: c.cliente ? `${c.nome} · ${c.cliente}` : c.nome }))} valore={cantiereId} onCambia={(v) => setCantiereId(v)} segnaposto={inSede ? 'Nessuno: da indicare a fine giornata' : 'Cantiere…'} disabilitato={pending} etichettaNessuno={inSede ? 'Nessuno: da indicare a fine giornata' : undefined} />
          {inSede && !cantiereId ? (
            <span className="block text-muted-foreground">Viene registrata la presenza in sede; le ore si attribuiscono ai cantieri alla chiusura.</span>
          ) : null}
        </div>
        {sedeDefault ? (
          <div role="radiogroup" aria-label="Dove" className="inline-flex overflow-hidden rounded-md border border-border text-xs">
            {([[true, `In sede · ${sedeDefault.nome}`], [false, 'In cantiere']] as [boolean, string][]).map(([v, et]) => (
              <button key={et} type="button" role="radio" aria-checked={inSede === v} disabled={pending} onClick={() => setInSede(v)} className={inSede === v ? 'bg-primary px-3 py-1.5 font-semibold text-white' : 'bg-background px-3 py-1.5 text-muted-foreground'}>{et}</button>
            ))}
          </div>
        ) : null}
        {!inSede ? (
          <div className="space-y-2 text-xs">
            <label className="block space-y-1">
              <span className="font-medium text-muted-foreground">Partenza</span>
              <select value={partenza} disabled={pending} onChange={(e) => setPartenza(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                {sediAmmesse.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                <option value="casa">Abitazione privata</option>
              </select>
            </label>
            {partenza !== 'casa' ? (
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5"><input type="checkbox" className="h-3.5 w-3.5 accent-primary" checked={autista} disabled={pending} onChange={(e) => setAutista(e.target.checked)} /> Conducente</label>
                {autista && dati.mezzi.length > 0 ? (
                  <select value={mezzoId} disabled={pending} onChange={(e) => setMezzoId(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
                    <option value="">Mezzo…</option>
                    {ordinaMezzi(dati.mezzi).map((m) => <option key={m.id} value={m.id}>{etichettaMezzo(m)}</option>)}
                  </select>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {errore ? <p className="text-xs text-destructive">{errore}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={pending}>Annulla</Button>
          <Button size="sm" onClick={avvia} disabled={pending}>{pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />} Inizia</Button>
        </div>
      </div>
    </div>
  );
}

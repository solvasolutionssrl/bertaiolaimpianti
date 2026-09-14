'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AlertTriangle, History, Loader2, X } from 'lucide-react';
import { formattaOreGiornata } from '@kommessa/api/kantiere-ore';
import { AFFIDABILITA_ETICHETTA, type Affidabilita, type Attore, type EventoCronologia } from '@kommessa/api/kantiere-cronologia';
import { fmtOra } from '@/app/office/_lib/format';
import { cronologiaGiornata, type CronologiaGiornataVista } from '@/app/office/_actions/kantiere-cronologia';

/**
 * Cronologia della giornata, pannello laterale dell'ufficio.
 *
 * Racconta in ordine cosa è successo, come, chi e quando: inizio turno col
 * cartello, pausa dall'app, fine turno dichiarata, correzione dell'ufficio dieci
 * giorni dopo. Si apre su richiesta: su una giornata normale sarebbe rumore.
 *
 * Pannello a destra e non dialog al centro: si legge accanto all'elenco, senza
 * perdere il punto in cui si era.
 */

const PUNTO: Record<Attore, string> = {
  persona: 'bg-slate-500',
  capo: 'bg-sky-500',
  ufficio: 'bg-amber-500',
  sistema: 'bg-white ring-2 ring-inset ring-slate-400',
};

const ATTORE_ETICHETTA: Record<Attore, string> = {
  persona: 'La persona',
  capo: 'Capo squadra',
  ufficio: 'Ufficio',
  sistema: 'Automatico',
};

const STATO_ETICHETTA: Record<string, string> = {
  bozza: 'Da verificare',
  approvato: 'Approvata',
  respinto: 'Respinta',
  inviato: 'Inviata',
  verificato: 'Verificata',
  esportato: 'Esportata',
};

function giornoLungo(iso: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso));
}

function giornoRoma(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date(iso));
}

function giornoOra(iso: string): string {
  const d = new Date(iso);
  const giorno = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit' }).format(d);
  return `${giorno} alle ${fmtOra(iso)}`;
}

export function BollinoAffidabilita({
  affidabilita,
  modificheDopoApprovazione = 0,
  onClick,
}: {
  affidabilita: Affidabilita;
  modificheDopoApprovazione?: number;
  onClick?: () => void;
}) {
  if (affidabilita === 'timbrata' && modificheDopoApprovazione === 0) return null;

  const dopo = modificheDopoApprovazione > 0;
  const cls = dopo
    ? 'border-amber-300 bg-amber-50 text-amber-800'
    : affidabilita === 'corretta_ufficio'
      ? 'border-amber-200 bg-amber-50/60 text-amber-700'
      : 'border-border bg-muted/50 text-muted-foreground';
  const testo = dopo ? 'Modificata dopo l’approvazione' : AFFIDABILITA_ETICHETTA[affidabilita];
  const spiega = dopo
    ? 'Le ore sono cambiate quando la giornata era già approvata. Apri la cronologia per vedere chi e cosa.'
    : affidabilita === 'corretta_ufficio'
      ? 'L’ufficio ha cambiato le ore o inserito timbrature per questa persona.'
      : 'Almeno una parte della giornata è stata dichiarata a mano invece che timbrata.';

  const contenuto = (
    <>
      {dopo ? <AlertTriangle className="h-3 w-3" aria-hidden="true" /> : null}
      {testo}
    </>
  );
  const base = `inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-medium leading-4 ${cls}`;

  return onClick ? (
    <button
      type="button"
      title={spiega}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`${base} hover:brightness-95`}
    >
      {contenuto}
    </button>
  ) : (
    <span title={spiega} className={base}>
      {contenuto}
    </span>
  );
}

function RigaEvento({ ev }: { ev: EventoCronologia }) {
  return (
    <li className="relative grid grid-cols-[3.25rem_1rem_minmax(0,1fr)] gap-x-2 pb-4 last:pb-0">
      {/* Le ore scritte a mano non hanno un orario: meglio niente che un'ora finta. */}
      <span className="pt-0.5 text-right text-xs tabular-nums text-muted-foreground">
        {ev.senzaOrario ? '' : fmtOra(ev.quando)}
      </span>
      <span className="relative flex justify-center">
        <span
          aria-hidden="true"
          className={`relative z-10 mt-1 h-2.5 w-2.5 rounded-full ${PUNTO[ev.attore]} ${
            ev.attenzione ? 'outline outline-2 outline-offset-2 outline-amber-300' : ''
          }`}
        />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-5 text-foreground">{ev.titolo}</p>
        {ev.modalita || ev.chi ? (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
            {ev.modalita ? (
              <span
                className="rounded border border-border bg-card px-1 py-px text-[11px] text-foreground/80"
                title={ev.ricostruita ? 'Modalità dedotta dai dati: la timbratura è precedente al 14 settembre.' : undefined}
              >
                {ev.modalita}
                {ev.ricostruita ? <span className="text-muted-foreground"> · dedotta</span> : null}
              </span>
            ) : null}
            {ev.chi ? <span>di {ev.chi}</span> : null}
          </p>
        ) : null}
        {ev.dettaglio.map((d, i) => (
          <p key={i} className="mt-0.5 truncate text-xs text-muted-foreground">
            {d}
          </p>
        ))}
        {ev.arrivatoAl ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground/80">
            {ev.arrivoDichiarato ? 'Registrata il ' : 'Arrivata il '}
            {giornoOra(ev.arrivatoAl)}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function Contenuto({ vista }: { vista: CronologiaGiornataVista }) {
  // Raggruppa per giorno di calendario: le modifiche arrivate giorni dopo stanno
  // sotto la loro data, non mescolate agli orari della giornata.
  const gruppi: { giorno: string; eventi: EventoCronologia[] }[] = [];
  for (const ev of vista.eventi) {
    const g = giornoRoma(ev.quando);
    const last = gruppi[gruppi.length - 1];
    if (last && last.giorno === g) last.eventi.push(ev);
    else gruppi.push({ giorno: g, eventi: [ev] });
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-border bg-card px-2.5 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Lavoro</p>
          <p className="text-sm font-semibold tabular-nums">{formattaOreGiornata(vista.minutiLavoro)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-2.5 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Viaggio</p>
          <p className="text-sm font-semibold tabular-nums">{formattaOreGiornata(vista.minutiViaggio)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-2.5 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Stato</p>
          <p className="truncate text-sm font-semibold">{STATO_ETICHETTA[vista.stato] ?? vista.stato}</p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <BollinoAffidabilita
          affidabilita={vista.affidabilita}
          modificheDopoApprovazione={vista.modificheDopoApprovazione}
        />
        {vista.affidabilita === 'timbrata' && vista.modificheDopoApprovazione === 0 ? (
          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-px text-[10px] font-medium leading-4 text-emerald-700">
            Tutta timbrata
          </span>
        ) : null}
        {vista.cantieri.length > 0 ? (
          <span className="truncate text-xs text-muted-foreground">{vista.cantieri.join(' · ')}</span>
        ) : null}
      </div>

      {vista.eventi.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Nessun evento registrato per questa giornata.
        </p>
      ) : (
        <div className="mt-5 space-y-5">
          {gruppi.map((g, gi) => (
            <section key={g.giorno}>
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {giornoLungo(g.giorno)}
                {gi > 0 ? <span className="ml-1.5 font-normal normal-case tracking-normal">· modifiche successive</span> : null}
              </p>
              <ol className="relative before:absolute before:bottom-1.5 before:left-[4.25rem] before:top-1.5 before:w-px before:bg-border">
                {g.eventi.map((ev) =>
                  ev.dopoApprovazione ? (
                    <div key={ev.chiave} className="-mx-2 mb-2 rounded-lg bg-amber-50/70 px-2 pt-2">
                      <RigaEvento ev={ev} />
                    </div>
                  ) : (
                    <RigaEvento key={ev.chiave} ev={ev} />
                  ),
                )}
              </ol>
            </section>
          ))}
        </div>
      )}

      <div className="mt-6 border-t border-border pt-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
          {(Object.keys(PUNTO) as Attore[]).map((a) => (
            <li key={a} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${PUNTO[a]}`} />
              {ATTORE_ETICHETTA[a]}
            </li>
          ))}
        </ul>
        {vista.modalitaDedotte ? (
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Per le timbrature precedenti al 14 settembre la modalità è dedotta dai dati disponibili.
          </p>
        ) : null}
      </div>
    </>
  );
}

export function CronologiaGiornataPannello({
  rapportino,
  onClose,
}: {
  rapportino: { id: string; nome: string; data: string } | null;
  onClose: () => void;
}) {
  const [vista, setVista] = React.useState<CronologiaGiornataVista | null>(null);
  const [errore, setErrore] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!rapportino) {
      setVista(null);
      setErrore(null);
      return;
    }
    let attivo = true;
    setVista(null);
    setErrore(null);
    cronologiaGiornata({ rapportinoId: rapportino.id })
      .then((r) => {
        if (!attivo) return;
        if (r.ok) setVista(r.cronologia);
        else setErrore(r.error);
      })
      .catch(() => attivo && setErrore('Non è stato possibile caricare la cronologia.'));
    return () => {
      attivo = false;
    };
  }, [rapportino]);

  return (
    <DialogPrimitive.Root open={!!rapportino} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-900/25 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-background shadow-2xl outline-none sm:max-w-[500px] data-[state=open]:animate-in data-[state=open]:slide-in-from-right"
        >
          <header className="flex shrink-0 items-start gap-3 border-b border-border px-5 py-4">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <History className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-base font-semibold tracking-tight">
                Cronologia della giornata
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="truncate text-sm text-muted-foreground">
                {rapportino ? `${rapportino.nome} · ${giornoLungo(rapportino.data)}` : ''}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Chiudi"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {errore ? (
              <p className="mt-8 text-center text-sm text-destructive">{errore}</p>
            ) : !vista ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              </div>
            ) : (
              <Contenuto vista={vista} />
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

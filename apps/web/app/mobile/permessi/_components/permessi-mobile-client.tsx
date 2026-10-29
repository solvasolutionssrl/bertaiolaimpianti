'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CalendarCheck, Plus, X, Check, Loader2, Clock, CalendarDays, Inbox, FileText } from 'lucide-react';
import { LABEL_STATO_PERMESSO } from '@kommessa/api/permessi-tipi';
import {
  addOre,
  controllaRichiesta,
  fmtQuando,
  fmtQuantita,
  minutiFra,
  STATO_CLASSE,
  testoDurata,
  giorniFra,
  type RichiestaVista,
  type TipoOpt,
} from '@kommessa/api/permessi-richiesta';
import { Portal } from '@/app/mobile/_components/portal';
import { useAlert, useConfirm } from '@/app/_components/confirm-provider';
import { Scelta } from '@/app/_components/scelta';
import { MobileBackButton } from '@/app/mobile/_components/mobile-back-button';
import { richiediPermesso, decidiPermesso, annullaRichiesta } from '@/app/office/_actions/ferie-permessi';

export type MiaRichiesta = RichiestaVista;
export interface DaApprovare {
  id: string;
  dipendenteNome: string;
  tipoLabel: string;
  dataInizio: string;
  dataFine: string;
  tuttoIlGiorno: boolean;
  oraInizio: string | null;
  oraFine: string | null;
  motivo: string | null;
}

/**
 * I campi di data e ora su iPhone: Safari da' loro una larghezza intrinseca e
 * dentro una griglia non si restringono (il campo esce dalla card). Qui si
 * tolgono l'aspetto nativo e il minimo, e il valore si allinea a sinistra.
 */
const CAMPO =
  'block h-11 w-full min-w-0 appearance-none rounded-lg border border-input bg-background px-3 text-base text-foreground focus:border-primary focus:outline-none [&::-webkit-date-and-time-value]:text-left [&::-webkit-date-and-time-value]:min-h-[1.5rem]';
const ETICHETTA = 'mb-1 block text-xs font-medium text-muted-foreground';

export function PermessiMobileClient({
  mioDip,
  oggiISO,
  tipiOpzioni,
  mieRichieste,
  daApprovare,
  puoApprovare,
}: {
  mioDip: string | null;
  oggiISO: string;
  tipiOpzioni: TipoOpt[];
  mieRichieste: MiaRichiesta[];
  daApprovare: DaApprovare[];
  puoApprovare: boolean;
}) {
  const [formOpen, setFormOpen] = React.useState(false);
  const [tipoSel, setTipoSel] = React.useState<string | null>(null);
  // I tipi presenti nelle richieste in elenco (anche quelli non piu' attivi).
  const opzioniTipo = React.useMemo(() => {
    const visti = new Set<string>();
    for (const r of mieRichieste) visti.add(r.tipoLabel);
    for (const r of daApprovare) visti.add(r.tipoLabel);
    return [...visti].sort((a, b) => a.localeCompare(b, 'it')).map((t) => ({ valore: t, etichetta: t }));
  }, [mieRichieste, daApprovare]);
  const delTipo = <T extends { tipoLabel: string }>(lista: T[]) =>
    tipoSel ? lista.filter((r) => r.tipoLabel === tipoSel) : lista;
  const mie = delTipo(mieRichieste);
  const daApprovareVisibili = delTipo(daApprovare);
  const inAttesa = mie.filter((r) => r.stato === 'in_attesa' || r.stato === 'modifica_richiesta');
  const decise = mie.filter((r) => r.stato === 'approvato' || r.stato === 'rifiutato');

  return (
    <div className="animate-content-in flex min-h-[100dvh] flex-col gap-4 p-4">
      <header className="mt-2 flex items-center gap-2">
        <MobileBackButton />
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <CalendarCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          Ferie e permessi
        </h1>
      </header>

      {mioDip ? (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-sm active:scale-[0.99]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Nuova richiesta
        </button>
      ) : (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Il profilo non è collegato a una scheda dipendente. Richiedere il collegamento all’ufficio.
        </p>
      )}

      {opzioniTipo.length > 1 ? (
        <div className="min-w-0" data-filtro="tipo">
          <Scelta
            aria-label="Tipo di richiesta"
            opzioni={opzioniTipo}
            valore={tipoSel}
            onCambia={setTipoSel}
            segnaposto="Tutti i tipi"
            etichettaNessuno="Tutti i tipi"
            segnapostoRicerca="Cerca un tipo…"
            ricercaSempre
          />
        </div>
      ) : null}

      {puoApprovare && daApprovareVisibili.length > 0 ? (
        <section className="space-y-2" data-sezione="da-approvare">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Inbox className="h-3.5 w-3.5" aria-hidden="true" /> Da approvare ({daApprovareVisibili.length})
          </h2>
          {daApprovareVisibili.map((r) => (
            <DaApprovareCard key={r.id} r={r} />
          ))}
        </section>
      ) : null}

      <section className="space-y-2" data-sezione="in-corso">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">In attesa di risposta</h2>
        {inAttesa.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-card/60 p-4 text-sm text-muted-foreground">
            Nessuna richiesta {tipoSel ? 'di questo tipo ' : ''}in attesa.
          </p>
        ) : (
          inAttesa.map((r) => <MiaRichiestaCard key={r.id} r={r} />)
        )}
      </section>

      {decise.length > 0 ? (
        <section className="space-y-2" data-sezione="storico">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Storico</h2>
          {decise.map((r) => (
            <MiaRichiestaCard key={r.id} r={r} />
          ))}
        </section>
      ) : null}

      {formOpen && mioDip ? (
        <RichiestaSheet dipendenteId={mioDip} oggiISO={oggiISO} tipiOpzioni={tipiOpzioni} onClose={() => setFormOpen(false)} />
      ) : null}
    </div>
  );
}

function MiaRichiestaCard({ r }: { r: MiaRichiesta }) {
  const router = useRouter();
  const alert = useAlert();
  const askConfirm = useConfirm();
  const [pending, start] = React.useTransition();
  const Icona = r.tuttoIlGiorno ? CalendarDays : Clock;
  return (
    <div className="rounded-xl border border-border bg-card p-3" data-richiesta={r.id}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{r.tipoLabel}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Icona className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{fmtQuando(r)}</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={'rounded-full px-2 py-0.5 text-[11px] font-medium ' + STATO_CLASSE[r.stato]}>
            {LABEL_STATO_PERMESSO[r.stato] ?? r.stato}
          </span>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{fmtQuantita(r)}</span>
        </div>
      </div>
      {r.motivo ? <p className="mt-2 text-sm text-foreground/80">{r.motivo}</p> : null}
      {r.decisioneNota ? (
        <p className="mt-2 rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">Nota dell’ufficio:</span> {r.decisioneNota}
        </p>
      ) : null}
      {r.stato === 'in_attesa' ? (
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            const ok = await askConfirm({
              title: 'Annullare la richiesta?',
              description: 'La richiesta verrà eliminata. Si potrà inviarne una nuova in qualsiasi momento.',
              confirmLabel: 'Annulla richiesta',
              cancelLabel: 'Indietro',
              destructive: true,
            });
            if (!ok) return;
            start(async () => {
              const res = await annullaRichiesta(r.id);
              if (!res.ok) await alert({ title: 'Operazione non riuscita', body: res.error });
              router.refresh();
            });
          }}
          className="mt-2 min-h-[36px] text-xs font-medium text-rose-600"
        >
          Annulla richiesta
        </button>
      ) : null}
    </div>
  );
}

function DaApprovareCard({ r }: { r: DaApprovare }) {
  const router = useRouter();
  const alert = useAlert();
  const [pending, start] = React.useTransition();

  const decidi = (esito: 'approvato' | 'rifiutato') =>
    start(async () => {
      const res = await decidiPermesso({ id: r.id, esito });
      if (!res.ok) {
        await alert({ title: 'Operazione non riuscita', body: res.error });
        return;
      }
      router.refresh();
    });

  const Icona = r.tuttoIlGiorno ? CalendarDays : Clock;
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-sm font-semibold">{r.dipendenteNome}</p>
      <p className="text-sm text-muted-foreground">
        {r.tipoLabel} · {fmtQuantita(r)}
      </p>
      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Icona className="h-3.5 w-3.5" aria-hidden="true" />
        {fmtQuando(r)}
      </p>
      {r.motivo ? <p className="mt-1 text-sm text-foreground/80">{r.motivo}</p> : null}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => decidi('approvato')}
          className="flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white active:scale-[0.99]"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
          Approva
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => decidi('rifiutato')}
          className="flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-lg border border-rose-300 py-2 text-sm font-semibold text-rose-600 active:scale-[0.99]"
        >
          <X className="h-4 w-4" aria-hidden="true" /> Rifiuta
        </button>
      </div>
    </div>
  );
}

const SCORCIATOIE_ORE = [2, 4, 8];

function RichiestaSheet({
  dipendenteId,
  oggiISO,
  tipiOpzioni,
  onClose,
}: {
  dipendenteId: string;
  oggiISO: string;
  tipiOpzioni: TipoOpt[];
  onClose: () => void;
}) {
  const router = useRouter();
  const alert = useAlert();
  const [pending, start] = React.useTransition();
  const [tipo, setTipo] = React.useState(tipiOpzioni[0]?.codice ?? 'ferie');
  const tipoScelto = tipiOpzioni.find((t) => t.codice === tipo);
  const [aOre, setAOre] = React.useState(tipoScelto?.unita === 'ore');
  const [dataInizio, setDataInizio] = React.useState(oggiISO);
  const [dataFine, setDataFine] = React.useState(oggiISO);
  const [oraInizio, setOraInizio] = React.useState('08:00');
  const [oraFine, setOraFine] = React.useState('12:00');
  const [motivo, setMotivo] = React.useState('');
  const [errore, setErrore] = React.useState<string | null>(null);

  const onTipo = (codice: string) => {
    setTipo(codice);
    setErrore(null);
    const t = tipiOpzioni.find((x) => x.codice === codice);
    if (t?.unita === 'ore') {
      setAOre(true);
      if (t.oreDefault) {
        setOraInizio('08:00');
        setOraFine(addOre('08:00', t.oreDefault));
      }
    } else if (t?.unita === 'giorni') {
      setAOre(false);
    }
  };
  // Il tipo decide se la scelta giorni/ore esiste: con «entrambi» la si lascia alla persona.
  const sceltaLibera = !tipoScelto || tipoScelto.unita === 'entrambi';

  const minutiScelti = aOre ? minutiFra(oraInizio, oraFine) : 0;
  const giorniScelti = aOre ? 0 : giorniFra(dataInizio, dataFine);
  const riepilogo = aOre
    ? minutiScelti > 0
      ? `${testoDurata(minutiScelti)} · ${fmtQuando({ dataInizio, dataFine: dataInizio, tuttoIlGiorno: false, oraInizio, oraFine })}`
      : null
    : giorniScelti > 0
      ? `${giorniScelti === 1 ? '1 giorno' : `${giorniScelti} giorni`} · ${fmtQuando({ dataInizio, dataFine, tuttoIlGiorno: true, oraInizio: null, oraFine: null })}`
      : null;

  const invia = () => {
    const problema = controllaRichiesta({ tipo, aOre, dataInizio, dataFine: aOre ? dataInizio : dataFine, oraInizio, oraFine });
    if (problema) {
      setErrore(problema);
      return;
    }
    setErrore(null);
    start(async () => {
      const res = await richiediPermesso({
        dipendenteId,
        tipo,
        dataInizio,
        dataFine: aOre ? dataInizio : dataFine,
        tuttoIlGiorno: !aOre,
        oraInizio: aOre ? oraInizio : null,
        oraFine: aOre ? oraFine : null,
        motivo: motivo.trim() || null,
      });
      if (!res.ok) {
        await alert({ title: 'Richiesta non inviata', body: res.error });
        return;
      }
      onClose();
      router.refresh();
    });
  };

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[70] flex flex-col bg-background"
        role="dialog"
        aria-modal="true"
        aria-label="Nuova richiesta"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold">Nuova richiesta</h2>
          <button type="button" onClick={onClose} aria-label="Chiudi" className="-mr-2 rounded-full p-2 text-muted-foreground">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-4">
          <div className="block">
            <span className={ETICHETTA}>Tipo</span>
            {/* Con la ricerca, come nell'ufficio: la tendina di sistema non la ha */}
            <Scelta
              aria-label="Tipo"
              opzioni={tipiOpzioni.map((t) => ({ valore: t.codice, etichetta: t.label }))}
              valore={tipo || null}
              onCambia={(v) => {
                if (v) onTipo(v);
              }}
              segnaposto="Scegli il tipo…"
              segnapostoRicerca="Cerca un tipo…"
              ricercaSempre
              className="h-11 text-base"
            />
          </div>
          {tipoScelto?.richiedeGiustificativo ? (
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Per questo tipo di assenza l’ufficio può richiedere un documento giustificativo.
            </p>
          ) : null}

          {sceltaLibera ? (
            <div role="radiogroup" aria-label="Durata" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {(
                [
                  { v: false, t: 'Giorni interi' },
                  { v: true, t: 'A ore' },
                ] as const
              ).map((o) => (
                <button
                  key={String(o.v)}
                  type="button"
                  role="radio"
                  aria-checked={aOre === o.v}
                  onClick={() => {
                    setAOre(o.v);
                    setErrore(null);
                  }}
                  className={
                    'h-10 rounded-md text-sm font-medium transition ' +
                    (aOre === o.v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')
                  }
                >
                  {o.t}
                </button>
              ))}
            </div>
          ) : null}

          {aOre ? (
            <div className="space-y-3">
              <label className="block">
                <span className={ETICHETTA}>Giorno</span>
                <input type="date" value={dataInizio} onChange={(e) => setDataInizio(e.target.value)} className={CAMPO} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block min-w-0">
                  <span className={ETICHETTA}>Dalle</span>
                  <input type="time" step={300} value={oraInizio} onChange={(e) => setOraInizio(e.target.value)} className={CAMPO} />
                </label>
                <label className="block min-w-0">
                  <span className={ETICHETTA}>Alle</span>
                  <input type="time" step={300} value={oraFine} onChange={(e) => setOraFine(e.target.value)} className={CAMPO} />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Durata:</span>
                {SCORCIATOIE_ORE.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setOraFine(addOre(oraInizio, h))}
                    className={
                      'h-9 rounded-full border px-3 text-xs font-medium ' +
                      (minutiScelti === h * 60 ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-foreground')
                    }
                  >
                    {h} ore
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <label className="block min-w-0">
                <span className={ETICHETTA}>Dal</span>
                <input
                  type="date"
                  value={dataInizio}
                  onChange={(e) => {
                    setDataInizio(e.target.value);
                    if (e.target.value > dataFine) setDataFine(e.target.value);
                  }}
                  className={CAMPO}
                />
              </label>
              <label className="block min-w-0">
                <span className={ETICHETTA}>Al</span>
                <input type="date" value={dataFine} min={dataInizio} onChange={(e) => setDataFine(e.target.value)} className={CAMPO} />
              </label>
            </div>
          )}

          <label className="block">
            <span className={ETICHETTA}>Motivo (facoltativo)</span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Se utile all’ufficio."
              className="block w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-base focus:border-primary focus:outline-none"
            />
          </label>

          {riepilogo ? (
            <p className="rounded-lg bg-primary/5 px-3 py-2 text-sm text-foreground" data-riepilogo>
              <span className="font-medium">{tipoScelto?.label ?? tipo}</span> · {riepilogo}
            </p>
          ) : null}
          {errore ? (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {errore}
            </p>
          ) : null}
        </div>

        <footer className="shrink-0 border-t border-border p-4">
          <button
            type="button"
            onClick={invia}
            disabled={pending}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground active:scale-[0.99] disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
            Invia richiesta
          </button>
        </footer>
      </div>
    </Portal>
  );
}

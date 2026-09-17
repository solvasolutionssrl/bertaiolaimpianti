'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Info,
  Pencil,
  Plus,
  Settings2,
  Stethoscope,
  Trash2,
  Users,
} from 'lucide-react';
import { Badge, Button, Card, CardContent } from '@kommessa/ui';
import type { CausaleEssePaghe } from '@kommessa/api/paghe-causali';

import { useAlert, useConfirm } from '@/app/_components/confirm-provider';
import { eliminaEventoPaghe, segnaStatoMese } from '@/app/office/_actions/paghe';
import type {
  CertificatoMese,
  DipendenteMese,
  EventoMese,
  ModelloMese,
} from '../_lib/dati-mese';
import { EventoDialog } from './evento-dialog';
import { DizionarioDialog } from './dizionario-dialog';
import { CertificatoDialog } from './certificato-dialog';

/**
 * La pagina con cui l'ufficio prepara il mese per il consulente del lavoro.
 *
 * Tre cose devono essere immediate: che cosa Kommessa ha gia' capito da solo,
 * che cosa manca ancora, e che cosa uscira' davvero nel file. Per questo le
 * viste sono quattro e non una: il riepilogo per persona, il calendario per
 * vedere il mese a colpo d'occhio, le variazioni da scrivere a mano per chi
 * ancora non usa l'app, e l'anteprima del file con accanto la traduzione in
 * italiano di ogni riga.
 */

export interface PagheClientProps {
  mese: ModelloMese;
  catalogo: CausaleEssePaghe[];
  codiciPersonalizzati: string[];
  tipiAssenza: { codice: string; label: string }[];
}

type Vista = 'riepilogo' | 'calendario' | 'completa' | 'file';

const MESI = [
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre',
];

function etichettaMese(periodo: string): string {
  const [anno, mese] = periodo.split('-');
  return `${MESI[Number(mese) - 1] ?? periodo} ${anno}`;
}

function spostaMese(periodo: string, passi: number): string {
  const [anno, mese] = periodo.split('-').map(Number);
  const d = new Date(Date.UTC(anno!, (mese ?? 1) - 1 + passi, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Ore come le scrive il file: virgola e due decimali, mai i minuti. */
function ore(valore: number): string {
  return valore.toFixed(2).replace('.', ',');
}

function giornoBreve(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function giorniDelMese(periodo: string): string[] {
  const [anno, mese] = periodo.split('-').map(Number);
  const quanti = new Date(Date.UTC(anno!, mese!, 0)).getUTCDate();
  return Array.from(
    { length: quanti },
    (_, i) => `${periodo}-${String(i + 1).padStart(2, '0')}`,
  );
}

/** Colore della pastiglia in base a che cosa comunica la causale. */
function tintaCausale(codice: string, famiglia: string): string {
  if (codice === 'ML' || codice === 'IN' || codice === 'MO') {
    return 'bg-rose-50 text-rose-700 ring-rose-200';
  }
  if (famiglia === 'straordinario') return 'bg-amber-50 text-amber-800 ring-amber-200';
  return 'bg-sky-50 text-sky-700 ring-sky-200';
}

function Sezione({
  icona: Icona,
  titolo,
  azione,
  children,
  className,
}: {
  icona: React.ComponentType<{ className?: string }>;
  titolo: string;
  azione?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="mb-3 flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icona className="h-3.5 w-3.5" />
          </span>
          <h2 className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {titolo}
          </h2>
          {azione}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function Kpi({ etichetta, valore, nota }: { etichetta: string; valore: string; nota?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card px-3 py-2">
      <div className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {etichetta}
      </div>
      <div className="mt-0.5 truncate text-lg font-semibold leading-tight text-foreground">
        {valore}
      </div>
      {nota ? <div className="truncate text-[11px] text-muted-foreground">{nota}</div> : null}
    </div>
  );
}

export function PagheClient({
  mese,
  catalogo,
  codiciPersonalizzati,
  tipiAssenza,
}: PagheClientProps) {
  const router = useRouter();
  const showAlert = useAlert();
  const confirm = useConfirm();
  const [vista, setVista] = React.useState<Vista>('riepilogo');
  const [inCorso, setInCorso] = React.useState(false);
  const [aperti, setAperti] = React.useState<Set<string>>(new Set());
  const [eventoAperto, setEventoAperto] = React.useState<EventoMese | 'nuovo' | null>(null);
  const [dizionarioAperto, setDizionarioAperto] = React.useState(false);
  const [certificatoAperto, setCertificatoAperto] = React.useState<{
    dipendente: DipendenteMese;
    dal: string;
    al: string;
    esistente: CertificatoMese | null;
  } | null>(null);
  const perCodice = React.useMemo(
    () => new Map(catalogo.map((c) => [c.codice, c])),
    [catalogo],
  );
  const dipPerId = React.useMemo(
    () => new Map(mese.dipendenti.map((d) => [d.id, d])),
    [mese.dipendenti],
  );

  const eventiPerDip = React.useMemo(() => {
    const mappa = new Map<string, EventoMese[]>();
    for (const e of mese.eventi) {
      const lista = mappa.get(e.dipendenteId);
      if (lista) lista.push(e);
      else mappa.set(e.dipendenteId, [e]);
    }
    for (const lista of mappa.values()) lista.sort((a, b) => a.dal.localeCompare(b.dal));
    return mappa;
  }, [mese.eventi]);

  const totali = React.useMemo(() => {
    let straordinario = 0;
    let viaggio = 0;
    let assenze = 0;
    for (const e of mese.eventi) {
      const causale = perCodice.get(e.causale);
      if (causale?.famiglia === 'straordinario') {
        if (e.causale === mese.config.regole.viaggioEccedente) viaggio += e.ore;
        else straordinario += e.ore;
      } else {
        assenze += 1;
      }
    }
    return { straordinario, viaggio, assenze };
  }, [mese.eventi, mese.config.regole.viaggioEccedente, perCodice]);

  const blocchi = mese.esito.avvisi.filter((a) => a.gravita === 'blocco');
  const attenzioni = mese.esito.avvisi.filter((a) => a.gravita === 'attenzione');
  const senzaCodice = mese.dipendenti.filter(
    (d) => d.attivo && !d.codicePaghe && eventiPerDip.has(d.id),
  );

  function vaiAlMese(periodo: string) {
    router.push(`/office/personalizzazioni/paghe?mese=${periodo}`);
  }

  function apriChiudi(id: string) {
    setAperti((prima) => {
      const dopo = new Set(prima);
      if (dopo.has(id)) dopo.delete(id);
      else dopo.add(id);
      return dopo;
    });
  }

  async function cambiaStato(consegnato: boolean) {
    setInCorso(true);
    const res = await segnaStatoMese({ periodo: mese.periodo, consegnato });
    setInCorso(false);
    if (!res.ok) await showAlert({ title: 'Non salvato', body: res.error });
    else router.refresh();
  }

  async function rimuoviEvento(evento: EventoMese) {
    if (!evento.id) return;
    const ok = await confirm({
      title: 'Elimina la variazione',
      description: `${dipPerId.get(evento.dipendenteId)?.cognome ?? ''}: ${evento.causale} del ${giornoBreve(evento.dal)}.`,
      confirmLabel: 'Elimina',
      destructive: true,
    });
    if (!ok) return;
    setInCorso(true);
    const res = await eliminaEventoPaghe(evento.id);
    setInCorso(false);
    if (!res.ok) await showAlert({ title: 'Non eliminata', body: res.error });
    else router.refresh();
  }

  const scaricabile = mese.esito.totali.eventi > 0 && Boolean(mese.config.codiceDitta);

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-5 md:px-6">
      {/* Intestazione: mese, stato, azione principale. */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
            Export paghe
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Le variazioni del mese nel tracciato che il consulente del lavoro importa nel suo
            programma paghe.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Stessa altezza dei tasti accanto: 40px, bordo compreso. */}
          <div className="flex h-10 items-center gap-1 rounded-lg border border-border bg-card px-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              aria-label="Mese precedente"
              onClick={() => vaiAlMese(spostaMese(mese.periodo, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[8.5rem] text-center text-sm font-semibold text-foreground">
              {etichettaMese(mese.periodo)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              aria-label="Mese successivo"
              onClick={() => vaiAlMese(spostaMese(mese.periodo, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {mese.stato === 'consegnato' ? (
            <Badge className="bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
              Consegnato
            </Badge>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => setDizionarioAperto(true)}>
            <Settings2 className="mr-1.5 h-3.5 w-3.5" />
            Impostazioni
          </Button>
          <Button size="sm" asChild={scaricabile} disabled={!scaricabile}>
            {scaricabile ? (
              <a href={`/api/office/paghe/export?periodo=${mese.periodo}`} download>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Scarica il file
              </a>
            ) : (
              <span>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Scarica il file
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Numeri del mese. */}
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Kpi
          etichetta="Nel file"
          valore={String(mese.esito.totali.dipendenti)}
          nota={`su ${mese.dipendenti.filter((d) => d.attivo).length} in forza`}
        />
        <Kpi
          etichetta="Righe evento"
          valore={String(mese.esito.totali.eventi)}
          nota={`${mese.esito.totali.record14} giornaliere, ${mese.esito.totali.record12} a periodo`}
        />
        <Kpi etichetta="Straordinario" valore={`${ore(totali.straordinario)} ore`} />
        <Kpi etichetta="Viaggio" valore={`${ore(totali.viaggio)} ore`} />
        <Kpi etichetta="Assenze" valore={String(totali.assenze)} nota="righe di assenza" />
        <Kpi
          etichetta="Da guardare"
          valore={String(blocchi.length + attenzioni.length + mese.causaliDaDecidere.length)}
          nota={blocchi.length > 0 ? `${blocchi.length} bloccanti` : 'nessun blocco'}
        />
      </div>

      {/* Avvisi: prima i blocchi, poi quello che lo Studio dovra' sistemare. */}
      {blocchi.length > 0 || mese.causaliDaDecidere.length > 0 || attenzioni.length > 0 ? (
        <div className="mb-4 space-y-2">
          {blocchi.length > 0 ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-rose-800">
                <AlertTriangle className="h-4 w-4" />
                {blocchi.length === 1
                  ? 'Una riga resta fuori dal file'
                  : `${blocchi.length} righe restano fuori dal file`}
              </div>
              <ul className="mt-1.5 space-y-0.5 text-[13px] text-rose-700">
                {blocchi.slice(0, 6).map((a, i) => (
                  <li key={i}>{a.messaggio}</li>
                ))}
                {blocchi.length > 6 ? <li>e altre {blocchi.length - 6}.</li> : null}
              </ul>
            </div>
          ) : null}

          {mese.causaliDaDecidere.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <Info className="h-4 w-4 shrink-0 text-amber-700" />
              <span className="text-[13px] text-amber-800">
                Da decidere con il consulente con quale causale comunicare:{' '}
                <strong>{mese.causaliDaDecidere.map((c) => c.label).join(', ')}</strong>.
              </span>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                onClick={() => setDizionarioAperto(true)}
              >
                Scegli la causale
              </Button>
            </div>
          ) : null}

          {attenzioni.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                <Stethoscope className="h-4 w-4" />
                Il file esce comunque, ma lo Studio dovra' completare a mano
              </div>
              <ul className="mt-1.5 space-y-0.5 text-[13px] text-amber-800">
                {attenzioni.slice(0, 5).map((a, i) => (
                  <li key={i}>{a.messaggio}</li>
                ))}
                {attenzioni.length > 5 ? <li>e altre {attenzioni.length - 5}.</li> : null}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Colonna principale */}
        <div className="min-w-0">
          <div className="mb-3 inline-flex rounded-lg border border-border bg-card p-1">
            {(
              [
                ['riepilogo', 'Riepilogo', Users],
                ['calendario', 'Calendario', CalendarDays],
                ['completa', 'Da completare', Plus],
                ['file', 'Anteprima file', FileText],
              ] as const
            ).map(([id, label, Icona]) => (
              <button
                key={id}
                type="button"
                onClick={() => setVista(id)}
                className={
                  vista === id
                    ? 'flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground'
                    : 'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground'
                }
              >
                <Icona className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {vista === 'riepilogo' ? (
            <RiepilogoVista
              mese={mese}
              eventiPerDip={eventiPerDip}
              perCodice={perCodice}
              aperti={aperti}
              apriChiudi={apriChiudi}
              onModifica={(e) => setEventoAperto(e)}
              onElimina={rimuoviEvento}
              onCertificato={(dip, e) =>
                setCertificatoAperto({
                  dipendente: dip,
                  dal: e.dal,
                  al: e.al,
                  esistente:
                    mese.certificati.find(
                      (c) => c.dipendenteId === dip.id && c.dal <= e.al && e.dal <= c.al,
                    ) ?? null,
                })
              }
            />
          ) : null}

          {vista === 'calendario' ? (
            <CalendarioVista mese={mese} eventiPerDip={eventiPerDip} perCodice={perCodice} />
          ) : null}

          {vista === 'completa' ? (
            <CompletaVista
              mese={mese}
              eventiPerDip={eventiPerDip}
              onAggiungi={() => setEventoAperto('nuovo')}
            />
          ) : null}

          {vista === 'file' ? <FileVista mese={mese} /> : null}
        </div>

        {/* Sidebar di riepilogo */}
        <div className="space-y-3 xl:sticky xl:top-4 xl:self-start">
          {mese.giornateSospese.length > 0 ? (
            <Sezione icona={AlertTriangle} titolo="Giornate non approvate">
              <p className="text-[12px] leading-snug text-muted-foreground">
                {mese.giornateSospese.length}{' '}
                {mese.giornateSospese.length === 1 ? 'giornata resta' : 'giornate restano'} fuori
                dal file: finche' non sono approvate in Presenze e ore, le loro ore non si
                comunicano.
              </p>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-[12px]">
                {mese.giornateSospese.slice(0, 20).map((g, i) => {
                  const dip = dipPerId.get(g.dipendenteId);
                  return (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="truncate text-foreground">
                        {dip ? `${dip.cognome} ${dip.nome}` : 'Dipendente'}
                      </span>
                      <span className="shrink-0 text-muted-foreground">{giornoBreve(g.data)}</span>
                    </li>
                  );
                })}
              </ul>
            </Sezione>
          ) : null}

          {senzaCodice.length > 0 ? (
            <Sezione icona={Users} titolo="Senza codice paghe">
              <p className="text-[12px] leading-snug text-muted-foreground">
                Hanno variazioni da comunicare ma non hanno il codice delle paghe in anagrafica,
                quindi restano fuori dal file.
              </p>
              <ul className="mt-2 space-y-1 text-[12px] text-foreground">
                {senzaCodice.map((d) => (
                  <li key={d.id} className="truncate">
                    {d.cognome} {d.nome}
                  </li>
                ))}
              </ul>
            </Sezione>
          ) : null}

          <Sezione icona={Check} titolo="Stato del mese">
            {mese.stato === 'consegnato' ? (
              <>
                <p className="text-[12px] text-muted-foreground">
                  Segnato come consegnato
                  {mese.consegnatoAl
                    ? ` il ${new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(mese.consegnatoAl))}`
                    : ''}
                  .
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 w-full"
                  disabled={inCorso}
                  onClick={() => cambiaStato(false)}
                >
                  Riapri il mese
                </Button>
              </>
            ) : (
              <>
                <p className="text-[12px] text-muted-foreground">
                  Quando hai mandato il file allo Studio, segnalo qui: serve a sapere a colpo
                  d'occhio quali mesi sono chiusi.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 w-full"
                  disabled={inCorso}
                  onClick={() => cambiaStato(true)}
                >
                  Segna come consegnato
                </Button>
              </>
            )}
          </Sezione>
        </div>
      </div>

      {eventoAperto ? (
        <EventoDialog
          periodo={mese.periodo}
          dipendenti={mese.dipendenti}
          catalogo={catalogo}
          oreGiornataIntera={mese.oreGiornataIntera}
          evento={eventoAperto === 'nuovo' ? null : eventoAperto}
          onChiudi={() => setEventoAperto(null)}
          onSalvato={() => {
            setEventoAperto(null);
            router.refresh();
          }}
        />
      ) : null}

      {dizionarioAperto ? (
        <DizionarioDialog
          catalogo={catalogo}
          codiciPersonalizzati={codiciPersonalizzati}
          regole={mese.config.regole}
          tipiAssenza={tipiAssenza}
          daDecidere={mese.causaliDaDecidere.map((c) => c.tipo)}
          programmaPresenze={mese.config.programmaPresenze}
          codiceDitta={mese.config.codiceDitta}
          onChiudi={() => setDizionarioAperto(false)}
          onSalvato={() => router.refresh()}
        />
      ) : null}

      {certificatoAperto ? (
        <CertificatoDialog
          dipendente={certificatoAperto.dipendente}
          dal={certificatoAperto.dal}
          al={certificatoAperto.al}
          esistente={certificatoAperto.esistente}
          onChiudi={() => setCertificatoAperto(null)}
          onSalvato={() => {
            setCertificatoAperto(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Viste
// ---------------------------------------------------------------------------

function PastigliaCausale({
  codice,
  causale,
  titolo,
}: {
  codice: string;
  causale?: CausaleEssePaghe;
  titolo?: string;
}) {
  return (
    <span
      title={titolo ?? causale?.descrizione ?? codice}
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold ring-1 ${tintaCausale(codice, causale?.famiglia ?? 'evento')}`}
    >
      {codice}
    </span>
  );
}

function RiepilogoVista({
  mese,
  eventiPerDip,
  perCodice,
  aperti,
  apriChiudi,
  onModifica,
  onElimina,
  onCertificato,
}: {
  mese: ModelloMese;
  eventiPerDip: Map<string, EventoMese[]>;
  perCodice: Map<string, CausaleEssePaghe>;
  aperti: Set<string>;
  apriChiudi: (id: string) => void;
  onModifica: (e: EventoMese) => void;
  onElimina: (e: EventoMese) => void;
  onCertificato: (d: DipendenteMese, e: EventoMese) => void;
}) {
  const conEventi = mese.dipendenti.filter((d) => eventiPerDip.has(d.id));

  if (conEventi.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-sm font-medium text-foreground">
            Per questo mese non c'e' niente da comunicare.
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Le giornate normali non si esportano: nel file vanno solo straordinari, assenze e
            maggiorazioni.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="max-h-[calc(100vh-20rem)] overflow-auto">
          <table className="w-full table-fixed border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
              <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                <th className="w-[34%] px-3 py-2 font-semibold">Dipendente</th>
                <th className="w-[10%] px-3 py-2 font-semibold">Codice</th>
                <th className="w-[12%] px-3 py-2 text-right font-semibold">Straordinario</th>
                <th className="w-[10%] px-3 py-2 text-right font-semibold">Viaggio</th>
                <th className="w-[24%] px-3 py-2 font-semibold">Causali</th>
                <th className="w-[10%] px-3 py-2 text-right font-semibold">Righe</th>
              </tr>
            </thead>
            <tbody>
              {conEventi.map((d, indice) => {
                const eventi = eventiPerDip.get(d.id) ?? [];
                const straordinario = eventi
                  .filter(
                    (e) =>
                      perCodice.get(e.causale)?.famiglia === 'straordinario' &&
                      e.causale !== mese.config.regole.viaggioEccedente,
                  )
                  .reduce((s, e) => s + e.ore, 0);
                const viaggio = eventi
                  .filter((e) => e.causale === mese.config.regole.viaggioEccedente)
                  .reduce((s, e) => s + e.ore, 0);
                const codici = [...new Set(eventi.map((e) => e.causale))];
                const aperto = aperti.has(d.id);

                return (
                  <React.Fragment key={d.id}>
                    <tr
                      className={`cursor-pointer border-t border-border ${indice % 2 ? 'bg-muted/20' : 'bg-card'} hover:bg-primary/5`}
                      onClick={() => apriChiudi(d.id)}
                    >
                      <td className="px-3 py-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <ChevronDown
                            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${aperto ? '' : '-rotate-90'}`}
                          />
                          <span className="truncate font-medium text-foreground">
                            {d.cognome} {d.nome}
                          </span>
                          {!d.usaKommessa ? (
                            <span
                              title="Non ha giornate registrate in Kommessa: le sue variazioni sono scritte a mano."
                              className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                            >
                              a mano
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-[12px] text-muted-foreground">
                        {d.codicePaghe ?? (
                          <span className="text-rose-600">manca</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {straordinario > 0 ? ore(straordinario) : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {viaggio > 0 ? ore(viaggio) : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {codici.slice(0, 6).map((c) => (
                            <PastigliaCausale key={c} codice={c} causale={perCodice.get(c)} />
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {eventi.length}
                      </td>
                    </tr>

                    {aperto
                      ? eventi.map((e, i) => {
                          const causale = perCodice.get(e.causale);
                          const malattia = e.causale === 'ML';
                          return (
                            <tr key={`${d.id}-${i}`} className="border-t border-border/60 bg-muted/10">
                              <td className="px-3 py-1.5 pl-8 text-[13px]" colSpan={2}>
                                <div className="flex min-w-0 items-center gap-2">
                                  <PastigliaCausale codice={e.causale} causale={causale} />
                                  <span className="truncate text-muted-foreground">
                                    {causale?.descrizione ?? e.causale}
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-1.5 text-right text-[13px] tabular-nums" colSpan={2}>
                                {e.dal === e.al
                                  ? giornoBreve(e.dal)
                                  : `${giornoBreve(e.dal)} - ${giornoBreve(e.al)}`}
                                {e.ore > 0 ? ` · ${ore(e.ore)} ore` : ''}
                              </td>
                              <td className="px-3 py-1.5 text-[13px]">
                                {malattia ? (
                                  <button
                                    type="button"
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      onCertificato(d, e);
                                    }}
                                    className={
                                      e.infoAggiuntiva
                                        ? 'inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200'
                                        : 'inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200'
                                    }
                                  >
                                    <Stethoscope className="h-3 w-3" />
                                    {e.infoAggiuntiva ? `PUC ${e.infoAggiuntiva}` : 'PUC mancante'}
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-muted-foreground">
                                    {e.origine === 'kommessa' ? 'da Kommessa' : 'scritta a mano'}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-1.5 text-right">
                                {e.id ? (
                                  <div className="flex justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0"
                                      aria-label="Modifica"
                                      onClick={(ev) => {
                                        ev.stopPropagation();
                                        onModifica(e);
                                      }}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-rose-600"
                                      aria-label="Elimina"
                                      onClick={(ev) => {
                                        ev.stopPropagation();
                                        onElimina(e);
                                      }}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })
                      : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function CalendarioVista({
  mese,
  eventiPerDip,
  perCodice,
}: {
  mese: ModelloMese;
  eventiPerDip: Map<string, EventoMese[]>;
  perCodice: Map<string, CausaleEssePaghe>;
}) {
  const giorni = giorniDelMese(mese.periodo);
  const righe = mese.dipendenti.filter((d) => eventiPerDip.has(d.id));

  return (
    <Card>
      <CardContent className="p-0">
        <div className="max-h-[calc(100vh-20rem)] overflow-auto">
          <table className="w-full table-fixed border-collapse text-sm">
            <thead className="sticky top-0 z-20 bg-muted/80 backdrop-blur">
              <tr>
                <th className="sticky left-0 z-30 w-48 bg-muted/90 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground backdrop-blur">
                  Dipendente
                </th>
                {giorni.map((g) => {
                  const settimana = new Date(`${g}T00:00:00Z`).getUTCDay();
                  const festivo = settimana === 0 || settimana === 6;
                  return (
                    <th
                      key={g}
                      className={`w-9 px-0 py-2 text-center text-[10px] font-semibold ${festivo ? 'bg-muted text-muted-foreground' : 'text-foreground'}`}
                    >
                      {Number(g.slice(8, 10))}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {righe.map((d, indice) => {
                const eventi = eventiPerDip.get(d.id) ?? [];
                return (
                  <tr
                    key={d.id}
                    className={`border-t border-border ${indice % 2 ? 'bg-muted/20' : 'bg-card'}`}
                  >
                    <td className="sticky left-0 z-10 w-48 truncate bg-inherit px-3 py-1.5 align-middle font-medium text-foreground">
                      {d.cognome} {d.nome}
                    </td>
                    {giorni.map((g) => {
                      const delGiorno = eventi.filter((e) => e.dal <= g && g <= e.al);
                      return (
                        <td key={g} className="px-0 py-1 text-center align-middle">
                          <div className="flex flex-col items-center gap-0.5">
                            {delGiorno.slice(0, 2).map((e, i) => (
                              <PastigliaCausale
                                key={i}
                                codice={e.causale}
                                causale={perCodice.get(e.causale)}
                                titolo={`${perCodice.get(e.causale)?.descrizione ?? e.causale}${e.ore > 0 ? ` · ${ore(e.ore)} ore` : ''}`}
                              />
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {righe.length === 0 ? (
          <p className="p-8 text-center text-[13px] text-muted-foreground">
            Nessuna variazione da mostrare in questo mese.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CompletaVista({
  mese,
  eventiPerDip,
  onAggiungi,
}: {
  mese: ModelloMese;
  eventiPerDip: Map<string, EventoMese[]>;
  onAggiungi: () => void;
}) {
  const fuori = mese.dipendenti.filter((d) => d.attivo && !d.usaKommessa);
  const senzaNiente = fuori.filter((d) => !eventiPerDip.has(d.id));

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              Variazioni di chi non usa ancora Kommessa
            </p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Per chi timbra, straordinari e ore di viaggio arrivano da soli. Per gli altri si
              scrivono qui, una volta sola: un periodo di ferie diventa da solo una riga per giorno
              lavorativo.
            </p>
          </div>
          <Button size="sm" onClick={onAggiungi}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Aggiungi variazione
          </Button>
        </CardContent>
      </Card>

      <Sezione icona={Users} titolo={`Senza giornate in Kommessa (${fuori.length})`}>
        {fuori.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            Tutti i dipendenti in forza hanno giornate registrate: il file si costruisce da solo.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {fuori.map((d) => {
              const quanti = eventiPerDip.get(d.id)?.length ?? 0;
              return (
                <div
                  key={d.id}
                  className={`flex min-w-0 items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 ${quanti > 0 ? 'border-emerald-200 bg-emerald-50/50' : 'border-border bg-muted/20'}`}
                >
                  <span className="truncate text-[13px] text-foreground">
                    {d.cognome} {d.nome}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {quanti > 0 ? `${quanti} righe` : 'niente'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {senzaNiente.length > 0 ? (
          <p className="mt-3 border-t border-border pt-2 text-[12px] text-muted-foreground">
            Se per qualcuno di loro il mese e' stato regolare, va bene cosi': una giornata normale
            non si comunica.
          </p>
        ) : null}
      </Sezione>
    </div>
  );
}

function FileVista({ mese }: { mese: ModelloMese }) {
  if (!mese.esito.righe.length) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-[13px] text-muted-foreground">
          {mese.config.codiceDitta
            ? 'Nessuna riga da scrivere per questo mese.'
            : "Manca il codice ditta dello Studio: impostalo qui a fianco e il file si genera."}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-foreground">DatiMese.txt</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {mese.esito.righe.length} righe a lunghezza fissa. Accanto a ogni riga c'e' cosa dice.
            </p>
          </div>
          <Badge className="shrink-0 bg-muted text-muted-foreground">ASCII</Badge>
        </div>
        <div className="max-h-[calc(100vh-22rem)] overflow-auto">
          <table className="w-full table-fixed border-collapse">
            <tbody>
              {mese.esito.righe.map((r, i) => (
                <tr
                  key={i}
                  className={`border-t border-border/60 ${r.tipo === '10' ? 'bg-primary/5' : r.tipo === '00' ? 'bg-muted/40' : ''}`}
                >
                  <td className="w-10 px-2 py-1 text-right align-top font-mono text-[11px] text-muted-foreground">
                    {i + 1}
                  </td>
                  <td className="w-[52%] px-2 py-1 align-top">
                    <code className="block overflow-x-auto whitespace-pre text-[12px] leading-relaxed text-foreground">
                      {r.testo}
                    </code>
                  </td>
                  <td className="px-3 py-1 align-top text-[12px] leading-relaxed text-muted-foreground">
                    <span className="mr-1.5 font-mono text-[10px] font-semibold text-primary">
                      {r.tipo}
                    </span>
                    {r.glossa}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

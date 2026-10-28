'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Clock, FileText, Loader2, Plus } from 'lucide-react';
import { Button, Card, CardContent, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label } from '@kommessa/ui';
import { LABEL_STATO_PERMESSO } from '@kommessa/api/permessi-tipi';
import {
  addOre,
  controllaRichiesta,
  fmtQuando,
  fmtQuantita,
  giorniFra,
  minutiFra,
  STATO_CLASSE,
  testoDurata,
  type RichiestaVista,
  type TipoOpt,
} from '@kommessa/api/permessi-richiesta';
import { useAlert, useConfirm } from '@/app/_components/confirm-provider';
import { annullaRichiesta, richiediPermesso } from '@/app/office/_actions/ferie-permessi';

const SCORCIATOIE_ORE = [2, 4, 8];

export function RichiesteMioClient({
  dipendenteId,
  oggiISO,
  tipi,
  richieste,
}: {
  dipendenteId: string;
  oggiISO: string;
  tipi: TipoOpt[];
  richieste: RichiestaVista[];
}) {
  const [aperto, setAperto] = React.useState(false);
  const inAttesa = richieste.filter((r) => r.stato === 'in_attesa' || r.stato === 'modifica_richiesta');
  const decise = richieste.filter((r) => r.stato === 'approvato' || r.stato === 'rifiutato');

  return (
    <div className="space-y-4" data-le-mie-richieste>
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <div className="text-sm">
            <p className="font-medium">
              {inAttesa.length === 0
                ? 'Nessuna richiesta in attesa di risposta.'
                : inAttesa.length === 1
                  ? 'Una richiesta in attesa di risposta.'
                  : `${inAttesa.length} richieste in attesa di risposta.`}
            </p>
            <p className="text-muted-foreground">Le richieste arrivano all’approvatore del gruppo; la risposta compare qui e sul telefono.</p>
          </div>
          <Button size="sm" onClick={() => setAperto(true)} disabled={tipi.length === 0}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Nuova richiesta
          </Button>
        </CardContent>
      </Card>

      <Sezione titolo="In attesa di risposta" vuoto="Nessuna richiesta in attesa." righe={inAttesa} />
      <Sezione titolo="Storico" vuoto="Nessuna richiesta decisa." righe={decise} />

      <DialogRichiesta aperto={aperto} onClose={() => setAperto(false)} dipendenteId={dipendenteId} oggiISO={oggiISO} tipi={tipi} />
    </div>
  );
}

function Sezione({ titolo, vuoto, righe }: { titolo: string; vuoto: string; righe: RichiestaVista[] }) {
  return (
    <Card>
      <CardContent className="p-0 sm:p-0">
        <div className="border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{titolo}</div>
        {righe.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">{vuoto}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-4 py-2 font-medium">Tipo</th>
                  <th className="px-4 py-2 font-medium">Quando</th>
                  <th className="px-4 py-2 text-right font-medium">Quantità</th>
                  <th className="px-4 py-2 font-medium">Motivo</th>
                  <th className="px-4 py-2 font-medium">Stato</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {righe.map((r) => (
                  <RigaRichiesta key={r.id} r={r} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RigaRichiesta({ r }: { r: RichiestaVista }) {
  const router = useRouter();
  const alert = useAlert();
  const askConfirm = useConfirm();
  const [pending, start] = React.useTransition();
  const Icona = r.tuttoIlGiorno ? CalendarDays : Clock;
  return (
    <tr className="border-b border-border last:border-0" data-richiesta={r.id}>
      <td className="px-4 py-2.5 font-medium">{r.tipoLabel}</td>
      <td className="px-4 py-2.5">
        <span className="inline-flex items-center gap-1.5">
          <Icona className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          {fmtQuando(r)}
        </span>
      </td>
      <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">{fmtQuantita(r)}</td>
      <td className="max-w-[18rem] px-4 py-2.5 text-muted-foreground">
        <p className="truncate" title={r.motivo ?? undefined}>
          {r.motivo ?? '—'}
        </p>
        {r.decisioneNota ? (
          <p className="mt-0.5 truncate text-xs" title={r.decisioneNota}>
            Nota dell’ufficio: {r.decisioneNota}
          </p>
        ) : null}
      </td>
      <td className="px-4 py-2.5">
        <span className={'rounded-full px-2 py-0.5 text-[11px] font-medium ' + STATO_CLASSE[r.stato]}>{LABEL_STATO_PERMESSO[r.stato] ?? r.stato}</span>
      </td>
      <td className="px-4 py-2.5 text-right">
        {r.stato === 'in_attesa' ? (
          <Button
            size="sm"
            variant="outline"
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
          >
            Annulla
          </Button>
        ) : null}
      </td>
    </tr>
  );
}

function DialogRichiesta({
  aperto,
  onClose,
  dipendenteId,
  oggiISO,
  tipi,
}: {
  aperto: boolean;
  onClose: () => void;
  dipendenteId: string;
  oggiISO: string;
  tipi: TipoOpt[];
}) {
  const router = useRouter();
  const alert = useAlert();
  const [pending, start] = React.useTransition();
  const [tipo, setTipo] = React.useState(tipi[0]?.codice ?? 'ferie');
  const tipoScelto = tipi.find((t) => t.codice === tipo);
  const [aOre, setAOre] = React.useState(tipoScelto?.unita === 'ore');
  const [dataInizio, setDataInizio] = React.useState(oggiISO);
  const [dataFine, setDataFine] = React.useState(oggiISO);
  const [oraInizio, setOraInizio] = React.useState('08:00');
  const [oraFine, setOraFine] = React.useState('12:00');
  const [motivo, setMotivo] = React.useState('');
  const [errore, setErrore] = React.useState<string | null>(null);

  // Il modulo riparte pulito a ogni apertura.
  React.useEffect(() => {
    if (!aperto) return;
    const primo = tipi[0];
    setTipo(primo?.codice ?? 'ferie');
    setAOre(primo?.unita === 'ore');
    setDataInizio(oggiISO);
    setDataFine(oggiISO);
    setOraInizio('08:00');
    setOraFine('12:00');
    setMotivo('');
    setErrore(null);
  }, [aperto, oggiISO, tipi]);

  const onTipo = (codice: string) => {
    setTipo(codice);
    setErrore(null);
    const t = tipi.find((x) => x.codice === codice);
    if (t?.unita === 'ore') {
      setAOre(true);
      if (t.oreDefault) {
        setOraInizio('08:00');
        setOraFine(addOre('08:00', t.oreDefault));
      }
    } else if (t?.unita === 'giorni') setAOre(false);
  };
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
    <Dialog open={aperto} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className="sm:max-w-lg" aria-label="Nuova richiesta">
        <DialogHeader>
          <DialogTitle>Nuova richiesta</DialogTitle>
          <DialogDescription>Ferie o permesso: il tipo, quando, e un motivo se utile all’ufficio.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rich-tipo">Tipo</Label>
            <select
              id="rich-tipo"
              value={tipo}
              onChange={(e) => onTipo(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none"
            >
              {tipi.map((t) => (
                <option key={t.codice} value={t.codice}>
                  {t.label}
                </option>
              ))}
            </select>
            {tipoScelto?.richiedeGiustificativo ? (
              <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Per questo tipo di assenza l’ufficio può richiedere un documento giustificativo.
              </p>
            ) : null}
          </div>

          {sceltaLibera ? (
            <div role="radiogroup" aria-label="Durata" className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
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
                  className={'h-9 rounded text-sm font-medium transition ' + (aOre === o.v ? 'bg-background shadow-sm' : 'text-muted-foreground')}
                >
                  {o.t}
                </button>
              ))}
            </div>
          ) : null}

          {aOre ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 [&>*]:min-w-0">
              <div className="col-span-2 space-y-1.5 sm:col-span-1">
                <Label htmlFor="rich-giorno">Giorno</Label>
                <Input id="rich-giorno" type="date" value={dataInizio} onChange={(e) => setDataInizio(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rich-dalle">Dalle</Label>
                <Input id="rich-dalle" type="time" step={300} value={oraInizio} onChange={(e) => setOraInizio(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rich-alle">Alle</Label>
                <Input id="rich-alle" type="time" step={300} value={oraFine} onChange={(e) => setOraFine(e.target.value)} />
              </div>
              <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-3">
                <span className="text-xs text-muted-foreground">Durata:</span>
                {SCORCIATOIE_ORE.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setOraFine(addOre(oraInizio, h))}
                    className={
                      'h-7 rounded-full border px-2.5 text-xs font-medium ' +
                      (minutiScelti === h * 60 ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background')
                    }
                  >
                    {h} ore
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
              <div className="space-y-1.5">
                <Label htmlFor="rich-dal">Dal</Label>
                <Input
                  id="rich-dal"
                  type="date"
                  value={dataInizio}
                  onChange={(e) => {
                    setDataInizio(e.target.value);
                    if (e.target.value > dataFine) setDataFine(e.target.value);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rich-al">Al</Label>
                <Input id="rich-al" type="date" value={dataFine} min={dataInizio} onChange={(e) => setDataFine(e.target.value)} />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="rich-motivo">Motivo (facoltativo)</Label>
            <textarea
              id="rich-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              maxLength={1000}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>

          {riepilogo ? (
            <p className="rounded-md bg-primary/5 px-3 py-2 text-sm" data-riepilogo>
              <span className="font-medium">{tipoScelto?.label ?? tipo}</span> · {riepilogo}
            </p>
          ) : null}
          {errore ? (
            <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {errore}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button size="sm" variant="outline" onClick={onClose} disabled={pending}>
            Annulla
          </Button>
          <Button size="sm" onClick={invia} disabled={pending}>
            {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Invia richiesta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

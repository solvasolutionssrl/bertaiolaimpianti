'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CalendarCheck,
  Check,
  X,
  RotateCcw,
  Loader2,
  Scale,
  Clock,
  CalendarDays,
  Plus,
  Search,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Badge,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kommessa/ui';
import { LABEL_STATO_PERMESSO } from '@kommessa/api/permessi-tipi';
import { useAlert } from '@/app/_components/confirm-provider';
import { decidiPermesso, richiediPermesso } from '@/app/office/_actions/ferie-permessi';

export interface DipOpt {
  id: string;
  nome: string;
}
export interface TipoOpt {
  codice: string;
  label: string;
  unita: 'giorni' | 'ore' | 'entrambi';
  oreDefault?: number | null;
}

type Stato = 'in_attesa' | 'approvato' | 'rifiutato' | 'modifica_richiesta';

export interface RichiestaRow {
  id: string;
  dipendenteNome: string;
  tipo: string;
  tipoLabel: string;
  dataInizio: string;
  dataFine: string;
  tuttoIlGiorno: boolean;
  oraInizio: string | null;
  oraFine: string | null;
  motivo: string | null;
  stato: Stato;
  gruppoNome: string | null;
  approverNome: string | null;
  decisoNome: string | null;
  decisoAt: string | null;
  decisioneNota: string | null;
  createdAt: string;
}

function fmtData(iso: string): string {
  const [Y, M, D] = iso.split('-').map(Number);
  return new Date(Date.UTC(Y!, M! - 1, D!)).toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Rome',
  });
}
function addOre(hhmm: string, ore: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  let tot = (h ?? 0) * 60 + (m ?? 0) + Math.round(ore * 60);
  if (tot > 23 * 60 + 59) tot = 23 * 60 + 59;
  return `${String(Math.floor(tot / 60)).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`;
}
function fmtQuando(r: RichiestaRow): string {
  if (!r.tuttoIlGiorno && r.oraInizio && r.oraFine)
    return `${fmtData(r.dataInizio)} · ${r.oraInizio}-${r.oraFine}`;
  return r.dataInizio === r.dataFine ? fmtData(r.dataInizio) : `${fmtData(r.dataInizio)} → ${fmtData(r.dataFine)}`;
}

const STATO_STYLE: Record<Stato, string> = {
  in_attesa: 'border-amber-200 bg-amber-50 text-amber-700',
  approvato: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  rifiutato: 'border-rose-200 bg-rose-50 text-rose-700',
  modifica_richiesta: 'border-sky-200 bg-sky-50 text-sky-700',
};

const FILTRI: { value: 'in_attesa' | 'tutte' | 'approvato' | 'rifiutato'; label: string }[] = [
  { value: 'in_attesa', label: 'Da approvare' },
  { value: 'approvato', label: 'Approvate' },
  { value: 'rifiutato', label: 'Rifiutate' },
  { value: 'tutte', label: 'Tutte' },
];

export function PermessiClient({
  richieste,
  dipendenti,
  tipiOpzioni,
  mioDip,
  oggiISO,
}: {
  richieste: RichiestaRow[];
  dipendenti: DipOpt[];
  tipiOpzioni: TipoOpt[];
  mioDip: string | null;
  oggiISO: string;
}) {
  const [filtro, setFiltro] = React.useState<'in_attesa' | 'tutte' | 'approvato' | 'rifiutato'>('in_attesa');
  const [decisione, setDecisione] = React.useState<{ r: RichiestaRow; esito: Stato } | null>(null);
  const [nuovaOpen, setNuovaOpen] = React.useState(false);

  const conteggi = React.useMemo(() => {
    const c = { in_attesa: 0, approvato: 0, rifiutato: 0 };
    for (const r of richieste) {
      if (r.stato === 'in_attesa' || r.stato === 'modifica_richiesta') c.in_attesa++;
      else if (r.stato === 'approvato') c.approvato++;
      else if (r.stato === 'rifiutato') c.rifiutato++;
    }
    return c;
  }, [richieste]);

  const filtrate = React.useMemo(() => {
    if (filtro === 'tutte') return richieste;
    if (filtro === 'in_attesa')
      return richieste.filter((r) => r.stato === 'in_attesa' || r.stato === 'modifica_richiesta');
    return richieste.filter((r) => r.stato === filtro);
  }, [richieste, filtro]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <CalendarCheck className="h-5 w-5 text-primary" />
            Ferie e permessi
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Richieste dei dipendenti da approvare, rifiutare o rimandare.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => setNuovaOpen(true)}>
            <Plus className="h-4 w-4" /> Nuova richiesta
          </Button>
          <Link
            href="/office/personale/tipi-permesso"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted/40"
          >
            <Scale className="h-4 w-4" /> Tipi e normativa
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {FILTRI.map((f) => {
          const n =
            f.value === 'in_attesa'
              ? conteggi.in_attesa
              : f.value === 'approvato'
                ? conteggi.approvato
                : f.value === 'rifiutato'
                  ? conteggi.rifiutato
                  : richieste.length;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setFiltro(f.value)}
              className={
                'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ' +
                (filtro === f.value ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:bg-muted/40')
              }
            >
              {f.label}
              <span className="ml-1.5 text-xs text-muted-foreground">{n}</span>
            </button>
          );
        })}
      </div>

      {filtrate.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          Nessuna richiesta {filtro === 'in_attesa' ? 'da approvare' : 'in questa vista'}.
        </p>
      ) : (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {filtrate.map((r) => (
              <RichiestaRiga key={r.id} r={r} onDecidi={(esito) => setDecisione({ r, esito })} />
            ))}
          </CardContent>
        </Card>
      )}

      {decisione ? (
        <DecisioneDialog r={decisione.r} esito={decisione.esito} onClose={() => setDecisione(null)} />
      ) : null}

      {nuovaOpen ? (
        <NuovaRichiestaDialog
          dipendenti={dipendenti}
          tipiOpzioni={tipiOpzioni}
          mioDip={mioDip}
          oggiISO={oggiISO}
          onClose={() => setNuovaOpen(false)}
        />
      ) : null}
    </div>
  );
}

function NuovaRichiestaDialog({
  dipendenti,
  tipiOpzioni,
  mioDip,
  oggiISO,
  onClose,
}: {
  dipendenti: DipOpt[];
  tipiOpzioni: TipoOpt[];
  mioDip: string | null;
  oggiISO: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const alert = useAlert();
  const [pending, start] = React.useTransition();
  const tipiDisponibili = tipiOpzioni;
  const [dipendenteId, setDipendenteId] = React.useState<string>(mioDip ?? dipendenti[0]?.id ?? '');
  const [cercaDip, setCercaDip] = React.useState('');
  const [tipo, setTipo] = React.useState(tipiDisponibili[0]?.codice ?? 'ferie');
  const [tuttoIlGiorno, setTuttoIlGiorno] = React.useState(true);
  const [dataInizio, setDataInizio] = React.useState(oggiISO);
  const [dataFine, setDataFine] = React.useState(oggiISO);
  const [oraInizio, setOraInizio] = React.useState('08:00');
  const [oraFine, setOraFine] = React.useState('12:00');
  const [motivo, setMotivo] = React.useState('');

  const dipFiltrati = React.useMemo(() => {
    const q = cercaDip.trim().toLowerCase();
    if (!q) return dipendenti;
    return dipendenti.filter((d) => d.nome.toLowerCase().includes(q));
  }, [dipendenti, cercaDip]);

  const onTipo = (codice: string) => {
    setTipo(codice);
    const t = tipiDisponibili.find((x) => x.codice === codice);
    if (t?.unita === 'ore') {
      setTuttoIlGiorno(false);
      if (t.oreDefault) {
        setOraInizio('08:00');
        setOraFine(addOre('08:00', t.oreDefault));
      }
    } else if (t?.unita === 'giorni') {
      setTuttoIlGiorno(true);
    }
  };

  const invia = () => {
    if (!dipendenteId) {
      void alert({ title: 'Manca il dipendente', body: 'Scegli per chi è la richiesta.' });
      return;
    }
    start(async () => {
      const res = await richiediPermesso({
        dipendenteId,
        tipo,
        dataInizio,
        dataFine: tuttoIlGiorno ? dataFine : dataInizio,
        tuttoIlGiorno,
        oraInizio: tuttoIlGiorno ? null : oraInizio,
        oraFine: tuttoIlGiorno ? null : oraFine,
        motivo: motivo.trim() || null,
      });
      if (!res.ok) {
        await alert({ title: 'Non creata', body: res.error });
        return;
      }
      onClose();
      router.refresh();
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuova richiesta</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Dipendente */}
          <div className="text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Per chi</span>
            <div className="relative mb-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={cercaDip}
                onChange={(e) => setCercaDip(e.target.value)}
                placeholder="Cerca dipendente…"
                className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border border-border p-1">
              {dipFiltrati.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDipendenteId(d.id)}
                  className={
                    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ' +
                    (dipendenteId === d.id ? 'bg-primary/10 font-medium' : 'hover:bg-muted/50')
                  }
                >
                  <span className="min-w-0 flex-1 truncate">{d.nome}</span>
                  {mioDip === d.id ? (
                    <span className="shrink-0 text-[10px] text-muted-foreground">tu</span>
                  ) : null}
                  {dipendenteId === d.id ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
                </button>
              ))}
            </div>
          </div>

          {/* Tipo */}
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Tipo</span>
            <select
              value={tipo}
              onChange={(e) => onTipo(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none"
            >
              {tipiDisponibili.map((t) => (
                <option key={t.codice} value={t.codice}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
            <span className="font-medium">Tutto il giorno</span>
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={tuttoIlGiorno}
              onChange={(e) => setTuttoIlGiorno(e.target.checked)}
            />
          </label>

          {tuttoIlGiorno ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Dal</span>
                <input
                  type="date"
                  value={dataInizio}
                  onChange={(e) => {
                    setDataInizio(e.target.value);
                    if (e.target.value > dataFine) setDataFine(e.target.value);
                  }}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Al</span>
                <input
                  type="date"
                  value={dataFine}
                  min={dataInizio}
                  onChange={(e) => setDataFine(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none"
                />
              </label>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Giorno</span>
                <input
                  type="date"
                  value={dataInizio}
                  onChange={(e) => setDataInizio(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Dalle</span>
                  <input
                    type="time"
                    value={oraInizio}
                    onChange={(e) => setOraInizio(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Alle</span>
                  <input
                    type="time"
                    value={oraFine}
                    onChange={(e) => setOraFine(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none"
                  />
                </label>
              </div>
            </div>
          )}

          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Motivo (facoltativo)</span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </label>

          <p className="rounded-md border border-sky-200 bg-sky-50/50 px-3 py-2 text-[11px] text-sky-700">
            La richiesta resta <b>da approvare</b>: passa dal normale flusso di approvazione anche se
            la crei tu.
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Annulla
          </Button>
          <Button type="button" onClick={invia} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Crea richiesta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RichiestaRiga({ r, onDecidi }: { r: RichiestaRow; onDecidi: (esito: Stato) => void }) {
  const attesa = r.stato === 'in_attesa' || r.stato === 'modifica_richiesta';
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate text-sm font-semibold">{r.dipendenteNome}</span>
          <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[10px] text-slate-700">
            {r.tipoLabel}
          </Badge>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {r.tuttoIlGiorno ? <CalendarDays className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
            {fmtQuando(r)}
          </span>
        </div>
        <p className="truncate text-[11px] text-muted-foreground">
          {r.gruppoNome ? r.gruppoNome : 'Senza gruppo'}
          {r.motivo ? ` · ${r.motivo}` : ''}
          {r.decisoNome ? ` · ${LABEL_STATO_PERMESSO[r.stato]} da ${r.decisoNome}` : ''}
          {r.decisioneNota ? ` · «${r.decisioneNota}»` : ''}
        </p>
      </div>
      {attesa ? (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onDecidi('approvato')}
            title="Approva"
            className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDecidi('modifica_richiesta')}
            title="Chiedi modifica"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted/40"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDecidi('rifiutato')}
            title="Rifiuta"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-rose-300 text-rose-600 hover:bg-rose-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <Badge variant="outline" className={'shrink-0 text-[10px] ' + STATO_STYLE[r.stato]}>
          {LABEL_STATO_PERMESSO[r.stato] ?? r.stato}
        </Badge>
      )}
    </div>
  );
}

function DecisioneDialog({ r, esito, onClose }: { r: RichiestaRow; esito: Stato; onClose: () => void }) {
  const router = useRouter();
  const alert = useAlert();
  const [nota, setNota] = React.useState('');
  const [pending, start] = React.useTransition();

  const titolo =
    esito === 'approvato'
      ? 'Approvare la richiesta?'
      : esito === 'rifiutato'
        ? 'Rifiutare la richiesta?'
        : 'Chiedere una modifica?';

  const conferma = () => {
    start(async () => {
      const res = await decidiPermesso({ id: r.id, esito, nota: nota.trim() || null });
      if (!res.ok) {
        await alert({ title: 'Errore', body: res.error });
        return;
      }
      onClose();
      router.refresh();
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titolo}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p className="font-medium">{r.dipendenteNome}</p>
            <p className="text-muted-foreground">
              {r.tipoLabel} · {fmtQuando(r)}
            </p>
            {r.motivo ? <p className="mt-1 text-foreground/80">{r.motivo}</p> : null}
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Nota {esito === 'approvato' ? '(facoltativa)' : '(consigliata)'}
            </span>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={2}
              placeholder={esito === 'modifica_richiesta' ? 'Cosa deve correggere il dipendente…' : 'Motivazione…'}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Annulla
          </Button>
          <Button
            type="button"
            onClick={conferma}
            disabled={pending}
            className={
              esito === 'approvato'
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : esito === 'rifiutato'
                  ? 'bg-rose-600 text-white hover:bg-rose-700'
                  : ''
            }
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : esito === 'approvato' ? (
              'Approva'
            ) : esito === 'rifiutato' ? (
              'Rifiuta'
            ) : (
              'Chiedi modifica'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

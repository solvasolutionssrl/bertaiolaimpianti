'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  GraduationCap,
  HardHat,
  Loader2,
  Plus,
  Search,
  Send,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kommessa/ui';
import {
  addGiorni,
  giorniSettimana,
  rilevaConflitti,
  LABEL_FASCIA,
  NOMI_GIORNO_BREVI,
  type Fascia,
  type VoceOccupazione,
} from '@kommessa/api/pianificazione';
import { useConfirm, useAlert } from '@/app/_components/confirm-provider';
import type { BloccoView } from '../_lib/query';
import {
  creaBlocco,
  aggiornaBlocco,
  eliminaBlocco,
  pubblicaSettimana,
  copiaSettimanaPrecedente,
} from '@/app/office/_actions/pianificazione';

export interface DipRow {
  id: string;
  nome: string;
  cognome: string;
  mansione: string | null;
  aTurni: boolean;
}
export interface CantRow {
  id: string;
  nome: string;
  codiceCommessa: string | null;
  clienteNome: string | null;
  categoria: string | null;
}
export interface MezzoRow {
  id: string;
  targa: string;
  modello: string | null;
  tipo: string;
}

const PATH = '/office/personale/pianificazione';

/** Hue deterministico da un id (per il colore-cantiere dei chip). */
function hue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

function nomeDip(d: DipRow): string {
  return `${d.cognome} ${d.nome}`.trim();
}

function fmtGiornoLungo(iso: string): string {
  const [Y, M, D] = iso.split('-').map(Number);
  return new Date(Date.UTC(Y!, M! - 1, D!)).toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Rome',
  });
}

// ── Form dialog ──────────────────────────────────────────────────────

interface FormState {
  id?: string;
  tipo: 'cantiere' | 'evento';
  data: string;
  fascia: Fascia;
  oraInizio: string;
  oraFine: string;
  cantiereId: string | null;
  titolo: string;
  luogo: string;
  dipendentiIds: string[];
  mezziIds: string[];
  note: string;
}

function formVuoto(data: string, dipId?: string): FormState {
  return {
    tipo: 'cantiere',
    data,
    fascia: 'giornata',
    oraInizio: '08:00',
    oraFine: '17:00',
    cantiereId: null,
    titolo: '',
    luogo: '',
    dipendentiIds: dipId ? [dipId] : [],
    mezziIds: [],
    note: '',
  };
}

function formDaBlocco(b: BloccoView): FormState {
  return {
    id: b.id,
    tipo: b.tipo,
    data: b.data,
    fascia: b.fascia,
    oraInizio: b.oraInizio,
    oraFine: b.oraFine,
    cantiereId: b.cantiereId,
    titolo: b.titolo ?? '',
    luogo: b.luogo ?? '',
    dipendentiIds: [...b.membri],
    mezziIds: [...b.mezzi],
    note: b.note ?? '',
  };
}

const FASCE: Fascia[] = ['giornata', 'mattina', 'pomeriggio', 'custom'];

function BloccoDialog({
  form,
  onClose,
  cantieri,
  dipendenti,
  mezzi,
  onSaved,
}: {
  form: FormState;
  onClose: () => void;
  cantieri: CantRow[];
  dipendenti: DipRow[];
  mezzi: MezzoRow[];
  onSaved: () => void;
}) {
  const alert = useAlert();
  const confirm = useConfirm();
  const [f, setF] = React.useState<FormState>(form);
  const [conflitti, setConflitti] = React.useState<string[]>([]);
  const [pending, start] = React.useTransition();
  const [cercaCant, setCercaCant] = React.useState('');
  const [cercaDip, setCercaDip] = React.useState('');
  const isEdit = !!f.id;

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setF((s) => ({ ...s, [k]: v }));

  const toggleDip = (id: string) =>
    setF((s) => ({
      ...s,
      dipendentiIds: s.dipendentiIds.includes(id)
        ? s.dipendentiIds.filter((x) => x !== id)
        : [...s.dipendentiIds, id],
    }));
  const toggleMezzo = (id: string) =>
    setF((s) => ({
      ...s,
      mezziIds: s.mezziIds.includes(id)
        ? s.mezziIds.filter((x) => x !== id)
        : [...s.mezziIds, id],
    }));

  const cantFiltrati = React.useMemo(() => {
    const q = cercaCant.trim().toLowerCase();
    if (!q) return cantieri.slice(0, 60);
    const tokens = q.split(/\s+/);
    return cantieri
      .filter((c) => {
        const blob = [c.nome, c.codiceCommessa, c.clienteNome, c.categoria]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return tokens.every((t) => blob.includes(t));
      })
      .slice(0, 60);
  }, [cantieri, cercaCant]);

  const dipFiltrati = React.useMemo(() => {
    const q = cercaDip.trim().toLowerCase();
    if (!q) return dipendenti;
    return dipendenti.filter((d) =>
      `${nomeDip(d)} ${d.mansione ?? ''}`.toLowerCase().includes(q),
    );
  }, [dipendenti, cercaDip]);

  const cantScelto = cantieri.find((c) => c.id === f.cantiereId) ?? null;

  const salva = (forza: boolean) => {
    setConflitti([]);
    start(async () => {
      const payload = {
        ...(f.id ? { id: f.id } : {}),
        tipo: f.tipo,
        data: f.data,
        fascia: f.fascia,
        oraInizio: f.fascia === 'custom' ? f.oraInizio : null,
        oraFine: f.fascia === 'custom' ? f.oraFine : null,
        cantiereId: f.tipo === 'cantiere' ? f.cantiereId : null,
        titolo: f.tipo === 'evento' ? f.titolo : null,
        luogo: f.tipo === 'evento' ? f.luogo : null,
        dipendentiIds: f.dipendentiIds,
        mezziIds: f.mezziIds,
        note: f.note,
        forza,
      };
      const res = isEdit ? await aggiornaBlocco(payload) : await creaBlocco(payload);
      if (res.ok) {
        onSaved();
        onClose();
        return;
      }
      if ('conflitti' in res) {
        setConflitti(res.conflitti);
        return;
      }
      await alert({ title: 'Non salvato', body: res.error });
    });
  };

  const onElimina = async () => {
    if (!f.id) return;
    if (
      !(await confirm({
        title: 'Eliminare questo blocco?',
        description: 'La pianificazione verrà rimossa. Operazione non annullabile.',
        destructive: true,
        confirmLabel: 'Elimina',
      }))
    )
      return;
    start(async () => {
      const res = await eliminaBlocco(f.id!);
      if (!res.ok) {
        await alert({ title: 'Errore', body: res.error });
        return;
      }
      onSaved();
      onClose();
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Modifica blocco' : 'Nuovo blocco'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tipo */}
          <div className="grid grid-cols-2 gap-2">
            {(['cantiere', 'evento'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set('tipo', t)}
                className={
                  'flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ' +
                  (f.tipo === t
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border hover:bg-muted/40')
                }
              >
                {t === 'cantiere' ? (
                  <HardHat className="h-4 w-4" />
                ) : (
                  <GraduationCap className="h-4 w-4" />
                )}
                {t === 'cantiere' ? 'Cantiere' : 'Evento / formazione'}
              </button>
            ))}
          </div>

          {/* Giorno + fascia */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-muted-foreground">Giorno</span>
              <input
                type="date"
                value={f.data}
                onChange={(e) => set('data', e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none"
              />
            </label>
            <div className="text-sm">
              <span className="mb-1 block font-medium text-muted-foreground">Fascia</span>
              <div className="flex flex-wrap gap-1.5">
                {FASCE.map((fascia) => (
                  <button
                    key={fascia}
                    type="button"
                    onClick={() => set('fascia', fascia)}
                    className={
                      'rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ' +
                      (f.fascia === fascia
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border hover:bg-muted/40')
                    }
                  >
                    {LABEL_FASCIA[fascia]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {f.fascia === 'custom' ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-muted-foreground">Dalle</span>
                <input
                  type="time"
                  value={f.oraInizio}
                  onChange={(e) => set('oraInizio', e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-muted-foreground">Alle</span>
                <input
                  type="time"
                  value={f.oraFine}
                  onChange={(e) => set('oraFine', e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none"
                />
              </label>
            </div>
          ) : null}

          {/* Target: cantiere o evento */}
          {f.tipo === 'cantiere' ? (
            <div className="text-sm">
              <span className="mb-1 block font-medium text-muted-foreground">Cantiere</span>
              {cantScelto ? (
                <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{cantScelto.nome}</span>
                    {cantScelto.clienteNome ? (
                      <span className="text-muted-foreground"> · {cantScelto.clienteNome}</span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => set('cantiereId', null)}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative mb-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={cercaCant}
                      onChange={(e) => setCercaCant(e.target.value)}
                      placeholder="Cerca cantiere, codice, cliente…"
                      className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border border-border p-1">
                    {cantFiltrati.length === 0 ? (
                      <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                        Nessun cantiere
                      </p>
                    ) : (
                      cantFiltrati.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            set('cantiereId', c.id);
                            setCercaCant('');
                          }}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted/50"
                        >
                          <span className="min-w-0 truncate">{c.nome}</span>
                          {c.clienteNome ? (
                            <span className="ml-auto shrink-0 truncate text-xs text-muted-foreground">
                              {c.clienteNome}
                            </span>
                          ) : null}
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-muted-foreground">Titolo</span>
                <input
                  value={f.titolo}
                  onChange={(e) => set('titolo', e.target.value)}
                  placeholder="es. Formazione antincendio"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-muted-foreground">Luogo</span>
                <input
                  value={f.luogo}
                  onChange={(e) => set('luogo', e.target.value)}
                  placeholder="es. Sede, aula 2"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none"
                />
              </label>
            </div>
          )}

          {/* Dipendenti */}
          <div className="text-sm">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-medium text-muted-foreground">
                Dipendenti ({f.dipendentiIds.length})
              </span>
            </div>
            <div className="relative mb-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={cercaDip}
                onChange={(e) => setCercaDip(e.target.value)}
                placeholder="Cerca persona…"
                className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-md border border-border p-1">
              {dipFiltrati.map((d) => {
                const on = f.dipendentiIds.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDip(d.id)}
                    className={
                      'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ' +
                      (on ? 'bg-primary/10' : 'hover:bg-muted/50')
                    }
                  >
                    <span
                      className={
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border ' +
                        (on ? 'border-primary bg-primary text-primary-foreground' : 'border-input')
                      }
                    >
                      {on ? '✓' : ''}
                    </span>
                    <span className="min-w-0 truncate">{nomeDip(d)}</span>
                    {d.mansione ? (
                      <span className="ml-auto shrink-0 truncate text-xs text-muted-foreground">
                        {d.mansione}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mezzi */}
          {mezzi.length > 0 ? (
            <div className="text-sm">
              <span className="mb-1 block font-medium text-muted-foreground">
                Mezzi ({f.mezziIds.length})
              </span>
              <div className="flex flex-wrap gap-1.5">
                {mezzi.map((m) => {
                  const on = f.mezziIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleMezzo(m.id)}
                      className={
                        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ' +
                        (on
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border hover:bg-muted/40')
                      }
                    >
                      <Truck className="h-3.5 w-3.5" />
                      {m.targa}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Note */}
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-muted-foreground">Note</span>
            <textarea
              value={f.note}
              onChange={(e) => set('note', e.target.value)}
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </label>

          {/* Conflitti */}
          {conflitti.length > 0 ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <p className="mb-1 font-medium">Attenzione, sovrapposizioni:</p>
              <ul className="list-disc space-y-0.5 pl-5">
                {conflitti.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <DialogFooter className="mt-2 flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {isEdit ? (
            <Button
              type="button"
              variant="outline"
              onClick={onElimina}
              disabled={pending}
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" /> Elimina
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Annulla
            </Button>
            <Button type="button" onClick={() => salva(conflitti.length > 0)} disabled={pending}>
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : conflitti.length > 0 ? (
                'Salva comunque'
              ) : (
                'Salva'
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Chip ─────────────────────────────────────────────────────────────

function Chip({
  b,
  conflitto,
  onClick,
}: {
  b: BloccoView;
  conflitto: boolean;
  onClick: () => void;
}) {
  const h = b.tipo === 'evento' ? 275 : hue(b.cantiereId ?? b.id);
  const label = b.tipo === 'cantiere' ? b.cantiereNome ?? 'Cantiere' : b.titolo ?? 'Evento';
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${label} · ${b.oraInizio}-${b.oraFine}${b.stato === 'bozza' ? ' · bozza' : ''}`}
      className={
        'flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-[11px] font-medium leading-tight transition ' +
        (conflitto ? 'ring-1 ring-destructive ' : '') +
        (b.stato === 'bozza' ? 'opacity-70 ' : '')
      }
      style={{
        backgroundColor: `hsl(${h} 70% 94%)`,
        color: `hsl(${h} 60% 28%)`,
        borderLeft: `3px solid hsl(${h} 60% 45%)`,
      }}
    >
      {b.tipo === 'evento' ? (
        <GraduationCap className="h-3 w-3 shrink-0" />
      ) : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 tabular-nums opacity-70">
        {b.fascia === 'mattina' ? 'M' : b.fascia === 'pomeriggio' ? 'P' : b.oraInizio}
      </span>
    </button>
  );
}

// ── Main ─────────────────────────────────────────────────────────────

export function PianificazioneClient({
  lunediISO,
  oggiLunediISO,
  oggiISO,
  dipendenti,
  cantieri,
  mezzi,
  blocchi,
}: {
  lunediISO: string;
  oggiLunediISO: string;
  oggiISO: string;
  dipendenti: DipRow[];
  cantieri: CantRow[];
  mezzi: MezzoRow[];
  blocchi: BloccoView[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const alert = useAlert();
  const [pending, start] = React.useTransition();
  const [dialog, setDialog] = React.useState<FormState | null>(null);
  const [cerca, setCerca] = React.useState('');
  const [soloTurni, setSoloTurni] = React.useState(false);

  const giorni = React.useMemo(() => giorniSettimana(lunediISO), [lunediISO]);

  // Indice blocchi per (dip|giorno) e set conflitti.
  const { perCella, conflittoSet } = React.useMemo(() => {
    const perCella = new Map<string, BloccoView[]>();
    const voci: VoceOccupazione[] = [];
    for (const b of blocchi) {
      for (const d of b.membri) {
        const k = `${d}|${b.data}`;
        const arr = perCella.get(k);
        if (arr) arr.push(b);
        else perCella.set(k, [b]);
        voci.push({ entita: d, data: b.data, inizio: b.oraInizio, fine: b.oraFine, refId: b.id });
      }
    }
    const conflitti = rilevaConflitti(voci);
    const conflittoSet = new Set<string>();
    for (const c of conflitti) {
      conflittoSet.add(`${c.entita}|${c.data}|${c.a}`);
      conflittoSet.add(`${c.entita}|${c.data}|${c.b}`);
    }
    return { perCella, conflittoSet };
  }, [blocchi]);

  const dipFiltrati = React.useMemo(() => {
    let out = dipendenti;
    if (soloTurni) out = out.filter((d) => d.aTurni);
    const q = cerca.trim().toLowerCase();
    if (q) out = out.filter((d) => `${nomeDip(d)} ${d.mansione ?? ''}`.toLowerCase().includes(q));
    return out;
  }, [dipendenti, soloTurni, cerca]);

  const bozze = blocchi.filter((b) => b.stato === 'bozza').length;

  const vaiA = (iso: string) => router.push(`${PATH}?lun=${iso}`);
  const refresh = () => router.refresh();

  const onPubblica = () => {
    start(async () => {
      const res = await pubblicaSettimana({ lunediISO });
      if (!res.ok) {
        await alert({ title: 'Errore', body: res.error });
        return;
      }
      await alert({
        title: 'Settimana pubblicata',
        body:
          res.pubblicati === 0
            ? 'Nessun blocco in bozza da pubblicare.'
            : `${res.pubblicati} ${res.pubblicati === 1 ? 'blocco pubblicato' : 'blocchi pubblicati'}. ${res.notificati} ${res.notificati === 1 ? 'persona avvisata' : 'persone avvisate'}.`,
      });
      refresh();
    });
  };

  const onCopia = () => {
    start(async () => {
      let res = await copiaSettimanaPrecedente({ lunediISO });
      if (!res.ok && 'conflitti' in res) {
        if (
          !(await confirm({
            title: 'La settimana ha già una pianificazione',
            description: res.conflitti.join(' '),
            confirmLabel: 'Copia comunque',
          }))
        )
          return;
        res = await copiaSettimanaPrecedente({ lunediISO, forza: true });
      }
      if (!res.ok) {
        await alert({ title: 'Errore', body: 'error' in res ? res.error : 'Copia non riuscita' });
        return;
      }
      await alert({ title: 'Copiata', body: 'Blocchi copiati dalla settimana precedente (come bozza).' });
      refresh();
    });
  };

  const rangeLabel = `${fmtGiornoLungo(giorni[0]!)} · ${fmtGiornoLungo(giorni[6]!)}`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <CalendarDays className="h-5 w-5 text-primary" />
            Pianificazione settimanale
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {rangeLabel}
            {bozze > 0 ? (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                {bozze} in bozza
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-border">
            <button
              type="button"
              onClick={() => vaiA(addGiorni(lunediISO, -7))}
              className="flex h-9 w-9 items-center justify-center rounded-l-lg hover:bg-muted/50"
              aria-label="Settimana precedente"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => vaiA(oggiLunediISO)}
              className="h-9 border-x border-border px-3 text-sm font-medium hover:bg-muted/50"
            >
              Oggi
            </button>
            <button
              type="button"
              onClick={() => vaiA(addGiorni(lunediISO, 7))}
              className="flex h-9 w-9 items-center justify-center rounded-r-lg hover:bg-muted/50"
              aria-label="Settimana successiva"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <Button type="button" variant="outline" onClick={onCopia} disabled={pending}>
            <Copy className="h-4 w-4" /> Copia precedente
          </Button>
          <Button type="button" onClick={onPubblica} disabled={pending || bozze === 0}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Pubblica
          </Button>
        </div>
      </header>

      {/* Filtri */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
            placeholder="Cerca dipendente…"
            className="h-9 w-56 rounded-md border border-input bg-background pl-8 pr-3 text-sm focus:border-primary focus:outline-none"
          />
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={soloTurni}
            onChange={(e) => setSoloTurni(e.target.checked)}
          />
          Solo a turni
        </label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => setDialog(formVuoto(giorni[0]!))}
        >
          <Plus className="h-4 w-4" /> Nuovo blocco
        </Button>
      </div>

      {/* Griglia */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-soft">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 w-48 min-w-48 border-b border-r border-border bg-muted/40 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Dipendente
              </th>
              {giorni.map((g, i) => {
                const [, , D] = g.split('-');
                const weekend = i >= 5;
                const oggi = g === oggiISO;
                return (
                  <th
                    key={g}
                    className={
                      'border-b border-border px-2 py-2 text-center text-xs font-semibold ' +
                      (weekend ? 'bg-muted/30 text-muted-foreground' : 'text-foreground') +
                      (oggi ? ' bg-primary/5' : '')
                    }
                  >
                    <div>{NOMI_GIORNO_BREVI[i]}</div>
                    <div className="text-[11px] font-normal text-muted-foreground">{D}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {dipFiltrati.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Nessun dipendente.
                </td>
              </tr>
            ) : (
              dipFiltrati.map((d) => (
                <tr key={d.id} className="group">
                  <th className="sticky left-0 z-10 w-48 min-w-48 border-b border-r border-border bg-card px-3 py-2 text-left align-top">
                    <div className="truncate text-sm font-medium">{nomeDip(d)}</div>
                    {d.mansione ? (
                      <div className="truncate text-[11px] text-muted-foreground">{d.mansione}</div>
                    ) : null}
                  </th>
                  {giorni.map((g, i) => {
                    const cella = perCella.get(`${d.id}|${g}`) ?? [];
                    const weekend = i >= 5;
                    return (
                      <td
                        key={g}
                        className={
                          'border-b border-border/70 p-1 align-top ' +
                          (weekend ? 'bg-muted/20' : '')
                        }
                      >
                        <div className="flex min-h-[3rem] flex-col gap-1">
                          {cella.map((b) => (
                            <Chip
                              key={b.id}
                              b={b}
                              conflitto={conflittoSet.has(`${d.id}|${g}|${b.id}`)}
                              onClick={() => setDialog(formDaBlocco(b))}
                            />
                          ))}
                          <button
                            type="button"
                            onClick={() => setDialog(formVuoto(g, d.id))}
                            className="flex items-center justify-center rounded border border-dashed border-transparent py-1 text-muted-foreground opacity-0 transition hover:border-border hover:bg-muted/40 group-hover:opacity-100"
                            aria-label="Aggiungi"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {dialog ? (
        <BloccoDialog
          form={dialog}
          onClose={() => setDialog(null)}
          cantieri={cantieri}
          dipendenti={dipendenti}
          mezzi={mezzi}
          onSaved={refresh}
        />
      ) : null}
    </div>
  );
}

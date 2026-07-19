'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarClock,
  CalendarDays,
  CalendarOff,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  GraduationCap,
  HardHat,
  Loader2,
  MapPin,
  MoreHorizontal,
  Plus,
  Save,
  Search,
  Send,
  StickyNote,
  Trash2,
  Truck,
  Umbrella,
  User,
  Users,
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
import { AddressAutocomplete } from '@/app/_components/address-autocomplete';
import type { BloccoView, TipoBlocco, AssenzaView } from '../_lib/query';
import {
  creaBlocco,
  creaBlocchiRicorrenti,
  aggiornaBlocco,
  eliminaBlocco,
  pubblicaSettimana,
  copiaSettimanaPrecedente,
  spostaBlocco,
  ripetiBlocco,
} from '@/app/office/_actions/pianificazione';
import { ExportMenu } from './export-menu';
import { GruppoFilter } from './gruppo-filter';
import { useGridDrag, type GridDrag } from './use-grid-drag';
import { TIP } from '../_lib/tooltips';

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

/** Gruppo lavoro (reparto) per il filtro dipendenti. */
export interface GruppoLite {
  id: string;
  nome: string;
  colore: string | null;
}

/** Hue deterministico da un id (colore-cantiere dei chip). */
function hue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}
/** Hue per tipo: cantiere = per-id; evento = teal; formazione = viola. */
function hueTipo(b: { tipo: TipoBlocco; cantiereId: string | null; id: string }): number {
  if (b.tipo === 'evento') return 168;
  if (b.tipo === 'formazione') return 275;
  return hue(b.cantiereId ?? b.id);
}

function nomeDip(d: DipRow): string {
  return `${d.cognome} ${d.nome}`.trim();
}
/** Etichetta di un blocco per l'anteprima/chip (nome cantiere o titolo). */
function labelBlocco(b: BloccoView): string {
  return b.tipo === 'cantiere' ? b.cantiereNome ?? 'Cantiere' : b.titolo ?? 'Evento';
}
function tipoMezzoLabel(t: string): string {
  return t === 'autocarro' ? 'Autocarro' : t === 'autovettura' ? 'Autovettura' : 'Mezzo';
}
function nomeMezzo(m: MezzoRow): string {
  return m.modello?.trim() || tipoMezzoLabel(m.tipo);
}

function fmtGiornoLungo(iso: string): string {
  const [Y, M, D] = iso.split('-').map(Number);
  return new Date(Date.UTC(Y!, M! - 1, D!)).toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Rome',
  });
}

/** "Gio 24/07" — etichetta breve di un giorno (per riepiloghi/ripetizione). */
function giornoBreveIT(iso: string): string {
  const [Y, M, D] = iso.split('-').map(Number);
  const dow = new Date(Date.UTC(Y!, M! - 1, D!)).getUTCDay(); // 0=dom..6=sab
  return `${NOMI_GIORNO_BREVI[(dow + 6) % 7]} ${String(D).padStart(2, '0')}/${String(M).padStart(2, '0')}`;
}

const TIPO_META: Record<
  TipoBlocco,
  { label: string; icon: typeof HardHat; sel: string }
> = {
  cantiere: {
    label: 'Cantiere',
    icon: HardHat,
    sel: 'border-sky-600 bg-sky-600 text-white shadow-sm',
  },
  evento: {
    label: 'Evento',
    icon: CalendarClock,
    sel: 'border-teal-600 bg-teal-600 text-white shadow-sm',
  },
  formazione: {
    label: 'Formazione',
    icon: GraduationCap,
    sel: 'border-violet-600 bg-violet-600 text-white shadow-sm',
  },
};

/** Accenti della colonna dipendenti, coordinati (leggeri) al tipo scelto. */
const TIPO_ACCENT: Record<TipoBlocco, { badge: string; chk: string; rowOn: string }> = {
  cantiere: { badge: 'bg-sky-100 text-sky-700', chk: 'border-sky-500 bg-sky-500', rowOn: 'bg-sky-50' },
  evento: { badge: 'bg-teal-100 text-teal-700', chk: 'border-teal-500 bg-teal-500', rowOn: 'bg-teal-50' },
  formazione: {
    badge: 'bg-violet-100 text-violet-700',
    chk: 'border-violet-500 bg-violet-500',
    rowOn: 'bg-violet-50',
  },
};

// ── Pannello di sezione (struttura + tinta leggera) ──────────────────

const TINTE = {
  comune: 'border-slate-200 bg-slate-50',
  cantiere: 'border-sky-200 bg-sky-50/50',
  evento: 'border-teal-200 bg-teal-50/50',
  note: 'border-slate-200 bg-slate-50/70',
  mezzi: 'border-amber-200 bg-amber-50/40',
  dipendenti: 'border-emerald-200 bg-emerald-50/40',
} as const;

function Sezione({
  icon: Icon,
  title,
  tinta,
  right,
  children,
}: {
  icon: typeof HardHat;
  title: string;
  tinta: keyof typeof TINTE;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={'min-w-0 rounded-lg border p-3 shadow-sm ' + TINTE[tinta]}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {title}
        </span>
        {right}
      </div>
      {children}
    </div>
  );
}

// ── Form dialog ──────────────────────────────────────────────────────

interface FormState {
  id?: string;
  tipo: TipoBlocco;
  data: string;
  fascia: Fascia;
  oraInizio: string;
  oraFine: string;
  cantiereId: string | null;
  titolo: string;
  luogo: string;
  luogoLat: number | null;
  luogoLng: number | null;
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
    luogoLat: null,
    luogoLng: null,
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
    luogoLat: b.luogoLat,
    luogoLng: b.luogoLng,
    dipendentiIds: [...b.membri],
    mezziIds: [...b.mezzi],
    note: b.note ?? '',
  };
}

const FASCE: Fascia[] = ['giornata', 'mattina', 'pomeriggio', 'custom'];
const TIPI: TipoBlocco[] = ['cantiere', 'evento', 'formazione'];

function BloccoDialog({
  form,
  onClose,
  cantieri,
  dipendenti,
  mezzi,
  gruppi,
  dipGruppo,
  giorni,
  onSaved,
}: {
  form: FormState;
  onClose: () => void;
  cantieri: CantRow[];
  dipendenti: DipRow[];
  mezzi: MezzoRow[];
  gruppi: GruppoLite[];
  dipGruppo: Record<string, string>;
  giorni: string[];
  onSaved: () => void;
}) {
  const alert = useAlert();
  const confirm = useConfirm();
  const [f, setF] = React.useState<FormState>(form);
  const [conflitti, setConflitti] = React.useState<string[]>([]);
  const [pending, start] = React.useTransition();
  const [cercaCant, setCercaCant] = React.useState('');
  const [cercaDip, setCercaDip] = React.useState('');
  const [cercaMezzo, setCercaMezzo] = React.useState('');
  const [gruppoDip, setGruppoDip] = React.useState('tutti'); // filtro gruppi: predisposto, non ancora attivo
  // "Ripeti su più giorni" (solo in creazione): giorni EXTRA oltre a f.data.
  const [ripeti, setRipeti] = React.useState<Set<string>>(() => new Set());
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

  // Cantiere: nessuna lista di default. Solo quando si digita compaiono i
  // primi 5 risultati coerenti (in un dropdown che si sovrappone al resto).
  const cantMatches = React.useMemo(() => {
    const q = cercaCant.trim().toLowerCase();
    if (!q) return [];
    const tokens = q.split(/\s+/);
    return cantieri
      .filter((c) => {
        const blob = [c.nome, c.codiceCommessa, c.clienteNome, c.categoria]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return tokens.every((t) => blob.includes(t));
      })
      .slice(0, 5);
  }, [cantieri, cercaCant]);

  const dipFiltrati = React.useMemo(() => {
    let out = dipendenti;
    if (gruppoDip !== 'tutti') out = out.filter((d) => dipGruppo[d.id] === gruppoDip);
    const q = cercaDip.trim().toLowerCase();
    if (q) out = out.filter((d) => `${nomeDip(d)} ${d.mansione ?? ''}`.toLowerCase().includes(q));
    return out;
  }, [dipendenti, cercaDip, gruppoDip, dipGruppo]);

  const mezziFiltrati = React.useMemo(() => {
    const q = cercaMezzo.trim().toLowerCase();
    if (!q) return mezzi;
    return mezzi.filter((m) =>
      `${m.targa} ${m.modello ?? ''} ${m.tipo}`.toLowerCase().includes(q),
    );
  }, [mezzi, cercaMezzo]);

  const cantScelto = cantieri.find((c) => c.id === f.cantiereId) ?? null;
  const isCantiere = f.tipo === 'cantiere';
  const accent = TIPO_ACCENT[f.tipo];

  // Giorno + fascia (+ orari custom): vivono DENTRO la card del "cosa"
  // (cantiere/evento/formazione), sotto i campi, senza divisore.
  const quandoFields = (
    <>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Giorno</span>
          <input
            type="date"
            value={f.data}
            onChange={(e) => {
              const v = e.target.value;
              set('data', v);
              // Se il nuovo giorno principale era tra gli "extra", toglilo (è l'ancora).
              setRipeti((prev) => {
                if (!prev.has(v)) return prev;
                const n = new Set(prev);
                n.delete(v);
                return n;
              });
            }}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none"
          />
        </label>
        <div className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Fascia</span>
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
        <div className="mt-2 grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Dalle</span>
            <input
              type="time"
              value={f.oraInizio}
              onChange={(e) => set('oraInizio', e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Alle</span>
            <input
              type="time"
              value={f.oraFine}
              onChange={(e) => set('oraFine', e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none"
            />
          </label>
        </div>
      ) : null}
    </>
  );

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
        cantiereId: isCantiere ? f.cantiereId : null,
        titolo: isCantiere ? null : f.titolo,
        luogo: isCantiere ? null : f.luogo,
        luogoLat: isCantiere ? null : f.luogoLat,
        luogoLng: isCantiere ? null : f.luogoLng,
        dipendentiIds: f.dipendentiIds,
        mezziIds: f.mezziIds,
        note: f.note,
        forza,
      };

      // Ripeti su più giorni (solo in creazione): clona il blocco sui giorni scelti.
      if (!isEdit && ripeti.size > 0) {
        const date = Array.from(new Set([f.data, ...ripeti])).sort();
        const res = await creaBlocchiRicorrenti({ ...payload, date });
        if (res.ok) {
          onSaved();
          onClose();
          if (res.saltati.length > 0) {
            await alert({
              title: 'Ripetizione completata',
              body:
                `Blocco creato su ${res.creati} ${res.creati === 1 ? 'giorno' : 'giorni'}. ` +
                `Saltati: ${res.saltati
                  .map((s) => `${giornoBreveIT(s.data)} (${s.motivo})`)
                  .join('; ')}.`,
            });
          }
          return;
        }
        if ('conflitti' in res) {
          setConflitti(res.conflitti);
          return;
        }
        await alert({ title: 'Non salvato', body: res.error });
        return;
      }

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
    const membriNomi = f.dipendentiIds
      .map((id) => dipendenti.find((d) => d.id === id))
      .filter((d): d is DipRow => !!d)
      .map((d) => nomeDip(d))
      .join(', ');
    const isSquad = f.dipendentiIds.length > 1;
    if (
      !(await confirm({
        title: 'Eliminare questo blocco?',
        description:
          (isSquad
            ? `Riguarda l'intera squadra: ${membriNomi}. `
            : membriNomi
              ? `Riguarda ${membriNomi}. `
              : '') + 'La pianificazione verrà rimossa. Operazione non annullabile.',
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
      <DialogContent className="max-h-[92vh] w-full max-w-[calc(100vw-1rem)] overflow-y-auto overflow-x-hidden sm:max-w-[1160px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Modifica blocco' : 'Nuovo blocco'}</DialogTitle>
        </DialogHeader>

        <div className="min-w-0 space-y-3">
          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3 lg:items-stretch lg:gap-6">
            {/* SINISTRA (2/3): tipo + quando + target + mezzi + note */}
            <div className="min-w-0 space-y-3 lg:col-span-2">
              {/* Tipo: scelta tra cantiere / evento / formazione */}
              <div>
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Scegli il tipo di blocco
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {TIPI.map((t) => {
                    const meta = TIPO_META[t];
                    const Icon = meta.icon;
                    const on = f.tipo === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => set('tipo', t)}
                        className={
                          'flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ' +
                          (on ? meta.sel : 'border-border bg-white text-foreground hover:bg-muted/40')
                        }
                      >
                        <Icon className="h-4 w-4" />
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Cantiere o Evento/Formazione (il "cosa" — sopra il "quando":
                  il titolo/target conta più della data). */}
              {isCantiere ? (
                <Sezione icon={HardHat} title="Cantiere" tinta="cantiere">
                  {cantScelto ? (
                    <div className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-sky-300 bg-white px-3 py-2">
                      <span className="min-w-0 truncate text-sm">
                        <span className="font-medium">{cantScelto.nome}</span>
                        {cantScelto.clienteNome ? (
                          <span className="text-muted-foreground"> · {cantScelto.clienteNome}</span>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          set('cantiereId', null);
                          setCercaCant('');
                        }}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    // Nessuna lista di default: solo il campo. Digitando compare un
                    // dropdown (max 5) che si SOVRAPPONE al resto (absolute), senza
                    // alzare l'altezza del dialog.
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <input
                        value={cercaCant}
                        onChange={(e) => setCercaCant(e.target.value)}
                        placeholder="Cerca cantiere"
                        className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus:border-primary focus:outline-none"
                      />
                      {cercaCant.trim() ? (
                        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-border bg-white shadow-lg">
                          {cantMatches.length === 0 ? (
                            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                              Nessun cantiere
                            </p>
                          ) : (
                            cantMatches.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  set('cantiereId', c.id);
                                  setCercaCant('');
                                }}
                                className="flex w-full min-w-0 items-center gap-2 px-2.5 py-2 text-left text-sm hover:bg-muted/60"
                              >
                                <span className="min-w-0 flex-1 truncate">{c.nome}</span>
                                {c.clienteNome ? (
                                  <span className="min-w-0 shrink truncate text-right text-xs text-muted-foreground">
                                    {c.clienteNome}
                                  </span>
                                ) : null}
                              </button>
                            ))
                          )}
                        </div>
                      ) : null}
                    </div>
                  )}
                  {quandoFields}
                </Sezione>
              ) : (
                <Sezione
                  icon={f.tipo === 'formazione' ? GraduationCap : CalendarClock}
                  title={f.tipo === 'formazione' ? 'Formazione' : 'Evento'}
                  tinta="evento"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block min-w-0 text-sm">
                      <span className="mb-1 block text-xs font-semibold text-foreground">
                        Titolo
                      </span>
                      <input
                        value={f.titolo}
                        onChange={(e) => set('titolo', e.target.value)}
                        placeholder={
                          f.tipo === 'formazione' ? 'es. Formazione antincendio' : 'es. Riunione cantieri'
                        }
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-semibold focus:border-primary focus:outline-none"
                      />
                    </label>
                    <div className="block min-w-0 text-sm">
                      <span className="mb-1 flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> Luogo
                        </span>
                        {f.luogoLat != null && f.luogoLng != null ? (
                          <span className="flex items-center gap-1 font-medium text-emerald-600">
                            <CheckCircle2 className="h-3 w-3" /> Collegato a Maps
                          </span>
                        ) : null}
                      </span>
                      <AddressAutocomplete
                        value={f.luogo}
                        onChange={(label) => set('luogo', label)}
                        onSelect={(r) =>
                          setF((s) => ({ ...s, luogo: r.label, luogoLat: r.lat, luogoLng: r.lng }))
                        }
                        placeholder="Cerca indirizzo…"
                        className="h-9 bg-background pr-8 shadow-none"
                        linked={f.luogoLat != null && f.luogoLng != null}
                      />
                    </div>
                  </div>
                  {quandoFields}
                </Sezione>
              )}

              {/* Ripeti su più giorni (solo in creazione): clona il blocco intero
                  sui giorni scelti della settimana. Il giorno principale (f.data)
                  è sempre incluso; chi è in ferie quel giorno viene saltato. */}
              {!isEdit ? (
                <Sezione
                  icon={CalendarDays}
                  title="Ripeti su più giorni"
                  tinta="comune"
                  right={
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {1 + ripeti.size} {1 + ripeti.size === 1 ? 'giorno' : 'giorni'}
                    </span>
                  }
                >
                  <div className="flex flex-wrap gap-1.5">
                    {giorni.map((g, i) => {
                      const anchor = g === f.data;
                      const on = anchor || ripeti.has(g);
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => {
                            if (anchor) return;
                            setRipeti((prev) => {
                              const n = new Set(prev);
                              if (n.has(g)) n.delete(g);
                              else n.add(g);
                              return n;
                            });
                          }}
                          title={anchor ? 'Giorno principale del blocco' : undefined}
                          className={
                            'flex min-w-[2.75rem] flex-col items-center rounded-md border px-2 py-1 text-xs font-medium transition-colors ' +
                            (anchor
                              ? 'cursor-default border-primary bg-primary text-white'
                              : on
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border bg-white text-muted-foreground hover:bg-muted/40')
                          }
                        >
                          <span>{NOMI_GIORNO_BREVI[i]}</span>
                          <span className="text-[10px] tabular-nums opacity-80">{g.slice(8)}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Crea lo stesso blocco (squadra, mezzi, orario) su ogni giorno scelto. Chi è in
                    ferie quel giorno viene saltato.
                  </p>
                </Sezione>
              ) : null}

              {/* Mezzi: ricerca + card compatte */}
              <Sezione
                icon={Truck}
                title="Mezzi"
                tinta="mezzi"
                right={
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {f.mezziIds.length} selezionati
                  </span>
                }
              >
                {mezzi.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nessun mezzo disponibile.</p>
                ) : (
                  <>
                    <div className="relative mb-1.5">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <input
                        value={cercaMezzo}
                        onChange={(e) => setCercaMezzo(e.target.value)}
                        placeholder="Filtra mezzi…"
                        className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus:border-primary focus:outline-none"
                      />
                    </div>
                    <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
                      {mezziFiltrati.map((m) => {
                        const on = f.mezziIds.includes(m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => toggleMezzo(m.id)}
                            className={
                              'inline-flex items-center gap-1 rounded border px-1.5 py-1 text-xs leading-none transition-colors ' +
                              (on
                                ? 'border-amber-400 bg-amber-100/70 text-amber-800'
                                : 'border-border bg-white hover:bg-muted/40')
                            }
                          >
                            <Truck className="h-3 w-3 shrink-0" />
                            <span className="font-medium">{nomeMezzo(m)}</span>
                            <span className="text-[10px] tabular-nums text-muted-foreground">
                              {m.targa}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </Sezione>

              {/* Note */}
              <Sezione icon={StickyNote} title="Note" tinta="note">
                <textarea
                  value={f.note}
                  onChange={(e) => set('note', e.target.value)}
                  rows={2}
                  placeholder="Indicazioni per la squadra…"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </Sezione>
            </div>

            {/* DESTRA: dipendenti. Titolo = label fissa (come "Scegli il tipo"),
                separata da una riga verticale grigia, accenti coordinati al tipo
                scelto, lista alta fino in fondo a Note (scroll interno). */}
            <div className="flex min-w-0 flex-col lg:border-l lg:border-slate-200 lg:pl-6">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  Dipendenti
                </span>
                <span className={'rounded-full px-2 py-0.5 text-[11px] font-semibold ' + accent.badge}>
                  {f.dipendentiIds.length}
                </span>
              </div>
              <div className="mb-1.5 flex items-center gap-1.5">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={cercaDip}
                    onChange={(e) => setCercaDip(e.target.value)}
                    placeholder="Filtra persone…"
                    className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                {gruppi.length > 0 ? (
                  <select
                    value={gruppoDip}
                    onChange={(e) => setGruppoDip(e.target.value)}
                    title="Filtra per gruppo lavoro"
                    className="h-9 max-w-[8rem] shrink-0 rounded-md border border-input bg-background px-1.5 text-xs text-muted-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="tutti">Tutti i gruppi</option>
                    {gruppi.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.nome}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
              <div className="relative min-h-[16rem] flex-1">
                <div className="absolute inset-0 space-y-0.5 overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-sm">
                  {dipFiltrati.map((d) => {
                    const on = f.dipendentiIds.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => toggleDip(d.id)}
                        className={
                          'flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left text-sm ' +
                          (on ? accent.rowOn : 'hover:bg-muted/50')
                        }
                      >
                        <span
                          className={
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ' +
                            (on ? accent.chk + ' text-white' : 'border-input')
                          }
                        >
                          {on ? '✓' : ''}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{nomeDip(d)}</span>
                        {d.mansione ? (
                          <span className="min-w-0 shrink truncate text-right text-[11px] text-muted-foreground">
                            {d.mansione}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

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

        <DialogFooter className="mt-1 flex-col-reverse gap-2 sm:flex-row sm:justify-between">
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
  onOpen,
  drag,
}: {
  b: BloccoView;
  conflitto: boolean;
  onOpen: () => void;
  drag?: GridDrag;
}) {
  const h = hueTipo(b);
  const label = b.tipo === 'cantiere' ? b.cantiereNome ?? 'Cantiere' : b.titolo ?? 'Evento';
  const Icon = b.tipo === 'formazione' ? GraduationCap : b.tipo === 'evento' ? CalendarClock : null;
  const isSquad = b.membri.length > 1;
  const dragBlocco = { id: b.id, data: b.data, membri: b.membri, hue: h };
  return (
    <div className="group/chip relative">
      <button
        type="button"
        onPointerDown={drag ? (e) => drag.chipPointerDown(e, dragBlocco, label) : undefined}
        onClick={() => {
          if (drag?.suppressNextClick()) return;
          onOpen();
        }}
        title={`${label} · ${b.oraInizio}-${b.oraFine}${b.stato === 'bozza' ? ' · bozza' : ''} · ${
          isSquad ? TIP.squadra(b.membri.length) : TIP.singolo
        }${drag ? ` · ${TIP.chipAzioni}` : ''}`}
        className={
          'flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-[11px] font-medium leading-tight transition ' +
          (conflitto ? 'ring-1 ring-destructive ' : '') +
          (b.stato === 'bozza' ? 'opacity-70 ' : '')
        }
        style={{
          backgroundColor: `hsl(${h} 70% 94%)`,
          color: `hsl(${h} 60% 28%)`,
          // squadra = accento sinistro più marcato (card leggermente diversa)
          borderLeft: `${isSquad ? 4 : 3}px solid hsl(${h} 60% 45%)`,
        }}
      >
        {Icon ? <Icon className="h-3 w-3 shrink-0" /> : null}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {/* Riconoscimento immediato: squadra = pill piena colorata 👥N;
            tecnico singolo = icona persona tenue. */}
        {isSquad ? (
          <span
            className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none text-white shadow-sm"
            style={{ backgroundColor: `hsl(${h} 55% 42%)` }}
            title={TIP.squadra(b.membri.length)}
          >
            <Users className="h-2.5 w-2.5" />
            {b.membri.length}
          </span>
        ) : (
          <User className="h-2.5 w-2.5 shrink-0 opacity-50" aria-label={TIP.singolo} />
        )}
        <span className="shrink-0 tabular-nums opacity-70">
          {b.fascia === 'mattina' ? 'M' : b.fascia === 'pomeriggio' ? 'P' : b.oraInizio}
        </span>
      </button>
      {drag ? (
        <span
          role="separator"
          aria-label="Estendi il blocco sui giorni successivi"
          title={isSquad ? TIP.resizeSquadra : TIP.resizeSingolo}
          onPointerDown={(e) => drag.resizePointerDown(e, dragBlocco, label)}
          className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r opacity-0 transition group-hover/chip:opacity-100"
          style={{ backgroundColor: `hsl(${h} 60% 45%)`, touchAction: 'none' }}
        />
      ) : null}
    </div>
  );
}

/** Menu "⋯" per le azioni meno frequenti (Copia precedente, Salva bozza). */
function MoreMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        title={TIP.altreAzioni}
        aria-label={TIP.altreAzioni}
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>
      {open ? (
        <div
          className="absolute right-0 z-40 mt-1 w-60 overflow-hidden rounded-lg border border-border bg-white py-1 shadow-lg"
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      ) : null}
    </div>
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
  assenze,
  gruppi,
  dipGruppo,
  tenantNome,
  logoUrl,
  brandColor,
}: {
  lunediISO: string;
  oggiLunediISO: string;
  oggiISO: string;
  dipendenti: DipRow[];
  cantieri: CantRow[];
  mezzi: MezzoRow[];
  blocchi: BloccoView[];
  assenze: AssenzaView[];
  gruppi: GruppoLite[];
  dipGruppo: Record<string, string>;
  tenantNome: string;
  logoUrl: string | null;
  brandColor: string | null;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const alert = useAlert();
  const [pending, start] = React.useTransition();
  const [dialog, setDialog] = React.useState<FormState | null>(null);
  const [cerca, setCerca] = React.useState('');
  const [soloTurni, setSoloTurni] = React.useState(false);
  const [gruppoSel, setGruppoSel] = React.useState<string[]>([]); // filtro gruppi (vuoto = tutti)
  const [vista, setVista] = React.useState<'piano' | 'ferie'>('piano');

  const giorni = React.useMemo(() => giorniSettimana(lunediISO), [lunediISO]);

  const { perCella, conflittoSet, assenzePerCella } = React.useMemo(() => {
    const perCella = new Map<string, BloccoView[]>();
    const assenzePerCella = new Map<string, AssenzaView[]>();
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
    // Le assenze approvate occupano la cella → i blocchi sovrapposti diventano
    // in conflitto (rosso).
    for (const a of assenze) {
      const k = `${a.dipendenteId}|${a.data}`;
      const arr = assenzePerCella.get(k);
      if (arr) arr.push(a);
      else assenzePerCella.set(k, [a]);
      voci.push({
        entita: a.dipendenteId,
        data: a.data,
        inizio: a.tuttoIlGiorno ? '00:00' : a.oraInizio ?? '00:00',
        fine: a.tuttoIlGiorno ? '23:59' : a.oraFine ?? '23:59',
        refId: `assenza:${a.dipendenteId}:${a.data}`,
      });
    }
    const conflitti = rilevaConflitti(voci);
    const conflittoSet = new Set<string>();
    for (const c of conflitti) {
      conflittoSet.add(`${c.entita}|${c.data}|${c.a}`);
      conflittoSet.add(`${c.entita}|${c.data}|${c.b}`);
    }
    return { perCella, conflittoSet, assenzePerCella };
  }, [blocchi, assenze]);

  const dipFiltrati = React.useMemo(() => {
    let out = dipendenti;
    if (soloTurni) out = out.filter((d) => d.aTurni);
    if (gruppoSel.length > 0) out = out.filter((d) => gruppoSel.includes(dipGruppo[d.id] ?? ''));
    const q = cerca.trim().toLowerCase();
    if (q) out = out.filter((d) => `${nomeDip(d)} ${d.mansione ?? ''}`.toLowerCase().includes(q));
    return out;
  }, [dipendenti, soloTurni, cerca, gruppoSel, dipGruppo]);

  const bozze = blocchi.filter((b) => b.stato === 'bozza').length;

  // "Salvato" (rassicurazione): tutto si auto-salva; questa pill/tasto conferma.
  // salvatoAt è null a inizio render (no new Date() in SSR → niente mismatch).
  const [salvatoAt, setSalvatoAt] = React.useState<string | null>(null);
  const [flash, setFlash] = React.useState(false);
  const segnaSalvato = React.useCallback(() => {
    setSalvatoAt(
      new Date().toLocaleTimeString('it-IT', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Rome',
      }),
    );
    setFlash(true);
    window.setTimeout(() => setFlash(false), 1500);
  }, []);

  const vaiA = (iso: string) => router.push(`${PATH}?lun=${iso}`);
  const refresh = () => {
    segnaSalvato();
    router.refresh();
  };

  // Vista "Solo ferie": righe = solo chi ha almeno un'assenza nella settimana.
  const righeGriglia = React.useMemo(() => {
    if (vista !== 'ferie') return dipFiltrati;
    return dipFiltrati.filter((d) =>
      giorni.some((g) => (assenzePerCella.get(`${d.id}|${g}`) ?? []).length > 0),
    );
  }, [vista, dipFiltrati, giorni, assenzePerCella]);

  const dipById = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const d of dipendenti) m.set(d.id, nomeDip(d));
    return m;
  }, [dipendenti]);

  const nomiBlocco = React.useCallback(
    (b: BloccoView) => b.membri.map((m) => dipById.get(m) ?? '—').join(', '),
    [dipById],
  );

  // Stato di salvataggio del drag (anteprima + pill "Salvataggio…/Salvato").
  const [salvataggio, setSalvataggio] = React.useState<null | 'saving' | 'done'>(null);
  const [savingCells, setSavingCells] = React.useState<Set<string>>(() => new Set());
  const [savingGhost, setSavingGhost] = React.useState<{ hue: number; label: string } | null>(null);

  const avviaSalvataggio = (b: BloccoView, date: string[]) => {
    const cells = new Set<string>();
    for (const m of b.membri) for (const dd of date) cells.add(`${m}|${dd}`);
    setSavingCells(cells);
    setSavingGhost({ hue: hueTipo(b), label: labelBlocco(b) });
    setSalvataggio('saving');
  };
  const fineSalvataggio = (esito: 'done' | 'error') => {
    setSalvataggio(esito === 'done' ? 'done' : null);
    // tieni l'anteprima ancora un attimo così il refresh porta il chip vero senza buco
    window.setTimeout(() => {
      setSavingCells(new Set());
      setSavingGhost(null);
    }, 700);
    if (esito === 'done') window.setTimeout(() => setSalvataggio(null), 1600);
  };

  // Drag della griglia: allargare o spostare agisce SEMPRE sull'intero blocco.
  // Se è una squadra → conferma/riepilogo con i nomi; se è un tecnico singolo → fluido.
  const gridDrag = useGridDrag({
    giorni,
    onMove: async (id, nuovaData) => {
      const b = blocchi.find((x) => x.id === id);
      if (b && b.membri.length > 1) {
        const ok = await confirm({
          title: "Spostare l'intera squadra?",
          description: `A ${giornoBreveIT(nuovaData)} verranno riprogrammate tutte le persone del blocco: ${nomiBlocco(b)}.`,
          confirmLabel: 'Sposta la squadra',
        });
        if (!ok) return;
      }
      if (b) avviaSalvataggio(b, [nuovaData]);
      const res = await spostaBlocco({ id, nuovaData });
      if (!res.ok) {
        fineSalvataggio('error');
        await alert({ title: 'Spostamento non riuscito', body: res.error });
        return;
      }
      fineSalvataggio('done');
      refresh();
    },
    onResize: async (id, date) => {
      const b = blocchi.find((x) => x.id === id);
      if (b) avviaSalvataggio(b, date);
      const res = await ripetiBlocco({ id, date });
      if (!res.ok) {
        fineSalvataggio('error');
        await alert({ title: 'Estensione non riuscita', body: res.error });
        return;
      }
      fineSalvataggio('done');
      refresh();
      const isSquad = (b?.membri.length ?? 1) > 1;
      const salt = res.saltati;
      const saltStr = salt.map((s) => `${giornoBreveIT(s.data)} (${s.motivo})`).join('; ');
      const giorniLbl = `${res.creati} ${res.creati === 1 ? 'giorno' : 'giorni'}`;
      if (res.creati === 0) {
        if (salt.length > 0) await alert({ title: 'Nessun giorno aggiunto', body: `Saltati: ${saltStr}.` });
        return;
      }
      if (isSquad && b) {
        await alert({
          title: 'Estensione effettuata',
          body:
            `Modifica effettuata per l'intera squadra (${nomiBlocco(b)}) su ${giorniLbl}.` +
            (salt.length ? ` Saltati: ${saltStr}.` : ''),
        });
      } else if (salt.length > 0) {
        await alert({ title: 'Estensione effettuata', body: `Aggiunto su ${giorniLbl}. Saltati: ${saltStr}.` });
      }
      // tecnico singolo, tutto ok → basta la pill "Salvato"
    },
  });

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
            {salvatoAt ? (
              <span
                className={
                  'ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors ' +
                  (flash ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')
                }
              >
                <CheckCircle2 className="h-3 w-3" /> Salvato · {salvatoAt}
              </span>
            ) : (
              <span className="ml-2 text-xs text-muted-foreground/70">Salvataggio automatico</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Navigazione settimana */}
          <div className="flex items-center rounded-lg border border-border">
            <button
              type="button"
              onClick={() => vaiA(addGiorni(lunediISO, -7))}
              className="flex h-9 w-9 items-center justify-center rounded-l-lg hover:bg-muted/50"
              title={TIP.settimanaPrec}
              aria-label={TIP.settimanaPrec}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => vaiA(oggiLunediISO)}
              className="h-9 border-x border-border px-3 text-sm font-medium hover:bg-muted/50"
              title={TIP.oggi}
            >
              Oggi
            </button>
            <button
              type="button"
              onClick={() => vaiA(addGiorni(lunediISO, 7))}
              className="flex h-9 w-9 items-center justify-center rounded-r-lg hover:bg-muted/50"
              title={TIP.settimanaSucc}
              aria-label={TIP.settimanaSucc}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {/* Azione primaria */}
          <Button type="button" onClick={onPubblica} disabled={pending || bozze === 0} title={TIP.pubblica}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Pubblica
          </Button>
        </div>
      </header>

      {/* Toolbar — a sinistra la VISTA (cosa guardo), a destra le AZIONI */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Vista: Pianificazione ↔ Solo ferie (calendario assenze) */}
        <div className="inline-flex overflow-hidden rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setVista('piano')}
            title={TIP.vistaPiano}
            className={
              'flex h-9 items-center gap-1.5 px-3 text-sm font-medium transition-colors ' +
              (vista === 'piano' ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted/50')
            }
          >
            <CalendarDays className="h-4 w-4" /> Pianificazione
          </button>
          <button
            type="button"
            onClick={() => setVista('ferie')}
            title={TIP.vistaFerie}
            className={
              'flex h-9 items-center gap-1.5 border-l border-border px-3 text-sm font-medium transition-colors ' +
              (vista === 'ferie' ? 'bg-rose-600 text-white' : 'text-muted-foreground hover:bg-muted/50')
            }
          >
            <Umbrella className="h-4 w-4" /> Solo ferie
          </button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
            placeholder="Cerca dipendente…"
            title={TIP.cercaDip}
            className="h-9 w-52 rounded-md border border-input bg-background pl-8 pr-3 text-sm focus:border-primary focus:outline-none"
          />
        </div>
        {/* Filtro gruppo lavoro (reparto) — multi-select, pilota anche l'export */}
        {gruppi.length > 0 ? (
          <GruppoFilter gruppi={gruppi} sel={gruppoSel} onChange={setGruppoSel} />
        ) : null}
        <label
          className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-transparent px-1 text-sm text-muted-foreground hover:text-foreground"
          title={TIP.soloTurni}
        >
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={soloTurni}
            onChange={(e) => setSoloTurni(e.target.checked)}
          />
          Solo a turni
        </label>

        {/* Azioni (a destra): primaria d'inserimento + export + overflow */}
        <div className="ml-auto flex items-center gap-2">
          {vista === 'piano' ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setDialog(formVuoto(giorni[0]!))}
              title={TIP.nuovoBlocco}
            >
              <Plus className="h-4 w-4" /> Nuovo blocco
            </Button>
          ) : null}
          <ExportMenu
            lunediISO={lunediISO}
            giorni={giorni}
            dipendenti={dipendenti}
            cantieri={cantieri}
            blocchi={blocchi}
            assenze={assenze}
            gruppi={gruppi}
            dipGruppo={dipGruppo}
            gruppoSel={gruppoSel}
            vista={vista}
            tenantNome={tenantNome}
            logoUrl={logoUrl}
            brandColor={brandColor}
          />
          <MoreMenu>
            <button
              type="button"
              onClick={onCopia}
              disabled={pending}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50 disabled:opacity-50"
            >
              <Copy className="h-4 w-4" /> Copia settimana precedente
            </button>
            <button
              type="button"
              onClick={segnaSalvato}
              disabled={pending}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50 disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> Salva bozza
            </button>
          </MoreMenu>
        </div>
      </div>

      {/* Griglia — celle a larghezza fissa (table-fixed), header giorni fisso
          in scroll (sticky), zebra delicata. */}
      <div className="max-h-[calc(100vh-13rem)] overflow-auto rounded-xl border border-border bg-card shadow-soft">
        <table className="w-full min-w-[1040px] table-fixed border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 w-48 border-b border-r border-border bg-muted px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                      'sticky top-0 z-20 border-b border-border bg-muted px-2 py-2 text-center text-xs font-semibold ' +
                      (oggi ? 'text-primary' : weekend ? 'text-muted-foreground' : 'text-foreground')
                    }
                  >
                    <div>{NOMI_GIORNO_BREVI[i]}</div>
                    <div
                      className={
                        'text-[11px] font-normal ' +
                        (oggi ? 'text-primary' : 'text-muted-foreground')
                      }
                    >
                      {D}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {righeGriglia.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {vista === 'ferie' ? 'Nessuna assenza in questa settimana.' : 'Nessun dipendente.'}
                </td>
              </tr>
            ) : (
              righeGriglia.map((d, ri) => {
                const zebra = ri % 2 === 1;
                const baseBg = zebra ? 'bg-slate-50' : 'bg-white';
                const weekendBg = zebra ? 'bg-slate-100' : 'bg-slate-50';
                return (
                  <tr key={d.id} className="group">
                    <th
                      className={
                        'sticky left-0 z-10 w-48 border-b border-r border-border px-3 py-1.5 text-left align-middle ' +
                        baseBg
                      }
                    >
                      <div className="truncate text-sm font-medium">{nomeDip(d)}</div>
                      {d.mansione ? (
                        <div className="truncate text-[11px] text-muted-foreground">
                          {d.mansione}
                        </div>
                      ) : null}
                    </th>
                    {giorni.map((g, i) => {
                      const cella = perCella.get(`${d.id}|${g}`) ?? [];
                      const weekend = i >= 5;
                      // Anteprima "striscia" (forma card): mentre TRASCINI è a 75%
                      // tratteggiata; al RILASCIO (fase di salvataggio) diventa piena 100%.
                      const liveGhost = vista === 'piano' ? gridDrag.cellGhost(d.id, g) : null;
                      const saveGhost =
                        vista === 'piano' && !liveGhost && savingCells.has(`${d.id}|${g}`)
                          ? savingGhost
                          : null;
                      const ghost = liveGhost ?? saveGhost;
                      const ghostSolido = !!saveGhost;
                      return (
                        <td
                          key={g}
                          data-cell="1"
                          data-emp={d.id}
                          data-date={g}
                          className={
                            'border-b border-border/70 p-1 align-top ' + (weekend ? weekendBg : baseBg)
                          }
                        >
                          <div className="flex min-h-[2.75rem] flex-col gap-1">
                            {(assenzePerCella.get(`${d.id}|${g}`) ?? []).map((a, ai) => (
                              <span
                                key={'a' + ai}
                                title={`Assente: ${a.tipoLabel}`}
                                className="flex items-center gap-1 rounded bg-rose-100 px-1.5 py-1 text-[11px] font-medium leading-tight text-rose-700"
                              >
                                <CalendarOff className="h-3 w-3 shrink-0" />
                                <span className="min-w-0 flex-1 truncate">
                                  {a.tuttoIlGiorno ? a.tipoLabel : `${a.tipoLabel} ${a.oraInizio}`}
                                </span>
                              </span>
                            ))}
                            {vista === 'piano' ? (
                              <>
                                {ghost ? (
                                  <div
                                    className="flex w-full items-center rounded px-1.5 py-1 text-[11px] font-medium leading-tight"
                                    style={
                                      ghostSolido
                                        ? {
                                            // RILASCIATO → card "vera": piena, accento solido, 100%
                                            backgroundColor: `hsl(${ghost.hue} 70% 94%)`,
                                            color: `hsl(${ghost.hue} 60% 28%)`,
                                            borderLeft: `3px solid hsl(${ghost.hue} 60% 45%)`,
                                            opacity: 1,
                                            transition: 'opacity 150ms ease',
                                          }
                                        : {
                                            // MENTRE TRASCINI → anteprima "vuota": cornice tratteggiata,
                                            // fondo e testo tenui, opacità bassa (chiaramente non ancora reale)
                                            backgroundColor: `hsl(${ghost.hue} 75% 97%)`,
                                            color: `hsl(${ghost.hue} 45% 48%)`,
                                            border: `1px dashed hsl(${ghost.hue} 55% 60%)`,
                                            opacity: 0.6,
                                            transition: 'opacity 150ms ease',
                                          }
                                    }
                                  >
                                    <span className="min-w-0 flex-1 truncate">{ghost.label}</span>
                                  </div>
                                ) : null}
                                {cella.map((b) => (
                                  <Chip
                                    key={b.id}
                                    b={b}
                                    conflitto={conflittoSet.has(`${d.id}|${g}|${b.id}`)}
                                    onOpen={() => setDialog(formDaBlocco(b))}
                                    drag={gridDrag}
                                  />
                                ))}
                                <button
                                  type="button"
                                  onClick={() => setDialog(formVuoto(g, d.id))}
                                  className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border/60 text-muted-foreground/40 transition hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
                                  style={{ minHeight: cella.length ? '1.5rem' : '2.5rem' }}
                                  title={TIP.aggiungiCella}
                                  aria-label={TIP.aggiungiCella}
                                >
                                  <Plus className="h-4 w-4" />
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Ghost del drag "sposta" (segue il puntatore). */}
      {gridDrag.drag.kind === 'moving' ? (
        <div
          className="pointer-events-none fixed z-[60] -translate-x-1/2 -translate-y-full rounded-md border border-primary bg-white px-2 py-1 text-xs font-semibold text-primary shadow-lg"
          style={{ left: gridDrag.drag.x, top: gridDrag.drag.y - 10 }}
        >
          Sposta · {gridDrag.drag.label}
        </div>
      ) : null}

      {/* Pill di stato salvataggio drag (loading → conferma "Salvato"). */}
      {salvataggio ? (
        <div
          className={
            'pointer-events-none fixed bottom-6 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium shadow-lg ' +
            (salvataggio === 'saving'
              ? 'border-border bg-white text-foreground'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700')
          }
        >
          {salvataggio === 'saving' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Salvataggio in corso…
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Salvato
            </>
          )}
        </div>
      ) : null}

      {dialog ? (
        <BloccoDialog
          form={dialog}
          onClose={() => setDialog(null)}
          cantieri={cantieri}
          dipendenti={dipendenti}
          mezzi={mezzi}
          gruppi={gruppi}
          dipGruppo={dipGruppo}
          giorni={giorni}
          onSaved={refresh}
        />
      ) : null}
    </div>
  );
}

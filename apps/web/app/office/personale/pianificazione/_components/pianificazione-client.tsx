'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  GraduationCap,
  HardHat,
  Loader2,
  MapPin,
  Plus,
  Search,
  Send,
  StickyNote,
  Trash2,
  Truck,
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
import type { BloccoView, TipoBlocco } from '../_lib/query';
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

// Filtro per gruppo/reparto: UI predisposta, non ancora funzionale (i
// dipendenti non hanno un `gruppo`). Da collegare quando arriveranno i gruppi.
// Vedi documentazione_generale/08_LOGICHE/Dipendenti_Possibili_Aggiunte.md.
const GRUPPI_PLACEHOLDER = [
  { value: 'tutti', label: 'Tutti i gruppi' },
  { value: 'officina', label: 'Officina' },
  { value: 'cantiere', label: 'Cantiere' },
  { value: 'manutenzione', label: 'Manutenzione' },
];

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
  const [cercaMezzo, setCercaMezzo] = React.useState('');
  const [gruppoDip, setGruppoDip] = React.useState('tutti'); // filtro gruppi: predisposto, non ancora attivo
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
    const q = cercaDip.trim().toLowerCase();
    if (!q) return dipendenti;
    return dipendenti.filter((d) =>
      `${nomeDip(d)} ${d.mansione ?? ''}`.toLowerCase().includes(q),
    );
  }, [dipendenti, cercaDip]);

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
            onChange={(e) => set('data', e.target.value)}
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
                {/* Filtro gruppo/reparto: predisposto (non ancora funzionale). */}
                <select
                  value={gruppoDip}
                  onChange={(e) => setGruppoDip(e.target.value)}
                  title="Filtro per gruppo/reparto (in arrivo)"
                  className="h-9 max-w-[7rem] shrink-0 rounded-md border border-input bg-background px-1.5 text-xs text-muted-foreground focus:border-primary focus:outline-none"
                >
                  {GRUPPI_PLACEHOLDER.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
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
  onClick,
}: {
  b: BloccoView;
  conflitto: boolean;
  onClick: () => void;
}) {
  const h = hueTipo(b);
  const label = b.tipo === 'cantiere' ? b.cantiereNome ?? 'Cantiere' : b.titolo ?? 'Evento';
  const Icon = b.tipo === 'formazione' ? GraduationCap : b.tipo === 'evento' ? CalendarClock : null;
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
      {Icon ? <Icon className="h-3 w-3 shrink-0" /> : null}
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
  const [gruppo, setGruppo] = React.useState('tutti'); // filtro gruppo: predisposto, non ancora attivo

  const giorni = React.useMemo(() => giorniSettimana(lunediISO), [lunediISO]);

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
        {/* Filtro gruppo/reparto: predisposto (non ancora funzionale). */}
        <div className="flex items-center gap-1.5">
          <select
            value={gruppo}
            onChange={(e) => setGruppo(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm text-muted-foreground focus:border-primary focus:outline-none"
            title="Filtro per gruppo/reparto (in arrivo)"
          >
            {GRUPPI_PLACEHOLDER.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            in arrivo
          </span>
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
            {dipFiltrati.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Nessun dipendente.
                </td>
              </tr>
            ) : (
              dipFiltrati.map((d, ri) => {
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
                      return (
                        <td
                          key={g}
                          className={
                            'border-b border-border/70 p-1 align-top ' +
                            (weekend ? weekendBg : baseBg)
                          }
                        >
                          <div className="flex min-h-[2.75rem] flex-col gap-1">
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
                              className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border/60 text-muted-foreground/40 transition hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
                              style={{ minHeight: cella.length ? '1.5rem' : '2.5rem' }}
                              aria-label="Aggiungi assegnazione"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
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

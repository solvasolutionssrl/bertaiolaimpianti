'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  Clock,
  Euro,
  Car,
  Loader2,
  Truck,
  UserCircle2,
  Wallet,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Input,
  Label,
} from '@kommessa/ui';
/** Header sezione: piccola etichetta uppercase + icona in chip accentato. */
function SezioneHeader({
  icon,
  titolo,
  accent = 'blue',
  right,
}: {
  icon: React.ReactNode;
  titolo: string;
  accent?: 'blue' | 'amber' | 'emerald';
  right?: React.ReactNode;
}) {
  const accentCls: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-700',
    amber: 'bg-amber-100 text-amber-700',
    emerald: 'bg-emerald-100 text-emerald-700',
  };
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-md ${accentCls[accent]}`}>
          {icon}
        </span>
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {titolo}
        </h2>
      </div>
      {right}
    </div>
  );
}
import {
  TimbratureRiepilogo,
  TimbratureSommario,
  type TimbraturaInput,
} from '../../../_components/timbrature-riepilogo';
import { aggiornaDipendente } from '../../../../_actions/dipendenti';
import { CalendarioOre, type GiornoCalendario } from './calendario-ore';

// ── Tipi ──────────────────────────────────────────────────────────────────

interface DipendenteProp {
  id: string;
  userId: string | null;
  nome: string;
  cognome: string;
  mansione: string | null;
  codiceInterno: string | null;
  statoAttivo: boolean;
  note: string | null;
  costoOrario: number | null;
  aTurni: boolean;
}

interface GiornoView {
  giorno: string; // YYYY-MM-DD
  timbrature: { tipo: string; ts: string; pausa?: boolean | null }[];
  rapportino: {
    stato: string;
    ord: number;
    straord: number;
    viaggio: number;
  } | null;
}

interface MezzoGuidato {
  mezzoId: string;
  targa: string;
  modello: string | null;
  viaggi: number;
  km: number;
}

interface KmMese {
  mese: string; // YYYY-MM
  km: number;
}

interface Props {
  dipendente: DipendenteProp;
  accountNome: string | null;
  giorni: GiornoView[];
  mezziGuidati: MezzoGuidato[];
  kmPerMese: KmMese[];
  kmGuidati: number;
  kmPasseggero: number;
  minutiGuida: number;
  calendario: { mese: string; giorni: GiornoCalendario[] };
}

// ── Helpers ───────────────────────────────────────────────────────────────

const TEXTAREA_CLS =
  'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

const fmtKm = (km: number) =>
  new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(km);

const fmtOre = (n: number) => {
  const totMin = Math.max(0, Math.round(n * 60));
  return `${Math.floor(totMin / 60)}:${String(totMin % 60).padStart(2, '0')}`;
};

const fmtEuro = (n: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(n);

function fmtOreKpi(n: number): string {
  return fmtOre(n);
}

function fmtGiorno(d: string): string {
  // d è YYYY-MM-DD; renderizzo a mezzogiorno UTC per evitare slittamenti di fuso.
  return new Intl.DateTimeFormat('it-IT', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Rome',
  }).format(new Date(`${d}T12:00:00Z`));
}

function fmtMese(m: string): string {
  // m è YYYY-MM
  return new Intl.DateTimeFormat('it-IT', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Rome',
  }).format(new Date(`${m}-15T12:00:00Z`));
}

function fmtMinuti(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}min`;
  if (r === 0) return `${h}h`;
  return `${h}h ${String(r).padStart(2, '0')}min`;
}

function StatoRapportinoBadge({ stato }: { stato: string }) {
  const labelMap: Record<string, string> = {
    bozza: 'Bozza',
    inviato: 'Inviato',
    approvato: 'Approvato',
    rifiutato: 'Rifiutato',
  };
  const clsMap: Record<string, string> = {
    bozza: 'text-muted-foreground',
    inviato: 'text-blue-600 dark:text-blue-400',
    approvato: 'text-emerald-600 dark:text-emerald-400',
    rifiutato: 'text-destructive',
  };
  return (
    <span className={`text-xs font-medium ${clsMap[stato] ?? 'text-muted-foreground'}`}>
      {labelMap[stato] ?? stato}
    </span>
  );
}

// ── KPI chip (mirror cantiere) ──────────────────────────────────────────────

function KpiChip({
  icon,
  valore,
  label,
  accent,
}: {
  icon: React.ReactNode;
  valore: React.ReactNode;
  label: string;
  accent: 'blue' | 'amber' | 'emerald' | 'slate';
}) {
  const map: Record<string, string> = {
    blue: 'border-blue-200/60 bg-blue-50/60 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300',
    amber: 'border-amber-200/60 bg-amber-50/60 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300',
    emerald: 'border-emerald-200/60 bg-emerald-50/60 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300',
    slate: 'border-border bg-muted/40 text-foreground',
  };
  return (
    <div className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 ${map[accent]}`}>
      <span className="shrink-0 opacity-80">{icon}</span>
      <div className="min-w-0">
        <p className="text-lg font-bold leading-none tabular-nums">{valore}</p>
        <p className="mt-0.5 truncate text-[11px] font-medium uppercase tracking-wide opacity-80">{label}</p>
      </div>
    </div>
  );
}

// ── Sezione card wrapper (compatto, header tinto) ───────────────────────────

function Sezione({
  header,
  children,
  className = '',
}: {
  header: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`shadow-soft ${className}`}>
      <div className="border-b border-border bg-muted/20 px-4 py-2.5">{header}</div>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  );
}

// ── Riga riepilogo (label · valore) per la sidebar ──────────────────────────

function RigaInfo({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium tabular-nums">{children}</span>
    </div>
  );
}

// ── Componente ────────────────────────────────────────────────────────────

export function DipendenteDetailClient({
  dipendente,
  accountNome,
  giorni,
  mezziGuidati,
  kmPerMese,
  kmGuidati,
  kmPasseggero,
  minutiGuida,
  calendario,
}: Props) {
  const router = useRouter();

  const [form, setForm] = React.useState({
    nome: dipendente.nome,
    cognome: dipendente.cognome,
    mansione: dipendente.mansione ?? '',
    codiceInterno: dipendente.codiceInterno ?? '',
    costoOrario: dipendente.costoOrario != null ? String(dipendente.costoOrario) : '',
    aTurni: dipendente.aTurni,
    statoAttivo: dipendente.statoAttivo,
    note: dipendente.note ?? '',
  });
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [aperti, setAperti] = React.useState<Set<string>>(new Set());

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setForm((f) => ({ ...f, [name]: (e.target as HTMLInputElement).checked }));
    } else {
      setForm((f) => ({ ...f, [name]: value }));
    }
    setOk(false);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    const costoNum = form.costoOrario.trim() === '' ? null : Number(form.costoOrario);
    if (costoNum != null && (Number.isNaN(costoNum) || costoNum < 0)) {
      setError('Il costo orario deve essere un numero valido.');
      return;
    }
    start(async () => {
      const res = await aggiornaDipendente({
        id: dipendente.id,
        nome: form.nome.trim(),
        cognome: form.cognome.trim(),
        mansione: form.mansione.trim() || null,
        codice_interno: form.codiceInterno.trim() || null,
        user_id: dipendente.userId, // passato invariato: non si modifica qui
        stato_attivo: form.statoAttivo,
        a_turni: form.aTurni,
        costo_orario: costoNum,
        note: form.note.trim() || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOk(true);
      setEditing(false);
      router.refresh();
    });
  }

  function annullaEdit() {
    setEditing(false);
    setError(null);
    setForm({
      nome: dipendente.nome,
      cognome: dipendente.cognome,
      mansione: dipendente.mansione ?? '',
      codiceInterno: dipendente.codiceInterno ?? '',
      costoOrario: dipendente.costoOrario != null ? String(dipendente.costoOrario) : '',
      aTurni: dipendente.aTurni,
      statoAttivo: dipendente.statoAttivo,
      note: dipendente.note ?? '',
    });
  }

  function toggleGiorno(g: string) {
    setAperti((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  }

  const nomeCompleto = `${dipendente.cognome} ${dipendente.nome}`.trim();
  const costoNumLive = form.costoOrario.trim() === '' ? null : Number(form.costoOrario);

  // ── Aggregati periodo ──
  const kmTotali = mezziGuidati.reduce((s, m) => s + m.km, 0);
  const oreOrd = giorni.reduce((s, g) => s + (g.rapportino ? g.rapportino.ord : 0), 0);
  const oreStraord = giorni.reduce((s, g) => s + (g.rapportino ? g.rapportino.straord : 0), 0);
  const oreViaggio = giorni.reduce((s, g) => s + (g.rapportino ? g.rapportino.viaggio : 0), 0);
  const oreTotali = oreOrd + oreStraord + oreViaggio;
  const oreLavoro = oreOrd + oreStraord;
  const costoPeriodo =
    dipendente.costoOrario != null ? dipendente.costoOrario * oreLavoro : null;

  return (
    <div className="space-y-4">
      {/* ── Header band ── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link
            href="/office/kantiere/dipendenti"
            className="flex items-center gap-1 transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Dipendenti
          </Link>
          <span aria-hidden="true">/</span>
          <span className="font-medium text-foreground">{nomeCompleto}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
              <UserCircle2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">{nomeCompleto}</h1>
              {dipendente.codiceInterno && (
                <span className="font-mono text-xs text-muted-foreground">
                  {dipendente.codiceInterno}
                </span>
              )}
              {dipendente.mansione && (
                <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {dipendente.mansione}
                </span>
              )}
              <span
                className={
                  dipendente.statoAttivo
                    ? 'inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400'
                    : 'inline-flex items-center gap-1 text-xs font-medium text-muted-foreground'
                }
              >
                <span
                  className={
                    dipendente.statoAttivo
                      ? 'h-1.5 w-1.5 rounded-full bg-emerald-500'
                      : 'h-1.5 w-1.5 rounded-full bg-muted-foreground/50'
                  }
                />
                {dipendente.statoAttivo ? 'Attivo' : 'Non attivo'}
              </span>
              {dipendente.aTurni && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  Turni
                </span>
              )}
            </div>
          </div>
          {!editing && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(true);
                setOk(false);
              }}
            >
              Modifica
            </Button>
          )}
        </div>
      </div>

      {/* ── KPI strip (periodo ~45gg) ── */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <KpiChip
          accent="blue"
          icon={<Clock className="h-4 w-4" aria-hidden="true" />}
          valore={`${fmtOreKpi(oreTotali)}`}
          label="Ore totali (45gg)"
        />
        <KpiChip
          accent="amber"
          icon={<Clock className="h-4 w-4" aria-hidden="true" />}
          valore={`${fmtOreKpi(oreStraord)}`}
          label="Straordinari"
        />
        <KpiChip
          accent="blue"
          icon={<Car className="h-4 w-4" aria-hidden="true" />}
          valore={`${fmtOreKpi(oreViaggio)}`}
          label="Viaggio"
        />
        <KpiChip
          accent="emerald"
          icon={<Car className="h-4 w-4" aria-hidden="true" />}
          valore={`${fmtKm(kmGuidati)}`}
          label="Km guidati (90gg)"
        />
        <KpiChip
          accent={costoPeriodo != null ? 'emerald' : 'slate'}
          icon={<Wallet className="h-4 w-4" aria-hidden="true" />}
          valore={costoPeriodo != null ? fmtEuro(costoPeriodo) : 'n.d.'}
          label="Costo periodo"
        />
      </div>

      {/* ── Due colonne ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* ── LEFT (main, 2/3) ── */}
        <div className="space-y-4 lg:col-span-2">
          {/* Calendario ore (mese) */}
          <CalendarioOre mese={calendario.mese} giorni={calendario.giorni} />

          {/* Presenze e ore */}
          <Sezione
            header={
              <SezioneHeader
                icon={<CalendarClock className="h-4 w-4" aria-hidden="true" />}
                titolo="Presenze e ore"
                accent="blue"
                right={
                  <span className="font-mono text-xs font-semibold text-muted-foreground">
                    {giorni.length}
                  </span>
                }
              />
            }
            className="overflow-hidden"
          >
            {giorni.length === 0 ? (
              <p className="text-xs italic text-muted-foreground">
                Nessuna timbratura o rapportino negli ultimi 45 giorni.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-3 py-1.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Giorno</th>
                      <th className="px-3 py-1.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Timbrature</th>
                      <th className="px-3 py-1.5 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Ord.</th>
                      <th className="px-3 py-1.5 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Straord.</th>
                      <th className="px-3 py-1.5 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Viaggio</th>
                      <th className="px-3 py-1.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Rapportino</th>
                      <th className="w-8 px-2 py-1.5" aria-label="Espandi" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {giorni.map((g) => {
                      const hasTimb = g.timbrature.length > 0;
                      const isOpen = aperti.has(g.giorno);
                      const timbInput: TimbraturaInput[] = g.timbrature.map((t) => ({
                        tipo: t.tipo,
                        ts: t.ts,
                        pausa: t.pausa ?? false,
                      }));
                      return (
                        <React.Fragment key={g.giorno}>
                          <tr
                            className={hasTimb ? 'cursor-pointer hover:bg-muted/30' : 'hover:bg-muted/20'}
                            onClick={hasTimb ? () => toggleGiorno(g.giorno) : undefined}
                          >
                            <td className="whitespace-nowrap px-3 py-1.5 font-medium capitalize tabular-nums">
                              {fmtGiorno(g.giorno)}
                            </td>
                            <td className="px-3 py-1.5">
                              {hasTimb ? (
                                <TimbratureSommario timbrature={timbInput} />
                              ) : (
                                <span className="text-xs text-muted-foreground/60">Nessuna timbratura</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {g.rapportino && g.rapportino.ord > 0 ? (
                                fmtOre(g.rapportino.ord)
                              ) : (
                                <span className="text-muted-foreground/40">·</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {g.rapportino && g.rapportino.straord > 0 ? (
                                fmtOre(g.rapportino.straord)
                              ) : (
                                <span className="text-muted-foreground/40">·</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {g.rapportino && g.rapportino.viaggio > 0 ? (
                                fmtOre(g.rapportino.viaggio)
                              ) : (
                                <span className="text-muted-foreground/40">·</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5">
                              {g.rapportino ? (
                                <StatoRapportinoBadge stato={g.rapportino.stato} />
                              ) : (
                                <span className="text-xs text-muted-foreground/50">·</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              {hasTimb && (
                                <ChevronDown
                                  className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
                                  aria-hidden="true"
                                />
                              )}
                            </td>
                          </tr>
                          {hasTimb && isOpen && (
                            <tr className="bg-muted/20">
                              <td colSpan={7} className="px-3 py-2">
                                <TimbratureRiepilogo timbrature={timbInput} />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Sezione>

          {/* Mezzi guidati */}
          <Sezione
            header={
              <SezioneHeader
                icon={<Truck className="h-4 w-4" aria-hidden="true" />}
                titolo="Mezzi guidati"
                accent="amber"
                right={
                  <span className="font-mono text-xs font-semibold text-muted-foreground">
                    {mezziGuidati.length}
                  </span>
                }
              />
            }
          >
            {mezziGuidati.length === 0 ? (
              <p className="text-xs italic text-muted-foreground">
                Nessun viaggio come autista negli ultimi 90 giorni.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-3 py-1.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Mezzo</th>
                      <th className="px-3 py-1.5 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Viaggi</th>
                      <th className="px-3 py-1.5 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Km</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {mezziGuidati.map((m) => (
                      <tr key={m.mezzoId} className="hover:bg-muted/30">
                        <td className="px-3 py-1.5">
                          <span className="font-medium">{m.targa}</span>
                          {m.modello && (
                            <span className="ml-2 text-xs text-muted-foreground">{m.modello}</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{m.viaggi}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtKm(m.km)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-muted/20">
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">
                        Totale · guida {fmtMinuti(minutiGuida)}
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs font-semibold tabular-nums">
                        {mezziGuidati.reduce((s, m) => s + m.viaggi, 0)}
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs font-semibold tabular-nums">
                        {fmtKm(kmTotali)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Sezione>
        </div>

        {/* ── RIGHT (sidebar, 1/3, sticky) ── */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          {/* Anagrafica compatta (editabile) */}
          <Sezione
            header={
              <SezioneHeader
                icon={<UserCircle2 className="h-4 w-4" aria-hidden="true" />}
                titolo="Anagrafica"
                accent="blue"
                right={
                  !editing ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditing(true);
                        setOk(false);
                      }}
                    >
                      Modifica
                    </Button>
                  ) : null
                }
              />
            }
          >
            {editing ? (
              <form onSubmit={handleSave} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="cognome">Cognome *</Label>
                    <Input id="cognome" name="cognome" value={form.cognome} onChange={handleChange} required />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="nome">Nome *</Label>
                    <Input id="nome" name="nome" value={form.nome} onChange={handleChange} required />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="mansione">Mansione</Label>
                    <Input id="mansione" name="mansione" value={form.mansione} onChange={handleChange} placeholder="Elettricista" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="codiceInterno">Codice interno</Label>
                    <Input id="codiceInterno" name="codiceInterno" value={form.codiceInterno} onChange={handleChange} className="font-mono" />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="costoOrario">Costo orario (€/h)</Label>
                    <Input
                      id="costoOrario"
                      name="costoOrario"
                      type="number"
                      inputMode="decimal"
                      step="0.5"
                      min="0"
                      value={form.costoOrario}
                      onChange={handleChange}
                      placeholder="Es. 28.50"
                      className="tabular-nums"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2.5 rounded-md border border-border bg-muted/30 p-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm select-none">
                    <input
                      name="statoAttivo"
                      type="checkbox"
                      checked={form.statoAttivo}
                      onChange={handleChange}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    Attivo
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm select-none">
                    <input
                      name="aTurni"
                      type="checkbox"
                      checked={form.aTurni}
                      onChange={handleChange}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    Lavora a turni
                  </label>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="note">Note</Label>
                  <textarea
                    id="note"
                    name="note"
                    value={form.note}
                    onChange={handleChange}
                    rows={3}
                    placeholder="Annotazioni facoltative..."
                    className={TEXTAREA_CLS}
                  />
                </div>

                {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
                {costoNumLive != null && !Number.isNaN(costoNumLive) ? (
                  <p className="text-xs text-muted-foreground">
                    Costo orario:{' '}
                    <span className="font-medium text-foreground tabular-nums">{fmtEuro(costoNumLive)}/h</span>
                  </p>
                ) : null}

                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm" disabled={pending} onClick={annullaEdit}>
                    Annulla
                  </Button>
                  <Button type="submit" size="sm" disabled={pending}>
                    {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                    {pending ? 'Salvo...' : 'Salva'}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="divide-y divide-border">
                <RigaInfo label="Mansione">
                  {dipendente.mansione ?? <span className="font-normal text-muted-foreground">n.d.</span>}
                </RigaInfo>
                <RigaInfo label="Codice interno">
                  {dipendente.codiceInterno ? (
                    <span className="font-mono">{dipendente.codiceInterno}</span>
                  ) : (
                    <span className="font-normal text-muted-foreground">n.d.</span>
                  )}
                </RigaInfo>
                <RigaInfo label="Stato">
                  <span
                    className={
                      dipendente.statoAttivo
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-muted-foreground'
                    }
                  >
                    {dipendente.statoAttivo ? 'Attivo' : 'Non attivo'}
                  </span>
                </RigaInfo>
                <RigaInfo label="Costo orario">
                  {dipendente.costoOrario != null ? (
                    <span className="inline-flex items-center gap-1">
                      <Euro className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                      {fmtEuro(dipendente.costoOrario)}
                      <span className="text-xs font-normal text-muted-foreground">/h</span>
                    </span>
                  ) : (
                    <span className="font-normal text-muted-foreground">Non impostato</span>
                  )}
                </RigaInfo>
                <RigaInfo label="Lavoro a turni">
                  {dipendente.aTurni ? 'Sì' : 'No'}
                </RigaInfo>
                <RigaInfo label="Account collegato">
                  {accountNome ?? <span className="font-normal text-muted-foreground">Nessuno</span>}
                </RigaInfo>
                {dipendente.note ? (
                  <div className="pt-2">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Note</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">{dipendente.note}</p>
                  </div>
                ) : null}
                {ok ? (
                  <p className="pt-2 text-xs text-emerald-600 dark:text-emerald-400">Salvato.</p>
                ) : null}
              </div>
            )}
          </Sezione>

          {/* Riepilogo periodo */}
          <Sezione
            header={
              <SezioneHeader
                icon={<Clock className="h-4 w-4" aria-hidden="true" />}
                titolo="Riepilogo periodo"
                accent="emerald"
              />
            }
          >
            <div className="divide-y divide-border">
              <RigaInfo label="Ore ordinarie">{fmtOre(oreOrd)}</RigaInfo>
              <RigaInfo label="Straordinari">{fmtOre(oreStraord)}</RigaInfo>
              <RigaInfo label="Viaggio">{fmtOre(oreViaggio)}</RigaInfo>
              <RigaInfo label="Ore totali">
                <span className="font-semibold">{fmtOre(oreTotali)}</span>
              </RigaInfo>
              <RigaInfo label="Km guidati (90gg)">
                <span className="font-medium">{fmtKm(kmGuidati)} km</span>
              </RigaInfo>
              <RigaInfo label="Km da passeggero">
                <span className="text-muted-foreground">{fmtKm(kmPasseggero)} km</span>
              </RigaInfo>
              {costoPeriodo != null ? (
                <RigaInfo label="Costo lavoro periodo">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    {fmtEuro(costoPeriodo)}
                  </span>
                </RigaInfo>
              ) : null}
            </div>
            <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
              Totali su timbrature e rapportini degli ultimi 45 giorni. Costo lavoro = ore ordinarie +
              straordinari × costo orario.
            </p>
          </Sezione>

          {/* Km per mese */}
          <Sezione
            header={
              <SezioneHeader
                icon={<Car className="h-4 w-4" aria-hidden="true" />}
                titolo="Km percorsi per mese"
                accent="blue"
              />
            }
          >
            {kmPerMese.length === 0 ? (
              <p className="text-xs italic text-muted-foreground">
                Nessun viaggio registrato negli ultimi mesi.
              </p>
            ) : (
              <ul className="space-y-2">
                {(() => {
                  const max = Math.max(...kmPerMese.map((k) => k.km), 1);
                  return kmPerMese.map((k) => (
                    <li key={k.mese} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="capitalize text-muted-foreground">{fmtMese(k.mese)}</span>
                        <span className="font-medium tabular-nums">{fmtKm(k.km)} km</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.max(2, (k.km / max) * 100)}%` }}
                        />
                      </div>
                    </li>
                  ));
                })()}
              </ul>
            )}
          </Sezione>
        </div>
      </div>
    </div>
  );
}

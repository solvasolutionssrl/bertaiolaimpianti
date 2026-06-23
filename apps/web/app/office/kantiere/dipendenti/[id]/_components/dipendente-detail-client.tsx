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
  Gauge,
  Loader2,
  Truck,
  UserCircle2,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@kommessa/ui';
import {
  TimbratureRiepilogo,
  TimbratureSommario,
  type TimbraturaInput,
} from '../../../_components/timbrature-riepilogo';
import { aggiornaDipendente } from '../../../../_actions/dipendenti';

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
  minutiGuida: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const TEXTAREA_CLS =
  'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

const fmtKm = (km: number) =>
  new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(km);

const fmtOre = (n: number) =>
  new Intl.NumberFormat('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

const fmtEuro = (n: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(n);

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

// ── Componente ────────────────────────────────────────────────────────────

export function DipendenteDetailClient({
  dipendente,
  accountNome,
  giorni,
  mezziGuidati,
  kmPerMese,
  minutiGuida,
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

  // KPI riepilogo
  const kmTotali = mezziGuidati.reduce((s, m) => s + m.km, 0);
  const oreRegistrate = giorni.reduce(
    (s, g) => s + (g.rapportino ? g.rapportino.ord + g.rapportino.straord + g.rapportino.viaggio : 0),
    0,
  );

  return (
    <div className="space-y-6">
      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link
          href="/office/kantiere/dipendenti"
          className="flex items-center gap-1 transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Dipendenti
        </Link>
        <span aria-hidden="true">·</span>
        <span className="font-medium text-foreground">{nomeCompleto}</span>
      </div>

      {/* ── Header card editabile ── */}
      <Card className="shadow-soft">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                <UserCircle2 className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
                  {nomeCompleto}
                  {dipendente.codiceInterno && (
                    <span className="font-mono text-xs font-normal text-muted-foreground">
                      {dipendente.codiceInterno}
                    </span>
                  )}
                </CardTitle>
                <div className="mt-1 flex flex-wrap items-center gap-2">
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
            </div>
            {!editing && (
              <Button type="button" size="sm" variant="outline" onClick={() => { setEditing(true); setOk(false); }}>
                Modifica
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editing ? (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cognome">Cognome *</Label>
                  <Input id="cognome" name="cognome" value={form.cognome} onChange={handleChange} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nome">Nome *</Label>
                  <Input id="nome" name="nome" value={form.nome} onChange={handleChange} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mansione">Mansione</Label>
                  <Input id="mansione" name="mansione" value={form.mansione} onChange={handleChange} placeholder="Elettricista" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="codiceInterno">Codice interno</Label>
                  <Input id="codiceInterno" name="codiceInterno" value={form.codiceInterno} onChange={handleChange} className="font-mono" />
                </div>
                <div className="space-y-1.5">
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
                <div className="flex flex-col justify-end gap-2.5 rounded-md border border-border bg-muted/30 p-3">
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
              </div>

              <div className="space-y-1.5">
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

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
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
                  }}
                >
                  Annulla
                </Button>
                <Button type="submit" size="sm" disabled={pending}>
                  {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                  {pending ? 'Salvo...' : 'Salva'}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              {/* Riga dati chiave */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Euro className="h-3.5 w-3.5" aria-hidden="true" />
                    Costo orario
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {dipendente.costoOrario != null ? (
                      <>
                        {fmtEuro(dipendente.costoOrario)}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">/h</span>
                      </>
                    ) : (
                      <span className="text-sm font-normal text-muted-foreground">Non impostato</span>
                    )}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <UserCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Account collegato
                  </p>
                  <p className="mt-1 truncate text-sm font-medium">
                    {accountNome ?? <span className="font-normal text-muted-foreground">Nessun account</span>}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    Ore registrate (45gg)
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{fmtOre(oreRegistrate)}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
                    Km guidati (90gg)
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{fmtKm(kmTotali)}</p>
                </div>
              </div>

              {dipendente.note && (
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Note</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">{dipendente.note}</p>
                </div>
              )}
            </div>
          )}

          {ok && !editing ? (
            <p className="mt-3 text-xs text-emerald-600 dark:text-emerald-400">Salvato.</p>
          ) : null}
          {/* anteprima live costo in edit */}
          {editing && costoNumLive != null && !Number.isNaN(costoNumLive) ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Costo orario: <span className="font-medium text-foreground tabular-nums">{fmtEuro(costoNumLive)}/h</span>
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* ── Presenze e ore ── */}
      <Card className="shadow-soft">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Presenze e ore
            <span className="font-mono text-xs font-normal text-muted-foreground">{giorni.length}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {giorni.length === 0 ? (
            <p className="text-xs italic text-muted-foreground">
              Nessuna timbratura o rapportino negli ultimi 45 giorni.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-3 py-1.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Giorno</th>
                    <th className="px-3 py-1.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Timbrature</th>
                    <th className="px-3 py-1.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Ord.</th>
                    <th className="px-3 py-1.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Straord.</th>
                    <th className="px-3 py-1.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Viaggio</th>
                    <th className="px-3 py-1.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Rapportino</th>
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
        </CardContent>
      </Card>

      {/* ── Mezzi guidati + Km per mese ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Mezzi guidati */}
        <Card className="shadow-soft">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Truck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Mezzi guidati
              <span className="font-mono text-xs font-normal text-muted-foreground">{mezziGuidati.length}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {mezziGuidati.length === 0 ? (
              <p className="text-xs italic text-muted-foreground">
                Nessun viaggio come autista negli ultimi 90 giorni.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-3 py-1.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Mezzo</th>
                      <th className="px-3 py-1.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Viaggi</th>
                      <th className="px-3 py-1.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Km</th>
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
          </CardContent>
        </Card>

        {/* Km per mese */}
        <Card className="shadow-soft">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Km per mese
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
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
                      <div className="flex items-center justify-between gap-2 text-sm">
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

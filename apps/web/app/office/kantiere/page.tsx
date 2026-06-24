import Link from 'next/link';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@kommessa/ui';
import { fmtData } from '@/app/office/_lib/format';
import { TurniAttivi } from './_components/turni-attivi';
import { BarsOrizzontali, AreaTrend, DonutOre } from './_components/charts';
import { turniAttivi } from '@/app/office/_actions/kantiere-turni-attivi';
import {
  Users,
  QrCode,
  ClipboardList,
  Timer,
  Clock,
  HardHat,
  AlertTriangle,
  ArrowUpRight,
  Activity,
  UserCheck,
  CalendarDays,
  MapPin,
  Utensils,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

/* ------------------------------------------------------------------ */
/* Local types                                                          */
/* ------------------------------------------------------------------ */

type RapportinoInviatoRow = {
  id: string;
  dipendente_id: string;
  data: string;
  stato: string;
};

type DipendenteNomeRow = {
  id: string;
  nome: string;
  cognome: string;
};

type RigaOreRow = {
  ore_ordinarie: number;
  ore_straordinarie: number;
  ore_viaggio: number;
};

type TimbraturaRow = {
  dipendente_id: string;
  cantiere_id: string | null;
  tipo: string;
  ts: string;
};

type CantiereRow = {
  id: string;
  nome: string;
  codice: string | null;
};

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

/** Inizio giornata odierna in Europe/Rome espresso come ISO UTC. */
function inizioOggiRome(): string {
  const oggi = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
  return `${oggi}T00:00:00.000Z`;
}

/** Data odierna YYYY-MM-DD in Europe/Rome. */
function oggiRome(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
}

/** Inizio di 7 giorni fa in formato YYYY-MM-DD (per rapportini). */
function settimanaDa(): string {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(d);
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

export default async function KantierePanoramica() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  // ===== KPI 1: dipendenti attivi =====
  const { count: dipendentiAttivi } = await supabase
    .from('dipendenti' as never)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenantId)
    .eq('stato_attivo', true);

  // ===== KPI 2: QR attivi =====
  const { count: qrAttivi } = await supabase
    .from('cantiere_qr' as never)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenantId)
    .eq('attivo', true);

  // ===== KPI 3: rapportini da approvare =====
  const { count: daApprovare } = await supabase
    .from('rapportini' as never)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenantId)
    .eq('stato', 'inviato');

  // ===== KPI 4: timbrature oggi =====
  const inizioOggi = inizioOggiRome();
  const { count: timbratureOggi } = await supabase
    .from('timbrature' as never)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenantId)
    .gte('ts', inizioOggi);

  // ===== KPI 5: ore settimana =====
  const da7gg = settimanaDa();
  const { data: rapportiniSettimana } = (await supabase
    .from('rapportini' as never)
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .gte('data', da7gg)
    .in('stato', ['inviato', 'approvato'])
    .limit(500)) as { data: { id: string }[] | null };

  let oreOrd = 0;
  let oreStraord = 0;
  let oreViaggio = 0;
  const idsSettimana = (rapportiniSettimana ?? []).map((r) => r.id);
  if (idsSettimana.length > 0) {
    const { data: righe } = (await supabase
      .from('rapportino_righe' as never)
      .select('ore_ordinarie, ore_straordinarie, ore_viaggio')
      .in('rapportino_id', idsSettimana)) as { data: RigaOreRow[] | null };
    for (const r of righe ?? []) {
      oreOrd += r.ore_ordinarie ?? 0;
      oreStraord += r.ore_straordinarie ?? 0;
      oreViaggio += r.ore_viaggio ?? 0;
    }
  }
  const oreSettimana = oreOrd + oreStraord + oreViaggio;

  const oreSettimanaDisplay = Number.isFinite(oreSettimana)
    ? oreSettimana % 1 === 0
      ? String(oreSettimana)
      : oreSettimana.toFixed(1)
    : '0';

  // ===== Anomalie aperte (conteggio sintetico) =====
  const { count: anomalieAperte } = await supabase
    .from('timbrature' as never)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenantId)
    .eq('tipo', 'ingresso')
    // timbrature senza uscita nella stessa giornata di ieri o precedente
    // (come proxy anomalie: ingresso senza corrispondente uscita prima di oggi)
    .lt('ts', inizioOggi)
    .gte('ts', `${da7gg}T00:00:00.000Z`);

  // ===== Timbrature di oggi per analisi presenze =====
  const { data: timbOggiRaw } = (await supabase
    .from('timbrature' as never)
    .select('dipendente_id, cantiere_id, tipo, ts')
    .eq('tenant_id', ctx.tenantId)
    .gte('ts', inizioOggi)
    .order('ts', { ascending: true })
    .limit(1000)) as { data: TimbraturaRow[] | null };

  const timbOggi = timbOggiRaw ?? [];

  // ===== Turni attivi (live) — fonte unica per "in cantiere" e "in pausa" =====
  // Derivare i conteggi dai turni APERTI (logica pausa-aware di `turniAttivi`)
  // invece che da una semplice differenza ingressi/uscite: così chi è rientrato
  // dalla pausa torna "in cantiere" e chi è in pausa NON viene contato tra i
  // presenti, e i due numeri restano allineati con la card "Turni attivi".
  const turniRes = await turniAttivi();
  const turniGruppi = turniRes.ok ? turniRes.gruppi : [];
  const turniTotale = turniRes.ok ? turniRes.totale : 0;
  const dipInLavoro = new Set<string>();
  const dipInPausa = new Set<string>();
  for (const g of turniGruppi) {
    for (const t of g.turni) {
      if (t.inPausa) dipInPausa.add(t.dipendenteId);
      else dipInLavoro.add(t.dipendenteId);
    }
  }
  // Chi sta effettivamente lavorando ha priorità su un eventuale turno in pausa
  // (caso limite: turni aperti su più cantieri).
  for (const id of dipInLavoro) dipInPausa.delete(id);
  const inCantiereOraCount = dipInLavoro.size;
  const inPausaOraCount = dipInPausa.size;

  // Presenze per cantiere oggi (dipendenti unici per cantiere)
  const presenzaPerCantiere = new Map<string, Set<string>>();
  for (const t of timbOggi) {
    if (t.tipo !== 'ingresso') continue;
    const cId = t.cantiere_id ?? '__nessuno__';
    const existing = presenzaPerCantiere.get(cId);
    if (existing) {
      existing.add(t.dipendente_id);
    } else {
      presenzaPerCantiere.set(cId, new Set([t.dipendente_id]));
    }
  }

  // Carica nomi cantieri coinvolti oggi
  const cantiereIdsOggi = [...presenzaPerCantiere.keys()].filter((k) => k !== '__nessuno__');
  const cantiereNomiMap = new Map<string, string>();
  if (cantiereIdsOggi.length > 0) {
    const { data: cRows } = (await supabase
      .from('cantieri' as never)
      .select('id, nome, codice')
      .in('id', cantiereIdsOggi)) as { data: CantiereRow[] | null };
    for (const c of cRows ?? []) {
      cantiereNomiMap.set(c.id, c.nome || c.codice || c.id);
    }
  }

  // Distribuzione presenze per cantiere oggi (top 6)
  const presenzaCantiereList: { nome: string; count: number }[] = [];
  for (const [cId, dipSet] of presenzaPerCantiere) {
    const nome =
      cId === '__nessuno__' ? 'Non specificato' : (cantiereNomiMap.get(cId) ?? cId);
    presenzaCantiereList.push({ nome, count: dipSet.size });
  }
  presenzaCantiereList.sort((a, b) => b.count - a.count);
  const topCantieri = presenzaCantiereList.slice(0, 6);

  // Presenze per giorno ultimi 7 giorni (per grafico trend)
  const { data: rapportiniUltimi7 } = (await supabase
    .from('rapportini' as never)
    .select('dipendente_id, data')
    .eq('tenant_id', ctx.tenantId)
    .gte('data', da7gg)
    .lte('data', oggiRome())
    .in('stato', ['inviato', 'approvato'])
    .limit(2000)) as { data: { dipendente_id: string; data: string }[] | null };

  // Dipendenti unici per giorno (presenti = hanno rapportino)
  const presenzePerGiorno = new Map<string, Set<string>>();
  for (const r of rapportiniUltimi7 ?? []) {
    const existing = presenzePerGiorno.get(r.data);
    if (existing) {
      existing.add(r.dipendente_id);
    } else {
      presenzePerGiorno.set(r.data, new Set([r.dipendente_id]));
    }
  }

  // Genera array 7 giorni
  const trend7gg: { giorno: string; etichetta: string; count: number }[] = [];
  const oggi = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(oggi);
    d.setDate(d.getDate() - i);
    const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(d);
    const label = new Intl.DateTimeFormat('it-IT', {
      timeZone: 'Europe/Rome',
      weekday: 'short',
      day: 'numeric',
    }).format(d);
    trend7gg.push({
      giorno: iso,
      etichetta: label,
      count: presenzePerGiorno.get(iso)?.size ?? 0,
    });
  }

  // Ultimi 5 rapportini inviati con nome dipendente
  const { data: ultimiRaw } = (await supabase
    .from('rapportini' as never)
    .select('id, dipendente_id, data, stato')
    .eq('tenant_id', ctx.tenantId)
    .eq('stato', 'inviato')
    .order('inviato_at', { ascending: false })
    .limit(5)) as { data: RapportinoInviatoRow[] | null };

  const ultimi = ultimiRaw ?? [];
  const dipIdsUltimi = [...new Set(ultimi.map((r) => r.dipendente_id))];
  const dipNomiMap = new Map<string, string>();
  if (dipIdsUltimi.length > 0) {
    const { data: dipNomi } = (await supabase
      .from('dipendenti' as never)
      .select('id, nome, cognome')
      .in('id', dipIdsUltimi)) as { data: DipendenteNomeRow[] | null };
    for (const d of dipNomi ?? []) {
      dipNomiMap.set(d.id, `${d.nome} ${d.cognome}`.trim());
    }
  }

  return (
    <div className="w-full space-y-5">
      {/* ===== Header ===== */}
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Kantiere</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Riepilogo operativo presenze, cantieri e rapportini.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/office/kantiere/qr">
              <QrCode className="h-3.5 w-3.5" />
              QR code
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/office/kantiere/rapportini">
              <ClipboardList className="h-3.5 w-3.5" />
              Rapportini
            </Link>
          </Button>
        </div>
      </header>

      {/* ===== KPI grid — stile compatto ===== */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-6">
        <KpiMini
          label="Dipendenti attivi"
          value={dipendentiAttivi ?? 0}
          icon={<Users />}
          tone="default"
        />
        <KpiMini
          label="Attualmente in cantiere"
          value={inCantiereOraCount}
          icon={<UserCheck />}
          tone={inCantiereOraCount > 0 ? 'success' : 'default'}
          hint="Turno aperto, al lavoro"
        />
        <KpiMini
          label="In pausa pranzo"
          value={inPausaOraCount}
          icon={<Utensils />}
          tone="pausa"
          hint="Turno aperto, fermi"
        />
        <KpiMini
          label="Timbrature oggi"
          value={timbratureOggi ?? 0}
          icon={<Timer />}
          tone="default"
        />
        <KpiMini
          label="Da approvare"
          value={daApprovare ?? 0}
          icon={<ClipboardList />}
          tone={(daApprovare ?? 0) > 0 ? 'warning' : 'default'}
          hint="Rapportini in attesa"
        />
        <KpiMini
          label="Ore settimana"
          value={oreSettimanaDisplay}
          icon={<Clock />}
          tone="default"
          hint="Ultimi 7 giorni"
        />
      </div>

      {/* ===== Turni attivi (live) ===== */}
      <TurniAttivi iniziale={turniGruppi} totaleIniziale={turniTotale} />

      {/* ===== Riga principale: Grafici ===== */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard etichetta="Oggi" titolo="Presenze per cantiere" icon={<MapPin />}>
          <BarsOrizzontali
            data={topCantieri.map((c) => ({ nome: c.nome, valore: c.count }))}
            unita="pers."
          />
        </ChartCard>

        <ChartCard etichetta="Ultimi 7 giorni" titolo="Dipendenti con rapportino" icon={<CalendarDays />}>
          <AreaTrend
            data={trend7gg.map((g) => ({ etichetta: g.etichetta, valore: g.count }))}
            unita="dip."
          />
        </ChartCard>

        <ChartCard etichetta="Ultimi 7 giorni" titolo="Ripartizione ore" icon={<Clock />}>
          <DonutOre ordinarie={oreOrd} straordinarie={oreStraord} viaggio={oreViaggio} />
        </ChartCard>
      </div>

      {/* ===== Riga secondaria: Anomalie + Rapportini da approvare ===== */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Pannello Anomalie (tinta amber) */}
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 shadow-soft dark:border-amber-900/40 dark:bg-amber-950/20">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 [&_svg]:h-4 [&_svg]:w-4"
              >
                <AlertTriangle />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-400">
                  Attenzione
                </p>
                <h2 className="mt-0.5 text-base font-semibold text-foreground">Anomalie</h2>
              </div>
            </div>
            {(anomalieAperte ?? 0) > 0 && (
              <span className="rounded-full bg-amber-500 px-2.5 py-0.5 font-mono text-xs font-semibold text-white">
                {anomalieAperte}
              </span>
            )}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Timbrature incomplete, straordinari e presenze anomale negli ultimi 14 giorni.
          </p>
          <div className="mt-4">
            <Button asChild variant="outline" size="sm" className="border-amber-300 bg-white hover:border-amber-400 hover:bg-amber-50 dark:bg-transparent">
              <Link href="/office/kantiere/anomalie">
                Vedi tutte le anomalie
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Ultimi rapportini da approvare */}
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-flex h-5 w-5 items-center justify-center rounded text-primary [&_svg]:h-3.5 [&_svg]:w-3.5"
              >
                <Activity />
              </span>
              <h2 className="text-sm font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Rapportini da approvare
              </h2>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/office/kantiere/rapportini">
                Vedi tutti
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>

          {ultimi.length === 0 ? (
            <div className="rounded-lg border border-border bg-card px-4 py-8 text-center shadow-soft">
              <p className="text-sm text-muted-foreground">Nessun rapportino in attesa di approvazione.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card shadow-soft">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">Dipendente</th>
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2 text-right">Azione</th>
                  </tr>
                </thead>
                <tbody>
                  {ultimi.map((r, i) => (
                    <tr
                      key={r.id}
                      className={`transition-colors hover:bg-muted/30 ${i < ultimi.length - 1 ? 'border-b border-border' : ''}`}
                    >
                      <td className="px-3 py-1.5 font-medium">
                        {dipNomiMap.get(r.dipendente_id) ?? r.dipendente_id}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">{fmtData(r.data)}</td>
                      <td className="px-3 py-1.5 text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link href="/office/kantiere/rapportini">Vedi</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ===== Accessi rapidi ===== */}
      <section>
        <div className="mb-3 flex items-center gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Sezioni
          </p>
          <div aria-hidden className="h-px flex-1 bg-gradient-to-r from-border via-border to-transparent" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { href: '/office/kantiere/cantieri', label: 'Cantieri', Icon: HardHat },
            { href: '/office/kantiere/qr', label: 'QR code', Icon: QrCode },
            { href: '/office/kantiere/rapportini', label: 'Rapportini', Icon: ClipboardList },
            { href: '/office/kantiere/dipendenti', label: 'Dipendenti', Icon: Users },
            { href: '/office/kantiere/report', label: 'Report ore', Icon: Clock },
            { href: '/office/kantiere/anomalie', label: 'Anomalie', Icon: AlertTriangle },
          ].map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card px-3 py-4 text-center shadow-soft transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-soft-md"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">
                <Icon />
              </span>
              <span className="text-xs font-medium text-foreground">{label}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ChartCard — chrome riusabile per i grafici                           */
/* ------------------------------------------------------------------ */

function ChartCard({
  etichetta,
  titolo,
  icon,
  children,
}: {
  etichetta: string;
  titolo: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="border border-border bg-card shadow-soft">
      <CardHeader className="pb-1 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
              {etichetta}
            </p>
            <CardTitle className="mt-0.5 text-base font-semibold">{titolo}</CardTitle>
          </div>
          <span
            aria-hidden
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary-soft text-primary [&_svg]:h-4 [&_svg]:w-4"
          >
            {icon}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pb-4 pt-3">{children}</CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* KpiMini — identico alla dashboard commessa                          */
/* ------------------------------------------------------------------ */

const KPI_TONE = {
  default: { bar: 'bg-primary', icon: 'bg-primary-soft text-primary', value: 'text-foreground', card: 'border-border bg-card' },
  warning: { bar: 'bg-accent', icon: 'bg-accent-soft text-accent-soft-foreground', value: 'text-foreground', card: 'border-border bg-card' },
  success: { bar: 'bg-success', icon: 'bg-success/10 text-success', value: 'text-foreground', card: 'border-border bg-card' },
  critical: { bar: 'bg-destructive', icon: 'bg-destructive/10 text-destructive', value: 'text-destructive', card: 'border-border bg-card' },
  // Ambra "pausa pranzo": richiama l'estetica gialla del resto della UI pausa
  // (pallino/icona Utensils ambra in TurniAttivi). Tinta leggera sempre attiva.
  pausa: {
    bar: 'bg-amber-500',
    icon: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    value: 'text-foreground',
    card: 'border-amber-200 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-950/20',
  },
} as const;

type KpiTone = keyof typeof KPI_TONE;

function KpiMini({
  label,
  value,
  icon,
  hint,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  hint?: string;
  tone?: KpiTone;
}) {
  const t = KPI_TONE[tone];
  return (
    <div className={`relative flex items-center gap-3 overflow-hidden rounded-lg border px-3 py-2.5 shadow-soft ${t.card}`}>
      <span aria-hidden className={`absolute inset-y-2 left-0 w-[2px] rounded-full ${t.bar}`} />
      <span
        aria-hidden
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md [&_svg]:h-4 [&_svg]:w-4 ${t.icon}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className={`font-mono text-2xl font-medium leading-none tabular-nums ${t.value}`}>
          {value}
        </p>
        <p className="mt-1 truncate text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
          {hint ? <span className="normal-case tracking-normal"> · {hint}</span> : null}
        </p>
      </div>
    </div>
  );
}

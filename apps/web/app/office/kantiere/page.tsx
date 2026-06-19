import Link from 'next/link';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { KpiCard, Button } from '@kommessa/ui';
import { fmtData } from '@/app/office/_lib/format';
import { Users, QrCode, ClipboardList, Timer, Clock, HardHat } from 'lucide-react';

export const dynamic = 'force-dynamic';

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

/** Inizio giornata odierna in Europe/Rome espresso come ISO UTC. */
function inizioOggiRome(): string {
  const oggi = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
  // Usa mezzanotte UTC del giorno Rome; approssimazione conservativa (±1h) accettabile per KPI.
  return `${oggi}T00:00:00.000Z`;
}

/** Inizio di 7 giorni fa in formato YYYY-MM-DD (per rapportini). */
function settimanaDa(): string {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(d);
}

export default async function KantierePanoramica() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  // KPI 1: dipendenti attivi
  const { count: dipendentiAttivi } = await supabase
    .from('dipendenti' as never)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenantId)
    .eq('stato_attivo', true);

  // KPI 2: QR attivi
  const { count: qrAttivi } = await supabase
    .from('cantiere_qr' as never)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenantId)
    .eq('attivo', true);

  // KPI 3: rapportini da approvare (stato = 'inviato')
  const { count: daApprovare } = await supabase
    .from('rapportini' as never)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenantId)
    .eq('stato', 'inviato');

  // KPI 4: timbrature oggi
  const { count: timbratureOggi } = await supabase
    .from('timbrature' as never)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenantId)
    .gte('ts', inizioOggiRome());

  // KPI 5: ore settimana (somma in JS su righe degli ultimi 7 giorni)
  const da7gg = settimanaDa();
  const { data: rapportiniSettimana } = (await supabase
    .from('rapportini' as never)
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .gte('data', da7gg)
    .in('stato', ['inviato', 'approvato'])
    .limit(500)) as { data: { id: string }[] | null };

  let oreSettimana = 0;
  const idsSettimana = (rapportiniSettimana ?? []).map((r) => r.id);
  if (idsSettimana.length > 0) {
    const { data: righe } = (await supabase
      .from('rapportino_righe' as never)
      .select('ore_ordinarie, ore_straordinarie, ore_viaggio')
      .in('rapportino_id', idsSettimana)) as { data: RigaOreRow[] | null };
    for (const r of righe ?? []) {
      oreSettimana += (r.ore_ordinarie ?? 0) + (r.ore_straordinarie ?? 0) + (r.ore_viaggio ?? 0);
    }
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

  const oreSettimanaDisplay = Number.isFinite(oreSettimana)
    ? oreSettimana % 1 === 0
      ? String(oreSettimana)
      : oreSettimana.toFixed(1)
    : '0';

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Kantiere — Panoramica</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Riepilogo operativo del modulo presenze e cantieri.
        </p>
      </header>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard
          label="Dipendenti attivi"
          value={dipendentiAttivi ?? 0}
          icon={<Users />}
        />
        <KpiCard
          label="QR attivi"
          value={qrAttivi ?? 0}
          icon={<QrCode />}
        />
        <KpiCard
          label="Da approvare"
          value={daApprovare ?? 0}
          tone={(daApprovare ?? 0) > 0 ? 'warning' : 'default'}
          hint="Rapportini in stato 'inviato'"
          icon={<ClipboardList />}
        />
        <KpiCard
          label="Timbrature oggi"
          value={timbratureOggi ?? 0}
          icon={<Timer />}
        />
        <KpiCard
          label="Ore settimana"
          value={oreSettimanaDisplay}
          hint="Ultimi 7 giorni (inviato + approvato)"
          icon={<Clock />}
        />
      </div>

      {/* Accessi rapidi */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-widest text-muted-foreground">
          Accessi rapidi
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/office/kantiere/qr">QR code</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/office/kantiere/cantieri">Cantieri</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/office/kantiere/rapportini">Rapportini</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/office/kantiere/dipendenti">Dipendenti</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/office/kantiere/report">Report ore</Link>
          </Button>
        </div>
      </section>

      {/* Ultimi rapportini inviati */}
      {ultimi.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-widest text-muted-foreground">
            Ultimi rapportini da approvare
          </h2>
          <div className="rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2">Dipendente</th>
                  <th className="px-4 py-2">Data</th>
                  <th className="px-4 py-2 text-right">Azione</th>
                </tr>
              </thead>
              <tbody>
                {ultimi.map((r, i) => (
                  <tr
                    key={r.id}
                    className={i < ultimi.length - 1 ? 'border-b border-border' : undefined}
                  >
                    <td className="px-4 py-2 font-medium">
                      {dipNomiMap.get(r.dipendente_id) ?? r.dipendente_id}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{fmtData(r.data)}</td>
                    <td className="px-4 py-2 text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href="/office/kantiere/rapportini">Vedi</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

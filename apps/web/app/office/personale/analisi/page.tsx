import { notFound } from 'next/navigation';
import { requireTenantContext } from '@kommessa/api/tenant';
import { createServerSupabase } from '@kommessa/api/server';
import { romeDay } from '@kommessa/api/rome-time';
import { addGiorni } from '@kommessa/api/pianificazione';
import { labelTipoPermesso } from '@kommessa/api/permessi-tipi';
import { leggiConfigDipendenti } from '../../../_lib/dipendenti-config';
import { AnalisiClient, type LatestRow, type SerieMese } from './_components/analisi-client';

export const dynamic = 'force-dynamic';

const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

export default async function AnalisiPage() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();
  const cfg = await leggiConfigDipendenti(supabase, ctx.tenantId);
  if (!cfg.ferieAttiva) notFound();

  const oggi = romeDay(new Date());
  const anno = oggi.slice(0, 4);
  const ym = oggi.slice(0, 7);
  const canDecide = ctx.role === 'admin' || ctx.role === 'office';

  const [richRes, dipRes, presRes] = await Promise.all([
    supabase
      .from('permesso_richieste' as never)
      .select(
        'id, dipendente_id, tipo, data_inizio, data_fine, tutto_il_giorno, ora_inizio, ora_fine, motivo, stato, created_at',
      )
      .eq('tenant_id', ctx.tenantId)
      .order('created_at', { ascending: false })
      .limit(600),
    supabase.from('dipendenti' as never).select('id, nome, cognome, stato_attivo').eq('tenant_id', ctx.tenantId),
    supabase
      .from('rapportini' as never)
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId)
      .gte('data', `${ym}-01`)
      .lte('data', `${ym}-31`),
  ]);

  const dipMap = new Map(
    ((dipRes.data ?? []) as unknown as { id: string; nome: string; cognome: string; stato_attivo: boolean }[]).map(
      (d) => [d.id, { nome: `${d.cognome} ${d.nome}`.trim(), attivo: d.stato_attivo }],
    ),
  );
  const dipendentiAttivi = [...dipMap.values()].filter((d) => d.attivo).length;

  const rich = (richRes.data ?? []) as unknown as Array<{
    id: string;
    dipendente_id: string;
    tipo: string;
    data_inizio: string;
    data_fine: string;
    tutto_il_giorno: boolean;
    ora_inizio: string | null;
    ora_fine: string | null;
    motivo: string | null;
    stato: string;
    created_at: string;
  }>;

  // KPI
  let inAttesa = 0;
  let approvate = 0;
  let rifiutate = 0;
  let giorniFerie = 0;
  for (const r of rich) {
    if (r.stato === 'in_attesa' || r.stato === 'modifica_richiesta') inAttesa++;
    else if (r.stato === 'approvato') approvate++;
    else if (r.stato === 'rifiutato') rifiutate++;
    if (r.stato === 'approvato' && r.tipo === 'ferie' && r.data_inizio.slice(0, 4) === anno) {
      giorniFerie += giorniTra(r.data_inizio, r.data_fine);
    }
  }

  // Per stato (donut)
  const perStato = [
    { nome: 'In attesa', valore: inAttesa, colore: '#D97706' },
    { nome: 'Approvate', valore: approvate, colore: '#059669' },
    { nome: 'Rifiutate', valore: rifiutate, colore: '#DC2626' },
  ].filter((s) => s.valore > 0);

  // Per tipo (bars) — top 8
  const perTipoMap = new Map<string, number>();
  for (const r of rich) perTipoMap.set(r.tipo, (perTipoMap.get(r.tipo) ?? 0) + 1);
  const perTipo = [...perTipoMap.entries()]
    .map(([tipo, valore]) => ({ nome: labelTipoPermesso(tipo), valore }))
    .sort((a, b) => b.valore - a.valore)
    .slice(0, 8);

  // Andamento ultimi 6 mesi (per created_at)
  const perMese: SerieMese[] = [];
  const [yy, mm] = [Number(ym.slice(0, 4)), Number(ym.slice(5, 7))];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(yy, mm - 1 - i, 1));
    const key = d.toISOString().slice(0, 7);
    const label = `${MESI[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
    perMese.push({ mese: label, key, valore: 0 });
  }
  const meseIdx = new Map(perMese.map((m, i) => [m.key, i]));
  for (const r of rich) {
    const k = r.created_at.slice(0, 7);
    const i = meseIdx.get(k);
    if (i !== undefined) perMese[i]!.valore++;
  }

  // Assenze in arrivo (approvate, data_fine >= oggi), prossime 30
  const in30 = addGiorni(oggi, 30);
  const upcoming = rich
    .filter((r) => r.stato === 'approvato' && r.data_fine >= oggi && r.data_inizio <= in30)
    .sort((a, b) => a.data_inizio.localeCompare(b.data_inizio))
    .slice(0, 10)
    .map((r) => ({
      dipendenteNome: dipMap.get(r.dipendente_id)?.nome ?? 'Dipendente',
      tipoLabel: labelTipoPermesso(r.tipo),
      dataInizio: r.data_inizio,
      dataFine: r.data_fine,
      tuttoIlGiorno: r.tutto_il_giorno,
    }));

  // Ultime richieste (6)
  const latest: LatestRow[] = rich.slice(0, 6).map((r) => ({
    id: r.id,
    dipendenteNome: dipMap.get(r.dipendente_id)?.nome ?? 'Dipendente',
    tipoLabel: labelTipoPermesso(r.tipo),
    dataInizio: r.data_inizio,
    dataFine: r.data_fine,
    tuttoIlGiorno: r.tutto_il_giorno,
    oraInizio: r.ora_inizio ? r.ora_inizio.slice(0, 5) : null,
    oraFine: r.ora_fine ? r.ora_fine.slice(0, 5) : null,
    motivo: r.motivo,
    stato: r.stato as LatestRow['stato'],
  }));

  return (
    <AnalisiClient
      kpi={{
        totale: rich.length,
        inAttesa,
        approvate,
        rifiutate,
        giorniFerie,
        presenzeMese: presRes.count ?? 0,
        dipendentiAttivi,
      }}
      perStato={perStato}
      perTipo={perTipo}
      perMese={perMese}
      upcoming={upcoming}
      latest={latest}
      canDecide={canDecide}
    />
  );
}

function giorniTra(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number) as [number, number, number];
  const [by, bm, bd] = b.split('-').map(Number) as [number, number, number];
  const da = Date.UTC(ay, am - 1, ad);
  const db = Date.UTC(by, bm - 1, bd);
  return Math.round((db - da) / 86400000) + 1;
}

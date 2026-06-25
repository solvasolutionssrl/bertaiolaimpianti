import { redirect } from 'next/navigation';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { romeDayBoundsUtc } from '@kommessa/api/rome-time';
import {
  risolviRegoleEffettive,
  calcolaCostoGiornataCond,
  eFestivo,
  giornoSettimanaISO,
  type RegolaOre,
  type RegolaAmbito,
  type RegolaCond,
} from '@kommessa/api/kantiere-costi';
import { tenantHasModule } from '@/app/_lib/modules';
import { assicuraRegoleDefault } from '@/app/office/_actions/kantiere-regole';
import { SubNav } from '../_components/sub-nav';
import { CostoCantiereClient } from './_components/costo-cantiere-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Kantiere · Costo cantiere' };

// ── Tipi righe DB (mirror di ore-costi/page.tsx) ────────────────────────────
type RegolaRow = {
  id: string;
  nome: string;
  tipo: RegolaOre['tipo'];
  attiva: boolean;
  params: Record<string, unknown> | null;
  maggiorazione_pct: number;
  priorita: number;
  giorni_settimana: number[] | null;
  ora_da: string | null;
  ora_a: string | null;
  festivo_match: 'qualsiasi' | 'solo_festivo' | 'solo_feriale';
  applica_a: 'tutte' | 'ordinario' | 'straordinario';
  a_turni: 'qualsiasi' | 'si' | 'no';
};
type AmbitoRow = { id: string; regola_id: string; tipo_target: RegolaAmbito['tipo_target']; target_id: string | null };
type DipendenteRow = { id: string; costo_orario: number | null; a_turni: boolean };
type CantiereRow = { id: string; nome: string | null; codice: string | null };
type RapportinoRow = { id: string; dipendente_id: string; data: string; stato: string };
type RigaRow = {
  rapportino_id: string;
  cantiere_id: string | null;
  ore_ordinarie: number;
  ore_straordinarie: number;
  ore_viaggio: number;
};
type SpesaRow = { cantiere_id: string | null; importo_totale: number | null };

export type CostoCantiereRiga = {
  cantiereId: string | null; // null = Da assegnare
  nome: string;
  oreLavorate: number; // ore pesate
  costoManodopera: number | null;
  totaleSpese: number;
  costoTotale: number; // manodopera (0 se null) + spese
  manodoperaMancante: boolean; // true se ci sono ore ma nessuna tariffa
};

function toYYYYMMDD(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(d);
}
function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), 1);
  return { from: toYYYYMMDD(from), to: toYYYYMMDD(to) };
}

interface PageProps {
  searchParams: { da?: string; a?: string };
}

export default async function CostoCantierePage({ searchParams }: PageProps) {
  if (!(await tenantHasModule('kantiere'))) redirect('/office');

  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  await assicuraRegoleDefault();

  const def = defaultRange();
  const from = searchParams.da ?? def.from;
  const to = searchParams.a ?? def.to;

  // ── Regole + ambiti ───────────────────────────────────────────────────────
  const { data: regoleData } = (await supabase
    .from('kantiere_regole_ore' as never)
    .select('id, nome, tipo, attiva, params, maggiorazione_pct, priorita, giorni_settimana, ora_da, ora_a, festivo_match, applica_a, a_turni')
    .eq('tenant_id', ctx.tenantId)
    .order('priorita', { ascending: false })
    .order('nome')) as { data: RegolaRow[] | null };
  const regole = regoleData ?? [];

  const { data: ambitiData } = (await supabase
    .from('kantiere_regola_ambito' as never)
    .select('id, regola_id, tipo_target, target_id')
    .eq('tenant_id', ctx.tenantId)) as { data: AmbitoRow[] | null };
  const ambiti = ambitiData ?? [];

  // ── Dipendenti (costo orario + a_turni) ───────────────────────────────────
  const { data: dipData } = (await supabase
    .from('dipendenti' as never)
    .select('id, costo_orario, a_turni')
    .eq('tenant_id', ctx.tenantId)) as { data: DipendenteRow[] | null };
  const dipendenti = dipData ?? [];
  const dipCostoMap = new Map<string, number | null>(dipendenti.map((d) => [d.id, d.costo_orario]));
  const dipATurniMap = new Map<string, boolean>(dipendenti.map((d) => [d.id, d.a_turni]));

  // ── Cantieri (nomi) ───────────────────────────────────────────────────────
  const { data: cantData } = (await supabase
    .from('cantieri' as never)
    .select('id, nome, codice')
    .eq('tenant_id', ctx.tenantId)
    .order('nome')) as { data: CantiereRow[] | null };
  const cantieri = cantData ?? [];
  const cantNomeMap = new Map<string, string>(cantieri.map((k) => [k.id, k.nome || k.codice || k.id]));

  // Regole pure (per risolviRegoleEffettive viaggio, rispetta ambiti) + condizionali.
  const regolePure: RegolaOre[] = regole.map((r) => ({
    id: r.id,
    nome: r.nome,
    tipo: r.tipo,
    attiva: r.attiva,
    params: r.params ?? {},
    maggiorazione_pct: Number(r.maggiorazione_pct),
    priorita: r.priorita,
  }));
  const ambitiPure: RegolaAmbito[] = ambiti.map((a) => ({
    regola_id: a.regola_id,
    tipo_target: a.tipo_target,
    target_id: a.target_id,
  }));
  const regoleCond: RegolaCond[] = regole
    .filter((r) => r.tipo !== 'maggiorazione_viaggio' && r.tipo !== 'soglia_giornaliera')
    .map((r) => ({
      id: r.id,
      nome: r.nome,
      attiva: r.attiva,
      maggiorazione_pct: Number(r.maggiorazione_pct),
      priorita: r.priorita,
      giorni_settimana: r.giorni_settimana,
      ora_da: r.ora_da,
      ora_a: r.ora_a,
      festivo_match: r.festivo_match,
      applica_a: r.applica_a,
      a_turni: r.a_turni,
      params: r.params ?? {},
    }));

  // ── Rapportini inviati/approvati nel range ────────────────────────────────
  const { data: rapData } = (await supabase
    .from('rapportini' as never)
    .select('id, dipendente_id, data, stato')
    .eq('tenant_id', ctx.tenantId)
    .gte('data', from)
    .lte('data', to)
    .in('stato', ['inviato', 'approvato'])
    .limit(5000)) as { data: RapportinoRow[] | null };
  const rapportini = rapData ?? [];
  const rapMeta = new Map<string, { dipendente_id: string; data: string }>(
    rapportini.map((r) => [r.id, { dipendente_id: r.dipendente_id, data: r.data }]),
  );
  const rapportinoIds = rapportini.map((r) => r.id);

  let righeData: RigaRow[] = [];
  if (rapportinoIds.length > 0) {
    const { data } = (await supabase
      .from('rapportino_righe' as never)
      .select('rapportino_id, cantiere_id, ore_ordinarie, ore_straordinarie, ore_viaggio')
      .in('rapportino_id', rapportinoIds)) as { data: RigaRow[] | null };
    // Solo le righe imputate a un cantiere (le commesse non rientrano qui).
    righeData = (data ?? []).filter((r) => r.cantiere_id != null);
  }

  // Cache % viaggio per (dipendente|cantiere) via vecchio solver (rispetta ambiti).
  const pctViaggioCache = new Map<string, number>();
  function getPctViaggio(dipendenteId: string | null, cantiereId: string | null): number {
    const key = `${dipendenteId ?? ''}|${cantiereId ?? ''}`;
    let v = pctViaggioCache.get(key);
    if (v === undefined) {
      const regEff = risolviRegoleEffettive(regolePure, ambitiPure, { dipendenteId, cantiereId });
      v = regEff.get('maggiorazione_viaggio')?.maggiorazione_pct ?? 0;
      pctViaggioCache.set(key, v);
    }
    return v;
  }

  // ── Manodopera per cantiere (stessa matematica di ore-costi, keyed by id) ──
  type LaborAcc = { ore: number; costo: number | null; haOre: boolean; tariffaPresente: boolean };
  const laborPerCantiere = new Map<string, LaborAcc>();

  for (const r of righeData) {
    const cid = r.cantiere_id as string;
    const meta = rapMeta.get(r.rapportino_id);
    const dipId = meta?.dipendente_id ?? '';
    const giorno = meta?.data ?? '';
    const festivo = giorno ? eFestivo(giorno) : false;
    const giornoSettimana = giorno ? giornoSettimanaISO(giorno) : 1;
    const aTurni = dipATurniMap.get(dipId) ?? false;
    const costoOrario = dipCostoMap.get(dipId) ?? null;

    const riga = calcolaCostoGiornataCond({
      chiaveDipendente: dipId,
      chiaveCommessa: cid,
      ore_ordinarie: Number(r.ore_ordinarie ?? 0),
      ore_straordinarie: Number(r.ore_straordinarie ?? 0),
      ore_viaggio: Number(r.ore_viaggio ?? 0),
      giornoSettimana,
      festivo,
      aTurni,
      pctViaggio: getPctViaggio(dipId, cid),
      costoOrario,
      regole: regoleCond,
    });

    const acc = laborPerCantiere.get(cid) ?? { ore: 0, costo: null, haOre: false, tariffaPresente: true };
    acc.ore = Math.round((acc.ore + riga.ore_pesate) * 100) / 100;
    if (riga.ore_pesate > 0) acc.haOre = true;
    if (riga.costo_totale != null) {
      acc.costo = Math.round(((acc.costo ?? 0) + riga.costo_totale) * 100) / 100;
    } else if (riga.ore_pesate > 0) {
      // Ore presenti ma nessuna tariffa per quel dipendente.
      acc.tariffaPresente = false;
    }
    laborPerCantiere.set(cid, acc);
  }

  // ── Spese confermate per cantiere nel range ───────────────────────────────
  let speseQuery = supabase
    .from('spese' as never)
    .select('cantiere_id, importo_totale')
    .eq('tenant_id', ctx.tenantId)
    .eq('stato', 'confermata')
    .limit(5000);
  {
    const { fromIso } = romeDayBoundsUtc(from);
    const { toIso } = romeDayBoundsUtc(to);
    speseQuery = speseQuery.gte('data_scontrino', fromIso).lt('data_scontrino', toIso);
  }
  const { data: speseData } = (await speseQuery) as { data: SpesaRow[] | null };
  const spese = speseData ?? [];

  const spesePerCantiere = new Map<string, number>(); // '' = Da assegnare
  for (const s of spese) {
    const key = s.cantiere_id ?? '';
    const prev = spesePerCantiere.get(key) ?? 0;
    spesePerCantiere.set(key, Math.round((prev + Number(s.importo_totale ?? 0)) * 100) / 100);
  }

  // ── Combina manodopera + spese in righe ───────────────────────────────────
  const tuttiId = new Set<string>();
  for (const k of laborPerCantiere.keys()) tuttiId.add(k);
  for (const k of spesePerCantiere.keys()) if (k) tuttiId.add(k);

  const righe: CostoCantiereRiga[] = [];
  for (const cid of tuttiId) {
    const lab = laborPerCantiere.get(cid);
    const spesa = Math.round((spesePerCantiere.get(cid) ?? 0) * 100) / 100;
    const oreLavorate = lab?.ore ?? 0;
    // costoManodopera: null se ci sono ore ma manca la tariffa; altrimenti il costo (può essere 0).
    const manodoperaMancante = !!lab && lab.haOre && !lab.tariffaPresente;
    const costoManodopera = manodoperaMancante ? null : lab?.costo ?? (lab?.haOre ? 0 : null);
    const costoTotale = Math.round(((costoManodopera ?? 0) + spesa) * 100) / 100;
    righe.push({
      cantiereId: cid,
      nome: cantNomeMap.get(cid) ?? 'Sconosciuto',
      oreLavorate,
      costoManodopera,
      totaleSpese: spesa,
      costoTotale,
      manodoperaMancante,
    });
  }

  // Riga "Da assegnare" per le spese senza cantiere.
  const speseSenzaCantiere = Math.round((spesePerCantiere.get('') ?? 0) * 100) / 100;
  if (speseSenzaCantiere > 0) {
    righe.push({
      cantiereId: null,
      nome: 'Da assegnare',
      oreLavorate: 0,
      costoManodopera: null,
      totaleSpese: speseSenzaCantiere,
      costoTotale: speseSenzaCantiere,
      manodoperaMancante: false,
    });
  }

  righe.sort((a, b) => b.costoTotale - a.costoTotale);

  return (
    <div className="w-full space-y-5">
      <header>
        <h1 className="text-lg font-semibold">Kontabilità</h1>
        <p className="text-sm text-muted-foreground">
          Costo per cantiere: manodopera (da rapportini) e spese, nel periodo.
        </p>
      </header>

      <SubNav />

      <CostoCantiereClient righe={righe} filtri={{ da: from, a: to }} />
    </div>
  );
}

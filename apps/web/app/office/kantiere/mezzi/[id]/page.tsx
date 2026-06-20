import { notFound, redirect } from 'next/navigation';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';
import { MezzoStoricoClient } from './_components/mezzo-storico-client';
import type { TrattaView, MezzoStorico, TotaliStorico } from './_components/mezzo-storico-client';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

type MezzoRow = {
  id: string;
  targa: string;
  modello: string | null;
  tipo: string;
};

type TrattaRow = {
  id: string;
  data: string;
  dipendente_id: string;
  direzione: 'andata' | 'ritorno';
  sede_id: string | null;
  cantiere_id: string | null;
  distanza_km: number | null;
  durata_confermata_min: number | null;
  timbratura_id: string | null;
};

type DipendenteRow = { id: string; nome: string; cognome: string };
type CantiereRow = { id: string; nome: string; codice: string | null };
type SedeRow = { id: string; nome: string };

export default async function MezzoStoricoPage({ params }: PageProps) {
  if (!(await tenantHasModule('kantiere'))) redirect('/office');

  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  // 1. Carica mezzo
  const { data: mezzoRaw } = (await supabase
    .from('mezzi' as never)
    .select('id, targa, modello, tipo')
    .eq('id', params.id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle()) as { data: MezzoRow | null };

  if (!mezzoRaw) notFound();

  const mezzo: MezzoStorico = {
    id: mezzoRaw.id,
    targa: mezzoRaw.targa,
    modello: mezzoRaw.modello,
    tipo: mezzoRaw.tipo,
  };

  // 2. Carica tratte per questo mezzo (ordine data desc)
  const { data: tratteRaw } = (await supabase
    .from('timbratura_viaggio' as never)
    .select('id, data, dipendente_id, direzione, sede_id, cantiere_id, distanza_km, durata_confermata_min, timbratura_id')
    .eq('tenant_id', ctx.tenantId)
    .eq('mezzo_id', params.id)
    .order('data', { ascending: false })
    .limit(500)) as { data: TrattaRow[] | null };

  const tratte: TrattaRow[] = tratteRaw ?? [];

  // 3. Batch-load dipendenti, cantieri, sedi
  const dipIds = [...new Set(tratte.map((t) => t.dipendente_id).filter(Boolean))];
  const cantiereIds = [...new Set(tratte.map((t) => t.cantiere_id).filter((id): id is string => id != null))];
  const sedeIds = [...new Set(tratte.map((t) => t.sede_id).filter((id): id is string => id != null))];

  const dipMap = new Map<string, string>();
  if (dipIds.length > 0) {
    const { data } = (await supabase
      .from('dipendenti' as never)
      .select('id, nome, cognome')
      .in('id', dipIds)) as { data: DipendenteRow[] | null };
    for (const d of data ?? []) {
      dipMap.set(d.id, `${d.nome} ${d.cognome}`.trim());
    }
  }

  const cantiereMap = new Map<string, string>();
  if (cantiereIds.length > 0) {
    const { data } = (await supabase
      .from('cantieri' as never)
      .select('id, nome, codice')
      .in('id', cantiereIds)) as { data: CantiereRow[] | null };
    for (const c of data ?? []) {
      cantiereMap.set(c.id, c.nome || c.codice || c.id);
    }
  }

  const sedeMap = new Map<string, string>();
  if (sedeIds.length > 0) {
    const { data } = (await supabase
      .from('sedi' as never)
      .select('id, nome')
      .in('id', sedeIds)) as { data: SedeRow[] | null };
    for (const s of data ?? []) {
      sedeMap.set(s.id, s.nome);
    }
  }

  // 4. Costruisci TrattaView[]
  const tratteView: TrattaView[] = tratte.map((t) => ({
    id: t.id,
    data: t.data,
    dipendente: dipMap.get(t.dipendente_id) ?? t.dipendente_id,
    direzione: t.direzione,
    sede: t.sede_id ? (sedeMap.get(t.sede_id) ?? null) : null,
    cantiere: t.cantiere_id ? (cantiereMap.get(t.cantiere_id) ?? null) : null,
    distanza_km: t.distanza_km ?? 0,
    durata_min: t.durata_confermata_min,
    manuale: t.timbratura_id == null,
  }));

  // 5. Totali
  const totali: TotaliStorico = tratteView.reduce(
    (acc, t) => ({
      kmTotali: acc.kmTotali + t.distanza_km,
      nViaggi: acc.nViaggi + 1,
      minutiTotali: acc.minutiTotali + (t.durata_min ?? 0),
    }),
    { kmTotali: 0, nViaggi: 0, minutiTotali: 0 },
  );

  return <MezzoStoricoClient mezzo={mezzo} tratte={tratteView} totali={totali} />;
}

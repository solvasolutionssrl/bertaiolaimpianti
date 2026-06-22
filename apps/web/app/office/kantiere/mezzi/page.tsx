import { redirect } from 'next/navigation';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';
import { MezziClient } from './_components/mezzi-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Kantiere · Parco mezzi' };

export type TipoMezzo = 'autocarro' | 'autovettura' | 'altro';

export type MezzoView = {
  id: string;
  tipo: TipoMezzo;
  targa: string;
  modello: string | null;
  attivo: boolean;
  note: string | null;
};

export type MezzoStats = {
  kmTotali: number;
  nViaggi: number;
};

type MezzoRow = {
  id: string;
  tipo: TipoMezzo;
  targa: string;
  modello: string | null;
  attivo: boolean;
  note: string | null;
};

type ViaggioAggRow = {
  mezzo_id: string;
  km_totali: number;
  n_viaggi: number;
};

export default async function MezziPage() {
  if (!(await tenantHasModule('kantiere'))) redirect('/office');

  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  const [mezziRes, viaggiRes] = await Promise.all([
    supabase
      .from('mezzi' as never)
      .select('id, tipo, targa, modello, attivo, note')
      .eq('tenant_id', ctx.tenantId)
      .order('tipo')
      .order('targa') as unknown as Promise<{ data: MezzoRow[] | null }>,
    supabase
      .from('timbratura_viaggio' as never)
      .select('mezzo_id, distanza_km')
      .eq('tenant_id', ctx.tenantId)
      .not('mezzo_id', 'is', null) as unknown as Promise<{ data: { mezzo_id: string; distanza_km: number | null }[] | null }>,
  ]);

  const mezzi: MezzoView[] = mezziRes.data ?? [];

  // Aggrega km e n. viaggi per mezzo lato server
  const statsMap = new Map<string, MezzoStats>();
  for (const v of viaggiRes.data ?? []) {
    if (!v.mezzo_id) continue;
    const cur = statsMap.get(v.mezzo_id) ?? { kmTotali: 0, nViaggi: 0 };
    cur.kmTotali += v.distanza_km ?? 0;
    cur.nViaggi += 1;
    statsMap.set(v.mezzo_id, cur);
  }

  const viaggioAgg: ViaggioAggRow[] = [...statsMap.entries()].map(([mezzo_id, s]) => ({
    mezzo_id,
    km_totali: s.kmTotali,
    n_viaggi: s.nViaggi,
  }));

  return (
    <div className="w-full space-y-5">
      <header>
        <h1 className="text-lg font-semibold">Parco mezzi</h1>
        <p className="text-sm text-muted-foreground">
          Veicoli e attrezzature aziendali disponibili per i cantieri.
        </p>
      </header>
      <MezziClient mezzi={mezzi} viaggioAgg={viaggioAgg} />
    </div>
  );
}

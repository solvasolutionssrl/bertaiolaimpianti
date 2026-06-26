import { redirect } from 'next/navigation';
import { Truck } from 'lucide-react';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { Card, CardContent, CardHeader, CardTitle } from '@kommessa/ui';
import { tenantHasModule } from '@/app/_lib/modules';
import { BarsOrizzontali } from '../_components/charts';
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
      .eq('autista', true) // solo chi ha davvero guidato il mezzo
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

  // Km per mezzo (top 8) per il grafico.
  const targaById = new Map(mezzi.map((m) => [m.id, m.targa]));
  const kmPerMezzo = viaggioAgg
    .map((v) => ({ nome: targaById.get(v.mezzo_id) ?? '—', valore: Math.round(v.km_totali) }))
    .filter((x) => x.valore > 0)
    .sort((a, b) => b.valore - a.valore)
    .slice(0, 8);

  return (
    <div className="w-full space-y-5">
      <header>
        <h1 className="text-lg font-semibold">Parco mezzi</h1>
        <p className="text-sm text-muted-foreground">
          Veicoli e attrezzature aziendali disponibili per i cantieri.
        </p>
      </header>

      {kmPerMezzo.length > 0 ? (
        <Card className="border border-border bg-card shadow-soft">
          <CardHeader className="pb-1 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                  Percorrenze
                </p>
                <CardTitle className="mt-0.5 text-base font-semibold">Km per mezzo</CardTitle>
              </div>
              <span
                aria-hidden
                className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary-soft text-primary [&_svg]:h-4 [&_svg]:w-4"
              >
                <Truck />
              </span>
            </div>
          </CardHeader>
          <CardContent className="pb-4 pt-3">
            <BarsOrizzontali data={kmPerMezzo} unita="km" colore="#D97706" />
          </CardContent>
        </Card>
      ) : null}

      <MezziClient mezzi={mezzi} viaggioAgg={viaggioAgg} />
    </div>
  );
}

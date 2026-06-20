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

type MezzoRow = {
  id: string;
  tipo: TipoMezzo;
  targa: string;
  modello: string | null;
  attivo: boolean;
  note: string | null;
};

export default async function MezziPage() {
  if (!(await tenantHasModule('kantiere'))) redirect('/office');

  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  const { data } = (await supabase
    .from('mezzi' as never)
    .select('id, tipo, targa, modello, attivo, note')
    .eq('tenant_id', ctx.tenantId)
    .order('tipo')
    .order('targa')) as { data: MezzoRow[] | null };

  const mezzi: MezzoView[] = data ?? [];

  return (
    <div className="w-full space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Parco mezzi</h1>
        <p className="text-sm text-muted-foreground">
          Veicoli e attrezzature aziendali disponibili per i cantieri.
        </p>
      </header>
      <MezziClient mezzi={mezzi} />
    </div>
  );
}

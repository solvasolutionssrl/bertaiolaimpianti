import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { SediClient } from './_components/sedi-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Kantiere · Sedi' };

export interface SedeRow {
  id: string;
  nome: string;
  tipo: 'sede_principale' | 'sede_secondaria' | 'hotel' | 'altro';
  indirizzo: string | null;
  lat: number | null;
  lng: number | null;
  is_default: boolean;
  attivo: boolean;
  note: string | null;
}

export default async function SediPage() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  const { data: raw } = await supabase
    .from('sedi' as never)
    .select('id, nome, tipo, indirizzo, lat, lng, is_default, attivo, note')
    .eq('tenant_id', ctx.tenantId)
    .order('is_default', { ascending: false })
    .order('tipo')
    .order('nome');

  const sedi: SedeRow[] = (raw ?? []) as SedeRow[];

  return (
    <div className="w-full space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Sedi</h1>
        <p className="text-sm text-muted-foreground">
          Luoghi di partenza e arrivo per i cantieri (sede aziendale, hotel, depositi, ecc.).
        </p>
      </header>
      <SediClient sedi={sedi} />
    </div>
  );
}

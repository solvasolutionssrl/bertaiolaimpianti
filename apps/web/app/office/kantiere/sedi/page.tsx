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

export interface CantiereLite {
  id: string;
  nome: string;
  codice: string | null;
  /** Codice cliente/commessa (visibile e cercabile). */
  codice_commessa: string | null;
  cliente_nome: string | null;
}

export default async function SediPage() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  const [sediRes, cantieriRes, assocRes] = await Promise.all([
    supabase
      .from('sedi' as never)
      .select('id, nome, tipo, indirizzo, lat, lng, is_default, attivo, note')
      .eq('tenant_id', ctx.tenantId)
      .order('is_default', { ascending: false })
      .order('tipo')
      .order('nome'),
    supabase
      .from('cantieri' as never)
      .select('id, nome, codice, codice_commessa, cliente_nome, stato')
      .eq('tenant_id', ctx.tenantId)
      .order('nome'),
    supabase
      .from('cantiere_sede' as never)
      .select('sede_id, cantiere_id')
      .eq('tenant_id', ctx.tenantId),
  ]);

  const sedi: SedeRow[] = (sediRes.data ?? []) as SedeRow[];

  const cantieri: CantiereLite[] = (
    (cantieriRes.data as {
      id: string;
      nome: string;
      codice: string | null;
      codice_commessa: string | null;
      cliente_nome: string | null;
      stato: string;
    }[] | null) ?? []
  )
    .filter((c) => c.stato !== 'chiuso')
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      codice: c.codice,
      codice_commessa: c.codice_commessa,
      cliente_nome: c.cliente_nome,
    }));

  // Mappa sede_id → array di cantiere_id collegati.
  const legamiPerSede: Record<string, string[]> = {};
  for (const a of (assocRes.data as { sede_id: string; cantiere_id: string }[] | null) ?? []) {
    (legamiPerSede[a.sede_id] ??= []).push(a.cantiere_id);
  }

  return (
    <div className="w-full space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Sedi</h1>
        <p className="text-sm text-muted-foreground">
          Luoghi di partenza e arrivo dei viaggi: sede aziendale, depositi e hotel della zona.
        </p>
      </header>
      <SediClient sedi={sedi} cantieri={cantieri} legamiPerSede={legamiPerSede} />
    </div>
  );
}

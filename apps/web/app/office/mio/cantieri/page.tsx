import { createServerSupabase } from '@kommessa/api/server';
import { leggiTutto, type EsitoPagina } from '@kommessa/api/pagine';
import { STATI_CANTIERE_VIVI } from '@kommessa/api/stato-lavoro';
import { requireTenantContextCached as requireTenantContext } from '@/app/_lib/tenant-cache';
import { Intestazione } from '../_components/intestazione';
import { mioDipendente } from '../_lib/me';
import { CantieriMioClient, type CantiereMioRiga } from './_components/cantieri-mio-client';

export const dynamic = 'force-dynamic';

/** I cantieri vivi del cliente, in sola lettura, con le fasi e la mia squadra. */
export default async function CantieriMioPage() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();
  const me = await mioDipendente(supabase, ctx.tenantId, ctx.userId);

  const righe = await leggiTutto<Record<string, unknown>>(
    (da, a) =>
      supabase
        .from('cantieri' as never)
        .select('id, codice, codice_commessa, nome, cliente_nome, indirizzo, categoria, stato, sottocantieri(id, stato)')
        .eq('tenant_id', ctx.tenantId)
        .in('stato', STATI_CANTIERE_VIVI as unknown as string[])
        .order('nome')
        .order('id')
        .range(da, a) as unknown as PromiseLike<EsitoPagina<Record<string, unknown>>>,
    { contesto: 'cantieri del tecnico' },
  );
  const miei = new Set<string>();
  if (me) {
    const { data } = await supabase.from('cantiere_squadra' as never).select('cantiere_id').eq('dipendente_id', me.dipendenteId);
    for (const r of (data as { cantiere_id: string }[] | null) ?? []) miei.add(r.cantiere_id);
  }
  const cantieri: CantiereMioRiga[] = righe.map((r) => {
    const fasi = (r.sottocantieri as { id: string; stato: string }[] | null) ?? [];
    return {
      id: String(r.id),
      codice: String(r.codice ?? ''),
      codice_commessa: (r.codice_commessa as string | null) ?? null,
      nome: String(r.nome ?? ''),
      cliente_nome: (r.cliente_nome as string | null) ?? null,
      categoria: (r.categoria as string | null) ?? null,
      indirizzo: (r.indirizzo as string | null) ?? null,
      stato: String(r.stato ?? 'attivo'),
      nFasi: fasi.filter((f) => f.stato === 'attivo').length,
      inSquadra: miei.has(String(r.id)),
    };
  });

  return (
    <>
      <Intestazione titolo="Cantieri" sotto="I cantieri aperti. Si apre la scheda per indirizzo, squadra e fasi." />
      <CantieriMioClient cantieri={cantieri} />
    </>
  );
}

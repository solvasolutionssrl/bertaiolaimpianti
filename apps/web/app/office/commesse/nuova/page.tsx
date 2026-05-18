import { createServerSupabase } from '@impiantixplus/api/server';
import { requireTenantContext } from '@impiantixplus/api/tenant';

import { NuovaCommessaForm, type VoceItem, type PresetItem } from './_components/form';

export const metadata = { title: 'Nuova commessa' };
export const dynamic = 'force-dynamic';

export default async function NuovaCommessaPage() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  const [voci, preset] = await Promise.all([
    supabase
      .from('voci_catalogo')
      .select('id, nome, categoria, "default", ordine_visualizzazione')
      .order('ordine_visualizzazione'),
    supabase
      .from('preset')
      .select('id, nome, voci_ids')
      .eq('tenant_id', ctx.tenantId)
      .order('nome'),
  ]);

  const vociItems: VoceItem[] = (voci.data ?? []).map((v) => ({
    id: v.id as number,
    nome: v.nome as string,
    categoria: v.categoria as string,
    default: v.default as boolean,
  }));

  const presetItems: PresetItem[] = (preset.data ?? []).map((p) => ({
    id: p.id as string,
    nome: p.nome as string,
    vociIds: Array.isArray(p.voci_ids) ? (p.voci_ids as number[]) : [],
  }));

  return (
    <div className="w-full space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
            Commesse
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Nuova commessa
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Inserisci cliente, voci e descrizione. La cartella cloud è
            mostrata come anteprima: in questa fase salviamo i metadata in
            database, la cartella fisica verrà creata quando lo storage
            cloud sarà attivato.
          </p>
        </div>
      </header>

      <NuovaCommessaForm voci={vociItems} preset={presetItems} />
    </div>
  );
}

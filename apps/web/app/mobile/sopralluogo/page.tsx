import type { Metadata } from 'next';

import { createServerSupabase } from '@impiantixplus/api/server';

import { guardMobile } from '../_lib/guard';
import { SopralluogoWizard, type ClienteOption, type VoceCatalogoOption, type PresetOption } from './wizard';

export const metadata: Metadata = {
  title: 'Nuovo sopralluogo',
};

/**
 * Sopralluogo: wizard 7 step (Flusso_Operativo.md §2).
 *  1. Anagrafica cliente (autocomplete da DB → POST creaCliente se nuovo)
 *  2. Cattura sul posto (foto/video/nota/canvas-schizzo) → upload temp
 *  3. Selezione voci (checkboxes per categoria; Sezione A pre-spuntate non disattivabili)
 *  4. Riepilogo
 *  5. Genera nome cartella (Edge Function ai-name); editabile dal capo
 *  6. Conferma → Edge Function create-commessa
 *  7. Successo: codice + path + redirect a dettaglio
 *
 * Il server fetcha qui sotto cataloghi + clienti + preset; lo step state
 * vive in un componente client.
 */
export default async function SopralluogoPage() {
  const ctx = await guardMobile();
  const supabase = createServerSupabase();

  const [{ data: clientiRaw }, { data: vociRaw }, { data: presetRaw }] = await Promise.all([
    supabase
      .from('clienti')
      .select('id, ragione_sociale, indirizzo, citta')
      .order('ragione_sociale')
      .limit(200),
    supabase
      .from('voci_catalogo')
      .select('id, nome, categoria, default, ordine_visualizzazione')
      .order('ordine_visualizzazione'),
    supabase
      .from('preset')
      .select('id, nome, voci_ids')
      .eq('tenant_id', ctx.tenantId)
      .order('nome'),
  ]);

  const clienti: ClienteOption[] = (clientiRaw ?? []).map((c) => ({
    id: c.id,
    nome: c.ragione_sociale,
    indirizzo: c.indirizzo ?? null,
    citta: c.citta ?? null,
  }));

  const voci: VoceCatalogoOption[] = (vociRaw ?? []).map((v) => ({
    id: v.id,
    nome: v.nome,
    categoria: v.categoria,
    default: v.default,
  }));

  const preset: PresetOption[] = (presetRaw ?? []).map((p) => ({
    id: p.id,
    nome: p.nome,
    vociIds: Array.isArray(p.voci_ids) ? (p.voci_ids as number[]) : [],
  }));

  return (
    <div className="flex min-h-[100dvh] flex-col gap-4 p-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Nuovo sopralluogo</h1>
        <p className="text-xs text-muted-foreground">
          7 passi · termina con la creazione automatica della commessa e della cartella.
        </p>
      </header>

      <SopralluogoWizard clienti={clienti} voci={voci} preset={preset} />
    </div>
  );
}

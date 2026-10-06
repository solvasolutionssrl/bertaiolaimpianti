import type { Metadata } from 'next';

import { createServerSupabase } from '@kommessa/api/server';

import { guardMobile } from '../_lib/guard';
import { soloMondoCommesse } from '../_lib/mondo';
import { SopralluogoWizard, type VoceCatalogoOption, type PresetOption } from './wizard';

export const metadata: Metadata = {
  title: 'Nuovo sopralluogo',
};

/**
 * Sopralluogo: wizard 7 step (Flusso_Operativo.md §2).
 *  1. Anagrafica cliente (autocomplete da DB → POST creaCliente se nuovo)
 *  2. Cattura sul posto (foto/video/nota/canvas-schizzo) → upload temp
 *  3. Selezione voci (checkboxes per categoria; Sezione A pre-spuntate non disattivabili)
 *  4. Riepilogo
 *  5. Genera nome cartella (/api/suggerisci-nome); editabile dal capo
 *  6. Conferma → action creaCommessa
 *  7. Successo: codice + path + redirect a dettaglio
 *
 * Il server fetcha qui sotto cataloghi + clienti + preset; lo step state
 * vive in un componente client.
 */
export default async function SopralluogoPage() {
  const ctx = await guardMobile();
  await soloMondoCommesse();
  const supabase = createServerSupabase();

  // L'anagrafica NON si scarica piu' qui. Prima arrivavano i primi 200
  // clienti e il filtro era in memoria nel browser: con 214 in archivio, gli
  // ultimi quattordici in ordine alfabetico non comparivano mai fra i
  // suggerimenti e si creava un doppione senza nessun segnale. Ora cerca il
  // server, su tutti.
  const [{ data: vociRaw }, { data: presetRaw }] = await Promise.all([
    supabase
      .from('voci_catalogo')
      .select('id, nome, categoria, default, ordine_visualizzazione')
      .order('ordine_visualizzazione'),
    supabase
      .from('preset')
      .select('id, nome, voci_default')
      .eq('tenant_id', ctx.tenantId)
      .order('nome'),
  ]);

  const voci: VoceCatalogoOption[] = (vociRaw ?? []).map((v) => ({
    id: v.id,
    nome: v.nome,
    categoria: v.categoria,
    default: v.default,
  }));

  const preset: PresetOption[] = (presetRaw ?? []).map((p) => ({
    id: p.id,
    nome: p.nome,
    vociIds: Array.isArray(p.voci_default) ? (p.voci_default as number[]) : [],
  }));

  return (
    <div className="flex min-h-[100dvh] flex-col gap-4 p-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Nuovo sopralluogo</h1>
        <p className="text-xs text-muted-foreground">
          Passi guidati · cliente, voci, foto/video e creazione commessa su Nextcloud.
        </p>
      </header>

      <SopralluogoWizard voci={voci} preset={preset} />
    </div>
  );
}

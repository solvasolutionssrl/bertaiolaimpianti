import type { Metadata } from 'next';

import { createServerSupabase } from '@kommessa/api/server';

import { guardMobile } from '../_lib/guard';
import { soloMondoCommesse } from '../_lib/mondo';
import { SopralluogoWizard, type VoceCatalogoOption, type PresetOption } from './wizard';
import { MobileBackButton } from '../_components/mobile-back-button';
import { possoAprireLavori } from '@/app/_lib/capacita-server';
import { CAPACITA_META } from '@kommessa/api/capacita';
import { NonAbilitato } from '../_components/non-abilitato';

/**
 * Dati dell'utente, quindi sempre freschi. Next lo dedurrebbe comunque dalla
 * lettura dei cookie, ma dichiararlo rende la regola la stessa su tutte le
 * rotte dell'app invece di dipendere da cosa capita di leggere.
 */
export const dynamic = 'force-dynamic';


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

  // Aprire un lavoro nuovo e' da capo squadra. Il tasto non si mostra a chi
  // non puo', ma l'indirizzo si puo' battere a mano: la porta si chiude anche
  // qui — con una spiegazione, non con un rimbalzo (vedi `NonAbilitato`).
  if (!(await possoAprireLavori())) {
    return (
      <NonAbilitato
        titolo="Profilo non abilitato"
        spiegazione={CAPACITA_META.capo_squadra.messaggioNegato}
      />
    );
  }
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
      {/* Senza questo tasto la pagina era un vicolo cieco: non e' un tab della
          barra in basso, e l'unica uscita era chiudere l'app o toccare un tab
          a caso. `MobileBackButton` e' il tasto canonico, ≥44px: il link
          testuale piccolo era esattamente il difetto per cui e' nato. */}
      <MobileBackButton label="Indietro" />
        <h1 className="text-xl font-semibold tracking-tight">Nuovo sopralluogo</h1>
        <p className="text-xs text-muted-foreground">
          Passi guidati · cliente, voci, foto/video e creazione commessa su Nextcloud.
        </p>
      </header>

      <SopralluogoWizard voci={voci} preset={preset} />
    </div>
  );
}

/**
 * Registro delle FUNZIONI office attivabili/disattivabili per-tenant dal super
 * admin. Modulo CLIENT-SAFE: solo dati e funzioni pure (niente `server-only`,
 * niente supabase) così può essere importato sia dal reader server sia dal tab
 * admin (client). Per aggiungere una funzione gestibile: aggiungi una voce qui
 * e leggi `tenantFeatureEnabled(key, kommessaWorld)` dove serve il gate.
 */

export type FeatureKey = 'voci_catalogo' | 'preset_lavoro';

export interface FeatureDef {
  key: FeatureKey;
  label: string;
  descrizione: string;
  /**
   * Se true, il default (senza override esplicito) segue il "mondo commesse"
   * (app_mode ≠ kantiere): attiva per Kommessa/Completa, spenta per solo-Kantiere.
   * Se false, il default è sempre attiva.
   */
  defaultKommessaOnly: boolean;
}

export const FEATURE_REGISTRY: FeatureDef[] = [
  {
    key: 'voci_catalogo',
    label: 'Voci catalogo',
    descrizione: 'Impostazioni → catalogo voci/lavori (mondo commesse).',
    defaultKommessaOnly: true,
  },
  {
    key: 'preset_lavoro',
    label: 'Preset di lavoro',
    descrizione: 'Impostazioni → combinazioni di voci riutilizzabili (mondo commesse).',
    defaultKommessaOnly: true,
  },
];

/** Default effettivo di una funzione quando non c'è override esplicito. */
export function featureDefault(def: FeatureDef, kommessaWorld: boolean): boolean {
  return def.defaultKommessaOnly ? kommessaWorld : true;
}

/**
 * Registro delle FUNZIONI office attivabili/disattivabili per-tenant dal super
 * admin. Modulo CLIENT-SAFE: solo dati e funzioni pure (niente `server-only`,
 * niente supabase) così può essere importato sia dal reader server sia dal tab
 * admin (client). Per aggiungere una funzione gestibile: aggiungi una voce qui
 * e leggi `tenantFeatureEnabled(key, kommessaWorld)` dove serve il gate.
 */

export type FeatureKey =
  | 'voci_catalogo'
  | 'preset_lavoro'
  | 'portale_clienti'
  | 'turno_tecnici';

export interface FeatureDef {
  key: FeatureKey;
  label: string;
  descrizione: string;
  /**
   * Se l'ufficio del cliente puo' accenderla da se'
   * (`/office/impostazioni/funzioni`), oltre al super admin.
   *
   * Si concede solo per cio' che riguarda **come lavora quel cliente**, non
   * per cio' che riguarda la piattaforma: il portale clienti, per esempio,
   * resta nostro perche' tocca il modello dei dati.
   */
  gestibileDaUfficio?: boolean;
  /**
   * Se true, il default (senza override esplicito) segue il "mondo commesse"
   * (app_mode ≠ kantiere): attiva per Kommessa/Completa, spenta per solo-Kantiere.
   * Se false, il default è sempre attiva.
   */
  defaultKommessaOnly: boolean;
  /** Spenta per tutti finché non la si accende a mano (funzione non finita). */
  defaultSpenta?: boolean;
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
  {
    key: 'turno_tecnici',
    label: 'Turno in cantiere',
    descrizione:
      'Il tecnico apre e chiude il turno sulla commessa dalla seconda scheda dell’app. Usata una sola volta in tutto, su un tenant di prova: nasce spenta e si accende a chi la chiede.',
    defaultKommessaOnly: true,
    defaultSpenta: true,
    gestibileDaUfficio: true,
  },
  {
    key: 'portale_clienti',
    label: 'Portale clienti',
    descrizione:
      'Accesso dei clienti finali (documenti, stato lavori, richieste). Chiuso: il portale non è finito e sul database il ruolo cliente non accede.',
    defaultKommessaOnly: true,
    defaultSpenta: true,
  },
];

/** Default effettivo di una funzione quando non c'è override esplicito. */
export function featureDefault(def: FeatureDef, kommessaWorld: boolean): boolean {
  if (def.defaultSpenta) return false;
  return def.defaultKommessaOnly ? kommessaWorld : true;
}

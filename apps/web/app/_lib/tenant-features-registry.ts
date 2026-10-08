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
  | 'turno_tecnici'
  | 'scadenza_password';

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
    key: 'scadenza_password',
    label: 'Password a scadenza',
    descrizione:
      'La password scade quattro volte l’anno (10 dicembre, marzo, giugno, settembre): dal primo del mese si avvisa, dal giorno della scadenza non si passa finché non si cambia.',
    // ⚠️ **Nasce spenta, e non e' prudenza generica.** Le date le ha scelte un
    // cliente; il muro lo prendono le persone. Acceso per tutti, il 10 dicembre
    // trentacinque tecnici di un'altra azienda si troverebbero bloccati davanti
    // a un QR in cantiere, per una regola che nessuno gli ha annunciato — e per
    // chi timbra significa non poter lavorare. Si accende a chi la chiede, dopo
    // che l'ha detto alla sua gente.
    defaultKommessaOnly: false,
    defaultSpenta: true,
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

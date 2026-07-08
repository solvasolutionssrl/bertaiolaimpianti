/**
 * Catalogo tipi di ferie/permesso (Fase 2 modulo Dipendenti).
 *
 * Set v1 per PMI impiantistica (i più usati), derivato dalla ricerca normativa
 * italiana in `documentazione_generale/08_LOGICHE/Permessi_Ferie_Normativa_IT.md`.
 * Puro: importabile da server e client. Append-only (aggiungere tipi non rompe
 * i dati esistenti: lo slug è salvato in `permesso_richieste.tipo`).
 */

export type UnitaPermesso = 'giorni' | 'ore' | 'entrambi';
export type Retribuito = 'azienda' | 'inps' | 'inail' | 'parziale' | 'no';

export interface TipoPermesso {
  codice: string;
  label: string;
  /** Unità tipica: giorni interi, a ore, o scelta libera. Guida la UI. */
  unita: UnitaPermesso;
  retribuito: Retribuito;
  /** Serve un giustificativo (certificato/attestazione). */
  richiedeGiustificativo: boolean;
  /** Descrizione breve (a cosa serve). */
  descrizione: string;
  /** Riferimento normativo/contrattuale sintetico. */
  riferimento: string;
}

export const PERMESSO_TIPI: TipoPermesso[] = [
  { codice: 'ferie', label: 'Ferie', unita: 'giorni', retribuito: 'azienda', richiedeGiustificativo: false, descrizione: 'Riposo annuale retribuito.', riferimento: 'CCNL Metalmeccanico: 4 settimane/anno (~160 h), ratei mensili.' },
  { codice: 'rol', label: 'Permessi ROL', unita: 'ore', retribuito: 'azienda', richiedeGiustificativo: false, descrizione: 'Riduzione orario di lavoro: monte ore individuale di permessi.', riferimento: 'CCNL Metalmeccanico: 72 h/anno (~6 h/mese).' },
  { codice: 'par_ex_festivita', label: 'Ex-festività (PAR)', unita: 'ore', retribuito: 'azienda', richiedeGiustificativo: false, descrizione: 'Ore sostitutive delle festività soppresse.', riferimento: 'CCNL Metalmeccanico: 32 h/anno (4 giorni).' },
  { codice: 'permesso_retribuito', label: 'Permesso retribuito', unita: 'ore', retribuito: 'azienda', richiedeGiustificativo: false, descrizione: 'Permesso a ore per motivi previsti da legge o CCNL.', riferimento: 'CCNL / accordi aziendali.' },
  { codice: 'permesso_non_retribuito', label: 'Permesso non retribuito', unita: 'entrambi', retribuito: 'no', richiedeGiustificativo: false, descrizione: 'Assenza breve autorizzata senza retribuzione.', riferimento: 'Autorizzazione del datore (trattenuta in busta).' },
  { codice: 'malattia', label: 'Malattia', unita: 'giorni', retribuito: 'inps', richiedeGiustificativo: true, descrizione: 'Assenza per patologia non professionale.', riferimento: 'INPS + integrazione CCNL; certificato telematico; periodo di comporto.' },
  { codice: 'infortunio', label: 'Infortunio', unita: 'giorni', retribuito: 'inail', richiedeGiustificativo: true, descrizione: 'Infortunio sul lavoro o malattia professionale.', riferimento: 'INAIL (60% dal 4° gg, 75% dopo il 90°); denuncia del datore obbligatoria.' },
  { codice: 'visita_medica', label: 'Visita medica', unita: 'ore', retribuito: 'azienda', richiedeGiustificativo: true, descrizione: 'Visita, esame o prestazione specialistica.', riferimento: 'Trattamento malattia oraria o imputazione a ROL/permesso (configurabile).' },
  { codice: 'permesso_104', label: 'Permesso Legge 104', unita: 'entrambi', retribuito: 'inps', richiedeGiustificativo: true, descrizione: 'Assistenza a familiare con disabilità grave (o lavoratore stesso).', riferimento: 'L. 104/1992 art. 3 c. 3: 3 giorni/mese oppure 2 h/giorno (INPS).' },
  { codice: 'lutto', label: 'Lutto', unita: 'giorni', retribuito: 'azienda', richiedeGiustificativo: true, descrizione: 'Decesso o grave infermità di coniuge/parente entro il 2° grado.', riferimento: 'Art. 4 L. 53/2000: 3 giorni/anno.' },
  { codice: 'congedo_matrimoniale', label: 'Congedo matrimoniale', unita: 'giorni', retribuito: 'azienda', richiedeGiustificativo: true, descrizione: 'Assenza per matrimonio o unione civile.', riferimento: 'CCNL Metalmeccanico: 15 giorni consecutivi.' },
  { codice: 'donazione_sangue', label: 'Donazione sangue', unita: 'giorni', retribuito: 'inps', richiedeGiustificativo: true, descrizione: 'Astensione per la giornata della donazione.', riferimento: 'L. 584/1967: 1 giorno (INPS), certificazione del centro trasfusionale.' },
  { codice: 'paternita_obbligatoria', label: 'Congedo di paternità', unita: 'giorni', retribuito: 'inps', richiedeGiustificativo: true, descrizione: 'Congedo obbligatorio del padre per la nascita.', riferimento: 'D.Lgs 151/2001: 10 giorni (INPS 100%).' },
  { codice: 'maternita_obbligatoria', label: 'Congedo di maternità', unita: 'giorni', retribuito: 'inps', richiedeGiustificativo: true, descrizione: 'Astensione obbligatoria pre e post parto.', riferimento: 'D.Lgs 151/2001: ~5 mesi (INPS 80% + integrazione CCNL).' },
  { codice: 'congedo_parentale', label: 'Congedo parentale', unita: 'entrambi', retribuito: 'parziale', richiedeGiustificativo: true, descrizione: 'Astensione facoltativa per cura del figlio.', riferimento: 'D.Lgs 151/2001: fino a 14 anni del figlio; quote 80%/30% (INPS).' },
  { codice: 'permesso_elettorale', label: 'Permesso elettorale', unita: 'giorni', retribuito: 'azienda', richiedeGiustificativo: true, descrizione: 'Componente di seggio (presidente, scrutatore, rappresentante).', riferimento: 'L. 53/1990: durata delle operazioni (a carico azienda).' },
];

export const RETRIBUITO_LABEL: Record<Retribuito, string> = {
  azienda: 'Retribuito (azienda)',
  inps: 'Retribuito (INPS)',
  inail: 'Retribuito (INAIL)',
  parziale: 'Parzialmente retribuito',
  no: 'Non retribuito',
};

export const UNITA_LABEL: Record<UnitaPermesso, string> = {
  giorni: 'Giorni',
  ore: 'Ore',
  entrambi: 'Giorni o ore',
};

const PER_CODICE = new Map(PERMESSO_TIPI.map((t) => [t.codice, t]));

export function tipoPermesso(codice: string): TipoPermesso | undefined {
  return PER_CODICE.get(codice);
}

export function labelTipoPermesso(codice: string): string {
  return PER_CODICE.get(codice)?.label ?? codice;
}

export const CODICI_PERMESSO = PERMESSO_TIPI.map((t) => t.codice);

export const LABEL_STATO_PERMESSO: Record<string, string> = {
  in_attesa: 'In attesa',
  approvato: 'Approvato',
  rifiutato: 'Rifiutato',
  modifica_richiesta: 'Modifica richiesta',
};

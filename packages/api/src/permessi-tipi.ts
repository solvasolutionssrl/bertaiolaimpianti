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
  /** Fonte esterna consultabile (URL istituzionale o guida attendibile). */
  fonte: string;
}

export const PERMESSO_TIPI: TipoPermesso[] = [
  { codice: 'ferie', label: 'Ferie', unita: 'giorni', retribuito: 'azienda', richiedeGiustificativo: false, descrizione: 'Riposo annuale retribuito.', riferimento: 'CCNL Metalmeccanico: 4 settimane/anno (~160 h), ratei mensili.', fonte: 'https://www.lexplain.it/ferie-contratto-metalmeccanici-industria-guida/' },
  { codice: 'rol', label: 'Permessi ROL', unita: 'ore', retribuito: 'azienda', richiedeGiustificativo: false, descrizione: 'Riduzione orario di lavoro: monte ore individuale di permessi.', riferimento: 'CCNL Metalmeccanico: 72 h/anno (~6 h/mese).', fonte: 'https://www.lexplain.it/permessi-par-e-rol-metalmeccanici-fino-a-104-ore-retribuite-compreso-ex-festivita/' },
  { codice: 'par_ex_festivita', label: 'Ex-festività (PAR)', unita: 'ore', retribuito: 'azienda', richiedeGiustificativo: false, descrizione: 'Ore sostitutive delle festività soppresse.', riferimento: 'CCNL Metalmeccanico: 32 h/anno (4 giorni).', fonte: 'https://www.lexplain.it/permessi-par-e-rol-metalmeccanici-fino-a-104-ore-retribuite-compreso-ex-festivita/' },
  { codice: 'permesso_retribuito', label: 'Permesso retribuito', unita: 'ore', retribuito: 'azienda', richiedeGiustificativo: false, descrizione: 'Permesso a ore per motivi previsti da legge o CCNL.', riferimento: 'CCNL / accordi aziendali.', fonte: 'https://www.lavoroediritti.com/abclavoro/permessi-retribuiti-quali-sono' },
  { codice: 'permesso_non_retribuito', label: 'Permesso non retribuito', unita: 'entrambi', retribuito: 'no', richiedeGiustificativo: false, descrizione: 'Assenza breve autorizzata senza retribuzione.', riferimento: 'Autorizzazione del datore (trattenuta in busta).', fonte: 'https://www.lavoroediritti.com/abclavoro/permessi-non-retribuiti' },
  { codice: 'malattia', label: 'Malattia', unita: 'giorni', retribuito: 'inps', richiedeGiustificativo: true, descrizione: 'Assenza per patologia non professionale.', riferimento: 'INPS + integrazione CCNL; certificato telematico; periodo di comporto.', fonte: 'https://www.inps.it/it/it/dettaglio-scheda.schede-servizio-strumento.schede-servizi.certificati-di-malattia-telematici-50117.certificati-di-malattia-telematici.html' },
  { codice: 'infortunio', label: 'Infortunio', unita: 'giorni', retribuito: 'inail', richiedeGiustificativo: true, descrizione: 'Infortunio sul lavoro o malattia professionale.', riferimento: 'INAIL (60% dal 4° gg, 75% dopo il 90°); denuncia del datore obbligatoria.', fonte: 'https://www.inail.it/portale/it/inail-comunica/lista-notizie/detail-notizie/infortunio-sul-lavoro.html' },
  { codice: 'visita_medica', label: 'Visita medica', unita: 'ore', retribuito: 'azienda', richiedeGiustificativo: true, descrizione: 'Visita, esame o prestazione specialistica.', riferimento: 'Trattamento malattia oraria o imputazione a ROL/permesso (configurabile).', fonte: 'https://www.lavoroediritti.com/abclavoro/permesso-visita-medica' },
  { codice: 'permesso_104', label: 'Permesso Legge 104', unita: 'entrambi', retribuito: 'inps', richiedeGiustificativo: true, descrizione: 'Assistenza a familiare con disabilità grave (o lavoratore stesso).', riferimento: 'L. 104/1992 art. 3 c. 3: 3 giorni/mese oppure 2 h/giorno (INPS).', fonte: 'https://www.inps.it/it/it/dettaglio-scheda.it.schede-servizio-strumento.schede-servizi.50098.indennit-per-permessi-fruiti-dai-lavoratori-per-assistere-familiari-disabili-in-situazione-di-gravit-o-fruiti-dai-lavoratori-disabili.html' },
  { codice: 'lutto', label: 'Lutto', unita: 'giorni', retribuito: 'azienda', richiedeGiustificativo: true, descrizione: 'Decesso o grave infermità di coniuge/parente entro il 2° grado.', riferimento: 'Art. 4 L. 53/2000: 3 giorni/anno.', fonte: 'https://www.fitcisl.org/documenti/permessi-e-congedi-per-motivi-personali-ex-art-4-legge-53-2000/' },
  { codice: 'congedo_matrimoniale', label: 'Congedo matrimoniale', unita: 'giorni', retribuito: 'azienda', richiedeGiustificativo: true, descrizione: 'Assenza per matrimonio o unione civile.', riferimento: 'CCNL Metalmeccanico: 15 giorni consecutivi.', fonte: 'https://www.lavoroediritti.com/abclavoro/congedo-matrimoniale' },
  { codice: 'donazione_sangue', label: 'Donazione sangue', unita: 'giorni', retribuito: 'inps', richiedeGiustificativo: true, descrizione: 'Astensione per la giornata della donazione.', riferimento: 'L. 584/1967: 1 giorno (INPS), certificazione del centro trasfusionale.', fonte: 'https://www.wikilabour.it/dizionario/congedi-permessi-ferie-festivita/permessi-per-donatori-di-sangue-e-midollo-osseo/' },
  { codice: 'paternita_obbligatoria', label: 'Congedo di paternità', unita: 'giorni', retribuito: 'inps', richiedeGiustificativo: true, descrizione: 'Congedo obbligatorio del padre per la nascita.', riferimento: 'D.Lgs 151/2001: 10 giorni (INPS 100%).', fonte: 'https://www.inps.it/it/it/dettaglio-scheda.it.schede-servizio-strumento.schede-servizi.congedo-di-paternit-obbligatorio-58988.congedo-di-paternit-obbligatorio.html' },
  { codice: 'maternita_obbligatoria', label: 'Congedo di maternità', unita: 'giorni', retribuito: 'inps', richiedeGiustificativo: true, descrizione: 'Astensione obbligatoria pre e post parto.', riferimento: 'D.Lgs 151/2001: ~5 mesi (INPS 80% + integrazione CCNL).', fonte: 'https://www.inps.it/it/it/dati-e-bilanci/attivit--di-ricerca/collaborazioni-e-partnership/maternit--obbligatoria.html' },
  { codice: 'congedo_parentale', label: 'Congedo parentale', unita: 'entrambi', retribuito: 'parziale', richiedeGiustificativo: true, descrizione: 'Astensione facoltativa per cura del figlio.', riferimento: 'D.Lgs 151/2001: fino a 14 anni del figlio; quote 80%/30% (INPS).', fonte: 'https://www.inps.it/it/it/dettaglio-scheda.it.schede-servizio-strumento.schede-servizi.50583.indennit-di-congedo-parentale-per-lavoratrici-e-lavoratori-dipendenti.html' },
  { codice: 'permesso_elettorale', label: 'Permesso elettorale', unita: 'giorni', retribuito: 'azienda', richiedeGiustificativo: true, descrizione: 'Componente di seggio (presidente, scrutatore, rappresentante).', riferimento: 'L. 53/1990: durata delle operazioni (a carico azienda).', fonte: 'https://www.fiscoetasse.com/approfondimenti/12837-permessi-elettorali-2024-regole-assenze-diritti-e-doveri.html' },
];

/**
 * Selezione di default dei tipi mostrati ai dipendenti nel form di richiesta
 * (i più comuni in una PMI impiantistica). Gli altri restano nel catalogo e
 * l'ufficio può attivarli dalla gestione (config `permesso_tipi_attivi`).
 */
export const PERMESSO_TIPI_DEFAULT_ATTIVI: string[] = [
  'ferie',
  'rol',
  'par_ex_festivita',
  'permesso_non_retribuito',
  'malattia',
  'visita_medica',
  'permesso_104',
  'lutto',
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

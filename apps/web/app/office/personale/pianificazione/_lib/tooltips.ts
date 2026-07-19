/**
 * Testi dei tooltip (attributo `title`) della Pianificazione — UN SOLO POSTO.
 *
 * ⚠️ Regola di manutenzione: se cambi il comportamento di un controllo o di un
 * gesto, aggiorna qui il testo corrispondente (non nei componenti). Così i
 * suggerimenti restano coerenti col funzionamento reale nel tempo.
 * Usati in: pianificazione-client (header, toolbar, griglia, chip), export-menu,
 * gruppo-filter.
 */
export const TIP = {
  // Navigazione settimana
  settimanaPrec: 'Settimana precedente',
  oggi: 'Vai alla settimana corrente',
  settimanaSucc: 'Settimana successiva',
  // Azioni
  pubblica: 'Pubblica la settimana e avvisa i tecnici coinvolti',
  copiaPrecedente: 'Copia i blocchi della settimana precedente (come bozza)',
  salvaBozza: 'La pianificazione si salva da sola: questo conferma il salvataggio',
  nuovoBlocco: 'Crea un nuovo blocco di pianificazione',
  esportaPdf: 'Esporta la settimana in PDF (sempre disponibile, anche in bozza)',
  altreAzioni: 'Altre azioni',
  // Vista e filtri
  vistaPiano: 'Vista pianificazione settimanale',
  vistaFerie: 'Mostra solo ferie e permessi della settimana',
  filtroGruppi: 'Filtra per gruppo lavoro (reparto)',
  soloTurni: 'Mostra solo i dipendenti a turni',
  cercaDip: 'Cerca un dipendente per nome o mansione',
  // Griglia / card
  aggiungiCella: 'Aggiungi un blocco in questo giorno',
  chipAzioni: 'Clic per aprire · tieni premuto per spostare',
  resizeSquadra: 'Trascina per estendere l’intera squadra sui giorni successivi',
  resizeSingolo: 'Trascina per estendere sui giorni successivi',
  singolo: 'Tecnico singolo',
  squadra: (n: number) => `Squadra di ${n} ${n === 1 ? 'persona' : 'persone'}`,
} as const;

/**
 * Messaggio UTENTE quando le funzioni AI (OpenAI) non sono disponibili
 * (crediti esauriti, chiave, OpenAI down, rete). Generico di proposito: il
 * motivo tecnico NON deve mai arrivare all'utente. Il super admin viene
 * avvisato a parte (`_lib/ai-alert`). Modulo client-safe (niente server-only).
 */
export const MSG_AI_NON_DISPONIBILE =
  'Funzioni AI non disponibili al momento, riprova più tardi.';

/** Codice macchina restituito dalle API quando l'AI è non disponibile. */
export const CODE_AI_NON_DISPONIBILE = 'AI_NON_DISPONIBILE';

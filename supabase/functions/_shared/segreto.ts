// =====================================================================
// _shared/segreto.ts — confronto a tempo costante dei segreti condivisi.
//
// Le funzioni con `verify_jwt = false` (notify-event, onboard-tenant,
// inbound-email) hanno il segreto come UNICA difesa: il gateway Supabase
// non controlla nessun JWT prima di farle partire. Un `===` fra stringhe
// si ferma al primo carattere diverso, quindi il tempo di risposta
// racconta quanti caratteri del segreto sono gia' indovinati.
//
// Stessa regola del lato Next (`apps/web/app/_lib/segreto.ts`), che qui
// non si puo' importare perche' gira su Deno: mai `===` su un segreto.
// =====================================================================

const enc = new TextEncoder();

/**
 * Confronto a tempo costante fra il segreto ricevuto e quello atteso.
 * Senza segreto configurato non passa nessuno: fallisce chiusa.
 */
export function segretoValido(
  ricevuto: string | null | undefined,
  atteso: string | null | undefined,
): boolean {
  if (!atteso || !ricevuto) return false;
  const a = enc.encode(ricevuto);
  const b = enc.encode(atteso);
  // La lunghezza non e' l'informazione da proteggere: quella che non deve
  // trapelare e' QUANTI caratteri iniziali sono giusti. A lunghezze diverse
  // si esce subito; a parita' di lunghezza si confrontano tutti i byte,
  // anche dopo aver gia' trovato una differenza.
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

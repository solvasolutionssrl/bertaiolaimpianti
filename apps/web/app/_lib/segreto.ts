import 'server-only';

import { timingSafeEqual } from 'node:crypto';

/**
 * Confronto a tempo costante fra un segreto ricevuto e quello atteso. Un `===`
 * sulle stringhe si ferma al primo carattere diverso e lascia misurare quanto
 * del segreto e' giusto. Senza segreto configurato non passa nessuno.
 */
export function segretoValido(
  ricevuto: string | null | undefined,
  atteso: string | null | undefined,
): boolean {
  if (!atteso || !ricevuto) return false;
  const a = Buffer.from(ricevuto);
  const b = Buffer.from(atteso);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** `Authorization: Bearer <segreto>`, confrontato a tempo costante. */
export function bearerValido(request: Request, atteso: string | null | undefined): boolean {
  const header = request.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') && segretoValido(header.slice('Bearer '.length), atteso);
}

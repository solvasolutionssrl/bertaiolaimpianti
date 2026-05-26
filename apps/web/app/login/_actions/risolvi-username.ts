'use server';

import { createServiceSupabase } from '@kommessa/api/service';

/**
 * Risolve un input di login a un'email completa.
 *
 * Logica:
 *  - Se l'input contiene `@`, è già un'email completa → ritornata
 *    invariata (l'utente sa cosa scrive, può essere `dev@solva.it`,
 *    `mario@kommessa.solva.it`, o un'email sintetica completa).
 *  - Altrimenti è uno username "nudo" tipo `tecnico` o `mario`. Cerchiamo
 *    in auth.users un account con email che matcha
 *    `^<username>@<tenant-slug>.kommessa.local$` (pattern degli account
 *    creati manualmente dal super-admin con creaUtenteManuale).
 *
 * Risultato:
 *  - { ok: true, email: '<completa>' } se troviamo 1 match univoco
 *  - { ok: false, error: 'ambiguous' } se ne troviamo 2+ (servirà
 *    digitare l'email completa per scegliere)
 *  - { ok: false, error: 'not_found' } se 0 match
 *
 * Sicurezza: chiamato da pre-login senza sessione attiva. NON espone
 * l'email completa nella risposta se non è esattamente 1 match — non
 * vogliamo trasformare il login form in un'oracle che enumera utenti
 * (mitigazione: il "not_found" è indistinguibile da "ambiguous" lato
 * client → entrambi mostrano "Username non valido o ambiguo").
 *
 * Performance: per i pilota typical ~5-50 utenti per tenant — il listUsers
 * paginato in 1000 basta. Per scaling: aggiungere indice email su una
 * VIEW filtrata o cache.
 */

export async function risolviUsernameLogin(
  input: string,
): Promise<
  | { ok: true; email: string }
  | { ok: false; error: 'not_found' | 'ambiguous' | 'invalid' }
> {
  const raw = String(input ?? '').trim();
  if (!raw) return { ok: false, error: 'invalid' };

  // Se contiene @ è già un'email — bypass diretto.
  if (raw.includes('@')) {
    return { ok: true, email: raw };
  }

  // Validazione username: stesse regole di creaUtenteManuale
  if (!/^[a-z0-9._-]{2,40}$/i.test(raw)) {
    return { ok: false, error: 'invalid' };
  }

  const username = raw.toLowerCase();
  const pattern = new RegExp(`^${escapeRegex(username)}@[^@]+\\.kommessa\\.local$`);

  const service = createServiceSupabase();

  // Scan paginato — primo match wins. In tenant pilota tipicamente
  // l'utente è nella prima pagina.
  let page = 1;
  const perPage = 200;
  const matches: string[] = [];
  while (page <= 25 /* hard cap 5k utenti, oltre serve indice */) {
    const { data, error } = await service.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) return { ok: false, error: 'invalid' };
    const users = data?.users ?? [];
    for (const u of users) {
      const email = (u.email ?? '').toLowerCase();
      if (pattern.test(email)) {
        matches.push(email);
        if (matches.length > 1) break; // ambiguity → return early
      }
    }
    if (matches.length > 1) break;
    if (users.length < perPage) break; // ultima pagina
    page += 1;
  }

  if (matches.length === 0) return { ok: false, error: 'not_found' };
  if (matches.length > 1) return { ok: false, error: 'ambiguous' };
  return { ok: true, email: matches[0]! };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

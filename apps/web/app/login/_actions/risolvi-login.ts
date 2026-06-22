'use server';

import { createServiceSupabase } from '@kommessa/api/service';

/**
 * Risolve i campi del login (codice azienda + username) all'email completa
 * con cui autenticare su Supabase.
 *
 * Login a 3 campi (codice azienda · username · password). Il codice azienda
 * disambigua username condivisi tra tenant diversi in modo DETERMINISTICO
 * (niente più scan di tutti gli utenti).
 *
 * Logica:
 *  1. `identita` contiene `@` → è già un'email completa (es. owner reali,
 *     `p.franchini@fpmimpianti.it`) → usata così com'è, codice ignorato.
 *  2. codice vuoto → tenant con `login_senza_codice=true` (Bertaiola):
 *     retrocompatibilità, gli utenti storici non si accorgono del nuovo campo.
 *  3. codice valorizzato → tenant con `codice_azienda = codice` (citext,
 *     case-insensitive).
 *  → email sintetica = `${username}@${slug.toLowerCase()}.kommessa.local`.
 *
 * Sicurezza: errori generici, nessuna enumerazione utenti.
 */
export async function risolviLogin(input: {
  codice?: string;
  identita: string;
}): Promise<
  | { ok: true; email: string }
  | { ok: false; error: 'codice_non_valido' | 'non_valido' }
> {
  const identita = String(input?.identita ?? '').trim();
  if (!identita) return { ok: false, error: 'non_valido' };

  // 1) email completa → bypass
  if (identita.includes('@')) {
    return { ok: true, email: identita.toLowerCase() };
  }

  // username "nudo": stesse regole di creaUtenteManuale
  if (!/^[a-z0-9._-]{2,40}$/i.test(identita)) {
    return { ok: false, error: 'non_valido' };
  }
  const username = identita.toLowerCase();
  const codice = String(input?.codice ?? '').trim();

  const svc = createServiceSupabase();
  let slug: string | null = null;

  if (!codice) {
    // 2) tenant di default per il login senza codice
    const { data } = await svc
      .from('tenants' as never)
      .select('slug')
      .eq('login_senza_codice', true)
      .maybeSingle();
    slug = (data as { slug: string } | null)?.slug ?? null;
    if (!slug) return { ok: false, error: 'non_valido' };
  } else {
    // 3) tenant per codice azienda (citext: case-insensitive)
    const { data } = await svc
      .from('tenants' as never)
      .select('slug')
      .eq('codice_azienda', codice)
      .maybeSingle();
    slug = (data as { slug: string } | null)?.slug ?? null;
    if (!slug) return { ok: false, error: 'codice_non_valido' };
  }

  return { ok: true, email: `${username}@${slug.toLowerCase()}.kommessa.local` };
}

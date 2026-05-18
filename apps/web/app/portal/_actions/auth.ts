'use server';

import { headers } from 'next/headers';
import { z } from 'zod';

import { createServerSupabase } from '@impiantixplus/api/server';

const emailSchema = z
  .string()
  .trim()
  .email('Inserisci un indirizzo email valido');

export interface InviaMagicLinkResult {
  ok: boolean;
  message: string;
}

/**
 * Server Action: invia un magic-link al cliente finale.
 *
 * - **Mai password**: il portale supporta solo OTP via email.
 * - Non rivela se l'email è registrata o no (anti-enumeration): risponde
 *   sempre con messaggio generico "Controlla la tua casella". L'effettiva
 *   appartenenza all'`external_users` viene validata al callback.
 * - `emailRedirectTo` torna sull'host corrente (`cliente.<tenant>.it`),
 *   sul path `/auth/callback` che chiude la sessione e redirige al portale.
 */
export async function inviaMagicLink(
  _prev: InviaMagicLinkResult | null,
  formData: FormData,
): Promise<InviaMagicLinkResult> {
  const rawEmail = formData.get('email');
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? 'Email non valida',
    };
  }
  const email = parsed.data.toLowerCase();

  const hdrs = headers();
  const host = hdrs.get('host') ?? '';
  const proto =
    hdrs.get('x-forwarded-proto') ??
    (host.includes('localhost') ? 'http' : 'https');
  const origin = `${proto}://${host}`;
  const emailRedirectTo = `${origin}/auth/callback?next=/`;

  const supabase = createServerSupabase();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo,
      // Non vogliamo creare nuovi utenti dal portale: i clienti devono essere
      // pre-registrati in `external_users` dall'ufficio. Se l'email non
      // esiste, Supabase semplicemente non invia (e noi non riveliamo).
      shouldCreateUser: false,
    },
  });

  if (error) {
    // Log lato server, ma rispondiamo comunque generico al cliente.
    console.error('[portal/inviaMagicLink]', error.message);
  }

  return {
    ok: true,
    message:
      'Se l\'email è registrata, riceverai a breve un link per accedere. Controlla la tua casella (anche lo spam).',
  };
}

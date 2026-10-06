'use server';

import { cookies } from 'next/headers';

import { BACHECA_GIORNI_SESSIONE } from '@kommessa/api/bacheca';

import {
  BACHECA_COOKIE,
  leggiBachecaDaToken,
  provaPasswordBacheca,
} from '@/app/_lib/bacheca-server';

/**
 * Entrare nella bacheca con la password.
 *
 * Il cookie è `httpOnly` e dura trenta giorni: una televisione che chiede la
 * password ogni mattina viene spenta. Il nome del cookie contiene il token, in
 * modo che un ufficio con due bacheche (improbabile, ma non impossibile) non se
 * le sovrascriva a vicenda.
 */
export async function entraNellaBacheca(input: {
  token: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; errore: string }> {
  const token = String(input?.token ?? '');
  const bacheca = await leggiBachecaDaToken(token);
  // Stesso messaggio per «non esiste» e «password sbagliata»: dire che un
  // indirizzo esiste racconta a chi li prova quali sono quelli buoni.
  if (!bacheca) return { ok: false, errore: 'Password sbagliata.' };

  const esito = await provaPasswordBacheca(bacheca, String(input?.password ?? ''));
  if (!esito.ok) return { ok: false, errore: esito.motivo };

  cookies().set(`${BACHECA_COOKIE}_${token.slice(0, 8)}`, esito.cookie, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: `/tv/${token}`,
    maxAge: BACHECA_GIORNI_SESSIONE * 24 * 60 * 60,
  });
  return { ok: true };
}

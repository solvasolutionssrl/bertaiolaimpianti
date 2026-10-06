import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

import { createServiceSupabase } from '@kommessa/api/service';
import { BYTE_TOKEN, linkApribile } from '@kommessa/api/link-pubblico';

/**
 * Il lato server dei link pubblici: generare il token, risolverlo, contare le
 * aperture.
 *
 * Stesso criterio dei token del comando iOS (`_lib/api-token.ts`): in tabella
 * finisce **solo lo SHA-256**. Il valore in chiaro esiste una volta sola, nella
 * risposta che lo crea; chi legge il database non ottiene link funzionanti.
 *
 * ⚠️ Tutto qui dentro gira con il **service role**, e non è una scorciatoia: la
 * pagina pubblica non ha nessuna sessione da cui derivare un tenant, quindi non
 * esiste un client dell'utente da usare. Per questo la tabella non ha nessuna
 * policy permissiva — vedi la migration `20261006110000`.
 */

/** Il token in chiaro. Da mostrare una volta e mai più. */
export function generaToken(): string {
  return randomBytes(BYTE_TOKEN).toString('base64url');
}

export function hashToken(inChiaro: string): string {
  return createHash('sha256').update(inChiaro.trim()).digest('hex');
}

export interface CommessaPubblica {
  linkId: string;
  tenantId: string;
  commessaId: string;
  mostraDettagli: boolean;
}

/**
 * Da token a commessa, o `null`.
 *
 * Torna `null` per **qualunque** motivo di fallimento — token assente,
 * malformato, inesistente, scaduto, spento. Al chiamante serve una pagina sola
 * («questo link non è più valido») e non vogliamo dire a chi prova indirizzi a
 * caso quale dei casi ha incontrato.
 */
export async function risolviToken(
  token: string,
): Promise<CommessaPubblica | null> {
  const pulito = (token ?? '').trim();
  // Forma attesa di un base64url da 32 byte: 43 caratteri. Il controllo evita
  // di interrogare il database per ogni indirizzo inventato.
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(pulito)) return null;

  try {
    const service = createServiceSupabase();
    const { data, error } = await service
      .from('commessa_link_pubblici' as never)
      .select('id, tenant_id, commessa_id, mostra_dettagli, expires_at, revoked_at')
      .eq('token_hash', hashToken(pulito))
      .maybeSingle();
    if (error || !data) return null;

    const riga = data as unknown as {
      id: string;
      tenant_id: string;
      commessa_id: string;
      mostra_dettagli: boolean;
      expires_at: string;
      revoked_at: string | null;
    };

    if (
      !linkApribile(
        { expiresAt: riga.expires_at, revokedAt: riga.revoked_at },
        new Date(),
      )
    ) {
      return null;
    }

    return {
      linkId: riga.id,
      tenantId: riga.tenant_id,
      commessaId: riga.commessa_id,
      mostraDettagli: riga.mostra_dettagli,
    };
  } catch {
    return null;
  }
}

/**
 * Segna un'apertura. Best-effort e **mai bloccante**: se il conteggio fallisce
 * la pagina si apre lo stesso. Serve a sapere se un link finito dove non doveva
 * è stato davvero usato, non a tenere una contabilità esatta.
 *
 * Da chiamare dentro `waitUntil`: senza, su Vercel la funzione viene congelata
 * appena parte la risposta e l'aggiornamento si perde.
 */
export async function segnaApertura(linkId: string): Promise<void> {
  try {
    const service = createServiceSupabase();
    await service.rpc('incrementa_apertura_link' as never, {
      p_link_id: linkId,
    } as never);
  } catch {
    // Silenzio voluto: un contatore non vale una pagina che non si apre.
  }
}

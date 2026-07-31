'use server';

import { revalidatePath } from 'next/cache';

import { createServiceSupabase } from '@kommessa/api/service';

import { requirePlatformAdmin } from '../_lib/guard';
import { generaTokenInChiaro, hashToken } from '../../_lib/api-token';

/**
 * Gestione dei token personali per il comando iOS "Carica su Kommessa".
 * Solo super admin di piattaforma: sono credenziali, non impostazioni.
 */

export interface RisultatoCreazione {
  ok: boolean;
  /** Presente SOLO qui, subito dopo la creazione. Poi non e' piu' recuperabile. */
  token?: string;
  error?: string;
}

export async function creaApiToken(input: {
  tenantId: string;
  userId: string;
  label: string;
}): Promise<RisultatoCreazione> {
  const admin = await requirePlatformAdmin();

  const label = input.label.trim();
  if (!label) return { ok: false, error: 'Serve un’etichetta.' };
  if (!input.tenantId || !input.userId) {
    return { ok: false, error: 'Serve un tenant e un utente.' };
  }

  const service = createServiceSupabase();

  // L'utente deve appartenere al tenant scelto: un token e' l'identita' di
  // quella persona dentro quell'azienda, non un accoppiamento arbitrario.
  const { data: utente } = await service
    .from('users')
    .select('id, tenant_id')
    .eq('id', input.userId)
    .eq('tenant_id', input.tenantId)
    .maybeSingle();
  if (!utente) {
    return { ok: false, error: 'L’utente non appartiene a questo tenant.' };
  }

  const inChiaro = generaTokenInChiaro();
  const { error } = await service.from('api_tokens' as never).insert({
    tenant_id: input.tenantId,
    user_id: input.userId,
    label,
    token_hash: hashToken(inChiaro),
    scopes: ['upload'],
    created_by: admin.userId,
  } as never);

  if (error) return { ok: false, error: error.message };

  await service.from('audit_events').insert({
    tenant_id: input.tenantId,
    actor_user_id: admin.userId,
    actor_role: 'platform_admin',
    entity_type: 'api_token',
    entity_id: input.userId,
    action: 'api_token.create',
    metadata: { label, scopes: ['upload'] },
  } as never);

  revalidatePath('/admin/token-app');
  return { ok: true, token: inChiaro };
}

export async function revocaApiToken(
  tokenId: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requirePlatformAdmin();
  const service = createServiceSupabase();

  const { data: riga } = await service
    .from('api_tokens' as never)
    .select('id, tenant_id, label')
    .eq('id', tokenId)
    .maybeSingle();
  if (!riga) return { ok: false, error: 'Token non trovato.' };

  const { error } = await service
    .from('api_tokens' as never)
    .update({ revoked_at: new Date().toISOString() } as never)
    .eq('id', tokenId);
  if (error) return { ok: false, error: error.message };

  const r = riga as unknown as { tenant_id: string; label: string };
  await service.from('audit_events').insert({
    tenant_id: r.tenant_id,
    actor_user_id: admin.userId,
    actor_role: 'platform_admin',
    entity_type: 'api_token',
    entity_id: tokenId,
    action: 'api_token.revoke',
    metadata: { label: r.label },
  } as never);

  revalidatePath('/admin/token-app');
  return { ok: true };
}

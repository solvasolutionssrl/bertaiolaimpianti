'use server';

import { revalidatePath } from 'next/cache';

import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';

import { auditTenant } from '@/app/_actions/_lib/audit';
import { createServerSupabase } from '@kommessa/api/server';
import { FEATURE_REGISTRY, type FeatureKey } from '@/app/_lib/tenant-features-registry';
import { assertCanManageTenant } from '../_components/role-gate';

/**
 * Accendere o spegnere una funzione per il proprio spazio di lavoro.
 *
 * Solo le funzioni marcate `gestibileDaUfficio` nel registro: le altre
 * restano al super admin, perché toccano cose che non riguardano «come lavora
 * questo cliente» ma come è fatta la piattaforma.
 *
 * ⚠️ Passa dal **service role** e non dal client dell'utente: `tenants` è la
 * tabella che contiene anche le credenziali Nextcloud e la chiave R2, e la sua
 * scrittura dall'app non è concessa a nessuno. Lo scope sul tenant della
 * sessione è esplicito.
 */
export async function cambiaFunzioneTenant(input: {
  chiave: string;
  accesa: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenantContext();
  try {
    assertCanManageTenant(ctx);
  } catch {
    return { ok: false, error: 'Solo un amministratore può cambiare le funzioni.' };
  }

  const def = FEATURE_REGISTRY.find((f) => f.key === input?.chiave);
  if (!def) return { ok: false, error: 'Funzione non riconosciuta.' };
  if (!def.gestibileDaUfficio) {
    return {
      ok: false,
      error: 'Questa funzione la gestiamo noi: scrivete a SOLVA e la accendiamo.',
    };
  }

  let service: ReturnType<typeof createServiceSupabase>;
  try {
    service = createServiceSupabase();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Configurazione del server incompleta.',
    };
  }

  const { data: riga } = await service
    .from('tenants')
    .select('features')
    .eq('id', ctx.tenantId)
    .maybeSingle();
  const attuali = ((riga as { features?: Record<string, unknown> | null } | null)?.features ??
    {}) as Record<string, unknown>;

  const nuove: Record<string, unknown> = { ...attuali, [def.key as FeatureKey]: input.accesa === true };

  const { error } = await service
    .from('tenants')
    .update({ features: nuove } as never)
    .eq('id', ctx.tenantId);
  if (error) return { ok: false, error: error.message };

  await auditTenant(createServerSupabase(), {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'tenant',
    entityId: ctx.tenantId,
    action: input.accesa ? 'funzione.accendi' : 'funzione.spegni',
    before: { features: attuali } as never,
    after: { features: nuove } as never,
    metadata: { funzione: def.key },
  });

  revalidatePath('/office/impostazioni/funzioni');
  // La barra in basso dell'app legge questa scelta: va rinfrescata anche lì.
  revalidatePath('/mobile');
  return { ok: true };
}

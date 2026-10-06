'use server';

import { revalidatePath } from 'next/cache';

import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import { validaPasswordBacheca } from '@kommessa/api/bacheca';

import { auditTenant } from '@/app/_actions/_lib/audit';
import { cifraPassword, generaTokenBacheca } from '@/app/_lib/bacheca-server';
import { assertCanManageTenant } from '../_components/role-gate';

/**
 * Accendere, spegnere e governare la bacheca da televisione.
 *
 * ⚠️ Tutto passa dal **service role**: `bacheche_pubbliche` ha RLS accesa e
 * nessuna policy permissiva, perché la pagina pubblica una sessione non ce l'ha
 * per definizione. Lo scope sul tenant della sessione è sempre esplicito.
 *
 * ⚠️ **La password non si rilegge mai.** In tabella c'è solo scrypt col suo
 * sale: chi la perde ne imposta un'altra. Vale anche per noi.
 */

type Esito<T = null> = { ok: true; data: T } | { ok: false; error: string };

async function guardia() {
  const ctx = await requireTenantContext();
  assertCanManageTenant(ctx);
  return { ctx, service: createServiceSupabase() };
}

/**
 * Accende la bacheca per la prima volta: indirizzo nuovo e password scelta
 * dall'ufficio. Torna l'indirizzo, che da quel momento è leggibile anche dopo
 * (non è il segreto: lo è la password).
 */
export async function accendiBacheca(input: {
  password: string;
}): Promise<Esito<{ token: string }>> {
  const v = validaPasswordBacheca(input?.password);
  if (!v.ok) return { ok: false, error: v.motivo };

  const { ctx, service } = await guardia();
  const token = generaTokenBacheca();
  const { hash, sale } = cifraPassword(input.password);

  const { error } = await service.from('bacheche_pubbliche' as never).upsert(
    {
      tenant_id: ctx.tenantId,
      token,
      password_hash: hash,
      password_sale: sale,
      attiva: true,
      tentativi_falliti: 0,
      bloccata_fino_a: null,
      creata_da: ctx.userId,
    } as never,
    { onConflict: 'tenant_id' },
  );
  if (error) return { ok: false, error: error.message };

  await auditTenant(createServerSupabase(), {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'bacheca',
    entityId: ctx.tenantId,
    action: 'bacheca.accendi',
    // ⚠️ Mai la password, nemmeno nell'audit: l'audit lo legge l'ufficio.
    after: { indirizzo_rigenerato: true } as never,
  });

  revalidatePath('/office/impostazioni/bacheca');
  return { ok: true, data: { token } };
}

/** Cambia solo la password, lasciando l'indirizzo com'è. */
export async function cambiaPasswordBacheca(input: {
  password: string;
}): Promise<Esito> {
  const v = validaPasswordBacheca(input?.password);
  if (!v.ok) return { ok: false, error: v.motivo };

  const { ctx, service } = await guardia();
  const { hash, sale } = cifraPassword(input.password);

  const { error } = await service
    .from('bacheche_pubbliche' as never)
    .update({
      password_hash: hash,
      password_sale: sale,
      tentativi_falliti: 0,
      bloccata_fino_a: null,
    } as never)
    .eq('tenant_id', ctx.tenantId);
  if (error) return { ok: false, error: error.message };

  await auditTenant(createServerSupabase(), {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'bacheca',
    entityId: ctx.tenantId,
    action: 'bacheca.password',
  });

  revalidatePath('/office/impostazioni/bacheca');
  return { ok: true, data: null };
}

/**
 * Rigenera l'indirizzo: quello di prima smette di funzionare subito.
 *
 * ⚠️ Butta fuori anche i televisori già entrati, ed è voluto: il cookie firmato
 * contiene il token, e `leggiSessione` lo confronta con l'indirizzo che si sta
 * aprendo. Se rigenerare non buttasse fuori nessuno non servirebbe a niente.
 */
export async function rigeneraIndirizzoBacheca(): Promise<Esito<{ token: string }>> {
  const { ctx, service } = await guardia();
  const token = generaTokenBacheca();

  const { error } = await service
    .from('bacheche_pubbliche' as never)
    .update({ token, tentativi_falliti: 0, bloccata_fino_a: null } as never)
    .eq('tenant_id', ctx.tenantId);
  if (error) return { ok: false, error: error.message };

  await auditTenant(createServerSupabase(), {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'bacheca',
    entityId: ctx.tenantId,
    action: 'bacheca.rigenera',
  });

  revalidatePath('/office/impostazioni/bacheca');
  return { ok: true, data: { token } };
}

/** Spegne la bacheca. Non cancella niente: si riaccende con un clic. */
export async function spegniBacheca(): Promise<Esito> {
  const { ctx, service } = await guardia();
  const { error } = await service
    .from('bacheche_pubbliche' as never)
    .update({ attiva: false } as never)
    .eq('tenant_id', ctx.tenantId);
  if (error) return { ok: false, error: error.message };

  await auditTenant(createServerSupabase(), {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'bacheca',
    entityId: ctx.tenantId,
    action: 'bacheca.spegni',
  });

  revalidatePath('/office/impostazioni/bacheca');
  return { ok: true, data: null };
}

/** Riaccende una bacheca spenta, con l'indirizzo e la password che aveva. */
export async function riaccendiBacheca(): Promise<Esito> {
  const { ctx, service } = await guardia();
  const { error } = await service
    .from('bacheche_pubbliche' as never)
    .update({ attiva: true } as never)
    .eq('tenant_id', ctx.tenantId);
  if (error) return { ok: false, error: error.message };

  await auditTenant(createServerSupabase(), {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'bacheca',
    entityId: ctx.tenantId,
    action: 'bacheca.accendi',
  });

  revalidatePath('/office/impostazioni/bacheca');
  return { ok: true, data: null };
}

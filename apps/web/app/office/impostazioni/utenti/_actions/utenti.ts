'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { AppRole } from '@kommessa/api';
import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import { assertCanManageTenant } from '../../_components/role-gate';

// Niente 'cliente': il portale clienti è chiuso (vedi migration 20260916090000).
const ROLE_VALUES = ['admin', 'office', 'tecnico'] as const;

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email non valida'),
  role: z.enum(ROLE_VALUES),
  displayName: z
    .string()
    .trim()
    .max(120)
    .optional()
    .or(z.literal('')),
});

/**
 * Invitare per email.
 *
 * Resta per chi ha una casella vera: riceve un messaggio e si scrive la
 * password da sé, senza che nessuno la senta. Per i tecnici — che una casella
 * aziendale non l'hanno — la strada e' `creaAccount` in
 * `app/_actions/account.ts`.
 *
 * ⚠️ Prima prendeva un `FormData` per `useFormState`, e il menu dei ruoli nel
 * modulo offriva «owner» e «capo»: due valori che questo schema rifiuta da
 * quando i ruoli sono stati ridotti a tre (migration 20260101003100). Chi
 * sceglieva uno dei due riceveva «Dati non validi», senza sapere perche'.
 */
export async function invitaUtenteDaOggetto(input: {
  email: string;
  role: string;
  displayName?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenantContext();
  try {
    assertCanManageTenant(ctx);
  } catch {
    return { ok: false, error: 'Solo gli amministratori possono invitare per email.' };
  }

  const parsed = inviteSchema.safeParse({
    email: input?.email ?? '',
    role: input?.role ?? 'office',
    displayName: input?.displayName ?? '',
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dati non validi' };
  }

  let admin;
  try {
    admin = createServiceSupabase();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Configurazione del server incompleta.',
    };
  }

  const appUrl =
    (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  const redirectTo = `${appUrl}/auth/callback?next=/accetta-invito`;

  const { data: invited, error: errInv } = await admin.auth.admin.inviteUserByEmail(
    parsed.data.email,
    {
      data: parsed.data.displayName ? { display_name: parsed.data.displayName } : undefined,
      redirectTo,
    },
  );
  if (errInv || !invited?.user) {
    return { ok: false, error: errInv?.message ?? 'Invio dell’invito non riuscito.' };
  }

  // Se quell'email è già una persona di un altro spazio di lavoro, l'invito si
  // ferma qui: cambiarle i claims la sposterebbe di tenant.
  const { data: giaEsistente } = await admin
    .from('users')
    .select('tenant_id')
    .eq('id', invited.user.id)
    .maybeSingle();
  const tenantEsistente = (giaEsistente as { tenant_id?: string } | null)?.tenant_id ?? null;
  if (tenantEsistente && tenantEsistente !== ctx.tenantId) {
    return { ok: false, error: 'Questa email appartiene già a un altro spazio di lavoro.' };
  }

  const { error: errMeta } = await admin.auth.admin.updateUserById(invited.user.id, {
    app_metadata: {
      tenant_id: ctx.tenantId,
      tenant_slug: ctx.tenantSlug,
      role: parsed.data.role,
    },
  });
  if (errMeta) return { ok: false, error: errMeta.message };

  const { error: errUpsert } = await admin.from('users').upsert(
    {
      id: invited.user.id,
      tenant_id: ctx.tenantId,
      role: parsed.data.role,
      display_name: parsed.data.displayName?.trim() || null,
      attivo: true,
      invite_sent_at: new Date().toISOString(),
      // Chi arriva per invito si scrive la password da sé nella pagina
      // d'invito: non c'è nessuna password temporanea da cambiare.
      must_change_password: false,
    } as never,
    { onConflict: 'id' },
  );
  if (errUpsert) return { ok: false, error: errUpsert.message };

  revalidatePath('/office/impostazioni/utenti');
  return { ok: true };
}

const roleChangeSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(ROLE_VALUES),
});

export async function cambiaRuolo(input: { userId: string; role: AppRole }) {
  const ctx = await requireTenantContext();
  assertCanManageTenant(ctx);
  const parsed = roleChangeSchema.parse(input);
  if (parsed.userId === ctx.userId && parsed.role !== 'admin' && ctx.role === 'admin') {
    throw new Error('Non puoi rimuovere il tuo ruolo di owner.');
  }
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('users')
    .update({ role: parsed.role })
    .eq('id', parsed.userId)
    .eq('tenant_id', ctx.tenantId);
  if (error) throw new Error(error.message);
  revalidatePath('/office/impostazioni/utenti');
}

const toggleSchema = z.object({ userId: z.string().uuid() });

export async function disattivaUtente(input: { userId: string }) {
  const ctx = await requireTenantContext();
  assertCanManageTenant(ctx);
  const parsed = toggleSchema.parse(input);
  if (parsed.userId === ctx.userId) {
    throw new Error('Non puoi disattivare il tuo stesso utente.');
  }
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('users')
    .update({ attivo: false })
    .eq('id', parsed.userId)
    .eq('tenant_id', ctx.tenantId);
  if (error) throw new Error(error.message);
  revalidatePath('/office/impostazioni/utenti');
}

export async function riattivaUtente(input: { userId: string }) {
  const ctx = await requireTenantContext();
  assertCanManageTenant(ctx);
  const parsed = toggleSchema.parse(input);
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('users')
    .update({ attivo: true })
    .eq('id', parsed.userId)
    .eq('tenant_id', ctx.tenantId);
  if (error) throw new Error(error.message);
  revalidatePath('/office/impostazioni/utenti');
}

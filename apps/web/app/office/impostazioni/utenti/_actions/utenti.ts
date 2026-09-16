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

export type UserFormState =
  | { status: 'idle' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

export async function invitaUtente(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const ctx = await requireTenantContext();
  try {
    assertCanManageTenant(ctx);
  } catch {
    return {
      status: 'error',
      message: 'Solo gli amministratori possono invitare utenti.',
    };
  }

  const parsed = inviteSchema.safeParse({
    email: formData.get('email')?.toString() ?? '',
    role: formData.get('role')?.toString() ?? 'office',
    displayName: formData.get('displayName')?.toString() ?? '',
  });
  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Dati non validi',
    };
  }

  // L'invito richiede service-role per chiamare auth.admin.inviteUserByEmail.
  let admin;
  try {
    admin = createServiceSupabase();
  } catch (e) {
    return {
      status: 'error',
      message:
        e instanceof Error
          ? e.message
          : 'Configurazione service-role mancante (SUPABASE_SERVICE_ROLE_KEY).',
    };
  }

  // Costruisce l'URL di redirect dove l'utente arriva dopo aver cliccato il link.
  // NEXT_PUBLIC_APP_URL va impostato in Vercel env vars con la URL di produzione.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '')
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  const redirectTo = `${appUrl}/auth/callback?next=/accetta-invito`;

  const { data: invited, error: errInv } = await admin.auth.admin.inviteUserByEmail(
    parsed.data.email,
    {
      data: parsed.data.displayName
        ? { display_name: parsed.data.displayName }
        : undefined,
      redirectTo,
    },
  );
  if (errInv || !invited?.user) {
    return {
      status: 'error',
      message: errInv?.message ?? 'Invio invito fallito.',
    };
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
    return {
      status: 'error',
      message: 'Questa email appartiene già a un altro spazio di lavoro.',
    };
  }

  // Promuovi i custom claims via app_metadata (verranno propagati nel JWT al login).
  const { error: errMeta } = await admin.auth.admin.updateUserById(
    invited.user.id,
    {
      app_metadata: {
        tenant_id: ctx.tenantId,
        tenant_slug: ctx.tenantSlug,
        role: parsed.data.role,
      },
    },
  );
  if (errMeta) {
    return { status: 'error', message: errMeta.message };
  }

  const { error: errUpsert } = await admin.from('users').upsert(
    {
      id: invited.user.id,
      tenant_id: ctx.tenantId,
      role: parsed.data.role,
      display_name: parsed.data.displayName?.trim() || null,
      attivo: true,
      invite_sent_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );
  if (errUpsert) {
    return { status: 'error', message: errUpsert.message };
  }

  revalidatePath('/office/impostazioni/utenti');
  return {
    status: 'success',
    message: `Invito inviato a ${parsed.data.email}.`,
  };
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

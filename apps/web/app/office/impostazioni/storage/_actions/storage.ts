'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabase } from '@impiantixplus/api/server';
import { requireTenantContext } from '@impiantixplus/api/tenant';
import { assertCanManageTenant } from '../../_components/role-gate';

const PROVIDERS = ['supabase', 'nextcloud'] as const;

const storageSchema = z
  .object({
    provider: z.enum(PROVIDERS),
    nextcloudBaseUrl: z
      .string()
      .trim()
      .url('URL non valido')
      .or(z.literal(''))
      .optional(),
    nextcloudUser: z.string().trim().max(160).or(z.literal('')).optional(),
    nextcloudAppPassword: z
      .string()
      .trim()
      .max(255)
      .or(z.literal(''))
      .optional(),
  })
  .superRefine((val, ctx) => {
    if (val.provider === 'nextcloud') {
      if (!val.nextcloudBaseUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Base URL obbligatorio per Nextcloud.',
          path: ['nextcloudBaseUrl'],
        });
      }
      if (!val.nextcloudUser) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Utente WebDAV obbligatorio.',
          path: ['nextcloudUser'],
        });
      }
    }
  });

export type StorageFormState =
  | { status: 'idle' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

export async function aggiornaStorage(
  _prev: StorageFormState,
  formData: FormData,
): Promise<StorageFormState> {
  const ctx = await requireTenantContext();
  try {
    assertCanManageTenant(ctx);
  } catch {
    return {
      status: 'error',
      message: 'Solo gli amministratori possono modificare lo storage.',
    };
  }

  const parsed = storageSchema.safeParse({
    provider: formData.get('provider')?.toString() ?? 'supabase',
    nextcloudBaseUrl: formData.get('nextcloudBaseUrl')?.toString() ?? '',
    nextcloudUser: formData.get('nextcloudUser')?.toString() ?? '',
    nextcloudAppPassword: formData.get('nextcloudAppPassword')?.toString() ?? '',
  });
  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Dati non validi',
    };
  }

  const supabase = createServerSupabase();

  // Recupera config esistente per non sovrascrivere la password se vuota
  const { data: existing } = await supabase
    .from('tenants')
    .select('storage_config')
    .eq('id', ctx.tenantId)
    .maybeSingle();
  const prevConfig =
    (existing?.storage_config as Record<string, unknown> | null) ?? {};

  let nextConfig: Record<string, unknown> = {};
  if (parsed.data.provider === 'nextcloud') {
    // Convenzione DB: camelCase (baseUrl, appPassword) — coerente col resto
    // del codebase (crea-commessa, foto.ts, annotations, …). Preserviamo la
    // password precedente sia se salvata in camelCase sia in snake_case legacy.
    nextConfig = {
      baseUrl: parsed.data.nextcloudBaseUrl?.replace(/\/+$/, ''),
      user: parsed.data.nextcloudUser,
      appPassword:
        parsed.data.nextcloudAppPassword?.trim() ||
        (prevConfig.appPassword as string | undefined) ||
        (prevConfig.app_password as string | undefined) ||
        '',
    };
  } else {
    nextConfig = {};
  }

  const { error } = await supabase
    .from('tenants')
    .update({
      storage_provider: parsed.data.provider,
      storage_config: nextConfig,
    })
    .eq('id', ctx.tenantId);

  if (error) return { status: 'error', message: error.message };
  revalidatePath('/office/impostazioni/storage');
  return {
    status: 'success',
    message:
      parsed.data.provider === 'supabase'
        ? 'Storage impostato su Supabase Storage.'
        : 'Storage impostato su Nextcloud (commesse future).',
  };
}

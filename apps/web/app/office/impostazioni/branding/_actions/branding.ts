'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabase } from '@impiantixplus/api/server';
import { createServiceSupabase } from '@impiantixplus/api/service';
import { requireTenantContext } from '@impiantixplus/api/tenant';
import { assertCanManageTenant } from '../../_components/role-gate';

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

const brandingSchema = z.object({
  nome: z.string().trim().min(1, 'Nome obbligatorio').max(160),
  brandColor: z
    .string()
    .trim()
    .regex(HEX_RE, 'Colore HEX non valido (es. #0F4FDB)')
    .or(z.literal(''))
    .nullable()
    .optional(),
  logoUrl: z
    .string()
    .trim()
    .url('URL logo non valido')
    .or(z.literal(''))
    .nullable()
    .optional(),
  inboundEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email('Email non valida')
    .or(z.literal(''))
    .nullable()
    .optional(),
});

export type BrandingFormState =
  | { status: 'idle' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

export async function aggiornaBranding(
  _prev: BrandingFormState,
  formData: FormData,
): Promise<BrandingFormState> {
  const ctx = await requireTenantContext();
  try {
    assertCanManageTenant(ctx);
  } catch {
    return {
      status: 'error',
      message: 'Solo gli amministratori possono modificare il branding.',
    };
  }

  const parsed = brandingSchema.safeParse({
    nome: formData.get('nome')?.toString() ?? '',
    brandColor: formData.get('brandColor')?.toString() ?? '',
    logoUrl: formData.get('logoUrl')?.toString() ?? '',
    inboundEmail: formData.get('inboundEmail')?.toString() ?? '',
  });
  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Dati non validi',
    };
  }

  // Normalizza colore: assicura prefisso #
  let brandColor = parsed.data.brandColor?.trim() || null;
  if (brandColor && !brandColor.startsWith('#')) brandColor = `#${brandColor}`;

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('tenants')
    .update({
      nome: parsed.data.nome,
      brand_color: brandColor,
      logo_url: parsed.data.logoUrl?.trim() || null,
      inbound_email: parsed.data.inboundEmail?.trim() || null,
    })
    .eq('id', ctx.tenantId);

  if (error) return { status: 'error', message: error.message };
  revalidatePath('/office', 'layout');
  return { status: 'success', message: 'Branding aggiornato.' };
}

/**
 * Upload del logo nel bucket "branding" via service-role.
 * Il bucket viene creato on-demand (pubblico) se non esiste.
 * Ritorna l'URL pubblico del file.
 */
export async function uploadLogo(formData: FormData): Promise<{
  status: 'success' | 'error';
  message: string;
  publicUrl?: string;
}> {
  const ctx = await requireTenantContext();
  try {
    assertCanManageTenant(ctx);
  } catch {
    return {
      status: 'error',
      message: 'Solo gli amministratori possono caricare il logo.',
    };
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { status: 'error', message: 'Nessun file caricato.' };
  }
  if (file.size > 2 * 1024 * 1024) {
    return { status: 'error', message: 'Logo troppo grande (max 2 MB).' };
  }

  let admin;
  try {
    admin = createServiceSupabase();
  } catch (e) {
    return {
      status: 'error',
      message:
        e instanceof Error ? e.message : 'Service-role non configurata.',
    };
  }

  // Crea bucket se assente
  const { data: buckets } = await admin.storage.listBuckets();
  if (!buckets?.some((b) => b.name === 'branding')) {
    const { error: errBucket } = await admin.storage.createBucket('branding', {
      public: true,
      fileSizeLimit: 2 * 1024 * 1024,
    });
    if (errBucket && !/already exists/i.test(errBucket.message)) {
      return { status: 'error', message: errBucket.message };
    }
  }

  const ext = (file.name.split('.').pop() ?? 'png').toLowerCase();
  const path = `${ctx.tenantSlug.toLowerCase()}/logo-${Date.now()}.${ext}`;
  const { error: errUp } = await admin.storage
    .from('branding')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type || 'image/png',
    });
  if (errUp) {
    return { status: 'error', message: errUp.message };
  }

  const { data: pub } = admin.storage.from('branding').getPublicUrl(path);
  const publicUrl = pub.publicUrl;

  await admin
    .from('tenants')
    .update({ logo_url: publicUrl })
    .eq('id', ctx.tenantId);

  revalidatePath('/office', 'layout');
  return { status: 'success', message: 'Logo caricato.', publicUrl };
}

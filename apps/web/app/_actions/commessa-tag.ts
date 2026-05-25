'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import type { AppRole } from '@kommessa/api';

/**
 * Server actions per la gestione dei tag liberi su una commessa.
 *
 * Tag sono normalizzati lowercase (constraint DB) + lunghezza 1-40
 * (constraint DB). Permessi: solo admin/office possono modificare i tag
 * di una commessa. I tecnici li vedono.
 */

const WRITE_ROLES = new Set<AppRole>(['admin', 'office']);

const TAG_RE = /^[a-z0-9_\- ]{1,40}$/;

export type TagResult = { ok: true } | { ok: false; error: string };

function normalize(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    // spazi multipli → singolo, e i caratteri non ammessi rimossi
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9_\- ]/g, '');
}

const AggInput = z.object({
  commessaId: z.string().uuid(),
  tag: z.string().min(1).max(60),
});

export async function aggiungiTag(input: unknown): Promise<TagResult> {
  const parsed = AggInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const ctx = await safeCtx();
  if (!ctx) return { ok: false, error: 'Sessione non valida' };
  if (!WRITE_ROLES.has(ctx.role)) {
    return { ok: false, error: 'Solo admin/office possono modificare i tag' };
  }

  const tag = normalize(parsed.data.tag);
  if (!tag || !TAG_RE.test(tag)) {
    return {
      ok: false,
      error: 'Tag non valido (1-40 caratteri, solo lettere/numeri/_/-/spazio)',
    };
  }

  const supabase = createServerSupabase();
  // ON CONFLICT (commessa_id, tag) DO NOTHING — idempotente
  const { error } = await supabase
    .from('commessa_tags')
    .upsert(
      {
        commessa_id: parsed.data.commessaId,
        tenant_id: ctx.tenantId,
        tag,
        created_by: ctx.userId,
      },
      { onConflict: 'commessa_id,tag' },
    );
  if (error) return { ok: false, error: `Insert tag fallito: ${error.message}` };

  revalidatePath(`/office/commesse/${parsed.data.commessaId}`);
  return { ok: true };
}

const RimInput = z.object({
  commessaId: z.string().uuid(),
  tag: z.string().min(1).max(60),
});

export async function rimuoviTag(input: unknown): Promise<TagResult> {
  const parsed = RimInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const ctx = await safeCtx();
  if (!ctx) return { ok: false, error: 'Sessione non valida' };
  if (!WRITE_ROLES.has(ctx.role)) {
    return { ok: false, error: 'Solo admin/office possono modificare i tag' };
  }

  const tag = normalize(parsed.data.tag);
  if (!tag) return { ok: false, error: 'Tag non valido' };

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('commessa_tags')
    .delete()
    .eq('commessa_id', parsed.data.commessaId)
    .eq('tag', tag);
  if (error) return { ok: false, error: `Delete tag fallito: ${error.message}` };

  revalidatePath(`/office/commesse/${parsed.data.commessaId}`);
  return { ok: true };
}

/**
 * Tag esistenti nel tenant con conteggio (per autocomplete).
 * Ritorna ordinati per uso decrescente, max 50.
 */
export async function elencaTagTenant(): Promise<
  Array<{ tag: string; usage_count: number }>
> {
  const ctx = await safeCtx();
  if (!ctx) return [];
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from('tenant_tags_summary')
    .select('tag, usage_count')
    .eq('tenant_id', ctx.tenantId)
    .order('usage_count', { ascending: false })
    .limit(50);
  return ((data ?? []) as Array<{ tag: string; usage_count: number }>).map((r) => ({
    tag: r.tag,
    usage_count: r.usage_count,
  }));
}

async function safeCtx() {
  try {
    return await requireTenantContext();
  } catch {
    return null;
  }
}

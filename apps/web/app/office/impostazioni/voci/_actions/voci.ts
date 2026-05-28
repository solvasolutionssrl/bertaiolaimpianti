'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { assertCanManageTenant } from '../../_components/role-gate';

const overrideSchema = z.object({
  voceId: z.number().int().min(1).max(32767),
  nomeOverride: z
    .string()
    .trim()
    .max(160)
    .or(z.literal(''))
    .nullable()
    .optional(),
  minFotoOverride: z
    .union([z.coerce.number().int().min(0).max(999), z.literal(''), z.null()])
    .optional(),
  attiva: z.boolean().default(true),
  /**
   * Path cartella (es. "Preventivi/NuoviImpianti") che la voce genera
   * su Nextcloud. Stringa vuota = esplicita assenza, NULL = eredita.
   *
   * Per voci GLOBALI (tenant_id NULL): scritto come
   *   tenant_voci_override.cartella_template_override.
   * Per voci CUSTOM (tenant_id valorizzato): scritto direttamente come
   *   voci_catalogo.cartella_template (è del proprio tenant).
   */
  cartellaTemplate: z
    .string()
    .trim()
    .max(200)
    .or(z.literal(''))
    .nullable()
    .optional(),
});

export type VoceFormState =
  | { status: 'idle' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

export async function salvaVoceOverride(
  _prev: VoceFormState,
  formData: FormData,
): Promise<VoceFormState> {
  const ctx = await requireTenantContext();
  try {
    assertCanManageTenant(ctx);
  } catch {
    return {
      status: 'error',
      message: 'Solo gli amministratori possono modificare il catalogo.',
    };
  }

  const parsed = overrideSchema.safeParse({
    voceId: Number(formData.get('voceId') ?? 0),
    nomeOverride: formData.get('nomeOverride')?.toString() ?? '',
    minFotoOverride: formData.get('minFotoOverride')?.toString() ?? '',
    attiva: formData.get('attiva') === 'on' || formData.get('attiva') === 'true',
    cartellaTemplate:
      formData.has('cartellaTemplate')
        ? (formData.get('cartellaTemplate')?.toString() ?? '')
        : undefined,
  });
  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Dati non validi',
    };
  }

  const nomeNorm =
    typeof parsed.data.nomeOverride === 'string' &&
    parsed.data.nomeOverride.trim().length > 0
      ? parsed.data.nomeOverride.trim()
      : null;
  const minFotoNorm =
    parsed.data.minFotoOverride === '' ||
    parsed.data.minFotoOverride === null ||
    parsed.data.minFotoOverride === undefined
      ? null
      : Number(parsed.data.minFotoOverride);
  const cartellaNorm =
    parsed.data.cartellaTemplate === undefined
      ? undefined // non passato → non toccare
      : parsed.data.cartellaTemplate === null ||
          parsed.data.cartellaTemplate === '' ||
          parsed.data.cartellaTemplate.trim() === ''
        ? null
        : parsed.data.cartellaTemplate.trim();

  const supabase = createServerSupabase();

  // Sceglie il path in base alla provenienza della voce:
  // - GLOBALE (tenant_id NULL): UPSERT su tenant_voci_override.
  // - CUSTOM del tenant (tenant_id NOT NULL): UPDATE diretto su voci_catalogo
  //   (passato via RLS: solo l'admin del tenant proprietario può scrivere).
  const { data: voceRow } = await supabase
    .from('voci_catalogo')
    .select('id, tenant_id')
    .eq('id', parsed.data.voceId)
    .maybeSingle();
  const isCustom = Boolean(
    (voceRow as { tenant_id?: string | null } | null)?.tenant_id,
  );

  if (isCustom) {
    // Per le custom: nome / cartella / (note di info) vivono nel record stesso.
    // attiva / min_foto restano su override per coerenza UX (anche se nascondibili).
    const updatePayload: Record<string, unknown> = {};
    if (nomeNorm) updatePayload.nome = nomeNorm;
    if (cartellaNorm !== undefined)
      updatePayload.cartella_template = cartellaNorm;
    if (Object.keys(updatePayload).length > 0) {
      const { error: upErr } = await supabase
        .from('voci_catalogo')
        .update(updatePayload as never)
        .eq('id', parsed.data.voceId);
      if (upErr) return { status: 'error', message: upErr.message };
    }
    // Anche per le custom usiamo l'override per attiva + min_foto.
    const { error } = await supabase
      .from('tenant_voci_override' as never)
      .upsert(
        {
          tenant_id: ctx.tenantId,
          voce_id: parsed.data.voceId,
          nome_override: null, // sulla custom il nome vive sul record
          min_foto_richieste_override: minFotoNorm,
          attiva: parsed.data.attiva,
          cartella_template_override: null,
        } as never,
        { onConflict: 'tenant_id,voce_id' },
      );
    if (error) return { status: 'error', message: error.message };
  } else {
    // Voce globale: override per nome/min_foto/attiva/cartella.
    const upsertPayload: Record<string, unknown> = {
      tenant_id: ctx.tenantId,
      voce_id: parsed.data.voceId,
      nome_override: nomeNorm,
      min_foto_richieste_override: minFotoNorm,
      attiva: parsed.data.attiva,
    };
    if (cartellaNorm !== undefined) {
      upsertPayload.cartella_template_override = cartellaNorm;
    }
    const { error } = await supabase
      .from('tenant_voci_override' as never)
      .upsert(upsertPayload as never, { onConflict: 'tenant_id,voce_id' });
    if (error) return { status: 'error', message: error.message };
  }

  revalidatePath('/office/impostazioni/voci');
  return { status: 'success', message: 'Voce aggiornata.' };
}

export async function resetVoceOverride(input: { voceId: number }) {
  const ctx = await requireTenantContext();
  assertCanManageTenant(ctx);
  const { voceId } = z
    .object({ voceId: z.number().int().min(1).max(32767) })
    .parse(input);

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('tenant_voci_override' as never)
    .delete()
    .eq('tenant_id', ctx.tenantId)
    .eq('voce_id', voceId);

  if (error) throw new Error(error.message);
  revalidatePath('/office/impostazioni/voci');
}

// =====================================================================
// Voci custom (tenant-specific)
// =====================================================================

const CATEGORIE = [
  'sempre_attiva',
  'impiantistica',
  'ventilazione',
  'documentazione',
  'tubazioni',
  'montaggi',
  'allacci',
  'supporto',
  'alimentazione',
] as const;

const nomeVoceSchema = z
  .string()
  .trim()
  .min(2, 'Il nome deve avere almeno 2 caratteri')
  .max(160, 'Il nome è troppo lungo (max 160)');

const creaVoceSchema = z.object({
  nome: nomeVoceSchema,
  categoria: z.enum(CATEGORIE),
  cartellaTemplate: z.string().trim().max(200).nullable().optional(),
  forceSimilar: z.boolean().default(false),
});

/** Normalizza un nome per il confronto fuzzy (lowercase + senza accenti + collassa spazi). */
function normalizzaNome(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Distanza di Levenshtein tra due stringhe (DP iterativo). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  // Garantiamo b come la più corta per ridurre la memoria del buffer.
  if (a.length < b.length) {
    const swap = a;
    a = b;
    b = swap;
  }
  let prev = new Array<number>(b.length + 1).fill(0);
  let cur = new Array<number>(b.length + 1).fill(0);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      const del = (prev[j] as number) + 1;
      const ins = (cur[j - 1] as number) + 1;
      const sub = (prev[j - 1] as number) + cost;
      cur[j] = Math.min(del, ins, sub);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length] as number;
}

export interface VoceSimile {
  id: number;
  nome: string;
  distance: number;
  scope: 'globale' | 'custom';
}

/** Cerca voci simili nel catalogo (globali + custom del tenant). Soglia: similarity > 0.7. */
export async function vociSimili(input: {
  nome: string;
}): Promise<VoceSimile[]> {
  const ctx = await requireTenantContext();
  assertCanManageTenant(ctx);
  const { nome } = z.object({ nome: nomeVoceSchema }).parse(input);

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('voci_catalogo')
    .select('id, nome, tenant_id')
    .order('ordine_visualizzazione');
  if (error) throw new Error(error.message);

  const target = normalizzaNome(nome);
  // Cast via unknown: la colonna tenant_id è aggiunta dalla migration 28/05/2026,
  // i types generati la rifletteranno al prossimo `supabase gen types`.
  const rows = (data ?? []) as unknown as Array<{
    id: number;
    nome: string;
    tenant_id: string | null;
  }>;

  const similarita: VoceSimile[] = rows
    .map((r) => {
      const candidate = normalizzaNome(r.nome);
      const dist = levenshtein(target, candidate);
      const maxLen = Math.max(target.length, candidate.length, 1);
      const similarity = 1 - dist / maxLen;
      const contains =
        candidate.includes(target) || target.includes(candidate);
      return {
        id: r.id,
        nome: r.nome,
        distance: dist,
        scope: (r.tenant_id === null ? 'globale' : 'custom') as
          | 'globale'
          | 'custom',
        score: contains ? Math.max(similarity, 0.85) : similarity,
      };
    })
    .filter((r) => r.score >= 0.7)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ score: _score, ...rest }) => rest);

  return similarita;
}

export async function creaVoceCustom(input: {
  nome: string;
  categoria: (typeof CATEGORIE)[number];
  cartellaTemplate?: string | null;
  forceSimilar?: boolean;
}): Promise<
  | { ok: true; voceId: number }
  | { ok: false; reason: 'similar'; similar: VoceSimile[] }
  | { ok: false; reason: 'duplicate' | 'error'; message: string }
> {
  const ctx = await requireTenantContext();
  assertCanManageTenant(ctx);
  const parsed = creaVoceSchema.parse(input);

  // Pre-check fuzzy: se forceSimilar=false e troviamo voci simili, blocca
  // e restituisci la lista per far decidere all'utente.
  if (!parsed.forceSimilar) {
    const sim = await vociSimili({ nome: parsed.nome });
    if (sim.length > 0) {
      return { ok: false, reason: 'similar', similar: sim };
    }
  }

  const supabase = createServerSupabase();

  // Id auto-generato via RPC dedicata (consuma la sequence 1000+).
  const { data: idRow, error: idErr } = (await supabase.rpc(
    'next_voce_custom_id' as never,
  )) as { data: number | null; error: { message: string } | null };

  let newId: number;
  if (idErr || idRow == null) {
    // Fallback robustness: max(id) custom del tenant + 1, partendo da 1000.
    const { data: maxRow } = await supabase
      .from('voci_catalogo')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    newId = Math.max(1000, ((maxRow?.id as number | undefined) ?? 999) + 1);
  } else {
    newId = Number(idRow);
  }

  // Ordine_visualizzazione: in coda (max ordine + 1, cap 32767).
  const { data: maxOrdRow } = await supabase
    .from('voci_catalogo')
    .select('ordine_visualizzazione')
    .order('ordine_visualizzazione', { ascending: false })
    .limit(1)
    .maybeSingle();
  const newOrdine = Math.min(
    32767,
    ((maxOrdRow?.ordine_visualizzazione as number | undefined) ?? 39) + 1,
  );

  const cartellaTemplateNorm =
    parsed.cartellaTemplate && parsed.cartellaTemplate.trim().length > 0
      ? parsed.cartellaTemplate.trim()
      : null;

  const { error: insErr } = await supabase
    .from('voci_catalogo')
    .insert({
      id: newId,
      nome: parsed.nome,
      categoria: parsed.categoria,
      default: false,
      cartella_template: cartellaTemplateNorm,
      ordine_visualizzazione: newOrdine,
      tenant_id: ctx.tenantId,
      note: `Voce custom creata da ${ctx.userId} il ${new Date().toISOString().slice(0, 10)}.`,
    } as never);

  if (insErr) {
    if (insErr.message?.toLowerCase().includes('unique')) {
      return {
        ok: false,
        reason: 'duplicate',
        message: 'Esiste già una voce con questo nome per il tuo tenant.',
      };
    }
    return { ok: false, reason: 'error', message: insErr.message };
  }

  revalidatePath('/office/impostazioni/voci');
  return { ok: true, voceId: newId };
}

export async function eliminaVoceCustom(input: { voceId: number }) {
  const ctx = await requireTenantContext();
  assertCanManageTenant(ctx);
  const { voceId } = z
    .object({ voceId: z.number().int().min(1000).max(32767) })
    .parse(input);

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('voci_catalogo')
    .delete()
    .eq('id', voceId)
    .eq('tenant_id', ctx.tenantId);

  if (error) throw new Error(error.message);
  revalidatePath('/office/impostazioni/voci');
}

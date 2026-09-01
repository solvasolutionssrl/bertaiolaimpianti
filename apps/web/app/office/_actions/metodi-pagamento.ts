'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import { auditTenant } from '@/app/_actions/_lib/audit';
import {
  METODI_PREDEFINITI,
  codiceDaNome,
  leggiMetodiPagamento,
} from '@/app/_lib/metodi-pagamento';

/**
 * Gestione dei metodi di pagamento delle spese.
 *
 * ⚠️ Il `codice` non si modifica MAI: è quello che sta dentro
 * `spese.metodo_pagamento`. Qui si rinomina l'etichetta, si aggiungono voci
 * nuove e si ritirano quelle che non servono più — mai una cancellazione, o le
 * spese vecchie resterebbero a puntare nel vuoto.
 *
 * Non è gated da nessun modulo: fa parte del prodotto, vale per tutti i clienti.
 */

type Result = { ok: true } | { ok: false; error: string };

async function guard() {
  const ctx = await requireTenantContext();
  if (!['owner', 'admin', 'office'].includes(ctx.role)) throw new Error('FORBIDDEN');
  return ctx;
}

const nomeSchema = z
  .string()
  .trim()
  .min(2, 'Il nome è troppo corto.')
  .max(40, 'Il nome è troppo lungo (max 40 caratteri).');

/**
 * Materializza i tre predefiniti se il cliente non ha ancora nessuna riga.
 * Serve ai clienti creati dopo la migrazione: apri la pagina e li trovi già lì,
 * senza doverli aggiungere a mano.
 */
export async function assicuraMetodiPredefiniti(): Promise<Result> {
  try {
    const ctx = await guard();
    const service = createServiceSupabase();
    const { count } = await service
      .from('metodi_pagamento' as never)
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId);
    if ((count ?? 0) > 0) return { ok: true };

    await service.from('metodi_pagamento' as never).insert(
      METODI_PREDEFINITI.map((m) => ({
        tenant_id: ctx.tenantId,
        codice: m.codice,
        nome: m.nome,
        ordine: m.ordine,
        di_sistema: true,
      })) as never,
    );
    revalidatePath('/office/impostazioni/pagamenti');
    return { ok: true };
  } catch {
    return { ok: false, error: 'Non sono riuscito a preparare i metodi di pagamento.' };
  }
}

/** Cambia l'etichetta mostrata. Il codice resta quello di prima. */
export async function rinominaMetodoPagamento(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid(), nome: nomeSchema }).safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Nome non valido.' };
  }
  try {
    const ctx = await guard();
    const service = createServiceSupabase();

    const { data: prima } = await service
      .from('metodi_pagamento' as never)
      .select('id, codice, nome')
      .eq('id', parsed.data.id)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();
    if (!prima) return { ok: false, error: 'Questo metodo non esiste più.' };

    const esistente = await nomeGiaUsato(service, ctx.tenantId, parsed.data.nome, parsed.data.id);
    if (esistente) return { ok: false, error: `«${parsed.data.nome}» esiste già.` };

    const { error } = await service
      .from('metodi_pagamento' as never)
      .update({ nome: parsed.data.nome, updated_at: new Date().toISOString() } as never)
      .eq('id', parsed.data.id)
      .eq('tenant_id', ctx.tenantId);
    if (error) return { ok: false, error: 'Non sono riuscito a salvare il nuovo nome.' };

    await auditTenant(service, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      entityType: 'metodo_pagamento',
      entityId: parsed.data.id,
      action: 'metodo_pagamento.rinomina',
      before: prima,
      after: { ...(prima as object), nome: parsed.data.nome },
    });

    revalidatePath('/office/impostazioni/pagamenti');
    return { ok: true };
  } catch {
    return { ok: false, error: 'Non sono riuscito a rinominare il metodo.' };
  }
}

/** Aggiunge un metodo nuovo. Il codice si genera dal nome, una volta sola. */
export async function aggiungiMetodoPagamento(input: unknown): Promise<Result> {
  const parsed = z.object({ nome: nomeSchema }).safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Nome non valido.' };
  }
  try {
    const ctx = await guard();
    const service = createServiceSupabase();

    if (await nomeGiaUsato(service, ctx.tenantId, parsed.data.nome, null)) {
      return { ok: false, error: `«${parsed.data.nome}» esiste già.` };
    }

    const esistenti = await leggiMetodiPagamento(service, ctx.tenantId);
    let codice = codiceDaNome(parsed.data.nome);
    // Un codice ritirato resta occupato: la spesa vecchia ci punta ancora.
    if (esistenti.some((m) => m.codice === codice)) codice = `${codice}_2`.slice(0, 40);
    const ordine = Math.max(0, ...esistenti.map((m) => m.ordine)) + 10;

    const { data, error } = await service
      .from('metodi_pagamento' as never)
      .insert({
        tenant_id: ctx.tenantId,
        codice,
        nome: parsed.data.nome,
        ordine,
        di_sistema: false,
      } as never)
      .select('id')
      .single();
    if (error || !data) return { ok: false, error: 'Non sono riuscito ad aggiungere il metodo.' };

    await auditTenant(service, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      entityType: 'metodo_pagamento',
      entityId: (data as { id: string }).id,
      action: 'metodo_pagamento.crea',
      after: { codice, nome: parsed.data.nome },
    });

    revalidatePath('/office/impostazioni/pagamenti');
    return { ok: true };
  } catch {
    return { ok: false, error: 'Non sono riuscito ad aggiungere il metodo.' };
  }
}

/**
 * Ritira o rimette in uso un metodo.
 *
 * Ritirare non cancella: sparisce dalle tendine e dalle scelte dell'AI, ma le
 * spese che lo usavano continuano a mostrarlo col suo nome.
 */
export async function cambiaStatoMetodoPagamento(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid(), attivo: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Richiesta non valida.' };
  try {
    const ctx = await guard();
    const service = createServiceSupabase();

    // Almeno uno deve restare acceso, o l'app si trova la tendina vuota.
    if (!parsed.data.attivo) {
      const tutti = await leggiMetodiPagamento(service, ctx.tenantId);
      const attiviRimasti = tutti.filter((m) => m.attivo && m.id !== parsed.data.id).length;
      if (attiviRimasti === 0) {
        return { ok: false, error: 'Deve restare almeno un metodo in uso.' };
      }
    }

    const { error } = await service
      .from('metodi_pagamento' as never)
      .update({ attivo: parsed.data.attivo, updated_at: new Date().toISOString() } as never)
      .eq('id', parsed.data.id)
      .eq('tenant_id', ctx.tenantId);
    if (error) return { ok: false, error: 'Non sono riuscito a salvare.' };

    await auditTenant(service, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      entityType: 'metodo_pagamento',
      entityId: parsed.data.id,
      action: parsed.data.attivo ? 'metodo_pagamento.riattiva' : 'metodo_pagamento.ritira',
    });

    revalidatePath('/office/impostazioni/pagamenti');
    return { ok: true };
  } catch {
    return { ok: false, error: 'Non sono riuscito a salvare.' };
  }
}

/** Due metodi con lo stesso nome sono indistinguibili a schermo. */
async function nomeGiaUsato(
  service: ReturnType<typeof createServiceSupabase>,
  tenantId: string,
  nome: string,
  escludiId: string | null,
): Promise<boolean> {
  const tutti = await leggiMetodiPagamento(service, tenantId);
  const cercato = nome.trim().toLowerCase();
  return tutti.some((m) => m.nome.trim().toLowerCase() === cercato && m.id !== escludiId);
}

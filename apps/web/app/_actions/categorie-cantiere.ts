'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import { chiaveCategoria } from '@kommessa/api/categorie-smistamento';

import { auditTenant } from './_lib/audit';

/**
 * Le categorie di cantiere: registro nostro, e smistamento dei valori che
 * arrivano dal gestionale.
 *
 * La regola che governa tutto: **la categoria scritta sul cantiere e' un
 * testo, non una chiave esterna**. Il registro serve a governare la lista —
 * rinominare, nascondere, fondere — non a vincolarla. Cosi' un tenant senza
 * gestionale continua a lavorare come sempre, e se un domani l'integrazione
 * si spegne i dati restano leggibili.
 *
 * Conseguenza pratica: quando si rinomina o si fonde, **i cantieri vanno
 * riscritti insieme al registro**. Se non lo si facesse, il registro
 * direbbe una cosa e i dati un'altra — che e' peggio di non avere il registro.
 */

type Esito = { ok: true } | { ok: false; error: string };

async function contesto() {
  const ctx = await requireTenantContext();
  if (!['owner', 'admin', 'office'].includes(ctx.role)) return null;
  return { ctx, service: createServiceSupabase() };
}

function rivalida() {
  revalidatePath('/office/kantiere/categorie');
  revalidatePath('/office/kantiere/cantieri');
}

// ---------------------------------------------------------------------------
// Registro
// ---------------------------------------------------------------------------

const NOME = z.string().trim().min(1).max(120);

export async function creaCategoria(input: { nome: string }): Promise<Esito> {
  const parsed = z.object({ nome: NOME }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Serve un nome.' };
  const c = await contesto();
  if (!c) return { ok: false, error: 'Permessi mancanti.' };

  const { error } = await c.service.from('cantiere_categorie' as never).insert({
    tenant_id: c.ctx.tenantId,
    nome: parsed.data.nome,
    origine: 'manuale',
  } as never);
  if (error) {
    return {
      ok: false,
      error: error.message.includes('duplicate') || error.code === '23505'
        ? 'Esiste già una categoria con questo nome.'
        : error.message,
    };
  }

  await auditTenant(c.service, {
    tenantId: c.ctx.tenantId,
    actorUserId: c.ctx.userId,
    actorRole: c.ctx.role,
    entityType: 'cantiere_categoria',
    action: 'categoria.crea',
    after: { nome: parsed.data.nome },
  });
  rivalida();
  return { ok: true };
}

/**
 * Rinomina, e **porta con se' i cantieri** che usavano il nome vecchio.
 *
 * E' il motivo per cui il registro esiste: senza, `QUADRI` scritto male su
 * ventiquattro cantieri restava scritto male per sempre.
 */
export async function rinominaCategoria(input: {
  id: string;
  nome: string;
}): Promise<{ ok: true; cantieriAggiornati: number } | { ok: false; error: string }> {
  const parsed = z.object({ id: z.string().uuid(), nome: NOME }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Dati non validi.' };
  const c = await contesto();
  if (!c) return { ok: false, error: 'Permessi mancanti.' };

  const { data: prima } = await c.service
    .from('cantiere_categorie' as never)
    .select('nome')
    .eq('id', parsed.data.id)
    .eq('tenant_id', c.ctx.tenantId)
    .maybeSingle();
  const vecchio = (prima as unknown as { nome: string } | null)?.nome;
  if (!vecchio) return { ok: false, error: 'Categoria inesistente.' };
  if (vecchio === parsed.data.nome) return { ok: true, cantieriAggiornati: 0 };

  const { error } = await c.service
    .from('cantiere_categorie' as never)
    .update({ nome: parsed.data.nome, updated_at: new Date().toISOString() } as never)
    .eq('id', parsed.data.id)
    .eq('tenant_id', c.ctx.tenantId);
  if (error) {
    return {
      ok: false,
      error: error.code === '23505'
        ? 'Esiste già una categoria con questo nome. Se volevi unirle, usa «Unisci».'
        : error.message,
    };
  }

  const { count } = await c.service
    .from('cantieri' as never)
    .update({ categoria: parsed.data.nome } as never, { count: 'exact' })
    .eq('tenant_id', c.ctx.tenantId)
    .eq('categoria', vecchio);

  await auditTenant(c.service, {
    tenantId: c.ctx.tenantId,
    actorUserId: c.ctx.userId,
    actorRole: c.ctx.role,
    entityType: 'cantiere_categoria',
    entityId: parsed.data.id,
    action: 'categoria.rinomina',
    before: { nome: vecchio },
    after: { nome: parsed.data.nome, cantieri_aggiornati: count ?? 0 },
  });
  rivalida();
  return { ok: true, cantieriAggiornati: count ?? 0 };
}

export async function attivaCategoria(input: {
  id: string;
  attiva: boolean;
}): Promise<Esito> {
  const parsed = z.object({ id: z.string().uuid(), attiva: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Dati non validi.' };
  const c = await contesto();
  if (!c) return { ok: false, error: 'Permessi mancanti.' };

  const { error } = await c.service
    .from('cantiere_categorie' as never)
    .update({ attiva: parsed.data.attiva, updated_at: new Date().toISOString() } as never)
    .eq('id', parsed.data.id)
    .eq('tenant_id', c.ctx.tenantId);
  if (error) return { ok: false, error: error.message };
  rivalida();
  return { ok: true };
}

/**
 * Fonde due categorie: i cantieri della prima passano alla seconda, le
 * corrispondenze col gestionale la seguono, e la prima sparisce.
 *
 * E' l'operazione che risolve i `QUADRI` / `QUADRI - CL` nati per sbaglio, e
 * l'unica distruttiva qui dentro — per questo sposta prima e cancella dopo.
 */
export async function unisciCategorie(input: {
  daId: string;
  aId: string;
}): Promise<{ ok: true; cantieriSpostati: number } | { ok: false; error: string }> {
  const parsed = z
    .object({ daId: z.string().uuid(), aId: z.string().uuid() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Dati non validi.' };
  if (parsed.data.daId === parsed.data.aId) {
    return { ok: false, error: 'Sono la stessa categoria.' };
  }
  const c = await contesto();
  if (!c) return { ok: false, error: 'Permessi mancanti.' };

  const { data: righe } = await c.service
    .from('cantiere_categorie' as never)
    .select('id, nome')
    .eq('tenant_id', c.ctx.tenantId)
    .in('id', [parsed.data.daId, parsed.data.aId]);
  const mappa = new Map(
    ((righe ?? []) as unknown as { id: string; nome: string }[]).map((r) => [r.id, r.nome]),
  );
  const da = mappa.get(parsed.data.daId);
  const a = mappa.get(parsed.data.aId);
  if (!da || !a) return { ok: false, error: 'Categoria inesistente.' };

  const { count } = await c.service
    .from('cantieri' as never)
    .update({ categoria: a } as never, { count: 'exact' })
    .eq('tenant_id', c.ctx.tenantId)
    .eq('categoria', da);

  // Le corrispondenze col gestionale seguono: se `CONSUNTIVO MAN` puntava a
  // quella che sparisce, deve puntare a quella che resta — altrimenti al
  // prossimo giro tornerebbe "da smistare".
  await c.service
    .from('categoria_mappature' as never)
    .update({ categoria_id: parsed.data.aId } as never)
    .eq('tenant_id', c.ctx.tenantId)
    .eq('categoria_id', parsed.data.daId);

  const { error } = await c.service
    .from('cantiere_categorie' as never)
    .delete()
    .eq('id', parsed.data.daId)
    .eq('tenant_id', c.ctx.tenantId);
  if (error) return { ok: false, error: error.message };

  await auditTenant(c.service, {
    tenantId: c.ctx.tenantId,
    actorUserId: c.ctx.userId,
    actorRole: c.ctx.role,
    entityType: 'cantiere_categoria',
    entityId: parsed.data.aId,
    action: 'categoria.unisci',
    before: { da },
    after: { a, cantieri_spostati: count ?? 0 },
  });
  rivalida();
  return { ok: true, cantieriSpostati: count ?? 0 };
}

/** Elimina, ma solo se non la usa nessuno: altrimenti si nasconde. */
export async function eliminaCategoria(input: { id: string }): Promise<Esito> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Dati non validi.' };
  const c = await contesto();
  if (!c) return { ok: false, error: 'Permessi mancanti.' };

  const { data: riga } = await c.service
    .from('cantiere_categorie' as never)
    .select('nome')
    .eq('id', parsed.data.id)
    .eq('tenant_id', c.ctx.tenantId)
    .maybeSingle();
  const nome = (riga as unknown as { nome: string } | null)?.nome;
  if (!nome) return { ok: false, error: 'Categoria inesistente.' };

  const { count } = await c.service
    .from('cantieri' as never)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', c.ctx.tenantId)
    .eq('categoria', nome);
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `La usano ${count} cantieri. Nascondila, oppure uniscila a un'altra.`,
    };
  }

  const { error } = await c.service
    .from('cantiere_categorie' as never)
    .delete()
    .eq('id', parsed.data.id)
    .eq('tenant_id', c.ctx.tenantId);
  if (error) return { ok: false, error: error.message };

  await auditTenant(c.service, {
    tenantId: c.ctx.tenantId,
    actorUserId: c.ctx.userId,
    actorRole: c.ctx.role,
    entityType: 'cantiere_categoria',
    entityId: parsed.data.id,
    action: 'categoria.elimina',
    before: { nome },
  });
  rivalida();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Smistamento dei valori del gestionale
// ---------------------------------------------------------------------------

/**
 * Decide dove va un valore arrivato dal gestionale: su una categoria che
 * abbiamo gia', oppure su una nuova promossa da quel valore.
 *
 * La promozione e' **esplicita e umana** apposta: se la facesse la macchina,
 * la nostra lista diventerebbe lo specchio della sorgente piu' disordinata, e
 * un refuso del gestionale entrerebbe in casa per sempre.
 */
export async function smistaValoreEsterno(input: {
  valoreEsterno: string;
  /** `null` = promuovi il valore stesso a categoria nuova. */
  categoriaId: string | null;
}): Promise<{ ok: true; nome: string } | { ok: false; error: string }> {
  const parsed = z
    .object({
      valoreEsterno: z.string().trim().min(1).max(200),
      categoriaId: z.string().uuid().nullable(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Dati non validi.' };
  const c = await contesto();
  if (!c) return { ok: false, error: 'Permessi mancanti.' };

  const { data: mod } = await c.service
    .from('tenant_modules' as never)
    .select('config')
    .eq('tenant_id', c.ctx.tenantId)
    .eq('module_code', 'integrazione')
    .maybeSingle();
  const sistema = (mod as unknown as { config?: { sistema?: string } } | null)?.config?.sistema;
  if (!sistema) return { ok: false, error: 'Nessun gestionale configurato.' };

  let categoriaId = parsed.data.categoriaId;
  let nome: string;

  if (categoriaId) {
    const { data: cat } = await c.service
      .from('cantiere_categorie' as never)
      .select('nome')
      .eq('id', categoriaId)
      .eq('tenant_id', c.ctx.tenantId)
      .maybeSingle();
    const n = (cat as unknown as { nome: string } | null)?.nome;
    if (!n) return { ok: false, error: 'Categoria inesistente.' };
    nome = n;
  } else {
    nome = parsed.data.valoreEsterno;
    const { data: creata, error } = await c.service
      .from('cantiere_categorie' as never)
      .insert({
        tenant_id: c.ctx.tenantId,
        nome,
        origine: 'gestionale',
      } as never)
      .select('id')
      .single();
    if (error || !creata) {
      // Gia' esistente con un altro giro di maiuscole: la si riusa invece di
      // fermarsi con un errore che l'utente non saprebbe come risolvere.
      const { data: gia } = await c.service
        .from('cantiere_categorie' as never)
        .select('id, nome')
        .eq('tenant_id', c.ctx.tenantId);
      const trovata = ((gia ?? []) as unknown as { id: string; nome: string }[]).find(
        (g) => chiaveCategoria(g.nome) === chiaveCategoria(nome),
      );
      if (!trovata) return { ok: false, error: error?.message ?? 'Creazione fallita.' };
      categoriaId = trovata.id;
      nome = trovata.nome;
    } else {
      categoriaId = (creata as unknown as { id: string }).id;
    }
  }

  const { error: errMap } = await c.service.from('categoria_mappature' as never).upsert(
    {
      tenant_id: c.ctx.tenantId,
      sistema,
      valore_esterno: parsed.data.valoreEsterno,
      categoria_id: categoriaId,
      visto_al: new Date().toISOString(),
    } as never,
    { onConflict: 'tenant_id,sistema,valore_esterno' },
  );
  if (errMap) return { ok: false, error: errMap.message };

  // I cantieri che portano ancora il valore grezzo passano al nome nostro:
  // e' il momento in cui lo smistamento diventa visibile a schermo.
  const { count } = await c.service
    .from('cantieri' as never)
    .update({ categoria: nome } as never, { count: 'exact' })
    .eq('tenant_id', c.ctx.tenantId)
    .eq('categoria', parsed.data.valoreEsterno);

  await auditTenant(c.service, {
    tenantId: c.ctx.tenantId,
    actorUserId: c.ctx.userId,
    actorRole: c.ctx.role,
    entityType: 'cantiere_categoria',
    entityId: categoriaId,
    action: 'categoria.smista',
    after: {
      valore_esterno: parsed.data.valoreEsterno,
      nome,
      cantieri_aggiornati: count ?? 0,
    },
  });
  rivalida();
  return { ok: true, nome };
}

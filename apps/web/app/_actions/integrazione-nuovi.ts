'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';

import { auditTenant } from './_lib/audit';

/**
 * Cosa fare di un record che il gestionale ha e noi no.
 *
 * Tre strade, e sono tutte e tre necessarie:
 *
 * 1. **collega** a un nostro record che esiste già — il caso più comune, e
 *    quello dove il match automatico ha fallito per una grafia diversa;
 * 2. **crea** il record da noi;
 * 3. **ignora**: non è un nostro dato. Senza questa, l'avviso resta acceso
 *    per sempre — l'anagrafica di un ERP è piena di account di servizio e
 *    postazioni (`User Ergo SW`, `Officina Mobile`) che persone non sono.
 *
 * ⚠️ **Non si crea mai in automatico un dipendente.** Un cantiere sbagliato è
 * una riga da cancellare; una persona è un contratto, una busta paga e un
 * accesso all'app. Qui decide sempre qualcuno.
 */

type Esito = { ok: true } | { ok: false; error: string };

const ENTITA = z.enum(['dipendente', 'commessa']);

async function contesto() {
  const ctx = await requireTenantContext();
  if (!['owner', 'admin', 'office'].includes(ctx.role)) return null;
  const service = createServiceSupabase();
  const { data: mod } = await service
    .from('tenant_modules' as never)
    .select('attivo, config')
    .eq('tenant_id', ctx.tenantId)
    .eq('module_code', 'integrazione')
    .maybeSingle();
  const riga = mod as unknown as {
    attivo: boolean;
    config: Record<string, unknown> | null;
  } | null;
  if (!riga?.attivo) return null;
  const sistema = typeof riga.config?.sistema === 'string' ? riga.config.sistema : null;
  if (!sistema) return null;
  return { ctx, service, sistema };
}

function rivalida() {
  revalidatePath('/office/kantiere/dipendenti');
  revalidatePath('/office/kantiere/cantieri');
  revalidatePath('/office/integrazione');
}

/** Nel registro delle mappature il mondo Kantiere chiama `cantiere` la commessa. */
const entitaNostra = (e: 'dipendente' | 'commessa') =>
  e === 'dipendente' ? 'dipendente' : 'cantiere';

// ---------------------------------------------------------------------------

const COLLEGA = z.object({
  entita: ENTITA,
  externalId: z.string().trim().min(1).max(120),
  /** Il nostro record a cui agganciarlo. */
  nostroId: z.string().uuid(),
  etichetta: z.string().trim().max(300).optional(),
});

export async function collegaDalGestionale(input: unknown): Promise<Esito> {
  const p = COLLEGA.safeParse(input);
  if (!p.success) return { ok: false, error: 'Dati non validi.' };
  const c = await contesto();
  if (!c) return { ok: false, error: 'Integrazione non attiva o permessi mancanti.' };

  // Un id del gestionale non può finire su due nostri record: le ore
  // verrebbero imputate due volte e nessuno se ne accorgerebbe finché i costi
  // non risultano doppi.
  const { data: gia } = await c.service
    .from('integrazione_mappature' as never)
    .select('entita_id')
    .eq('tenant_id', c.ctx.tenantId)
    .eq('sistema', c.sistema)
    .eq('entita', entitaNostra(p.data.entita))
    .eq('external_id', p.data.externalId)
    .maybeSingle();
  if (gia) return { ok: false, error: 'Questo record del gestionale è già collegato a un altro.' };

  const { error } = await c.service.from('integrazione_mappature' as never).upsert(
    {
      tenant_id: c.ctx.tenantId,
      sistema: c.sistema,
      entita: entitaNostra(p.data.entita),
      entita_id: p.data.nostroId,
      external_id: p.data.externalId,
      external_dati: { nome: p.data.etichetta ?? null },
      // `manuale` protegge la riga dai ri-abbinamenti automatici: una persona
      // l'ha guardata.
      origine: 'manuale',
    } as never,
    { onConflict: 'tenant_id,sistema,entita,entita_id' },
  );
  if (error) return { ok: false, error: error.message };

  await auditTenant(c.service, {
    tenantId: c.ctx.tenantId,
    actorUserId: c.ctx.userId,
    actorRole: c.ctx.role,
    entityType: p.data.entita,
    entityId: p.data.nostroId,
    action: 'integrazione.collega',
    after: { external_id: p.data.externalId, etichetta: p.data.etichetta ?? null },
  });
  rivalida();
  return { ok: true };
}

// ---------------------------------------------------------------------------

const CREA_DIPENDENTE = z.object({
  externalId: z.string().trim().min(1).max(120),
  nome: z.string().trim().min(1).max(120),
  cognome: z.string().trim().min(1).max(120),
  /** La NOSTRA matricola (quella del consulente del lavoro), non la loro. */
  matricola: z.string().trim().max(40).optional(),
  mansione: z.string().trim().max(120).optional(),
  inForza: z.boolean().default(true),
});

/**
 * Crea un dipendente a partire da un record del gestionale, già collegato.
 *
 * ⚠️ La **matricola resta nostra**: è quella del consulente del lavoro, e non
 * ha niente a che vedere con l'identificativo del gestionale. Su FPM le due
 * numerazioni si somigliano e non coincidono — `00003` da noi è Benedetti, il
 * `3` di ERGO è Biscaro. Metterci il loro codice inquinerebbe la busta paga.
 * Per questo il campo si compila a mano e si lascia vuoto se non lo si sa.
 */
export async function creaDipendenteDalGestionale(
  input: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const p = CREA_DIPENDENTE.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Dati non validi.' };
  const c = await contesto();
  if (!c) return { ok: false, error: 'Integrazione non attiva o permessi mancanti.' };

  if (p.data.matricola) {
    const { data: dup } = await c.service
      .from('dipendenti' as never)
      .select('id')
      .eq('tenant_id', c.ctx.tenantId)
      .eq('codice_interno', p.data.matricola)
      .maybeSingle();
    if (dup) return { ok: false, error: `La matricola ${p.data.matricola} è già di qualcun altro.` };
  }

  const { data: creato, error } = await c.service
    .from('dipendenti' as never)
    .insert({
      tenant_id: c.ctx.tenantId,
      nome: p.data.nome,
      cognome: p.data.cognome,
      codice_interno: p.data.matricola || null,
      mansione: p.data.mansione || null,
      stato_attivo: p.data.inForza,
    } as never)
    .select('id')
    .single();
  if (error || !creato) return { ok: false, error: error?.message ?? 'Creazione fallita.' };

  const id = (creato as unknown as { id: string }).id;
  const { error: errMap } = await c.service.from('integrazione_mappature' as never).insert({
    tenant_id: c.ctx.tenantId,
    sistema: c.sistema,
    entita: 'dipendente',
    entita_id: id,
    external_id: p.data.externalId,
    external_dati: { nome: `${p.data.cognome} ${p.data.nome}` },
    origine: 'manuale',
  } as never);
  if (errMap) {
    // Il dipendente resta, ma senza collegamento non riceverebbe ore: va detto
    // invece di lasciarlo lì a sembrare a posto.
    return {
      ok: false,
      error: 'Dipendente creato, ma il collegamento è fallito: collegalo a mano.',
    };
  }

  await auditTenant(c.service, {
    tenantId: c.ctx.tenantId,
    actorUserId: c.ctx.userId,
    actorRole: c.ctx.role,
    entityType: 'dipendente',
    entityId: id,
    action: 'integrazione.crea_dipendente',
    after: {
      external_id: p.data.externalId,
      nome: `${p.data.cognome} ${p.data.nome}`,
      matricola: p.data.matricola ?? null,
    },
  });
  rivalida();
  return { ok: true, id };
}

// ---------------------------------------------------------------------------

const IGNORA = z.object({
  entita: ENTITA,
  externalId: z.string().trim().min(1).max(120),
  etichetta: z.string().trim().max(300).optional(),
  motivo: z.string().trim().max(300).optional(),
});

/** «Non è un nostro dato»: sparisce dagli avvisi, non si cancella niente. */
export async function ignoraDalGestionale(input: unknown): Promise<Esito> {
  const p = IGNORA.safeParse(input);
  if (!p.success) return { ok: false, error: 'Dati non validi.' };
  const c = await contesto();
  if (!c) return { ok: false, error: 'Integrazione non attiva o permessi mancanti.' };

  const { error } = await c.service.from('integrazione_ignorati' as never).upsert(
    {
      tenant_id: c.ctx.tenantId,
      sistema: c.sistema,
      entita: p.data.entita,
      external_id: p.data.externalId,
      etichetta: p.data.etichetta ?? null,
      motivo: p.data.motivo ?? null,
      ignorato_da: c.ctx.userId,
    } as never,
    { onConflict: 'tenant_id,sistema,entita,external_id' },
  );
  if (error) return { ok: false, error: error.message };

  await auditTenant(c.service, {
    tenantId: c.ctx.tenantId,
    actorUserId: c.ctx.userId,
    actorRole: c.ctx.role,
    entityType: p.data.entita,
    action: 'integrazione.ignora',
    after: { external_id: p.data.externalId, etichetta: p.data.etichetta ?? null },
  });
  rivalida();
  return { ok: true };
}

/** Ripensamento: torna negli avvisi. */
export async function riprendiIgnorato(input: unknown): Promise<Esito> {
  const p = z
    .object({ entita: ENTITA, externalId: z.string().trim().min(1) })
    .safeParse(input);
  if (!p.success) return { ok: false, error: 'Dati non validi.' };
  const c = await contesto();
  if (!c) return { ok: false, error: 'Integrazione non attiva o permessi mancanti.' };

  const { error } = await c.service
    .from('integrazione_ignorati' as never)
    .delete()
    .eq('tenant_id', c.ctx.tenantId)
    .eq('sistema', c.sistema)
    .eq('entita', p.data.entita)
    .eq('external_id', p.data.externalId);
  if (error) return { ok: false, error: error.message };
  rivalida();
  return { ok: true };
}

'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import type { AppRole } from '@kommessa/api';
import { prossimoCodiceCantiere } from '@kommessa/api/kantiere';
import { tenantHasModule } from '@/app/_lib/modules';

/**
 * Server actions per la gestione dei Cantieri (CRUD + squadra + QR cantiere).
 *
 * Gated: richiede il modulo `kantiere`. Solo `admin` e `office` possono
 * eseguire mutazioni.
 *
 * Le tabelle `cantieri`, `cantiere_squadra` e `cantiere_qr` non sono nei
 * tipi generati → uso `as never` sulle chiamate `.from()`.
 */

const MANAGE_ROLES = new Set<AppRole>(['admin', 'office']);

// ── Guard condiviso ────────────────────────────────────────────────────────

async function guard() {
  const ctx = await requireTenantContext();
  if (!MANAGE_ROLES.has(ctx.role)) throw new Error('Solo admin/office possono gestire i cantieri');
  if (!(await tenantHasModule('kantiere'))) throw new Error('Modulo kantiere non attivo per questo tenant');
  return ctx;
}

// ── Utility ────────────────────────────────────────────────────────────────

function nuovoToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Verifica che il cantiere esista e appartenga al tenant. */
async function cantiereDelTenant(
  supabase: ReturnType<typeof createServerSupabase>,
  tenantId: string,
  cantiereId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('cantieri' as never)
    .select('id')
    .eq('id', cantiereId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Sincronizza l'anagrafica Sedi a partire dalla "Sede di partenza" digitata
 * sulla scheda cantiere.
 *
 * Quando l'utente compila la sede di partenza con un indirizzo geolocalizzato
 * (lat/lng presenti), la sede viene:
 *   1. creata/aggiornata nell'anagrafica `sedi` (match idempotente per nome),
 *   2. impostata come sede PREDEFINITA del tenant (mostrata come partenza per
 *      tutti i cantieri alla timbratura),
 *   3. associata a questo cantiere.
 *
 * Senza coordinate non si fa nulla (la sede non servirebbe al calcolo viaggio).
 * Best-effort: un errore qui NON fa fallire il salvataggio del cantiere.
 */
async function sincronizzaSedeDefaultDaCantiere(
  supabase: ReturnType<typeof createServerSupabase>,
  tenantId: string,
  cantiereId: string,
  sedePartenza: string | null,
  lat: number | null,
  lng: number | null,
): Promise<void> {
  const nome = (sedePartenza ?? '').trim();
  if (!nome || lat == null || lng == null) return;

  try {
    // Idempotenza: riusa una sede esistente con lo stesso nome.
    const { data: esistente } = await supabase
      .from('sedi' as never)
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('nome', nome)
      .maybeSingle();

    let sedeId = (esistente as { id: string } | null)?.id ?? null;

    if (sedeId) {
      await supabase
        .from('sedi' as never)
        .update({ indirizzo: nome, lat, lng, attivo: true } as never)
        .eq('id', sedeId)
        .eq('tenant_id', tenantId);
    } else {
      const { data: creata } = await supabase
        .from('sedi' as never)
        .insert({
          tenant_id: tenantId,
          nome,
          tipo: 'sede_principale',
          indirizzo: nome,
          lat,
          lng,
          is_default: false,
          attivo: true,
        } as never)
        .select('id')
        .single();
      sedeId = (creata as { id: string } | null)?.id ?? null;
    }
    if (!sedeId) return;

    // Imposta come predefinita (reset altri, set questa).
    await supabase
      .from('sedi' as never)
      .update({ is_default: false } as never)
      .eq('tenant_id', tenantId);
    await supabase
      .from('sedi' as never)
      .update({ is_default: true } as never)
      .eq('id', sedeId)
      .eq('tenant_id', tenantId);

    // Associa al cantiere (idempotente).
    await supabase
      .from('cantiere_sede' as never)
      .upsert(
        { cantiere_id: cantiereId, sede_id: sedeId, tenant_id: tenantId } as never,
        { onConflict: 'cantiere_id,sede_id' },
      );
  } catch {
    // Best-effort: ignora gli errori di sync sede.
  }
}

// ── Tipi ritorno ──────────────────────────────────────────────────────────

type OkResult = { ok: true } | { ok: false; error: string };
type CreaCantResult = { ok: true; id: string; codice: string } | { ok: false; error: string };
type QrResult = { ok: true; token: string } | { ok: false; error: string };

// ── 1. creaCantiere ───────────────────────────────────────────────────────

const CreaCantSchema = z.object({
  nome: z.string().min(1).max(160),
  indirizzo: z.string().max(300).optional().nullable(),
  indirizzoLat: z.number().optional().nullable(),
  indirizzoLng: z.number().optional().nullable(),
  sedePartenza: z.string().max(300).optional().nullable(),
  sedePartenzaLat: z.number().optional().nullable(),
  sedePartenzaLng: z.number().optional().nullable(),
  commessaId: z.string().uuid().optional().nullable(),
  stato: z.enum(['attivo', 'sospeso', 'chiuso']).optional(),
  note: z.string().max(2000).optional().nullable(),
});

export async function creaCantiere(input: unknown): Promise<CreaCantResult> {
  const parsed = CreaCantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };

  let ctx;
  try { ctx = await guard(); } catch (e) { return { ok: false, error: (e as Error).message }; }

  const supabase = createServerSupabase();

  // Auto-codice
  const { data: esistenti } = await supabase
    .from('cantieri' as never)
    .select('codice')
    .eq('tenant_id', ctx.tenantId);
  const codici = ((esistenti ?? []) as { codice: string | null }[]).map((r) => r.codice);
  const codice = prossimoCodiceCantiere(codici);

  // Sede partenza di default dal modulo config se non fornita
  let sedePartenza = parsed.data.sedePartenza?.trim() || null;
  if (!sedePartenza) {
    const { data: modCfg } = await supabase
      .from('tenant_modules' as never)
      .select('config')
      .eq('tenant_id', ctx.tenantId)
      .eq('module_code', 'kantiere')
      .maybeSingle();
    const cfg = (modCfg as { config?: { sede_partenza_default?: string } } | null)?.config;
    sedePartenza = cfg?.sede_partenza_default ?? null;
  }

  const { data, error } = await supabase
    .from('cantieri' as never)
    .insert({
      tenant_id: ctx.tenantId,
      codice,
      nome: parsed.data.nome,
      indirizzo: parsed.data.indirizzo ?? null,
      indirizzo_lat: parsed.data.indirizzoLat ?? null,
      indirizzo_lng: parsed.data.indirizzoLng ?? null,
      sede_partenza: sedePartenza,
      sede_partenza_lat: parsed.data.sedePartenzaLat ?? null,
      sede_partenza_lng: parsed.data.sedePartenzaLng ?? null,
      commessa_id: parsed.data.commessaId ?? null,
      stato: parsed.data.stato ?? 'attivo',
      note: parsed.data.note ?? null,
    } as never)
    .select('id, codice')
    .single();

  if (error) return { ok: false, error: error.message };
  const row = data as { id: string; codice: string };

  // Se la sede di partenza è geolocalizzata, popolala nell'anagrafica Sedi.
  await sincronizzaSedeDefaultDaCantiere(
    supabase,
    ctx.tenantId,
    row.id,
    sedePartenza,
    parsed.data.sedePartenzaLat ?? null,
    parsed.data.sedePartenzaLng ?? null,
  );

  revalidatePath('/office/kantiere/cantieri');
  revalidatePath('/office/kantiere/sedi');
  return { ok: true, id: row.id, codice: row.codice };
}

// ── 2. aggiornaCantiere ───────────────────────────────────────────────────

const AggiornaCantSchema = z.object({
  id: z.string().uuid(),
  nome: z.string().min(1).max(160).optional(),
  indirizzo: z.string().max(300).optional().nullable(),
  indirizzoLat: z.number().optional().nullable(),
  indirizzoLng: z.number().optional().nullable(),
  sedePartenza: z.string().max(300).optional().nullable(),
  sedePartenzaLat: z.number().optional().nullable(),
  sedePartenzaLng: z.number().optional().nullable(),
  commessaId: z.string().uuid().optional().nullable(),
  stato: z.enum(['attivo', 'sospeso', 'chiuso']).optional(),
  indirizzoDaVerificare: z.boolean().optional(),
  note: z.string().max(2000).optional().nullable(),
});

export async function aggiornaCantiere(input: unknown): Promise<OkResult> {
  const parsed = AggiornaCantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };

  let ctx;
  try { ctx = await guard(); } catch (e) { return { ok: false, error: (e as Error).message }; }

  const supabase = createServerSupabase();

  // Build patch con soli campi forniti
  const patch: Record<string, unknown> = {};
  if (parsed.data.nome !== undefined) patch['nome'] = parsed.data.nome;
  if ('indirizzo' in parsed.data) patch['indirizzo'] = parsed.data.indirizzo ?? null;
  if ('indirizzoLat' in parsed.data) patch['indirizzo_lat'] = parsed.data.indirizzoLat ?? null;
  if ('indirizzoLng' in parsed.data) patch['indirizzo_lng'] = parsed.data.indirizzoLng ?? null;
  if ('sedePartenza' in parsed.data) patch['sede_partenza'] = parsed.data.sedePartenza ?? null;
  if ('sedePartenzaLat' in parsed.data) patch['sede_partenza_lat'] = parsed.data.sedePartenzaLat ?? null;
  if ('sedePartenzaLng' in parsed.data) patch['sede_partenza_lng'] = parsed.data.sedePartenzaLng ?? null;
  if ('commessaId' in parsed.data) patch['commessa_id'] = parsed.data.commessaId ?? null;
  if (parsed.data.stato !== undefined) patch['stato'] = parsed.data.stato;
  if ('indirizzoDaVerificare' in parsed.data)
    patch['indirizzo_da_verificare'] = parsed.data.indirizzoDaVerificare ?? false;
  if ('note' in parsed.data) patch['note'] = parsed.data.note ?? null;

  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await supabase
    .from('cantieri' as never)
    .update(patch as never)
    .eq('id', parsed.data.id)
    .eq('tenant_id', ctx.tenantId);

  if (error) return { ok: false, error: error.message };

  // Se è stata aggiornata la sede di partenza con coordinate, sincronizza
  // l'anagrafica Sedi (crea/aggiorna + default + associazione al cantiere).
  if ('sedePartenza' in parsed.data) {
    await sincronizzaSedeDefaultDaCantiere(
      supabase,
      ctx.tenantId,
      parsed.data.id,
      parsed.data.sedePartenza ?? null,
      parsed.data.sedePartenzaLat ?? null,
      parsed.data.sedePartenzaLng ?? null,
    );
  }

  revalidatePath('/office/kantiere/cantieri');
  revalidatePath(`/office/kantiere/cantieri/${parsed.data.id}`);
  revalidatePath('/office/kantiere/sedi');
  return { ok: true };
}

// ── 3. eliminaCantiere ────────────────────────────────────────────────────

export async function eliminaCantiere(input: unknown): Promise<OkResult> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  let ctx;
  try { ctx = await guard(); } catch (e) { return { ok: false, error: (e as Error).message }; }

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('cantieri' as never)
    .delete()
    .eq('id', parsed.data.id)
    .eq('tenant_id', ctx.tenantId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/office/kantiere/cantieri');
  return { ok: true };
}

// ── 4. aggiungiMembroSquadraCantiere ─────────────────────────────────────

const AggiungiMembroSchema = z.object({
  cantiereId: z.string().uuid(),
  dipendenteId: z.string().uuid(),
  ruolo: z.enum(['capo', 'membro']).optional(),
});

export async function aggiungiMembroSquadraCantiere(input: unknown): Promise<OkResult> {
  const parsed = AggiungiMembroSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  let ctx;
  try { ctx = await guard(); } catch (e) { return { ok: false, error: (e as Error).message }; }

  const supabase = createServerSupabase();

  // Verifica cantiere appartiene al tenant
  if (!(await cantiereDelTenant(supabase, ctx.tenantId, parsed.data.cantiereId))) {
    return { ok: false, error: 'Cantiere non trovato per questo tenant' };
  }

  // Verifica dipendente appartiene al tenant
  const { data: dip } = await supabase
    .from('dipendenti' as never)
    .select('id, tenant_id')
    .eq('id', parsed.data.dipendenteId)
    .maybeSingle();
  const dipRow = dip as { id: string; tenant_id: string } | null;
  if (!dipRow || dipRow.tenant_id !== ctx.tenantId) {
    return { ok: false, error: 'Dipendente non trovato per questo tenant' };
  }

  const { error } = await supabase
    .from('cantiere_squadra' as never)
    .upsert(
      {
        cantiere_id: parsed.data.cantiereId,
        dipendente_id: parsed.data.dipendenteId,
        tenant_id: ctx.tenantId,
        ruolo: parsed.data.ruolo ?? 'membro',
        assegnato_da: ctx.userId,
      } as never,
      { onConflict: 'cantiere_id,dipendente_id' },
    );

  if (error) return { ok: false, error: `Assegnazione fallita: ${error.message}` };

  revalidatePath(`/office/kantiere/cantieri/${parsed.data.cantiereId}`);
  return { ok: true };
}

// ── 5. rimuoviMembroSquadraCantiere ──────────────────────────────────────

const RimuoviMembroSchema = z.object({
  cantiereId: z.string().uuid(),
  dipendenteId: z.string().uuid(),
});

export async function rimuoviMembroSquadraCantiere(input: unknown): Promise<OkResult> {
  const parsed = RimuoviMembroSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  let ctx;
  try { ctx = await guard(); } catch (e) { return { ok: false, error: (e as Error).message }; }

  const supabase = createServerSupabase();

  const { error } = await supabase
    .from('cantiere_squadra' as never)
    .delete()
    .eq('cantiere_id', parsed.data.cantiereId)
    .eq('dipendente_id', parsed.data.dipendenteId)
    .eq('tenant_id', ctx.tenantId);

  if (error) return { ok: false, error: `Rimozione fallita: ${error.message}` };

  revalidatePath(`/office/kantiere/cantieri/${parsed.data.cantiereId}`);
  return { ok: true };
}

// ── 6. impostaRuoloSquadraCantiere ────────────────────────────────────────

const ImpostaRuoloSchema = z.object({
  cantiereId: z.string().uuid(),
  dipendenteId: z.string().uuid(),
  ruolo: z.enum(['capo', 'membro']),
});

export async function impostaRuoloSquadraCantiere(input: unknown): Promise<OkResult> {
  const parsed = ImpostaRuoloSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  let ctx;
  try { ctx = await guard(); } catch (e) { return { ok: false, error: (e as Error).message }; }

  const supabase = createServerSupabase();

  const { error } = await supabase
    .from('cantiere_squadra' as never)
    .update({ ruolo: parsed.data.ruolo } as never)
    .eq('cantiere_id', parsed.data.cantiereId)
    .eq('dipendente_id', parsed.data.dipendenteId)
    .eq('tenant_id', ctx.tenantId);

  if (error) return { ok: false, error: `Aggiornamento ruolo fallito: ${error.message}` };

  revalidatePath(`/office/kantiere/cantieri/${parsed.data.cantiereId}`);
  return { ok: true };
}

// ── 7. generaQrCantiere ───────────────────────────────────────────────────

const QrCantSchema = z.object({ cantiereId: z.string().uuid() });

export async function generaQrCantiere(input: unknown): Promise<QrResult> {
  const parsed = QrCantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  let ctx;
  try { ctx = await guard(); } catch (e) { return { ok: false, error: (e as Error).message }; }

  const supabase = createServerSupabase();

  if (!(await cantiereDelTenant(supabase, ctx.tenantId, parsed.data.cantiereId))) {
    return { ok: false, error: 'Cantiere non trovato per questo tenant' };
  }

  // Idempotente: se esiste già un QR attivo per questo cantiere, restituiscilo
  const { data: esistente } = await supabase
    .from('cantiere_qr' as never)
    .select('token')
    .eq('cantiere_id', parsed.data.cantiereId)
    .eq('attivo', true)
    .maybeSingle();
  if (esistente) return { ok: true, token: (esistente as { token: string }).token };

  const token = nuovoToken();
  const { error } = await supabase.from('cantiere_qr' as never).insert({
    tenant_id: ctx.tenantId,
    cantiere_id: parsed.data.cantiereId,
    token,
    created_by: ctx.userId,
  } as never);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/office/kantiere/cantieri/${parsed.data.cantiereId}`);
  return { ok: true, token };
}

// ── 9. impostaSquadraCantiere ─────────────────────────────────────────────

const ImpostaSquadraSchema = z.object({
  cantiereId: z.string().uuid(),
  capoId: z.string().uuid().nullable(),
  membriIds: z.array(z.string().uuid()),
});

export async function impostaSquadraCantiere(input: unknown): Promise<OkResult> {
  const parsed = ImpostaSquadraSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };

  let ctx;
  try { ctx = await guard(); } catch (e) { return { ok: false, error: (e as Error).message }; }

  const supabase = createServerSupabase();

  if (!(await cantiereDelTenant(supabase, ctx.tenantId, parsed.data.cantiereId))) {
    return { ok: false, error: 'Cantiere non trovato per questo tenant' };
  }

  // Cancella tutta la squadra corrente
  const { error: delError } = await supabase
    .from('cantiere_squadra' as never)
    .delete()
    .eq('cantiere_id', parsed.data.cantiereId)
    .eq('tenant_id', ctx.tenantId);

  if (delError) return { ok: false, error: `Reset squadra fallito: ${delError.message}` };

  // Costruisci le nuove righe
  const { capoId, membriIds } = parsed.data;
  const nuoveRighe: {
    cantiere_id: string;
    dipendente_id: string;
    ruolo: string;
    tenant_id: string;
    assegnato_da: string;
  }[] = [];

  if (capoId) {
    nuoveRighe.push({
      cantiere_id: parsed.data.cantiereId,
      dipendente_id: capoId,
      ruolo: 'capo',
      tenant_id: ctx.tenantId,
      assegnato_da: ctx.userId,
    });
  }

  const capoIdStr = capoId ?? '';
  for (const id of membriIds) {
    if (id === capoIdStr) continue; // il capo non è anche membro
    nuoveRighe.push({
      cantiere_id: parsed.data.cantiereId,
      dipendente_id: id,
      ruolo: 'membro',
      tenant_id: ctx.tenantId,
      assegnato_da: ctx.userId,
    });
  }

  if (nuoveRighe.length > 0) {
    const { error: insError } = await supabase
      .from('cantiere_squadra' as never)
      .insert(nuoveRighe as never);
    if (insError) return { ok: false, error: `Inserimento squadra fallito: ${insError.message}` };
  }

  revalidatePath(`/office/kantiere/cantieri/${parsed.data.cantiereId}`);
  return { ok: true };
}

// ── 8. rigeneraQrCantiere ─────────────────────────────────────────────────

export async function rigeneraQrCantiere(input: unknown): Promise<QrResult> {
  const parsed = QrCantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  let ctx;
  try { ctx = await guard(); } catch (e) { return { ok: false, error: (e as Error).message }; }

  const supabase = createServerSupabase();

  if (!(await cantiereDelTenant(supabase, ctx.tenantId, parsed.data.cantiereId))) {
    return { ok: false, error: 'Cantiere non trovato per questo tenant' };
  }

  // Revoca QR attivo esistente
  await supabase
    .from('cantiere_qr' as never)
    .update({ attivo: false, revoked_at: new Date().toISOString() } as never)
    .eq('tenant_id', ctx.tenantId)
    .eq('cantiere_id', parsed.data.cantiereId)
    .eq('attivo', true);

  const token = nuovoToken();
  const { error } = await supabase.from('cantiere_qr' as never).insert({
    tenant_id: ctx.tenantId,
    cantiere_id: parsed.data.cantiereId,
    token,
    created_by: ctx.userId,
  } as never);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/office/kantiere/cantieri/${parsed.data.cantiereId}`);
  return { ok: true, token };
}

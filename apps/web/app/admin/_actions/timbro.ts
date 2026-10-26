'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServiceSupabase } from '@kommessa/api/service';

import { requirePlatformAdmin } from '../_lib/guard';
import { auditPlatform } from '../_lib/audit-platform';
import { ClientTimbro, ErroreTimbro } from '@/app/_lib/timbro/client';
import { leggiConfigTimbro } from '@/app/_lib/timbro/config';
import { importaTimbriTenant } from '@/app/_lib/timbro/import';

/**
 * Il governo del collegamento con la timbratrice Timbro, per cliente. Solo
 * super admin. Ogni giro di volante lascia traccia in `audit_events` — mai
 * con il token dentro.
 */

type Esito<T = Record<never, never>> = ({ ok: true } & T) | { ok: false; error: string };

const messaggio = (e: unknown) =>
  e instanceof ErroreTimbro ? `${e.codice}: ${e.message}` : e instanceof Error ? e.message : 'Errore sconosciuto';

function rinfresca(tenantId: string) {
  revalidatePath(`/admin/tenants/${tenantId}`);
  revalidatePath('/admin/integrazioni');
}

// ── Configurazione ───────────────────────────────────────────────────────────

const SALVA_SCHEMA = z.object({
  tenantId: z.string().uuid(),
  stato: z.enum(['spento', 'osservazione', 'attivo']),
  /** AAAA-MM-GG, o vuoto. */
  dal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  /** Nuovo token: assente = si tiene quello salvato. */
  token: z.string().min(10).max(500).optional(),
  urlBase: z.string().url().optional(),
});

export async function salvaCollegamentoTimbro(input: unknown): Promise<Esito<{ avviso?: string }>> {
  const admin = await requirePlatformAdmin();
  const parsed = SALVA_SCHEMA.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  const d = parsed.data;
  const service = createServiceSupabase();
  const prima = await leggiConfigTimbro(d.tenantId);

  // Un token nuovo si prova PRIMA di salvarlo: un token sbagliato salvato e'
  // un collegamento che sembra acceso e non legge niente.
  //
  // ⚠️ Si guardano anche gli SCOPE. Prima la prova chiamava `/punches`, che
  // vuole solo `punches:read`: una chiave senza `punches:write` passava, il
  // pannello diceva «funziona», e poi lo specchio delle nostre timbrature
  // falliva in silenzio con un 403. Mezzo collegamento che si dichiara intero.
  let avviso: string | null = null;
  if (d.token) {
    const client = new ClientTimbro(d.urlBase ?? prima?.urlBase ?? 'https://timbro-solva.vercel.app/api/v1', d.token);
    try {
      const io = await client.me();
      const scopes = io.key?.scopes ?? [];
      if (!scopes.includes('punches:read')) {
        return { ok: false, error: 'La chiave non ha il permesso di leggere le timbrature (`punches:read`).' };
      }
      if (!scopes.includes('punches:write')) {
        avviso =
          'La chiave legge ma non scrive: senza `punches:write` le timbrature fatte dall\'app non arrivano a Timbro, e il terminale non sa in che punto del turno è la persona.';
      }
    } catch (e) {
      return { ok: false, error: `Il token non funziona: ${messaggio(e)}` };
    }
  }
  if (d.stato !== 'spento' && !d.token && !prima?.token) {
    return { ok: false, error: 'Per accendere il collegamento serve il token di Timbro.' };
  }
  if (d.stato !== 'spento' && !d.dal) {
    return { ok: false, error: 'Per accendere il collegamento serve la data di partenza.' };
  }

  const riga: Record<string, unknown> = {
    tenant_id: d.tenantId,
    stato: d.stato,
    dal: d.dal,
    ...(d.token ? { token: d.token.trim() } : {}),
    ...(d.urlBase ? { url_base: d.urlBase } : {}),
  };
  const { error } = await service.from('integrazione_timbro' as never).upsert(riga as never, { onConflict: 'tenant_id' });
  if (error) return { ok: false, error: error.message };

  await auditPlatform({
    actorUserId: admin.userId,
    actorEmail: admin.email,
    tenantId: d.tenantId,
    entityType: 'integrazione_timbro',
    entityId: d.tenantId,
    action: 'timbro.collegamento.update',
    before: prima ? { stato: prima.stato, dal: prima.dal, conToken: !!prima.token } : null,
    after: { stato: d.stato, dal: d.dal, conToken: !!(d.token || prima?.token), tokenCambiato: !!d.token },
  });
  rinfresca(d.tenantId);
  // ⚠️ Un avviso si restituisce, non si tiene per sé: il collegamento è
  // salvato e funziona in lettura, ma chi l'ha salvato deve sapere che la
  // metà in scrittura non c'è.
  return avviso ? { ok: true, avviso } : { ok: true };
}

// ── Lettura a comando ────────────────────────────────────────────────────────

export async function leggiOraTimbro(input: { tenantId: string }): Promise<Esito<{ messaggio: string }>> {
  await requirePlatformAdmin();
  const tenantId = z.string().uuid().parse(input.tenantId);
  const esito = await importaTimbriTenant(tenantId, 'manuale');
  rinfresca(tenantId);
  return esito.ok ? { ok: true, messaggio: esito.messaggio ?? 'Fatto.' } : { ok: false, error: esito.messaggio ?? 'Lettura fallita.' };
}

// ── Webhook ──────────────────────────────────────────────────────────────────

const EVENTI_WEBHOOK = ['punch.created', 'punch.voided', 'punch.updated', 'badge.assigned'];

function urlWebhook(tenantId: string): string {
  // ⚠️ `.trim()`: la variabile su Vercel aveva un a capo in coda, e l'indirizzo
  // registrato su Timbro e' uscito spezzato in due righe.
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.kommessa.it').trim().replace(/\/$/, '');
  return `${base}/api/webhooks/timbro?t=${tenantId}`;
}

/** Registra il webhook su Timbro con il token (serve lo scope `webhooks:manage`). */
export async function registraWebhookTimbro(input: { tenantId: string }): Promise<Esito<{ url: string }>> {
  const admin = await requirePlatformAdmin();
  const tenantId = z.string().uuid().parse(input.tenantId);
  const cfg = await leggiConfigTimbro(tenantId);
  if (!cfg?.token) return { ok: false, error: 'Prima salva il token.' };
  const client = new ClientTimbro(cfg.urlBase, cfg.token);
  const url = urlWebhook(tenantId);
  try {
    if (cfg.webhookId) {
      await client.eliminaWebhook(cfg.webhookId).catch(() => null);
    }
    const creato = await client.creaWebhook(url, EVENTI_WEBHOOK);
    const service = createServiceSupabase();
    const { error } = await service
      .from('integrazione_timbro' as never)
      .update({ webhook_id: creato.id, webhook_secret: creato.secret } as never)
      .eq('tenant_id', tenantId);
    if (error) return { ok: false, error: error.message };
  } catch (e) {
    return { ok: false, error: messaggio(e) };
  }
  await auditPlatform({
    actorUserId: admin.userId,
    actorEmail: admin.email,
    tenantId,
    entityType: 'integrazione_timbro',
    entityId: tenantId,
    action: 'timbro.webhook.registra',
    metadata: { url },
  });
  rinfresca(tenantId);
  return { ok: true, url };
}

/** Il webhook e' stato creato dal lato di Timbro: qui si incolla solo il segreto. */
export async function impostaSegretoWebhookTimbro(input: { tenantId: string; secret: string }): Promise<Esito> {
  const admin = await requirePlatformAdmin();
  const parsed = z.object({ tenantId: z.string().uuid(), secret: z.string().min(8).max(500) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Segreto non valido.' };
  const service = createServiceSupabase();
  const { error } = await service
    .from('integrazione_timbro' as never)
    .update({ webhook_secret: parsed.data.secret.trim(), webhook_id: null } as never)
    .eq('tenant_id', parsed.data.tenantId);
  if (error) return { ok: false, error: error.message };
  await auditPlatform({
    actorUserId: admin.userId,
    actorEmail: admin.email,
    tenantId: parsed.data.tenantId,
    entityType: 'integrazione_timbro',
    entityId: parsed.data.tenantId,
    action: 'timbro.webhook.segreto',
  });
  rinfresca(parsed.data.tenantId);
  return { ok: true };
}

export async function provaWebhookTimbro(input: { tenantId: string }): Promise<Esito> {
  await requirePlatformAdmin();
  const tenantId = z.string().uuid().parse(input.tenantId);
  const cfg = await leggiConfigTimbro(tenantId);
  if (!cfg?.token || !cfg.webhookId) return { ok: false, error: 'Nessun webhook registrato da qui.' };
  try {
    await new ClientTimbro(cfg.urlBase, cfg.token).provaWebhook(cfg.webhookId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: messaggio(e) };
  }
}

// ── Abbinamento dipendenti ───────────────────────────────────────────────────

export interface RigaAbbinamento {
  timbroId: string;
  nome: string;
  employeeCode: string | null;
  externalId: string | null;
  attivo: boolean;
  /** Il nostro dipendente abbinato per `external_id`, se esiste. */
  nostroId: string | null;
  nostroNome: string | null;
  /** Suggerito per matricola o per nome, quando `external_id` manca o non corrisponde. */
  suggeritoId: string | null;
  suggeritoNome: string | null;
  esito: 'collegato' | 'suggerito' | 'scollegato' | 'esterno_sconosciuto';
}

export async function abbinamentoDipendentiTimbro(input: {
  tenantId: string;
}): Promise<Esito<{ righe: RigaAbbinamento[]; nostriSenzaTimbro: { id: string; nome: string }[] }>> {
  await requirePlatformAdmin();
  const tenantId = z.string().uuid().parse(input.tenantId);
  const cfg = await leggiConfigTimbro(tenantId);
  if (!cfg?.token) return { ok: false, error: 'Prima salva il token.' };
  const service = createServiceSupabase();
  let loro;
  try {
    loro = await new ClientTimbro(cfg.urlBase, cfg.token).employees();
  } catch (e) {
    return { ok: false, error: messaggio(e) };
  }
  const { data: nostriRaw } = await service
    .from('dipendenti' as never)
    .select('id, nome, cognome, codice_interno, stato_attivo')
    .eq('tenant_id', tenantId);
  const nostri = (nostriRaw ?? []) as { id: string; nome: string; cognome: string; codice_interno: string | null; stato_attivo: boolean }[];
  const perId = new Map(nostri.map((n) => [n.id, n]));
  const perMatricola = new Map(nostri.filter((n) => n.codice_interno).map((n) => [n.codice_interno!.trim().toLowerCase(), n]));
  const chiaveNome = (a: string | null | undefined, b: string | null | undefined) =>
    `${(a ?? '').trim().toLowerCase()}|${(b ?? '').trim().toLowerCase()}`;
  const perNome = new Map(nostri.map((n) => [chiaveNome(n.nome, n.cognome), n]));
  const nomeDi = (n: { nome: string; cognome: string }) => `${n.nome} ${n.cognome}`.trim();
  const abbinati = new Set<string>();

  const righe: RigaAbbinamento[] = loro.map((e) => {
    const ext = e.external_id?.toLowerCase() ?? null;
    const nostro = ext ? perId.get(ext) ?? null : null;
    if (nostro) abbinati.add(nostro.id);
    const sugg =
      !nostro
        ? (e.employee_code ? perMatricola.get(e.employee_code.trim().toLowerCase()) : undefined) ??
          perNome.get(chiaveNome(e.first_name, e.last_name)) ??
          perNome.get(chiaveNome(e.last_name, e.first_name)) ??
          null
        : null;
    return {
      timbroId: e.id,
      nome: `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim(),
      employeeCode: e.employee_code ?? null,
      externalId: e.external_id ?? null,
      attivo: e.active !== false,
      nostroId: nostro?.id ?? null,
      nostroNome: nostro ? nomeDi(nostro) : null,
      suggeritoId: sugg?.id ?? null,
      suggeritoNome: sugg ? nomeDi(sugg) : null,
      esito: nostro ? 'collegato' : sugg ? 'suggerito' : ext ? 'esterno_sconosciuto' : 'scollegato',
    };
  });
  const nostriSenzaTimbro = nostri
    .filter((n) => n.stato_attivo && !abbinati.has(n.id))
    .map((n) => ({ id: n.id, nome: nomeDi(n) }));
  return { ok: true, righe, nostriSenzaTimbro };
}

export async function collegaDipendenteTimbro(input: {
  tenantId: string;
  timbroId: string;
  dipendenteId: string;
}): Promise<Esito> {
  const admin = await requirePlatformAdmin();
  const parsed = z
    .object({ tenantId: z.string().uuid(), timbroId: z.string().min(1), dipendenteId: z.string().uuid() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  const cfg = await leggiConfigTimbro(parsed.data.tenantId);
  if (!cfg?.token) return { ok: false, error: 'Prima salva il token.' };
  const service = createServiceSupabase();
  const { data: dip } = await service
    .from('dipendenti' as never)
    .select('id')
    .eq('id', parsed.data.dipendenteId)
    .eq('tenant_id', parsed.data.tenantId)
    .maybeSingle();
  if (!dip) return { ok: false, error: 'Dipendente non trovato in questo cliente.' };
  try {
    await new ClientTimbro(cfg.urlBase, cfg.token).collegaEmployee(parsed.data.timbroId, parsed.data.dipendenteId);
  } catch (e) {
    return { ok: false, error: messaggio(e) };
  }
  // I timbri gia' arrivati per quel dipendente di Timbro restano senza persona
  // finche' non si rilegge: la riconciliazione ripassa con `updated_since`,
  // e Timbro muove `updated_at` quando attribuisce. Si forza subito.
  await importaTimbriTenant(parsed.data.tenantId, 'manuale');
  await auditPlatform({
    actorUserId: admin.userId,
    actorEmail: admin.email,
    tenantId: parsed.data.tenantId,
    entityType: 'dipendente',
    entityId: parsed.data.dipendenteId,
    action: 'timbro.dipendente.collega',
    metadata: { timbroId: parsed.data.timbroId },
  });
  rinfresca(parsed.data.tenantId);
  return { ok: true };
}

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServiceSupabase } from '@kommessa/api/service';
import { scadenzaDa } from '@kommessa/api/link-pubblico';

import { requireTenantContextCached } from '@/app/_lib/tenant-cache';
import { isKantiereOnly } from '@/app/_lib/app-mode';
import { generaToken, hashToken } from '@/app/_lib/link-pubblico-server';

/**
 * Creare e spegnere il link pubblico di una commessa.
 *
 * ⚠️ **Solo admin e ufficio.** Un link pubblico è l'unico punto dell'app in cui
 * un dato esce dal perimetro degli account: non è un gesto da tecnico sul
 * cantiere, è una decisione di chi parla col cliente. Il tecnico può fotografare
 * tutto, ma non può decidere chi guarda.
 *
 * Il valore in chiaro del token torna **una volta sola**, nella risposta che lo
 * crea. Non c'è nessun modo di rileggerlo dopo: in tabella c'è solo lo SHA-256.
 * Se qualcuno perde l'indirizzo, se ne genera un altro — e il vecchio muore.
 */

const RUOLI = new Set(['admin', 'office']);

export interface LinkPubblicoVista {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  aperture: number;
  ultimaAperturaAt: string | null;
  mostraDettagli: boolean;
  creatoDaNome: string | null;
}

type Esito<T> = { ok: true; data: T } | { ok: false; error: string };

type Guardia =
  | { ok: false; errore: string }
  | {
      ok: true;
      // Il contesto vero, non una sua copia a mano: `actor_role` su
      // `audit_events` e' un enum, e una `string` generica non ci entra.
      ctx: Awaited<ReturnType<typeof requireTenantContextCached>>;
      service: ReturnType<typeof createServiceSupabase>;
    };

async function guardia(commessaId: string): Promise<Guardia> {
  const ctx = await requireTenantContextCached();
  if (!RUOLI.has(ctx.role)) {
    return { ok: false, errore: 'Solo l’ufficio può condividere una commessa.' };
  }
  if (await isKantiereOnly()) {
    return { ok: false, errore: 'Le commesse non sono disponibili in questo spazio di lavoro.' };
  }
  // La commessa dev'essere di questo tenant. Il controllo passa dal service
  // role ma è esplicitamente filtrato sul tenant della sessione: senza, un id
  // indovinato aprirebbe una commessa di un altro cliente.
  const service = createServiceSupabase();
  const { data } = await service
    .from('commesse')
    .select('id')
    .eq('id', commessaId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (!data) return { ok: false, errore: 'Commessa non trovata.' };
  return { ok: true, ctx, service };
}

const CreaInput = z.object({
  commessaId: z.string().uuid(),
  mostraDettagli: z.boolean().default(false),
});

export async function creaLinkPubblico(input: {
  commessaId: string;
  mostraDettagli: boolean;
}): Promise<Esito<{ token: string; expiresAt: string }>> {
  const parsed = CreaInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Dati non validi.' };

  const g = await guardia(parsed.data.commessaId);
  if (!g.ok) return { ok: false, error: g.errore };
  const { ctx, service } = g;

  // Uno solo attivo per commessa: il precedente si spegne. Lo impone anche un
  // indice unico, ma farlo qui rende il comportamento esplicito invece di
  // affidarlo a un errore di vincolo.
  await service
    .from('commessa_link_pubblici' as never)
    .update({ revoked_at: new Date().toISOString(), revoked_by: ctx.userId } as never)
    .eq('commessa_id', parsed.data.commessaId)
    .is('revoked_at', null);

  const token = generaToken();
  const expiresAt = scadenzaDa(new Date()).toISOString();

  const { error } = await service.from('commessa_link_pubblici' as never).insert({
    tenant_id: ctx.tenantId,
    commessa_id: parsed.data.commessaId,
    token_hash: hashToken(token),
    mostra_dettagli: parsed.data.mostraDettagli,
    created_by: ctx.userId,
    expires_at: expiresAt,
  } as never);
  if (error) return { ok: false, error: error.message };

  await service.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'commessa',
    entity_id: parsed.data.commessaId,
    action: 'link_pubblico.crea',
    // ⚠️ Mai il token, nemmeno nell'audit: l'audit lo leggono in tanti, e un
    // token in chiaro lì dentro è un link funzionante regalato.
    after_data: {
      scade_il: expiresAt,
      mostra_dettagli: parsed.data.mostraDettagli,
    } as never,
  });

  revalidatePath(`/office/commesse/${parsed.data.commessaId}`);
  revalidatePath(`/mobile/commessa/${parsed.data.commessaId}`);
  return { ok: true, data: { token, expiresAt } };
}

export async function revocaLinkPubblico(input: {
  commessaId: string;
}): Promise<Esito<null>> {
  const g = await guardia(input.commessaId);
  if (!g.ok) return { ok: false, error: g.errore };
  const { ctx, service } = g;

  const { error } = await service
    .from('commessa_link_pubblici' as never)
    .update({ revoked_at: new Date().toISOString(), revoked_by: ctx.userId } as never)
    .eq('commessa_id', input.commessaId)
    .is('revoked_at', null);
  if (error) return { ok: false, error: error.message };

  await service.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'commessa',
    entity_id: input.commessaId,
    action: 'link_pubblico.revoca',
  });

  revalidatePath(`/office/commesse/${input.commessaId}`);
  revalidatePath(`/mobile/commessa/${input.commessaId}`);
  return { ok: true, data: null };
}

/**
 * Il link attivo di una commessa, se c'è. **Senza il token**: non esiste più in
 * nessun posto da cui rileggerlo. Serve a dire «c'è un link, scade il…, è stato
 * aperto N volte» e a offrire il tasto per spegnerlo.
 */
export async function leggiLinkPubblico(
  commessaId: string,
): Promise<LinkPubblicoVista | null> {
  const g = await guardia(commessaId);
  if (!g.ok) return null;
  const { service } = g;

  const { data } = await service
    .from('commessa_link_pubblici' as never)
    .select(
      'id, created_at, expires_at, revoked_at, aperture, ultima_apertura_at, mostra_dettagli, autore:users!commessa_link_pubblici_created_by_fkey ( display_name )',
    )
    .eq('commessa_id', commessaId)
    .is('revoked_at', null)
    .maybeSingle();
  if (!data) return null;

  const r = data as unknown as {
    id: string;
    created_at: string;
    expires_at: string;
    revoked_at: string | null;
    aperture: number;
    ultima_apertura_at: string | null;
    mostra_dettagli: boolean;
    autore: { display_name: string | null } | { display_name: string | null }[] | null;
  };
  const autore = Array.isArray(r.autore) ? r.autore[0] : r.autore;

  return {
    id: r.id,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
    aperture: r.aperture,
    ultimaAperturaAt: r.ultima_apertura_at,
    mostraDettagli: r.mostra_dettagli,
    creatoDaNome: autore?.display_name ?? null,
  };
}

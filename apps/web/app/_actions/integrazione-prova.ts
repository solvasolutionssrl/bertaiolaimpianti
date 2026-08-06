'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import {
  descrizioneOre,
  descrizioneSpesa,
  descrizioneViaggio,
  type PayloadOperazione,
} from '@kommessa/api/integrazione';

/**
 * Riga di prova: accoda UNA sola operazione, costruita apposta.
 *
 * Serve al collaudo con il cliente davanti allo schermo del gestionale. Non si
 * puo' usare la sincronizzazione normale per due motivi:
 *
 *  1. accoda tutto il periodo (decine di righe), mentre il recinto di collaudo
 *     dell'agente accetta un solo cantiere: il resto diventerebbe una coda di
 *     rifiuti da guardare;
 *  2. il cantiere di prova non ha ore vere — e inventarne un rapportino
 *     sporcherebbe le presenze di persone reali, che finiscono in busta paga.
 *
 * L'operazione e' quindi **sintetica**: importi minimi e la parola PROVA in
 * testa alla descrizione, perche' sul gestionale si riconosca a colpo d'occhio
 * cosa cancellare. Non tocca rapportini, spese o timbrature.
 *
 * Solo admin/owner: e' un attrezzo da collaudo, non una funzione d'ufficio.
 */

const Schema = z.object({
  tipo: z.enum(['ore', 'km', 'spesa']),
  /** Cantiere gia' collegato al gestionale su cui mandare la prova. */
  cantiereId: z.string().uuid(),
});

export interface EsitoProva {
  ok: boolean;
  error?: string;
  descrizione?: string;
  externalId?: string;
}

export async function accodaRigaDiProva(input: unknown): Promise<EsitoProva> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Dati non validi.' };

  const ctx = await requireTenantContext();
  if (!['owner', 'admin'].includes(ctx.role)) {
    return { ok: false, error: 'Serve un profilo amministratore.' };
  }

  const service = createServiceSupabase();

  const { data: modRaw } = await service
    .from('tenant_modules' as never)
    .select('attivo, config')
    .eq('tenant_id', ctx.tenantId)
    .eq('module_code', 'integrazione')
    .maybeSingle();
  const modulo = modRaw as unknown as {
    attivo: boolean;
    config: Record<string, unknown> | null;
  } | null;
  if (!modulo?.attivo) return { ok: false, error: 'Integrazione non attiva.' };
  const sistema =
    typeof modulo.config?.sistema === 'string' ? modulo.config.sistema : null;
  if (!sistema) return { ok: false, error: 'Manca la configurazione del gestionale.' };
  const maxDescrizione =
    typeof modulo.config?.max_descrizione === 'number'
      ? modulo.config.max_descrizione
      : undefined;

  // Il cantiere dev'essere gia' collegato: senza, l'agente non saprebbe dove
  // scrivere e la riga fallirebbe per un motivo che non c'entra col collaudo.
  const { data: mapRaw } = await service
    .from('integrazione_mappature' as never)
    .select('external_id')
    .eq('tenant_id', ctx.tenantId)
    .eq('sistema', sistema)
    .eq('entita', 'cantiere')
    .eq('entita_id', parsed.data.cantiereId)
    .maybeSingle();
  const externalId = (mapRaw as unknown as { external_id: string } | null)?.external_id;
  if (!externalId) {
    return { ok: false, error: 'Questo cantiere non è ancora collegato al gestionale.' };
  }

  const { data: cantRaw } = await service
    .from('cantieri' as never)
    .select('nome')
    .eq('id', parsed.data.cantiereId)
    .maybeSingle();
  const nomeCantiere = (cantRaw as unknown as { nome: string } | null)?.nome ?? null;

  // Il committente lo dichiara il gestionale, come per le operazioni vere.
  const { data: stgRaw } = await service
    .from('integrazione_staging' as never)
    .select('cliente_external_id')
    .eq('tenant_id', ctx.tenantId)
    .eq('sistema', sistema)
    .eq('entita', 'commessa')
    .eq('external_id', externalId)
    .maybeSingle();
  const cliente =
    (stgRaw as unknown as { cliente_external_id: string | null } | null)
      ?.cliente_external_id ?? null;

  // Un dipendente qualsiasi gia' collegato, se c'e': serve solo alle ore.
  const { data: dipMapRaw } = await service
    .from('integrazione_mappature' as never)
    .select('external_id')
    .eq('tenant_id', ctx.tenantId)
    .eq('sistema', sistema)
    .eq('entita', 'dipendente')
    .limit(1)
    .maybeSingle();
  const dipendente =
    (dipMapRaw as unknown as { external_id: string } | null)?.external_id ?? null;

  if (parsed.data.tipo === 'ore' && !dipendente) {
    return {
      ok: false,
      error:
        'Per provare le ore serve almeno un dipendente collegato al gestionale.',
    };
  }

  const oggi = new Date().toISOString().slice(0, 10);
  const rif = { commessa: externalId, cliente, dipendente };
  // Chiave unica per tentativo: una prova si deve poter ripetere, mentre
  // l'idempotenza normale la bloccherebbe come doppione.
  const chiave = `prova:${parsed.data.tipo}:${Date.now()}`;

  let payload: PayloadOperazione;
  if (parsed.data.tipo === 'ore') {
    // 15 minuti: abbastanza da vedersi, abbastanza poco da non falsare niente.
    payload = {
      tipo: 'ore',
      data: oggi,
      durataMin: 15,
      causale: 'ordinario',
      descrizione: descrizioneOre({
        causale: 'ordinario',
        durataMin: 15,
        persona: 'PROVA Kommessa',
        commessa: nomeCantiere,
        max: maxDescrizione,
      }),
      rif,
    };
  } else if (parsed.data.tipo === 'km') {
    payload = {
      tipo: 'km',
      data: oggi,
      km: 1,
      ruolo: 'autista',
      descrizione: descrizioneViaggio({
        data: oggi,
        km: 1,
        ruolo: 'autista',
        persona: 'PROVA Kommessa',
        arrivo: nomeCantiere,
        max: maxDescrizione,
      }),
      rif,
    };
  } else {
    payload = {
      tipo: 'spesa',
      data: oggi,
      categoria: 'altro',
      importoEur: 1,
      descrizione: descrizioneSpesa({
        data: oggi,
        categoria: 'altro',
        fornitore: 'PROVA Kommessa',
        commessa: nomeCantiere,
        max: maxDescrizione,
      }),
      rif,
    };
  }

  const { error } = await service.from('integrazione_outbox' as never).insert({
    tenant_id: ctx.tenantId,
    sistema,
    tipo: parsed.data.tipo,
    payload,
    idempotency_key: chiave,
    origine_tipo: 'prova',
    origine_id: null,
  } as never);

  if (error) return { ok: false, error: 'Accodamento fallito: ' + error.message };

  revalidatePath('/office/integrazione');
  return { ok: true, descrizione: payload.descrizione, externalId };
}

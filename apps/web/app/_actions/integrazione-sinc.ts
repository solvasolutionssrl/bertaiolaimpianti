'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import {
  riferimentiMancanti,
  validaPayload,
  type RequisitiRiferimenti,
  type RiferimentiEsterni,
} from '@kommessa/api/integrazione';
import {
  operazioneDaSpesa,
  operazioneDaViaggio,
  operazioniDaRigaRapportino,
  risolviCommessa,
  type MondoTenant,
  type OperazioneDaAccodare,
} from '@kommessa/api/integrazione-mappa';

/**
 * "Sincronizza col gestionale" — accodamento manuale.
 *
 * Raccoglie cio' che e' pronto per essere mandato al gestionale del cliente e
 * lo mette in coda (`integrazione_outbox`). **Non parla con nessun gestionale**:
 * a quello pensa l'agente dentro la rete del cliente, che passera' a prendere
 * il lavoro. Qui si decide soltanto *cosa* e' pronto.
 *
 * Perche' e' manuale: sul gestionale si scrive e non si torna indietro. Finche'
 * il cliente non ha verificato coi propri occhi che quello che mandiamo e'
 * giusto, un automatismo farebbe danni difficili da riparare. Il passaggio ad
 * automatico e' un interruttore in configurazione (`auto_push`).
 *
 * Permessi: admin / office / owner.
 */

const InputSchema = z.object({
  /** Quanti giorni indietro guardare. Un mese copre il ciclo delle paghe. */
  giorni: z.number().int().min(1).max(180).default(31),
});

export interface EsitoSincronizzazione {
  ok: boolean;
  error?: string;
  accodate: number;
  /** Gia' in coda o gia' inviate: non e' un errore, e' idempotenza al lavoro. */
  gia: number;
  /** Bloccate perche' manca un collegamento con l'anagrafica del gestionale. */
  bloccate: Array<{ cosa: string; motivo: string }>;
}

const VUOTO: EsitoSincronizzazione = { ok: true, accodate: 0, gia: 0, bloccate: [] };

export async function sincronizzaConGestionale(
  input: unknown,
): Promise<EsitoSincronizzazione> {
  const parsed = InputSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { ...VUOTO, ok: false, error: 'Periodo non valido.' };
  }

  const ctx = await requireTenantContext();
  if (!['owner', 'admin', 'office'].includes(ctx.role)) {
    return { ...VUOTO, ok: false, error: 'Non hai i permessi per sincronizzare.' };
  }

  const service = createServiceSupabase();

  // --- Il modulo e' acceso? Su quale gestionale? -------------------------
  const { data: moduloRaw } = await service
    .from('tenant_modules' as never)
    .select('attivo, config')
    .eq('tenant_id', ctx.tenantId)
    .eq('module_code', 'integrazione')
    .maybeSingle();

  const modulo = moduloRaw as unknown as {
    attivo: boolean;
    config: Record<string, unknown> | null;
  } | null;

  if (!modulo?.attivo) {
    return { ...VUOTO, ok: false, error: 'L’integrazione non è attiva per questa azienda.' };
  }
  const sistema =
    typeof modulo.config?.sistema === 'string' ? modulo.config.sistema : null;
  if (!sistema) {
    return { ...VUOTO, ok: false, error: 'Manca la configurazione del gestionale.' };
  }
  const requisiti = (modulo.config?.requisiti as RequisitiRiferimenti | undefined) ?? {};
  // Tetto del gestionale, se piu' stretto del nostro: va applicato QUI, mentre
  // la descrizione si compone. Dichiararlo solo all'agente non basterebbe.
  const maxDescrizione =
    typeof modulo.config?.max_descrizione === 'number'
      ? modulo.config.max_descrizione
      : undefined;

  // --- In che mondo vive questo cliente (cantieri o commesse)? -----------
  const { data: tenantRaw } = await service
    .from('tenants')
    .select('app_mode')
    .eq('id', ctx.tenantId)
    .maybeSingle();
  const mondo = (((tenantRaw as unknown as { app_mode: string } | null)?.app_mode ??
    'kantiere') as MondoTenant);

  // --- Le mappature verso il gestionale ----------------------------------
  const { data: mapRaw } = await service
    .from('integrazione_mappature' as never)
    .select('entita, entita_id, external_id')
    .eq('tenant_id', ctx.tenantId)
    .eq('sistema', sistema);

  const mappa = new Map<string, string>();
  for (const m of (mapRaw ?? []) as unknown as {
    entita: string;
    entita_id: string;
    external_id: string;
  }[]) {
    mappa.set(`${m.entita}:${m.entita_id}`, m.external_id);
  }

  // Il committente NON si mappa a parte: e' il gestionale a sapere quale
  // cliente sta dietro a quale commessa, e ce lo dice in `cliente_external_id`.
  // Serve ai documenti (km, spese) che su molti ERP pretendono il cliente.
  const { data: clienteDiRaw } = await service
    .from('integrazione_staging' as never)
    .select('external_id, cliente_external_id')
    .eq('tenant_id', ctx.tenantId)
    .eq('sistema', sistema)
    .eq('entita', 'commessa')
    .not('cliente_external_id', 'is', null);

  const clienteDellaCommessa = new Map(
    (
      (clienteDiRaw ?? []) as unknown as {
        external_id: string;
        cliente_external_id: string;
      }[]
    ).map((r) => [r.external_id, r.cliente_external_id]),
  );

  const dal = new Date(Date.now() - parsed.data.giorni * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const operazioni: OperazioneDaAccodare[] = [];
  const bloccate: EsitoSincronizzazione['bloccate'] = [];

  /** Risolve i riferimenti esterni, o dice cosa manca. */
  const rifPer = (
    riga: { cantiere_id?: string | null; commessa_id?: string | null },
    dipendenteId: string | null,
  ): RiferimentiEsterni => {
    const lavoro = risolviCommessa(riga, mondo);
    const commessa = lavoro
      ? (mappa.get(`${lavoro.entita}:${lavoro.id}`) ?? null)
      : null;
    return {
      commessa,
      dipendente: dipendenteId ? (mappa.get(`dipendente:${dipendenteId}`) ?? null) : null,
      // Il committente si eredita dalla commessa — un cantiere ha un solo
      // cliente — e lo dichiara il gestionale, non lo mappiamo noi.
      cliente: commessa ? (clienteDellaCommessa.get(commessa) ?? null) : null,
    };
  };

  // =======================================================================
  // ORE — solo da giornate APPROVATE. Il rapportino in bozza e' ancora in
  // discussione, e quello che finisce nel gestionale non si corregge.
  // =======================================================================
  const { data: rapportiniRaw } = await service
    .from('rapportini' as never)
    .select(
      'id, data, dipendente_id, stato, dipendente:dipendenti(nome, cognome), righe:rapportino_righe(id, cantiere_id, commessa_id, ore_ordinarie, ore_straordinarie, ore_viaggio, note)',
    )
    .eq('tenant_id', ctx.tenantId)
    .in('stato', ['approvato', 'esportato'])
    .gte('data', dal);

  for (const r of (rapportiniRaw ?? []) as unknown as {
    id: string;
    data: string;
    dipendente_id: string;
    dipendente: { nome: string | null; cognome: string | null } | null;
    righe: {
      id: string;
      cantiere_id: string | null;
      commessa_id: string | null;
      ore_ordinarie: number | string;
      ore_straordinarie: number | string;
      ore_viaggio: number | string;
      note: string | null;
    }[] | null;
  }[]) {
    const d = Array.isArray(r.dipendente) ? r.dipendente[0] : r.dipendente;
    const persona = [d?.nome, d?.cognome].filter(Boolean).join(' ') || null;

    for (const riga of r.righe ?? []) {
      const rif = rifPer(riga, r.dipendente_id);
      const nuove = operazioniDaRigaRapportino(riga, r.data, rif, { persona, maxDescrizione });
      for (const op of nuove) {
        const errori = validaPayload(op.payload, requisiti);
        if (errori.length) {
          bloccate.push({
            cosa: `Ore ${r.data} · ${persona ?? 'dipendente'}`,
            motivo: errori.join(' · '),
          });
          continue;
        }
        operazioni.push(op);
      }
    }
  }

  // =======================================================================
  // SPESE — solo confermate (la bozza e' ancora in revisione o in analisi AI).
  // =======================================================================
  const { data: speseRaw } = await service
    .from('spese' as never)
    .select(
      'id, categoria, ragione_sociale, importo_totale, numero_persone, data_scontrino, created_at, stato, cantiere_id, commessa_id, dipendente_id, dipendente:dipendenti(nome, cognome)',
    )
    .eq('tenant_id', ctx.tenantId)
    .eq('stato', 'confermata')
    .gte('created_at', dal);

  for (const s of (speseRaw ?? []) as unknown as (Parameters<
    typeof operazioneDaSpesa
  >[0] & {
    cantiere_id: string | null;
    commessa_id: string | null;
    dipendente_id: string | null;
    dipendente: { nome: string | null; cognome: string | null } | null;
  })[]) {
    const d = Array.isArray(s.dipendente) ? s.dipendente[0] : s.dipendente;
    const persona = [d?.nome, d?.cognome].filter(Boolean).join(' ') || null;
    const rif = rifPer(s, s.dipendente_id);
    const op = operazioneDaSpesa(s, rif, { persona, maxDescrizione });
    if (!op) continue;

    const errori = validaPayload(op.payload, requisiti);
    if (errori.length) {
      bloccate.push({
        cosa: `Spesa ${s.ragione_sociale ?? ''} ${op.payload.data}`.trim(),
        motivo: errori.join(' · '),
      });
      continue;
    }
    operazioni.push(op);
  }

  // =======================================================================
  // KM — solo all'autista (al passeggero l'auto non e' costata nulla).
  // =======================================================================
  const { data: viaggiRaw } = await service
    .from('timbratura_viaggio' as never)
    .select(
      'id, data, distanza_km, autista, direzione, cantiere_id, dipendente_id, dipendente:dipendenti(nome, cognome)',
    )
    .eq('tenant_id', ctx.tenantId)
    .eq('autista', true)
    .gte('data', dal);

  for (const v of (viaggiRaw ?? []) as unknown as (Parameters<
    typeof operazioneDaViaggio
  >[0] & {
    dipendente_id: string | null;
    dipendente: { nome: string | null; cognome: string | null } | null;
  })[]) {
    const d = Array.isArray(v.dipendente) ? v.dipendente[0] : v.dipendente;
    const persona = [d?.nome, d?.cognome].filter(Boolean).join(' ') || null;
    const rif = rifPer(v, v.dipendente_id);
    const op = operazioneDaViaggio(v, v.data, rif, { persona, maxDescrizione });
    if (!op) continue;

    const errori = validaPayload(op.payload, requisiti);
    if (errori.length) {
      bloccate.push({ cosa: `Viaggio ${v.data}`, motivo: errori.join(' · ') });
      continue;
    }
    operazioni.push(op);
  }

  if (operazioni.length === 0) {
    return { ok: true, accodate: 0, gia: 0, bloccate: raggruppa(bloccate) };
  }

  // =======================================================================
  // Accodamento. `ignoreDuplicates` sul vincolo di idempotenza: se qualcosa
  // era gia' in coda o gia' partito, non lo si rimette. E' la difesa contro
  // il doppio click sul pulsante — e contro il doppio documento sul
  // gestionale, dove non si potrebbe piu' cancellare.
  // =======================================================================
  const righe = operazioni.map((op) => ({
    tenant_id: ctx.tenantId,
    sistema,
    tipo: op.tipo,
    payload: op.payload,
    idempotency_key: op.idempotencyKey,
    origine_tipo: op.origineTipo,
    origine_id: op.origineId,
  }));

  const { data: inserite, error } = await service
    .from('integrazione_outbox' as never)
    .upsert(righe as never, {
      onConflict: 'tenant_id,sistema,idempotency_key',
      ignoreDuplicates: true,
    })
    .select('id');

  if (error) {
    return { ...VUOTO, ok: false, error: 'Non riesco a mettere in coda: ' + error.message };
  }

  const accodate = (inserite ?? []).length;
  revalidatePath('/office');

  return {
    ok: true,
    accodate,
    gia: operazioni.length - accodate,
    bloccate: raggruppa(bloccate),
  };
}

/**
 * Cento righe bloccate per lo stesso motivo sono UN problema, non cento.
 * Mostrarle tutte nasconderebbe il fatto che basta collegare un'anagrafica.
 */
function raggruppa(
  bloccate: EsitoSincronizzazione['bloccate'],
): EsitoSincronizzazione['bloccate'] {
  const perMotivo = new Map<string, number>();
  for (const b of bloccate) perMotivo.set(b.motivo, (perMotivo.get(b.motivo) ?? 0) + 1);
  return [...perMotivo.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([motivo, n]) => ({ cosa: `${n} ${n === 1 ? 'voce' : 'voci'}`, motivo }));
}

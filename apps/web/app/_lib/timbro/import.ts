import 'server-only';

import { createServiceSupabase } from '@kommessa/api/service';
import { romeWallToUtcIso } from '@kommessa/api/rome-time';

import { ClientTimbro, ErroreTimbro, type PunchTimbro } from './client';
import { importAbilitato, leggiConfigTimbro, leggiTutteConfigTimbro, type ConfigTimbro } from './config';

/**
 * L'import dei timbri da Timbro: **riconciliazione a cursore**.
 *
 * Ogni giro chiede a Timbro «cosa e' cambiato da `cursore − 60 s`», e scrive
 * tutto in `timbri_grezzi` con un upsert sulla chiave unica
 * `(tenant, sorgente, esterno_id)`. Rileggere un evento non lo duplica;
 * rileggerlo annullato lo marca annullato. Il minuto di margine copre gli
 * orologi non perfettamente allineati fra i due server.
 *
 * ⭐ Il webhook non sostituisce questo giro, lo anticipa: quando arriva, si
 * fa partire la stessa riconciliazione. Cosi' non esiste un secondo percorso
 * di scrittura da tenere uguale al primo, e se il webhook tace si perde al
 * massimo un giro di due minuti, non un timbro.
 *
 * ⚠️ La **data di partenza** (`dal`) si applica sull'ora del passaggio
 * (`occurred_at`), mai su quella di arrivo: un terminale rimasto senza rete
 * manda i passaggi anche giorni dopo, e quelli vanno presi.
 */

export interface EsitoImport {
  tenantId: string;
  ok: boolean;
  /** Eventi ricevuti da Timbro nel giro (compresi quelli gia' visti nel minuto di margine). */
  letti: number;
  /** Eventi davvero nuovi: con `updated_at` oltre il cursore. */
  nuovi: number;
  /** Righe scritte o aggiornate in `timbri_grezzi`. */
  scritti: number;
  /** Eventi scartati perche' prima della data di partenza. */
  primaDellaPartenza: number;
  /** Eventi di badge non assegnati a nessuno dei nostri dipendenti. */
  orfani: number;
  /** Eventi che abbiamo scritto NOI su Timbro e che tornano indietro: si saltano. */
  nostri: number;
  messaggio: string | null;
}

type Avvio = 'schedulato' | 'manuale' | 'webhook';

function orologioDa(timeSource: string | null): 'fisso' | 'telefono' | 'sconosciuto' {
  if (timeSource === 'ntp' || timeSource === 'server') return 'fisso';
  return 'sconosciuto';
}

function genereDa(p: PunchTimbro): 'badge' | 'manuale' | 'api' {
  if (p.kind === 'badge_tap') return 'badge';
  if (p.source === 'api') return 'api';
  return 'manuale';
}

/** La direzione **dichiarata**: solo per gli inserimenti a mano. Un badge non la misura. */
function tipoDa(p: PunchTimbro): 'ingresso' | 'uscita' | null {
  if (p.kind === 'badge_tap') return null;
  if (p.direction === 'in') return 'ingresso';
  if (p.direction === 'out') return 'uscita';
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function importaTimbri(
  cfg: ConfigTimbro,
  avvio: Avvio,
): Promise<EsitoImport> {
  const service = createServiceSupabase();
  const avviataAt = new Date().toISOString();
  const esito: EsitoImport = {
    tenantId: cfg.tenantId,
    ok: false,
    letti: 0,
    nuovi: 0,
    scritti: 0,
    primaDellaPartenza: 0,
    orfani: 0,
    nostri: 0,
    messaggio: null,
  };

  if (!importAbilitato(cfg)) {
    esito.messaggio = 'Collegamento non pronto: serve lo stato acceso, un token e una data di partenza.';
    return esito;
  }

  const client = new ClientTimbro(cfg.urlBase, cfg.token);
  const updatedSince = cfg.cursoreUpdatedAt
    ? new Date(new Date(cfg.cursoreUpdatedAt).getTime() - 60_000).toISOString()
    : undefined;

  let punches: PunchTimbro[];
  try {
    punches = await client.punches({ updatedSince, from: romeWallToUtcIso(cfg.dal, '00:00') });
  } catch (e) {
    esito.messaggio = e instanceof ErroreTimbro ? `${e.codice}: ${e.message}` : 'Errore sconosciuto';
    await registraGiro(service, cfg, avvio, avviataAt, esito, null, null);
    return esito;
  }
  esito.letti = punches.length;

  // I nostri dipendenti: `employee_external_id` DEVE essere uno di loro. Un
  // id che non conosciamo non si scrive come persona: resta orfano col badge.
  const { data: dipRaw } = await service
    .from('dipendenti' as never)
    .select('id')
    .eq('tenant_id', cfg.tenantId);
  const nostri = new Set(((dipRaw ?? []) as { id: string }[]).map((d) => d.id));

  const righe: Record<string, unknown>[] = [];
  let maxUpdated: string | null = null;
  let maxTimbro: string | null = null;
  for (const p of punches) {
    if (p.updated_at && (!maxUpdated || p.updated_at > maxUpdated)) maxUpdated = p.updated_at;
    // Il minuto di margine rilegge sempre l'ultimo evento: non e' una novita'.
    // ⚠️⚠️ Le timbrature che scriviamo NOI su Timbro tornano indietro con
    // `source: 'api'`. Importarle vorrebbe dire contare due volte la stessa
    // cosa: una dalla nostra tabella e una da qui, e la giornata di chi
    // timbra dall'app risulterebbe il doppio. Si saltano.
    //
    // ⚠️ Il salto sta DOPO l'avanzamento di `maxUpdated`: se il cursore non
    // superasse le nostre, ogni giro ripartirebbe da prima e il margine di un
    // minuto non basterebbe piu'.
    //
    // ⚠️ Si salta per `source`, non controllando se l'id e' uno dei nostri:
    // oggi su FPM nessun'altra integrazione scrive su Timbro, e contare due
    // volte una giornata vera e' molto peggio che ignorare il timbro di un
    // terzo che non esiste. Se un domani ne arriva uno, qui va un confronto
    // con i nostri id.
    if (p.source === 'api') {
      esito.nostri += 1;
      continue;
    }
    if (!cfg.cursoreUpdatedAt || (p.updated_at && p.updated_at > cfg.cursoreUpdatedAt)) esito.nuovi += 1;
    if (p.occurred_at && p.occurred_at.slice(0, 10) < cfg.dal) {
      esito.primaDellaPartenza += 1;
      continue;
    }
    const ext = p.employee_external_id;
    const dipendenteId = ext && UUID.test(ext) && nostri.has(ext.toLowerCase()) ? ext.toLowerCase() : null;
    if (!dipendenteId) esito.orfani += 1;
    if (p.status !== 'voided' && p.occurred_at && (!maxTimbro || p.occurred_at > maxTimbro)) {
      maxTimbro = p.occurred_at;
    }
    righe.push({
      tenant_id: cfg.tenantId,
      sorgente: 'timbro',
      esterno_id: p.id,
      dipendente_id: dipendenteId,
      badge: p.badge_code,
      ts: p.occurred_at,
      orologio: orologioDa(p.time_source),
      tipo: tipoDa(p),
      stato: p.status === 'voided' ? 'annullato' : 'valido',
      annullato_motivo: p.void_reason,
      genere: genereDa(p),
      dispositivo: p.device_id,
      passo: p.step ?? null,
      passo_origine: p.step_source ?? null,
      turno_era_aperto: p.shift_was_open ?? null,
      precedente_esterno_id: p.previous_punch_id ?? null,
      precedente_at: p.previous_occurred_at ?? null,
      grezzo: p,
    });
  }

  if (righe.length > 0) {
    // A gruppi: un upsert da migliaia di righe e' una richiesta sola che puo'
    // superare i limiti del gateway.
    for (let i = 0; i < righe.length; i += 200) {
      const { error } = await service
        .from('timbri_grezzi' as never)
        .upsert(righe.slice(i, i + 200) as never, { onConflict: 'tenant_id,sorgente,esterno_id' });
      if (error) {
        esito.messaggio = `Scrittura fallita: ${error.message}`;
        esito.scritti = i;
        await registraGiro(service, cfg, avvio, avviataAt, esito, null, null);
        return esito;
      }
      esito.scritti = Math.min(righe.length, i + 200);
    }
  }

  esito.ok = true;
  esito.messaggio =
    esito.nuovi === 0
      ? 'Nessuna novità.'
      : `${esito.nuovi} eventi nuovi, ${esito.scritti} scritti` +
        (esito.orfani ? `, ${esito.orfani} senza persona` : '') +
        (esito.primaDellaPartenza ? `, ${esito.primaDellaPartenza} prima della partenza` : '') +
        '.';
  await registraGiro(service, cfg, avvio, avviataAt, esito, maxUpdated, maxTimbro);
  return esito;
}

async function registraGiro(
  service: ReturnType<typeof createServiceSupabase>,
  cfg: ConfigTimbro,
  avvio: Avvio,
  avviataAt: string,
  esito: EsitoImport,
  maxUpdated: string | null,
  maxTimbro: string | null,
): Promise<void> {
  const ora = new Date().toISOString();
  const patch: Record<string, unknown> = {
    ultimo_giro_at: ora,
    ultimo_giro_esito: esito.ok ? 'ok' : 'errore',
    ultimo_giro_messaggio: esito.messaggio,
  };
  // Il cursore avanza solo se il giro e' andato a buon fine: altrimenti al
  // giro dopo si rilegge e non si perde niente.
  if (esito.ok && maxUpdated && (!cfg.cursoreUpdatedAt || maxUpdated > cfg.cursoreUpdatedAt)) {
    patch.cursore_updated_at = maxUpdated;
  }
  if (maxTimbro && (!cfg.ultimoTimbroAt || maxTimbro > cfg.ultimoTimbroAt)) {
    patch.ultimo_timbro_at = maxTimbro;
  }
  await service.from('integrazione_timbro' as never).update(patch as never).eq('tenant_id', cfg.tenantId);

  // Il diario dei giri, nella stessa tabella degli altri collegamenti. Un
  // giro a vuoto ogni due minuti non si scrive — sarebbero 720 righe al
  // giorno per dire «niente» — ma un errore si', sempre.
  // ⚠️ «A vuoto» = nessun evento NUOVO: il minuto di margine rilegge sempre l'ultimo.
  if (esito.nuovi > 0 || !esito.ok || avvio !== 'schedulato') {
    await service.from('integrazione_esecuzioni' as never).insert({
      tenant_id: cfg.tenantId,
      sistema: 'timbro',
      direzione: 'lettura',
      avvio,
      avviata_at: avviataAt,
      conclusa_at: ora,
      esito: esito.ok ? 'ok' : 'errore',
      letti: esito.nuovi,
      scritti: esito.scritti,
      errori: esito.ok ? 0 : 1,
      messaggio: esito.messaggio,
      dettaglio: { orfani: esito.orfani, primaDellaPartenza: esito.primaDellaPartenza },
    } as never);
  }
}

/** Un giro per un cliente, dalla sua riga. */
export async function importaTimbriTenant(tenantId: string, avvio: Avvio): Promise<EsitoImport> {
  const cfg = await leggiConfigTimbro(tenantId);
  if (!cfg) {
    return {
      tenantId,
      ok: false,
      letti: 0,
      nuovi: 0,
      scritti: 0,
      primaDellaPartenza: 0,
      orfani: 0,
      nostri: 0,
      messaggio: 'Collegamento non configurato.',
    };
  }
  return importaTimbri(cfg, avvio);
}

/** Il giro del cron: tutti i clienti con il collegamento pronto. */
export async function importaTimbriTutti(avvio: Avvio = 'schedulato'): Promise<EsitoImport[]> {
  const tutte = await leggiTutteConfigTimbro();
  const out: EsitoImport[] = [];
  for (const cfg of tutte) {
    if (!importAbilitato(cfg)) continue;
    out.push(await importaTimbri(cfg, avvio));
  }
  return out;
}

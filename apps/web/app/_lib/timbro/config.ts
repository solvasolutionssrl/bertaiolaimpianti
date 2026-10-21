import 'server-only';

import { createServiceSupabase } from '@kommessa/api/service';

/**
 * La configurazione del collegamento con Timbro, letta **solo** dalla service
 * role: la riga contiene il token.
 *
 * ⚠️ Quello che esce da qui si divide in due: `ConfigTimbro` (con il token)
 * resta nel server e non arriva mai a un componente; `StatoTimbro` e' la parte
 * raccontabile — stato, data di partenza, salute — che le pagine possono
 * mostrare. Due tipi, cosi' il compilatore impedisce di passare per sbaglio
 * la riga intera a un client component.
 */

export type StatoCollegamentoTimbro = 'spento' | 'osservazione' | 'attivo';

export interface ConfigTimbro {
  tenantId: string;
  stato: StatoCollegamentoTimbro;
  token: string | null;
  urlBase: string;
  dal: string | null;
  webhookId: string | null;
  webhookSecret: string | null;
  cursoreUpdatedAt: string | null;
  ultimoGiroAt: string | null;
  ultimoGiroEsito: 'ok' | 'errore' | null;
  ultimoGiroMessaggio: string | null;
  ultimoTimbroAt: string | null;
}

/** La parte senza segreti, che si puo' mostrare. */
export interface StatoTimbro {
  tenantId: string;
  stato: StatoCollegamentoTimbro;
  /** C'e' un token salvato (non si dice quale). */
  conToken: boolean;
  conWebhook: boolean;
  urlBase: string;
  dal: string | null;
  cursoreUpdatedAt: string | null;
  ultimoGiroAt: string | null;
  ultimoGiroEsito: 'ok' | 'errore' | null;
  ultimoGiroMessaggio: string | null;
  ultimoTimbroAt: string | null;
}

interface Riga {
  tenant_id: string;
  stato: string;
  token: string | null;
  url_base: string;
  dal: string | null;
  webhook_id: string | null;
  webhook_secret: string | null;
  cursore_updated_at: string | null;
  ultimo_giro_at: string | null;
  ultimo_giro_esito: string | null;
  ultimo_giro_messaggio: string | null;
  ultimo_timbro_at: string | null;
}

function daRiga(r: Riga): ConfigTimbro {
  return {
    tenantId: r.tenant_id,
    stato: r.stato === 'attivo' || r.stato === 'osservazione' ? r.stato : 'spento',
    token: r.token,
    urlBase: r.url_base,
    dal: r.dal,
    webhookId: r.webhook_id,
    webhookSecret: r.webhook_secret,
    cursoreUpdatedAt: r.cursore_updated_at,
    ultimoGiroAt: r.ultimo_giro_at,
    ultimoGiroEsito: r.ultimo_giro_esito === 'ok' || r.ultimo_giro_esito === 'errore' ? r.ultimo_giro_esito : null,
    ultimoGiroMessaggio: r.ultimo_giro_messaggio,
    ultimoTimbroAt: r.ultimo_timbro_at,
  };
}

export function statoDaConfig(c: ConfigTimbro): StatoTimbro {
  return {
    tenantId: c.tenantId,
    stato: c.stato,
    conToken: !!c.token,
    conWebhook: !!c.webhookSecret,
    urlBase: c.urlBase,
    dal: c.dal,
    cursoreUpdatedAt: c.cursoreUpdatedAt,
    ultimoGiroAt: c.ultimoGiroAt,
    ultimoGiroEsito: c.ultimoGiroEsito,
    ultimoGiroMessaggio: c.ultimoGiroMessaggio,
    ultimoTimbroAt: c.ultimoTimbroAt,
  };
}

const COLONNE =
  'tenant_id, stato, token, url_base, dal, webhook_id, webhook_secret, cursore_updated_at,' +
  ' ultimo_giro_at, ultimo_giro_esito, ultimo_giro_messaggio, ultimo_timbro_at';

/** La riga di un cliente, o null se non e' mai stata creata. */
export async function leggiConfigTimbro(tenantId: string): Promise<ConfigTimbro | null> {
  const service = createServiceSupabase();
  const { data } = await service
    .from('integrazione_timbro' as never)
    .select(COLONNE)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data ? daRiga(data as unknown as Riga) : null;
}

/** Tutti i clienti che hanno una riga (anche spenti: uno spento per sbaglio e' da vedere). */
export async function leggiTutteConfigTimbro(): Promise<ConfigTimbro[]> {
  const service = createServiceSupabase();
  const { data } = await service.from('integrazione_timbro' as never).select(COLONNE);
  return ((data ?? []) as unknown as Riga[]).map(daRiga);
}

/**
 * Lo stato raccontabile per un cliente, con un ripiego «spento» se la riga
 * non esiste: chi chiede «Timbro e' acceso qui?» vuole una risposta, non un
 * null da interpretare.
 */
export async function leggiStatoTimbro(tenantId: string): Promise<StatoTimbro> {
  const c = await leggiConfigTimbro(tenantId);
  return c
    ? statoDaConfig(c)
    : {
        tenantId,
        stato: 'spento',
        conToken: false,
        conWebhook: false,
        urlBase: '',
        dal: null,
        cursoreUpdatedAt: null,
        ultimoGiroAt: null,
        ultimoGiroEsito: null,
        ultimoGiroMessaggio: null,
        ultimoTimbroAt: null,
      };
}

/** Il collegamento legge i timbri: c'e' un token, una data di partenza e non e' spento. */
export type ConfigTimbroPronta = ConfigTimbro & { token: string; dal: string };

export function importAbilitato(c: ConfigTimbro | null): c is ConfigTimbroPronta {
  return !!c && c.stato !== 'spento' && !!c.token && !!c.dal;
}

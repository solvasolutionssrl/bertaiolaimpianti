import 'server-only';

import { createServiceSupabase } from '@kommessa/api/service';

import { autenticaToken } from '../../../../_lib/api-token';

/**
 * Porta d'ingresso delle rotte `/api/integrazione/v1/*`.
 *
 * Chi bussa e' un **agente di sincronizzazione**: un processo che gira su una
 * macchina dentro la rete di un cliente e parla col suo gestionale. Non ha una
 * sessione browser e non e' una persona: si autentica con un token Bearer di
 * scope `integrazione`.
 *
 * Qui si stabiliscono tre cose, e nessuna rotta puo' saltarle:
 *  1. il token e' valido e ha lo scope giusto;
 *  2. il tenant ha davvero il modulo `integrazione` acceso;
 *  3. su quale `sistema` (gestionale) sta lavorando — lo dice la config del
 *     tenant, NON l'agente. Se lo dichiarasse lui, un token rubato potrebbe
 *     farsi dare la coda di un altro gestionale dello stesso cliente.
 */

export interface ContestoAgente {
  tenantId: string;
  /** Gestionale del tenant, es. 'ergo'. Deciso dalla config, non dal chiamante. */
  sistema: string;
  tokenId: string;
  /** Requisiti aggiuntivi del gestionale, oltre al minimo di Kommessa. */
  requisiti: Record<string, string[]>;
  /** Tetto ai caratteri della descrizione, se il gestionale ne ha uno. */
  maxDescrizione: number | null;
}

export type EsitoGuard =
  | { ok: true; ctx: ContestoAgente }
  | { ok: false; risposta: Response };

/**
 * Errore in formato stabile: `codice` è per il programma, `messaggio` per
 * l'umano che legge i log dell'agente. Gli agenti li scriveranno persone
 * diverse in momenti diversi: un formato che cambia e' un agente che si rompe.
 */
export function erroreApi(
  status: number,
  codice: string,
  messaggio: string,
  extra?: Record<string, unknown>,
): Response {
  return Response.json({ errore: { codice, messaggio, ...extra } }, { status });
}

interface RigaModulo {
  attivo: boolean;
  config: Record<string, unknown> | null;
}

export async function autenticaAgente(request: Request): Promise<EsitoGuard> {
  const token = await autenticaToken(request, 'integrazione');
  if (!token) {
    return {
      ok: false,
      risposta: erroreApi(
        401,
        'token_non_valido',
        'Token assente, scaduto, revocato o senza permesso di integrazione.',
      ),
    };
  }

  const service = createServiceSupabase();
  const { data, error } = await service
    .from('tenant_modules' as never)
    .select('attivo, config')
    .eq('tenant_id', token.tenantId)
    .eq('module_code', 'integrazione')
    .maybeSingle();

  const riga = data as unknown as RigaModulo | null;

  if (error) {
    return {
      ok: false,
      risposta: erroreApi(
        503,
        'configurazione_non_leggibile',
        'Non riesco a leggere la configurazione del tenant. Riprova più tardi.',
      ),
    };
  }

  // Il modulo spento non e' un errore dell'agente: e' una scelta dell'ufficio.
  // Va detto in chiaro, altrimenti chi guarda i log insegue un bug che non c'e'.
  if (!riga?.attivo) {
    return {
      ok: false,
      risposta: erroreApi(
        403,
        'modulo_spento',
        'Il modulo di integrazione non è attivo per questo cliente. Va acceso dal pannello di amministrazione.',
      ),
    };
  }

  const config = riga.config ?? {};
  const sistema = typeof config.sistema === 'string' ? config.sistema : null;
  if (!sistema) {
    return {
      ok: false,
      risposta: erroreApi(
        409,
        'sistema_non_configurato',
        'Il modulo è attivo ma non dice con quale gestionale parlare (config.sistema).',
      ),
    };
  }

  return {
    ok: true,
    ctx: {
      tenantId: token.tenantId,
      sistema,
      tokenId: token.tokenId,
      requisiti:
        (config.requisiti as Record<string, string[]> | undefined) ?? {},
      maxDescrizione:
        typeof config.max_descrizione === 'number' ? config.max_descrizione : null,
    },
  };
}

/** Legge il corpo JSON senza far esplodere la rotta su un body malformato. */
export async function leggiJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

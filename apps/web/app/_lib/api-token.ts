import 'server-only';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { createServiceSupabase } from '@kommessa/api/service';

/**
 * Token personali per integrazioni esterne (comando iOS "Carica su Kommessa").
 *
 * Gli Shortcut di iOS non condividono i cookie di Safari, quindi le rotte
 * `/api/link/*` non possono usare la sessione: si autenticano con un token
 * Bearer personale, legato a un utente e a un tenant, revocabile in un istante.
 *
 * In tabella finisce solo lo SHA-256: il valore in chiaro esiste una volta
 * sola, nella schermata che lo crea. Vedi migration `20260731090000`.
 */

const PREFISSO = 'kmsa_';

/** Token nuovo in chiaro. Da mostrare UNA volta e mai piu'. */
export function generaTokenInChiaro(): string {
  return PREFISSO + randomBytes(32).toString('base64url');
}

export function hashToken(inChiaro: string): string {
  return createHash('sha256').update(inChiaro.trim()).digest('hex');
}

/**
 * Permessi concedibili a un token.
 * - `upload`       : comando iOS "Carica su Kommessa" (elenco commesse + invio file).
 * - `integrazione` : agente di sync verso il gestionale di un cliente. Apre SOLO
 *                    le rotte `/api/integrazione/*` — nessun accesso ai media,
 *                    alle commesse o al resto dell'app.
 */
export type ScopeToken = 'upload' | 'integrazione';

export interface ContestoToken {
  tokenId: string;
  tenantId: string;
  /**
   * Persona per conto della quale il token agisce. `null` per i token di
   * integrazione: li' il chiamante e' una macchina, non un dipendente, e
   * attribuirlo a qualcuno sporcherebbe l'audit con un dato falso.
   */
  userId: string | null;
  scopes: string[];
  /**
   * Ruolo applicativo dell'utente per conto del quale il token agisce.
   * Serve per l'audit: `audit_events.actor_role` e' un enum `app_role`, quindi
   * un valore inventato come 'api_token' fa fallire l'insert — e in silenzio,
   * se non si controlla l'errore.
   */
  role: string;
}

interface RigaToken {
  id: string;
  tenant_id: string;
  user_id: string | null;
  scopes: string[] | null;
  revoked_at: string | null;
  last_used_at: string | null;
  utente: { role: string } | { role: string }[] | null;
}

/** Estrae il token dall'header `Authorization: Bearer …`. */
function leggiHeader(request: Request): string | null {
  const raw = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return match?.[1]?.trim() || null;
}

/**
 * Autentica una richiesta con token Bearer.
 * Ritorna `null` per QUALUNQUE motivo di fallimento (assente, malformato,
 * inesistente, revocato, scope mancante): al chiamante basta un 401 uniforme,
 * e non diamo indizi su quale dei casi si sia verificato.
 */
/**
 * Con scope `upload` la persona c'e' sempre: il vincolo in tabella la impone e
 * il controllo qui sotto la ri-verifica. L'overload lo dichiara al compilatore,
 * cosi' le rotte `/api/link/*` non devono controllarlo a mano.
 */
export async function autenticaToken(
  request: Request,
  scopeRichiesto: 'upload',
): Promise<(ContestoToken & { userId: string }) | null>;
export async function autenticaToken(
  request: Request,
  scopeRichiesto: ScopeToken,
): Promise<ContestoToken | null>;
export async function autenticaToken(
  request: Request,
  scopeRichiesto: ScopeToken,
): Promise<ContestoToken | null> {
  const inChiaro = leggiHeader(request);
  if (!inChiaro || !inChiaro.startsWith(PREFISSO)) return null;

  const atteso = hashToken(inChiaro);
  const service = createServiceSupabase();
  const { data, error } = await service
    .from('api_tokens' as never)
    .select('id, tenant_id, user_id, scopes, revoked_at, last_used_at, utente:users(role)')
    .eq('token_hash', atteso)
    .maybeSingle();

  const riga = data as unknown as RigaToken | null;
  if (error || !riga) return null;
  if (riga.revoked_at) return null;

  // Confronto a tempo costante sull'hash: la query per uguaglianza ha gia'
  // fatto il lavoro, questo chiude la porta a differenze di timing residue.
  const a = Buffer.from(atteso, 'hex');
  const b = Buffer.from(hashToken(inChiaro), 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const scopes = riga.scopes ?? [];
  if (!scopes.includes(scopeRichiesto)) return null;

  // Un token `upload` senza persona non e' utilizzabile: i file finirebbero
  // senza proprietario e l'audit senza autore. Il vincolo in tabella lo impedisce,
  // ma qui si ri-verifica — cosi' l'overload che promette `userId: string` dice
  // il vero anche se un domani il vincolo cambiasse.
  if (scopeRichiesto === 'upload' && !riga.user_id) return null;

  // `last_used_at` serve a riconoscere i token dimenticati: aggiornato al
  // massimo una volta al minuto per non scrivere a ogni file di un batch.
  const ultimo = riga.last_used_at ? Date.parse(riga.last_used_at) : 0;
  if (Date.now() - ultimo > 60_000) {
    void service
      .from('api_tokens' as never)
      .update({ last_used_at: new Date().toISOString() } as never)
      .eq('id', riga.id);
  }

  const utente = Array.isArray(riga.utente) ? riga.utente[0] : riga.utente;
  return {
    tokenId: riga.id,
    tenantId: riga.tenant_id,
    userId: riga.user_id,
    scopes,
    role: utente?.role ?? 'tecnico',
  };
}

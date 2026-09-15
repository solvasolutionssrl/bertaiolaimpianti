import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Il cookie `shadow_admin` dell'impersonation: la sessione del super admin
 * messa da parte mentre agisce come un utente del tenant.
 *
 * Il valore è firmato con una chiave che esiste solo sul server (derivata
 * dalla service role). Prima era JSON in chiaro e bastava impostare a mano un
 * cookie con quel nome per risultare super admin nelle azioni riservate, come
 * il ripristino di una versione di commessa. Chi lo legge verifica firma e
 * scadenza; `isSuperadminActor` controlla anche che l'utente sia ancora super
 * admin.
 */

export const SHADOW_COOKIE = 'shadow_admin';

/** Durata massima di un'impersonation: cookie e firma scadono insieme. */
export const SHADOW_DURATA_S = 60 * 60 * 4;

export interface ShadowAdmin {
  refresh_token: string;
  admin_email: string;
  admin_user_id: string;
  target_email?: string;
  target_user_id?: string | null;
  tenant_label?: string;
  started_at: string;
  /** Scadenza, millisecondi dall'epoch. */
  scade_at: number;
}

function chiave(): Buffer {
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error('SUPABASE_SERVICE_ROLE_KEY assente: impersonation non disponibile');
  // Chiave dedicata: la service role non si usa direttamente come chiave HMAC.
  return createHmac('sha256', base).update('kommessa:shadow_admin:v1').digest();
}

/** Valore del cookie: `<dati in base64url>.<firma>`. */
export function firmaShadow(dati: ShadowAdmin): string {
  const corpo = Buffer.from(JSON.stringify(dati), 'utf8').toString('base64url');
  const firma = createHmac('sha256', chiave()).update(corpo).digest('base64url');
  return `${corpo}.${firma}`;
}

/** I dati del cookie se la firma è del server e non è scaduto; altrimenti null. */
export function leggiShadow(valore: string | null | undefined): ShadowAdmin | null {
  if (!valore) return null;
  const punto = valore.lastIndexOf('.');
  if (punto <= 0 || punto === valore.length - 1) return null;
  const corpo = valore.slice(0, punto);

  let attesa: Buffer;
  try {
    attesa = createHmac('sha256', chiave()).update(corpo).digest();
  } catch {
    return null;
  }
  const ricevuta = Buffer.from(valore.slice(punto + 1), 'base64url');
  if (ricevuta.length !== attesa.length || !timingSafeEqual(ricevuta, attesa)) return null;

  try {
    const dati = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8')) as ShadowAdmin;
    if (
      typeof dati.admin_user_id !== 'string' ||
      typeof dati.refresh_token !== 'string' ||
      typeof dati.scade_at !== 'number' ||
      dati.scade_at < Date.now()
    ) {
      return null;
    }
    return dati;
  } catch {
    return null;
  }
}

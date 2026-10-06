import 'server-only';

import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

import { createServiceSupabase } from '@kommessa/api/service';
import {
  BACHECA_BYTE_TOKEN,
  BACHECA_GIORNI_SESSIONE,
  dopoIngressoRiuscito,
  dopoTentativoSbagliato,
  statoBlocco,
} from '@kommessa/api/bacheca';

/**
 * Il lato server della bacheca: l'indirizzo, la password, la sessione del
 * televisore.
 *
 * Qui dentro c'è tutto quello che tocca la crittografia e il database; le
 * **regole** (quanti tentativi, quanto dura un blocco, come si ordinano le
 * cose da fare) stanno in `@kommessa/api/bacheca`, pure e provate.
 */

/** Il nome del cookie che tiene aperta la bacheca su un televisore. */
export const BACHECA_COOKIE = 'bacheca';

const SCRYPT_LUNGHEZZA = 32;

function chiaveFirma(): Buffer {
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error('SUPABASE_SERVICE_ROLE_KEY assente: bacheca non disponibile');
  // Chiave dedicata: la service role non si usa direttamente come chiave HMAC.
  return createHmac('sha256', base).update('kommessa:bacheca:v1').digest();
}

/** Un indirizzo nuovo. Casuale, non indovinabile, buono per un URL. */
export function generaTokenBacheca(): string {
  return randomBytes(BACHECA_BYTE_TOKEN).toString('base64url');
}

/**
 * La password come si salva: `scrypt` con un sale per riga.
 *
 * ⚠️ Non c'è nessun modo di tornare indietro, ed è il punto: chi la perde ne
 * imposta un'altra. Nemmeno un super admin può rileggerla.
 */
export function cifraPassword(password: string): { hash: string; sale: string } {
  const sale = randomBytes(16).toString('base64url');
  const hash = scryptSync(password, sale, SCRYPT_LUNGHEZZA).toString('base64url');
  return { hash, sale };
}

/** Confronto a tempo costante: un `===` perde la gara prima di perdere la password. */
export function passwordCorrisponde(
  password: string,
  hash: string,
  sale: string,
): boolean {
  try {
    const atteso = Buffer.from(hash, 'base64url');
    const calcolato = scryptSync(password, sale, atteso.length);
    return atteso.length === calcolato.length && timingSafeEqual(atteso, calcolato);
  } catch {
    return false;
  }
}

// ──────────────────── La sessione del televisore ────────────────────

interface SessioneBacheca {
  tenantId: string;
  token: string;
  /** Scadenza, millisecondi dall'epoch. */
  scadeAt: number;
}

/** Valore del cookie: `<dati in base64url>.<firma>`. */
export function firmaSessione(tenantId: string, token: string): string {
  const dati: SessioneBacheca = {
    tenantId,
    token,
    scadeAt: Date.now() + BACHECA_GIORNI_SESSIONE * 24 * 60 * 60 * 1000,
  };
  const corpo = Buffer.from(JSON.stringify(dati), 'utf8').toString('base64url');
  const firma = createHmac('sha256', chiaveFirma()).update(corpo).digest('base64url');
  return `${corpo}.${firma}`;
}

/**
 * I dati del cookie, se la firma è del nostro server e non è scaduto.
 *
 * ⚠️ Verifica che il **token nel cookie sia quello dell'indirizzo che si sta
 * aprendo** (rigenerare l'indirizzo deve buttare fuori tutti, altrimenti non
 * serve a niente) **e che il cliente sia quello della riga trovata
 * dall'indirizzo**. Quest'ultimo controllo e' nato da una prova: un biglietto
 * firmato con un altro `tenantId` apriva i dati di un altro cliente.
 */
export function leggiSessione(
  valore: string | null | undefined,
  tokenAtteso: string,
  tenantAtteso: string,
): SessioneBacheca | null {
  if (!valore) return null;
  const punto = valore.lastIndexOf('.');
  if (punto <= 0 || punto === valore.length - 1) return null;
  const corpo = valore.slice(0, punto);

  let attesa: Buffer;
  try {
    attesa = createHmac('sha256', chiaveFirma()).update(corpo).digest();
  } catch {
    return null;
  }
  let data: Buffer;
  try {
    data = Buffer.from(valore.slice(punto + 1), 'base64url');
  } catch {
    return null;
  }
  if (data.length !== attesa.length || !timingSafeEqual(data, attesa)) return null;

  try {
    const dati = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8')) as SessioneBacheca;
    if (typeof dati?.scadeAt !== 'number' || dati.scadeAt < Date.now()) return null;
    if (dati.token !== tokenAtteso) return null;
    if (typeof dati.tenantId !== 'string' || !dati.tenantId) return null;
    // ⚠️ Anche il cliente deve combaciare con la riga trovata dall'indirizzo.
    // Senza, un biglietto firmato con un altro `tenantId` ma l'indirizzo
    // giusto mostrerebbe i dati di un altro cliente. Oggi non e' sfruttabile
    // (per firmare serve la chiave del server) ma e' il difetto di fidarsi di
    // cio' che dice il cookie invece di cio' che dice la riga gia' letta.
    // Trovato provando, non leggendo.
    if (dati.tenantId !== tenantAtteso) return null;
    return dati;
  } catch {
    return null;
  }
}

// ──────────────────── Lettura e scrittura ────────────────────

export interface BachecaRiga {
  tenantId: string;
  token: string;
  passwordHash: string;
  passwordSale: string;
  attiva: boolean;
  tentativiFalliti: number;
  bloccataFinoA: string | null;
  aperture: number;
  ultimaAperturaAt: string | null;
}

/** Il token che arriva dall'indirizzo: forma plausibile prima di interrogare. */
const TOKEN_PLAUSIBILE = /^[A-Za-z0-9_-]{10,60}$/;

/**
 * La bacheca di quell'indirizzo, se esiste ed è accesa.
 *
 * Torna `null` per **ogni** motivo — token storto, inesistente, spenta — e il
 * chiamante mostra sempre la stessa pagina. Dire «questo indirizzo esiste ma è
 * spento» racconta a chi prova gli indirizzi quali esistono.
 */
export async function leggiBachecaDaToken(token: string): Promise<BachecaRiga | null> {
  if (!TOKEN_PLAUSIBILE.test(token)) return null;
  let service: ReturnType<typeof createServiceSupabase>;
  try {
    service = createServiceSupabase();
  } catch {
    return null;
  }
  const { data } = await service
    .from('bacheche_pubbliche' as never)
    .select(
      'tenant_id, token, password_hash, password_sale, attiva, tentativi_falliti, bloccata_fino_a, aperture, ultima_apertura_at',
    )
    .eq('token', token)
    .maybeSingle();
  if (!data) return null;
  const r = data as unknown as {
    tenant_id: string;
    token: string;
    password_hash: string;
    password_sale: string;
    attiva: boolean;
    tentativi_falliti: number;
    bloccata_fino_a: string | null;
    aperture: number;
    ultima_apertura_at: string | null;
  };
  if (!r.attiva) return null;
  return {
    tenantId: r.tenant_id,
    token: r.token,
    passwordHash: r.password_hash,
    passwordSale: r.password_sale,
    attiva: r.attiva,
    tentativiFalliti: r.tentativi_falliti ?? 0,
    bloccataFinoA: r.bloccata_fino_a,
    aperture: r.aperture ?? 0,
    ultimaAperturaAt: r.ultima_apertura_at,
  };
}

export type EsitoIngresso =
  | { ok: true; cookie: string }
  | { ok: false; motivo: string };

/**
 * Prova una password su una bacheca. Gestisce il freno ai tentativi.
 *
 * Il messaggio di rifiuto è sempre lo stesso («password sbagliata») tranne
 * quando c'è un blocco, dove si dice quanto manca: non è un'informazione utile
 * a chi attacca (lo scoprirebbe comunque riprovando) ed è l'unica cosa che
 * serve a chi ha solo sbagliato a battere.
 */
export async function provaPasswordBacheca(
  bacheca: BachecaRiga,
  password: string,
): Promise<EsitoIngresso> {
  const adesso = new Date();
  const blocco = statoBlocco(
    { tentativi: bacheca.tentativiFalliti, bloccataFinoA: bacheca.bloccataFinoA },
    adesso,
  );
  if (blocco.bloccata) {
    const minuti = Math.ceil(blocco.secondiRimasti / 60);
    return {
      ok: false,
      motivo: `Troppi tentativi. Riprova fra ${minuti} ${minuti === 1 ? 'minuto' : 'minuti'}.`,
    };
  }

  const service = createServiceSupabase();

  if (!passwordCorrisponde(password, bacheca.passwordHash, bacheca.passwordSale)) {
    const nuovo = dopoTentativoSbagliato(
      { tentativi: bacheca.tentativiFalliti, bloccataFinoA: bacheca.bloccataFinoA },
      adesso,
    );
    await service
      .from('bacheche_pubbliche' as never)
      .update({
        tentativi_falliti: nuovo.tentativi,
        bloccata_fino_a: nuovo.bloccataFinoA?.toISOString() ?? null,
      } as never)
      .eq('tenant_id', bacheca.tenantId);
    return { ok: false, motivo: 'Password sbagliata.' };
  }

  const azzerato = dopoIngressoRiuscito();
  await service
    .from('bacheche_pubbliche' as never)
    .update({
      tentativi_falliti: azzerato.tentativi,
      bloccata_fino_a: azzerato.bloccataFinoA,
    } as never)
    .eq('tenant_id', bacheca.tenantId);

  return { ok: true, cookie: firmaSessione(bacheca.tenantId, bacheca.token) };
}

/** Segna un'apertura. Best-effort: un contatore non deve far cadere la pagina. */
export async function segnaAperturaBacheca(tenantId: string): Promise<void> {
  try {
    const service = createServiceSupabase();
    await service.rpc('incrementa_apertura_bacheca' as never, { p_tenant: tenantId } as never);
  } catch {
    /* il contatore non vale una pagina bianca */
  }
}

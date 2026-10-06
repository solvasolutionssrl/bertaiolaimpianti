'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';

import { createServiceSupabase } from '@kommessa/api/service';
import {
  BYTE_TEMPORANEA,
  aliasLogin,
  componiPasswordTemporanea,
  validaPassword,
  validaUsername,
} from '@kommessa/api/identita';

import { requireTenantContextCached } from '@/app/_lib/tenant-cache';
import { auditTenant } from './_lib/audit';

/**
 * Creare e reimpostare gli accessi delle persone. **Un posto solo.**
 *
 * ## Perché un posto solo
 *
 * Prima di oggi un account nasceva da cinque strade diverse: due inviti per
 * posta, tre creazioni manuali, ognuna con la sua copia delle regole
 * sull'username e la sua formula per l'indirizzo. Cinque strade significano che
 * la sesta cosa che aggiungi — per esempio «al primo ingresso cambia la
 * password» — la metti in quattro e te ne dimentichi in una. E quella in cui te
 * ne dimentichi non da' nessun errore: da' un account che resta per sempre
 * sulla password dettata al telefono.
 *
 * Qui dentro ci sono due gesti e basta:
 *
 *  - `creaAccount`     una persona nuova entra
 *  - `reimpostaAccesso` una persona ha perso la password
 *
 * Entrambi passano dal service role, perche' creare un utente in Supabase Auth
 * e' un'operazione di amministrazione, e perche' `must_change_password` e'
 * protetta dal trigger `users_proteggi_privilegi`: dall'app non si scrive,
 * nemmeno da un amministratore.
 *
 * ## La password si vede una volta
 *
 * Torna in chiaro nella risposta che la crea, e poi non esiste piu' da nessuna
 * parte — nemmeno nell'audit, che lo leggono in tanti. Chi la perde ne fa
 * generare un'altra: e' piu' sicuro di qualunque posto in cui potremmo
 * tenerla.
 */

/** Chi puo' creare accessi: l'ufficio per i tecnici, l'amministratore per tutti. */
const RUOLI_CREABILI = ['tecnico', 'office', 'admin'] as const;
export type RuoloCreabile = (typeof RUOLI_CREABILI)[number];

export interface AccountCreato {
  userId: string;
  username: string;
  /** In chiaro, una volta sola. Da leggere a voce e non riscrivere da nessuna parte. */
  password: string;
  /** L'indirizzo con cui Supabase autentica. Non riceve posta: serve al supporto. */
  aliasInterno: string;
  /** La sigla da battere nel primo campo del login. */
  codiceAzienda: string | null;
}

type Esito<T> = { ok: true; data: T } | { ok: false; error: string };

/** Password temporanea vera: byte dal generatore crittografico, forma dal modulo puro. */
function nuovaPasswordTemporanea(): string {
  return componiPasswordTemporanea(new Uint8Array(randomBytes(BYTE_TEMPORANEA)));
}

type Guardia =
  | { ok: false; errore: string }
  | {
      ok: true;
      ctx: Awaited<ReturnType<typeof requireTenantContextCached>>;
      service: ReturnType<typeof createServiceSupabase>;
    };

/**
 * Chi puo' toccare gli accessi, e per quale ruolo.
 *
 * L'ufficio crea i tecnici: e' il gesto quotidiano, uno per persona che entra
 * in azienda. Un account d'ufficio o d'amministrazione vede tutto lo spazio di
 * lavoro, quindi lo crea un amministratore — la stessa regola che vale per gli
 * inviti, scritta una volta invece di due.
 */
async function guardia(ruoloTarget?: RuoloCreabile): Promise<Guardia> {
  const ctx = await requireTenantContextCached();
  if (ctx.role !== 'admin' && ctx.role !== 'office') {
    return { ok: false, errore: 'Gli accessi li gestisce l’ufficio.' };
  }
  if (ruoloTarget && ruoloTarget !== 'tecnico' && ctx.role !== 'admin') {
    return {
      ok: false,
      errore: 'Solo un amministratore può creare un account d’ufficio o di amministrazione.',
    };
  }
  let service: ReturnType<typeof createServiceSupabase>;
  try {
    service = createServiceSupabase();
  } catch (e) {
    return {
      ok: false,
      errore: e instanceof Error ? e.message : 'Configurazione del server incompleta.',
    };
  }
  return { ok: true, ctx, service };
}

/** La sigla che la persona dovra' battere nel primo campo del login, se serve. */
async function codiceAziendaDelTenant(
  service: ReturnType<typeof createServiceSupabase>,
  tenantId: string,
): Promise<string | null> {
  const { data } = await service
    .from('tenants' as never)
    .select('codice_azienda, login_senza_codice')
    .eq('id', tenantId)
    .maybeSingle();
  const t = data as { codice_azienda: string | null; login_senza_codice: boolean | null } | null;
  // Il tenant predefinito non ha bisogno della sigla: il campo si lascia vuoto.
  if (!t || t.login_senza_codice) return null;
  return t.codice_azienda ?? null;
}

export async function creaAccount(input: {
  username: string;
  displayName: string;
  role: RuoloCreabile;
  /** Se assente, la genera il server. È il caso normale. */
  password?: string;
  /** Se passato, l'account viene legato a quella scheda del personale. */
  dipendenteId?: string | null;
}): Promise<Esito<AccountCreato>> {
  const ruolo = input?.role;
  if (!RUOLI_CREABILI.includes(ruolo)) return { ok: false, error: 'Ruolo non valido.' };

  const g = await guardia(ruolo);
  if (!g.ok) return { ok: false, error: g.errore };
  const { ctx, service } = g;

  const vu = validaUsername(input?.username);
  if (!vu.ok) return { ok: false, error: vu.motivo };
  const username = vu.username;

  const displayName = String(input?.displayName ?? '').trim();
  if (displayName.length < 2 || displayName.length > 120) {
    return { ok: false, error: 'Il nome della persona deve stare fra 2 e 120 caratteri.' };
  }

  // Password: quella data, oppure una generata. In entrambi i casi passa dalla
  // stessa validazione — una password scelta a mano dall'ufficio non è più
  // affidabile di una generata, spesso è meno.
  const password = input?.password?.trim() || nuovaPasswordTemporanea();
  const vp = validaPassword(password, { username });
  if (!vp.ok) return { ok: false, error: vp.motivo };

  const aliasInterno = aliasLogin(username, ctx.tenantSlug);

  const creato = await service.auth.admin.createUser({
    email: aliasInterno,
    password,
    // Nessuna casella da confermare: l'indirizzo non esiste per definizione.
    email_confirm: true,
    user_metadata: { display_name: displayName },
    app_metadata: {
      tenant_id: ctx.tenantId,
      tenant_slug: ctx.tenantSlug,
      role: ruolo,
      manual_account: true,
    } as never,
  });
  if (creato.error) {
    const msg = creato.error.message.toLowerCase();
    // GoTrue non dice «username occupato», dice «already registered». Tradotto,
    // perché chi compila il modulo ha scritto un nome utente, non un'email.
    if (msg.includes('already')) {
      return { ok: false, error: `Il nome utente “${username}” è già usato in questo spazio di lavoro.` };
    }
    return { ok: false, error: creato.error.message };
  }
  const userId = creato.data.user?.id;
  if (!userId) return { ok: false, error: 'Supabase non ha restituito l’id dell’account.' };

  const { error: errProfilo } = await service.from('users').insert({
    id: userId,
    tenant_id: ctx.tenantId,
    role: ruolo,
    display_name: displayName,
    attivo: true,
    must_change_password: true,
  } as never);
  if (errProfilo) {
    // Un account in Auth senza riga in `users` è un fantasma: entra e non ha
    // tenant, quindi vede la pagina d'errore. Meglio toglierlo.
    try {
      await service.auth.admin.deleteUser(userId);
    } catch {
      /* best-effort: se non si cancella, resta un account senza profilo */
    }
    return { ok: false, error: `Account non creato: ${errProfilo.message}` };
  }

  // Legame con la scheda del personale, se ce n'è una. Non blocca: l'accesso
  // funziona anche senza, e si può collegare dopo dalla scheda.
  let avvisoLegame: string | null = null;
  if (input?.dipendenteId) {
    const { error } = await service
      .from('dipendenti' as never)
      .update({ user_id: userId } as never)
      .eq('id', input.dipendenteId)
      .eq('tenant_id', ctx.tenantId);
    if (error) avvisoLegame = error.message;
  }

  await auditTenant(service as never, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'utente',
    entityId: userId,
    action: 'account.crea',
    // ⚠️ Mai la password, nemmeno qui: l'audit lo legge tutto l'ufficio.
    after: { username, ruolo, nome: displayName, deve_cambiare_password: true } as never,
    metadata: avvisoLegame ? { legame_dipendente_fallito: avvisoLegame } : undefined,
  });

  revalidatePath('/office/impostazioni/utenti');
  revalidatePath('/office/personale/dipendenti');
  revalidatePath('/office/personale/dipendenti');

  return {
    ok: true,
    data: {
      userId,
      username,
      password,
      aliasInterno,
      codiceAzienda: await codiceAziendaDelTenant(service, ctx.tenantId),
    },
  };
}

/**
 * Una persona ha perso la password: gliene si da' una nuova, temporanea, che
 * dovra' cambiare al primo ingresso.
 *
 * Non c'e' nessun recupero per posta, e non e' una mancanza: l'indirizzo di
 * questi account **non esiste**, quindi un messaggio non arriverebbe da
 * nessuna parte. Il recupero e' una persona dell'ufficio che rigenera e detta.
 */
export async function reimpostaAccesso(input: {
  userId: string;
}): Promise<Esito<{ password: string; username: string | null }>> {
  const g = await guardia();
  if (!g.ok) return { ok: false, error: g.errore };
  const { ctx, service } = g;

  const userId = String(input?.userId ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return { ok: false, error: 'Account non valido.' };

  // La persona deve essere di questo spazio di lavoro. Il service role scavalca
  // RLS: senza questo filtro, un id indovinato reimposterebbe la password di un
  // altro cliente.
  const { data: profilo } = await service
    .from('users')
    .select('id, display_name, role')
    .eq('id', userId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (!profilo) return { ok: false, error: 'Account non trovato.' };

  const ruolo = (profilo as { role: string }).role;
  if (ruolo !== 'tecnico' && ctx.role !== 'admin') {
    return { ok: false, error: 'Solo un amministratore può reimpostare questo accesso.' };
  }

  const password = nuovaPasswordTemporanea();
  const { data: aggiornato, error: errAuth } = await service.auth.admin.updateUserById(userId, {
    password,
  });
  if (errAuth) return { ok: false, error: errAuth.message };

  const { error: errFlag } = await service
    .from('users')
    .update({ must_change_password: true, password_changed_at: null } as never)
    .eq('id', userId)
    .eq('tenant_id', ctx.tenantId);
  if (errFlag) return { ok: false, error: errFlag.message };

  await auditTenant(service as never, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'utente',
    entityId: userId,
    action: 'account.reimposta_password',
    after: { deve_cambiare_password: true } as never,
  });

  revalidatePath('/office/impostazioni/utenti');

  const email = aggiornato?.user?.email ?? null;
  const username = email ? (email.split('@')[0] ?? null) : null;
  return { ok: true, data: { password, username } };
}

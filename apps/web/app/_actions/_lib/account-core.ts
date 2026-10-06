import 'server-only';

import { randomBytes } from 'node:crypto';

import { createServiceSupabase } from '@kommessa/api/service';
import {
  BYTE_TEMPORANEA,
  aliasLogin,
  componiPasswordTemporanea,
  validaPassword,
  validaUsername,
} from '@kommessa/api/identita';
import { scriviCapacita } from '@kommessa/api/capacita';

/**
 * **Far nascere un account. Un posto solo, per davvero.**
 *
 * ## Perché questo file esiste accanto a `account.ts`
 *
 * `account.ts` diceva già «un posto solo», e per l'ufficio era vero. Ma fuori
 * da lì c'erano ancora **sei** strade: tre nel pannello di piattaforma (crea
 * manuale, nuovo utente con email, invita), l'owner che nasce insieme al
 * cliente, l'invito dell'ufficio, e lo script a riga di comando. Ognuna con la
 * sua copia delle regole, e con una differenza che contava davvero:
 *
 * ⚠️ **Quattro di quelle sei non scrivevano `must_change_password`.** Un
 * account creato dal pannello di piattaforma con nome utente e password
 * dettata a voce — identico a uno creato dall'ufficio — restava **per sempre**
 * sulla password dettata. È esattamente il guasto che il cancello esiste per
 * impedire, sopravvissuto nel percorso che nessuno guardava.
 *
 * Altre divergenze trovate contando, non immaginando: `tenant_slug` mancante
 * nei claim di un percorso, `invite_sent_at` scritto da uno solo su tre
 * inviti, l'utente Auth lasciato orfano da due percorsi quando l'inserimento
 * del profilo falliva, quattro nomi diversi nell'audit per «è nato un
 * account», e `entity_type` scritto ora `utente` ora `user`.
 *
 * ## Il contratto
 *
 * Questa funzione **non decide chi può**: la guardia la mette chi chiama —
 * l'ufficio con `requireTenantContext`, il pannello con
 * `requirePlatformAdmin`. Qui dentro sta solo *come* nasce un account, che è
 * la parte che deve essere identica ovunque.
 */

/** I ruoli che si possono assegnare a un account nuovo. */
export const RUOLI_ACCOUNT = ['tecnico', 'office', 'admin'] as const;
export type RuoloAccount = (typeof RUOLI_ACCOUNT)[number];

/**
 * Come entra la persona.
 *
 *  - `utente`  nome utente e password: si fabbrica l'alias `@<sigla>.kommessa.local`.
 *              È il caso dei tecnici, che una casella aziendale non ce l'hanno.
 *  - `email`   casella vera e password decisa adesso: entra subito, senza messaggi.
 *  - `invito`  casella vera e nessuna password: riceve un messaggio e se la sceglie.
 */
export type ModoIngresso =
  | { tipo: 'utente'; username: string; password?: string }
  | { tipo: 'email'; email: string; password?: string }
  | { tipo: 'invito'; email: string; redirectTo: string };

export interface NascitaAccount {
  tenantId: string;
  tenantSlug: string;
  displayName: string;
  role: RuoloAccount;
  ingresso: ModoIngresso;
  /** Da dare subito, invece che in un secondo giro che può fallire da solo. */
  capoSquadra?: boolean;
  /** Se passato, l'account viene legato a quella scheda del personale. */
  dipendenteId?: string | null;
}

export interface Attore {
  userId: string;
  /** Il ruolo di chi crea, per l'audit. Un super admin vale `admin`. */
  role: 'admin' | 'office';
}

export interface AccountNato {
  userId: string;
  /** Il nome utente, se entra così. */
  username: string | null;
  /** L'indirizzo con cui Supabase autentica (alias o casella vera). */
  emailAuth: string;
  /** In chiaro, una volta sola. `null` per gli inviti: se la sceglie la persona. */
  password: string | null;
  /** Se dovrà sceglierne una sua al primo ingresso. */
  deveCambiarePassword: boolean;
}

export type EsitoNascita =
  | { ok: true; data: AccountNato }
  | { ok: false; error: string };

/** Password temporanea vera: byte crittografici, forma dal modulo puro. */
function nuovaPasswordTemporanea(): string {
  return componiPasswordTemporanea(new Uint8Array(randomBytes(BYTE_TEMPORANEA)));
}

export async function faiNascereUnAccount(
  input: NascitaAccount,
  attore: Attore,
): Promise<EsitoNascita> {
  if (!RUOLI_ACCOUNT.includes(input.role)) {
    return { ok: false, error: 'Ruolo non valido.' };
  }

  const displayName = String(input.displayName ?? '').trim();
  if (displayName.length < 2 || displayName.length > 120) {
    return { ok: false, error: 'Il nome della persona deve stare fra 2 e 120 caratteri.' };
  }

  let service: ReturnType<typeof createServiceSupabase>;
  try {
    service = createServiceSupabase();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Configurazione del server incompleta.',
    };
  }

  // ── Chi entra, e con cosa ────────────────────────────────────────────────
  let emailAuth: string;
  let username: string | null = null;
  let password: string | null = null;
  const perInvito = input.ingresso.tipo === 'invito';

  if (input.ingresso.tipo === 'utente') {
    const vu = validaUsername(input.ingresso.username);
    if (!vu.ok) return { ok: false, error: vu.motivo };
    username = vu.username;
    emailAuth = aliasLogin(username, input.tenantSlug);
    password = input.ingresso.password?.trim() || nuovaPasswordTemporanea();
  } else {
    const email = String(input.ingresso.email ?? '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { ok: false, error: 'Email non valida.' };
    }
    emailAuth = email;
    if (input.ingresso.tipo === 'email') {
      password = input.ingresso.password?.trim() || nuovaPasswordTemporanea();
    }
  }

  // La password passa SEMPRE dalla stessa validazione, scelta a mano o
  // generata: una password battuta da un umano non è più affidabile di una
  // generata, spesso è meno.
  if (password !== null) {
    const vp = validaPassword(password, { username });
    if (!vp.ok) return { ok: false, error: vp.motivo };
  }

  // ── L'account in Supabase Auth ───────────────────────────────────────────
  const claims = {
    tenant_id: input.tenantId,
    tenant_slug: input.tenantSlug,
    role: input.role,
    // ⚠️ `tenant_slug` lo scrivevano quasi tutti i percorsi tranne uno, e la
    // sua assenza fa sollevare `NO_TENANT_CLAIM` finché il trigger
    // `sync_user_claims` non ripara. Qui c'è sempre.
    ...(perInvito ? {} : { manual_account: true }),
  };

  let userId: string;
  if (perInvito) {
    const { data, error } = await service.auth.admin.inviteUserByEmail(emailAuth, {
      data: { display_name: displayName },
      redirectTo: (input.ingresso as { redirectTo: string }).redirectTo,
    });
    if (error || !data?.user) {
      return { ok: false, error: error?.message ?? 'Invio dell’invito non riuscito.' };
    }
    userId = data.user.id;

    // Se quella casella è già una persona di un altro spazio di lavoro,
    // l'invito si ferma qui: cambiarle i claims la sposterebbe di cliente.
    // ⚠️ Lo controllava un solo percorso su tre.
    const { data: gia } = await service
      .from('users')
      .select('tenant_id')
      .eq('id', userId)
      .maybeSingle();
    const altroTenant = (gia as { tenant_id?: string } | null)?.tenant_id ?? null;
    if (altroTenant && altroTenant !== input.tenantId) {
      return { ok: false, error: 'Questa email appartiene già a un altro spazio di lavoro.' };
    }

    const { error: errMeta } = await service.auth.admin.updateUserById(userId, {
      app_metadata: claims as never,
    });
    if (errMeta) return { ok: false, error: errMeta.message };
  } else {
    const creato = await service.auth.admin.createUser({
      email: emailAuth,
      password: password!,
      // Nessuna casella da confermare: per un alias non esiste, per una vera
      // la password gliel'abbiamo data noi.
      email_confirm: true,
      user_metadata: { display_name: displayName },
      app_metadata: claims as never,
    });
    if (creato.error) {
      const msg = creato.error.message.toLowerCase();
      // GoTrue non dice «nome utente occupato», dice «already registered».
      if (msg.includes('already')) {
        return {
          ok: false,
          error: username
            ? `Il nome utente “${username}” è già usato in questo spazio di lavoro.`
            : `L’indirizzo ${emailAuth} ha già un account.`,
        };
      }
      return { ok: false, error: creato.error.message };
    }
    if (!creato.data.user?.id) {
      return { ok: false, error: 'Supabase non ha restituito l’id dell’account.' };
    }
    userId = creato.data.user.id;
  }

  // ── La riga applicativa ──────────────────────────────────────────────────
  //
  // ⚠️ Chi riceve una password da qualcun altro deve cambiarla al primo
  // ingresso. Chi arriva per invito se la sceglie già lui, quindi il cancello
  // non serve. Quattro percorsi su sei non scrivevano affatto questa colonna,
  // e il valore di default (`false`) lasciava l'account per sempre sulla
  // password dettata al telefono.
  const deveCambiarePassword = !perInvito;

  const riga: Record<string, unknown> = {
    id: userId,
    tenant_id: input.tenantId,
    role: input.role,
    display_name: displayName,
    attivo: true,
    must_change_password: deveCambiarePassword,
  };
  if (perInvito) riga.invite_sent_at = new Date().toISOString();
  if (input.capoSquadra && input.role === 'tecnico') {
    // Dato subito, in una scrittura sola: concederlo in un secondo giro
    // lasciava l'account creato e il potere no, se il secondo giro falliva.
    riga.permissions = scriviCapacita(null, 'capo_squadra', true);
  }

  // `upsert` e non `insert`: una casella già invitata in passato ha già la sua
  // riga, e un `insert` fallirebbe sulla chiave primaria.
  const { error: errProfilo } = await service
    .from('users')
    .upsert(riga as never, { onConflict: 'id' });
  if (errProfilo) {
    // Un account in Auth senza riga in `users` è un fantasma: entra, non ha
    // tenant, e vede la pagina d'errore. ⚠️ Due percorsi lo lasciavano lì.
    try {
      await service.auth.admin.deleteUser(userId);
    } catch {
      console.error(
        `[account] creato l'utente auth ${userId} ma non il profilo, e non si è potuto cancellare`,
      );
    }
    return { ok: false, error: `Account non creato: ${errProfilo.message}` };
  }

  // ── Il legame con la scheda del personale, se c'è ────────────────────────
  let avvisoLegame: string | null = null;
  if (input.dipendenteId) {
    const { error } = await service
      .from('dipendenti' as never)
      .update({ user_id: userId } as never)
      .eq('id', input.dipendenteId)
      .eq('tenant_id', input.tenantId);
    if (error) avvisoLegame = error.message;
  }

  // ── L'audit, con un vocabolario solo ────────────────────────────────────
  //
  // ⚠️ Prima c'erano quattro nomi per «è nato un account» (`account.crea`,
  // `create_manual`, `tenant.user.create_with_password`, `invite`) e due
  // `entity_type` (`utente` e `user`). Chi cerca nel registro non sa cosa
  // cercare.
  try {
    await service.from('audit_events').insert({
      tenant_id: input.tenantId,
      actor_user_id: attore.userId,
      actor_role: attore.role,
      entity_type: 'utente',
      entity_id: userId,
      action: perInvito ? 'account.invita' : 'account.crea',
      // ⚠️ Mai la password, nemmeno qui: l'audit lo legge tutto l'ufficio.
      after_data: {
        modo: input.ingresso.tipo,
        username,
        ruolo: input.role,
        nome: displayName,
        deve_cambiare_password: deveCambiarePassword,
        ...(input.capoSquadra ? { capo_squadra: true } : {}),
      } as never,
      metadata: (avvisoLegame ? { legame_dipendente_fallito: avvisoLegame } : {}) as never,
    });
  } catch {
    // L'audit è best-effort: non vale un account non creato.
  }

  return {
    ok: true,
    data: { userId, username, emailAuth, password, deveCambiarePassword },
  };
}

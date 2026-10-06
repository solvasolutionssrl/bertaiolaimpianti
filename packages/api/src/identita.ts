/**
 * Identità di accesso: username, alias di posta, password.
 *
 * ## Perché questo file esiste
 *
 * Prima di oggi la stessa regola stava scritta in quattro posti diversi: il
 * risolutore del login, l'azione dell'ufficio, quella del super admin e la
 * validazione nel browser. Quattro copie della stessa frase significano che un
 * giorno una delle quattro cambia e le altre no — e il sintomo non è un errore
 * ma un account che si crea e non entra, oppure un username che entra da una
 * porta e non dall'altra. Nessun messaggio, nessun log: solo una persona che
 * dice «a me non funziona».
 *
 * Qui dentro sta **il contratto**, non l'elenco di chi esiste:
 *
 *  - quali username sono accettabili (lo decide il login, che li deve ritrovare);
 *  - come un username diventa l'indirizzo con cui Supabase autentica;
 *  - quanto deve essere lunga una password (lo decide GoTrue, non noi);
 *  - come si compone una password temporanea che si possa **dettare al telefono**.
 *
 * ⚠️ Nessuna funzione qui dentro parla col database né genera casualità: la
 * composizione della password temporanea prende i byte da fuori. Così si può
 * provare con byte fissi e sapere esattamente cosa esce.
 */

// ───────────────────────────── Username ─────────────────────────────

/** Minimo e massimo: lo stesso intervallo che il login è disposto a cercare. */
export const USERNAME_MIN = 2;
export const USERNAME_MAX = 40;

/**
 * I caratteri ammessi in uno username.
 *
 * Volutamente strettissimo: minuscole, cifre, punto, trattino,
 * sottolineato. Finisce dentro un indirizzo di posta, quindi ogni carattere in
 * più è un carattere che un giorno qualcuno scrive maiuscolo, con un accento o
 * con uno spazio — e l'accesso non va, senza che si capisca perché.
 */
const USERNAME_AMMESSI = /^[a-z0-9._-]+$/;

export type EsitoUsername =
  | { ok: true; username: string }
  | { ok: false; motivo: string };

/**
 * Porta uno username alla sua unica forma buona: senza spazi ai lati, tutto
 * minuscolo. Torna `null` se quello che resta non è accettabile.
 *
 * Non solleva mai: serve anche in lettura, dove un dato storto non deve
 * fermare la pagina.
 */
export function normalizzaUsername(grezzo: unknown): string | null {
  if (typeof grezzo !== 'string') return null;
  const u = grezzo.trim().toLowerCase();
  if (u.length < USERNAME_MIN || u.length > USERNAME_MAX) return null;
  if (!USERNAME_AMMESSI.test(u)) return null;
  return u;
}

/**
 * Come `normalizzaUsername`, ma dice **perché** no. Da usare in scrittura: a
 * chi sta compilando un modulo si deve dire cosa cambiare, non «dati non
 * validi».
 */
export function validaUsername(grezzo: unknown): EsitoUsername {
  if (typeof grezzo !== 'string' || grezzo.trim() === '') {
    return { ok: false, motivo: 'Manca il nome utente.' };
  }
  const u = grezzo.trim().toLowerCase();
  if (u.length < USERNAME_MIN) {
    return { ok: false, motivo: `Il nome utente è troppo corto: almeno ${USERNAME_MIN} caratteri.` };
  }
  if (u.length > USERNAME_MAX) {
    return { ok: false, motivo: `Il nome utente è troppo lungo: massimo ${USERNAME_MAX} caratteri.` };
  }
  if (!USERNAME_AMMESSI.test(u)) {
    return {
      ok: false,
      motivo: 'Nel nome utente vanno solo lettere minuscole, numeri, punto, trattino e sottolineato.',
    };
  }
  return { ok: true, username: u };
}

/**
 * Propone uno username partendo dal nome della persona: `Mario Rossi` →
 * `m.rossi`. È un **suggerimento** per chi compila, non una regola: resta
 * modificabile, perché due Rossi esistono e la seconda la decide un umano.
 *
 * Torna `null` se dal nome non si ricava niente di accettabile.
 */
export function proponiUsername(nome: string, cognome?: string): string | null {
  const pulisci = (s: string) =>
    s
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');

  const n = pulisci(nome ?? '');
  const c = pulisci(cognome ?? '');

  // Con nome e cognome: iniziale del nome, punto, cognome. È la forma che l'uso
  // reale ha già scelto (gli account di FPM sono fatti così).
  if (n && c) return normalizzaUsername(`${n[0]}.${c}`.slice(0, USERNAME_MAX));
  // Con un campo solo, quello che c'è: può essere «nome cognome» tutto insieme.
  const unico = n || c;
  if (!unico) return null;
  return normalizzaUsername(unico.slice(0, USERNAME_MAX));
}

// ─────────────────────── Alias di posta per il login ───────────────────────

/**
 * Il dominio degli indirizzi che **non esistono**.
 *
 * Supabase Auth vuole un'email per ogni account, anche quando la persona non
 * ne ha una. Allora se ne fabbrica una che non può ricevere niente: `.local`
 * è riservato per definizione e non è risolvibile da internet. Non è un
 * ripiego sporco, è la dichiarazione che quella casella non va cercata.
 *
 * ⚠️ Cambiarlo rende irraggiungibili tutti gli account già creati.
 */
export const DOMINIO_ALIAS = 'kommessa.local';

/**
 * L'unica formula che trasforma «sigla azienda + nome utente» nell'indirizzo
 * con cui si autentica.
 *
 * Minuscolo da entrambe le parti: Supabase normalizza comunque l'indirizzo, e
 * se noi scrivessimo `Mario@BER.kommessa.local` la riga salvata sarebbe
 * un'altra da quella mostrata a chi ha creato l'account.
 */
export function aliasLogin(username: string, slugTenant: string): string {
  return `${username.trim().toLowerCase()}@${slugTenant.trim().toLowerCase()}.${DOMINIO_ALIAS}`;
}

/**
 * Se questo indirizzo è una casella vera o un alias fabbricato da noi.
 *
 * Serve per sapere **cosa si può fare** con un account: a un alias non si
 * manda nessun messaggio, quindi niente invito e niente recupero password per
 * posta. Chi dimentica la password se la fa reimpostare dall'ufficio.
 */
export function eAliasLocale(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase().endsWith(`.${DOMINIO_ALIAS}`);
}

/**
 * Il nome utente dentro un alias: `m.rossi@ber.kommessa.local` → `m.rossi`.
 * Torna `null` se non è un alias nostro, perché per un indirizzo vero non
 * esiste nessun nome utente da mostrare.
 */
export function usernameDaAlias(email: string | null | undefined): string | null {
  if (!eAliasLocale(email)) return null;
  const locale = String(email).trim().toLowerCase().split('@')[0] ?? '';
  return normalizzaUsername(locale);
}

/**
 * Come si presenta un account a schermo: il nome utente se è un alias,
 * l'indirizzo vero altrimenti. Un'unica risposta alla domanda «con cosa
 * entra questa persona?».
 */
export function etichettaAccesso(email: string | null | undefined): string {
  return usernameDaAlias(email) ?? (email ?? '—');
}

// ───────────────────────────── Password ─────────────────────────────

/** Il minimo che chiediamo. Più corta di così non la accetta nemmeno GoTrue. */
export const PASSWORD_MIN = 8;

/**
 * Il massimo, e non è una scelta di gusto: bcrypt tronca a 72 byte. Accettare
 * una password più lunga vorrebbe dire ignorare in silenzio la parte in
 * eccesso, cioè dire a qualcuno che ha una password lunga quando non ce l'ha.
 */
export const PASSWORD_MAX = 72;

export type EsitoPassword = { ok: true } | { ok: false; motivo: string };

/**
 * Se una password nuova si può accettare.
 *
 * Tre rifiuti, tutti con una ragione dicibile: troppo corta, troppo lunga,
 * uguale al nome utente. Il terzo conta più di quanto sembri: `rossi` /
 * `rossi` è la prima cosa che prova chiunque abbia l'elenco del personale.
 *
 * Non c'è nessuna pretesa di maiuscole, cifre e simboli: fa scegliere
 * `Password1!` e la fa scrivere su un biglietto attaccato al furgone.
 */
export function validaPassword(
  password: unknown,
  opzioni?: { username?: string | null },
): EsitoPassword {
  if (typeof password !== 'string' || password === '') {
    return { ok: false, motivo: 'Manca la password.' };
  }
  if (password.length < PASSWORD_MIN) {
    return { ok: false, motivo: `La password è troppo corta: almeno ${PASSWORD_MIN} caratteri.` };
  }
  // In byte, non in caratteri: una password di emoji sta sotto i 72 caratteri
  // e sopra i 72 byte, e verrebbe troncata senza che nessuno lo dica.
  if (new TextEncoder().encode(password).length > PASSWORD_MAX) {
    return { ok: false, motivo: `La password è troppo lunga: massimo ${PASSWORD_MAX} caratteri.` };
  }
  const u = opzioni?.username?.trim().toLowerCase();
  if (u && password.trim().toLowerCase() === u) {
    return { ok: false, motivo: 'La password non può essere uguale al nome utente.' };
  }
  return { ok: true };
}

/**
 * Le sillabe con cui si compone una password temporanea.
 *
 * Consonanti senza quelle che si confondono a voce o a schermo: via `l` (con
 * `1`), via `q` (con `g` al telefono), via `v` (con `b` al telefono). Vocali
 * tutte tranne... nessuna: le vocali non si confondono.
 *
 * Il risultato è pronunciabile — «tabero» si detta in tre sillabe — e questo
 * è l'unico requisito che conta davvero: la password temporanea viene letta a
 * voce da chi la crea a chi la deve usare.
 */
const CONSONANTI = 'bcdfgmnprstz';
const VOCALI = 'aeiou';
/** Cifre senza `0` e `1`: si confondono con `O` e `l`. */
const CIFRE = '23456789';

/** Quante sillabe e quante cifre: 3 + 2 = 8 caratteri, il nostro minimo esatto. */
export const SILLABE_TEMPORANEA = 3;
export const CIFRE_TEMPORANEA = 2;
/** Quanti byte servono a comporla: due per sillaba, uno per cifra. */
export const BYTE_TEMPORANEA = SILLABE_TEMPORANEA * 2 + CIFRE_TEMPORANEA;

/**
 * Compone una password temporanea dai byte dati. **Pura**: stessi byte, stessa
 * password.
 *
 * Forma: `Tabero47` — iniziale maiuscola perché qualche sistema la pretende e
 * non costa niente, poi sillabe, poi due cifre.
 *
 * ⚠️ I byte devono venire da una sorgente crittografica (`randomBytes`), non
 * da `Math.random`. Questa funzione non lo può controllare: è il chiamante che
 * deve fare la cosa giusta, ed è il motivo per cui la casualità sta fuori.
 */
export function componiPasswordTemporanea(byte: Uint8Array): string {
  if (byte.length < BYTE_TEMPORANEA) {
    throw new Error(`Servono almeno ${BYTE_TEMPORANEA} byte per comporre la password.`);
  }
  let out = '';
  for (let i = 0; i < SILLABE_TEMPORANEA; i += 1) {
    const c = CONSONANTI[byte[i * 2]! % CONSONANTI.length]!;
    const v = VOCALI[byte[i * 2 + 1]! % VOCALI.length]!;
    out += c + v;
  }
  out = out[0]!.toUpperCase() + out.slice(1);
  for (let i = 0; i < CIFRE_TEMPORANEA; i += 1) {
    out += CIFRE[byte[SILLABE_TEMPORANEA * 2 + i]! % CIFRE.length]!;
  }
  return out;
}

// ──────────────────── Cambio password al primo accesso ────────────────────

/**
 * Chi deve passare dalla schermata «scegli la tua password» prima di poter
 * lavorare.
 *
 * Una riga sola di logica, ma scritta qui per un motivo: così la stessa
 * domanda ha la stessa risposta nel guscio dell'ufficio, in quello del
 * telefono e in quello del pannello. Tre copie di un `if` sono tre occasioni
 * di dimenticarne una, e quella dimenticata è la porta che resta aperta.
 */
export function deveCambiarePassword(utente: {
  mustChangePassword?: boolean | null;
}): boolean {
  return utente.mustChangePassword === true;
}

/**
 * Chi sta ancora usando una password che ha scelto qualcun altro.
 *
 * È un fatto **diverso** dal precedente, e tenerli separati è il motivo per
 * cui esistono due funzioni al posto di una. `deveCambiarePassword` è una
 * *policy* («e per questo ti blocco»); questa è uno *stato* («la password in
 * uso te l'ha data l'ufficio»). Coincidevano finché l'unica risposta allo
 * stato era il blocco: dal momento in cui si vuole far entrare qualcuno
 * senza muro ma dirglielo, una colonna sola non basta più a scrivere il caso.
 *
 * Chi è bloccato è sempre anche provvisorio; il contrario no.
 */
export function mostraPromemoriaPassword(utente: {
  passwordProvvisoria?: boolean | null;
}): boolean {
  return utente.passwordProvvisoria === true;
}

/**
 * Cosa si scrive sulle due colonne della password quando un account nasce.
 *
 * ⚠️ **Esiste per un motivo preciso.** Il nucleo che fa nascere un account
 * (`app/_actions/_lib/account-core.ts`) è `server-only`, quindi uno script a
 * riga di comando non può importarlo: `scripts/crea-utenti-da-file.ts` scrive
 * la riga `users` per conto suo. È l'ottava strada, e il giro di ieri ha
 * mostrato cosa costano le strade parallele — quattro su sei non scrivevano
 * `must_change_password`.
 *
 * Non si può unificare il *client* (uno vive in Next, l'altro in `tsx`), ma si
 * può unificare la **decisione**: questa funzione è l'unico posto che sa come
 * si combinano «è nato per invito» e «blocco o promemoria». Le due strade
 * restano due, la regola è una.
 */
export function statoPasswordAllaNascita(opts: {
  /** Per invito la password la scegle la persona: non è provvisoria. */
  perInvito: boolean;
  /** Predefinito `obbligatorio`: su una password che sanno in due, si blocca. */
  cambio?: 'obbligatorio' | 'promemoria';
}): { must_change_password: boolean; password_provvisoria: boolean } {
  const provvisoria = !opts.perInvito;
  return {
    password_provvisoria: provvisoria,
    must_change_password: provvisoria && (opts.cambio ?? 'obbligatorio') === 'obbligatorio',
  };
}

// ───────────────────── Come si chiama un mestiere ─────────────────────

/**
 * Il ruolo come lo chiamano le persone, non come si chiama nell'enum.
 *
 * ⚠️ Esisteva in **sei** posti con cinque rese diverse: `Admin` / `Amministratore`
 * / `Amministratori` / `Titolari` / il valore grezzo. Uno dei sei elencava
 * ancora `owner` e `capo`, due ruoli dismessi da marzo che nessun account può
 * più assumere: a schermo comparivano gruppi vuoti con nomi che non
 * significano più niente.
 *
 * ⚠️ Non mostra MAI il valore grezzo per un ruolo che non conosce: un utente
 * non deve leggere `office` in una pagina.
 */
const ETICHETTE_RUOLO: Record<string, { singolare: string; plurale: string }> = {
  admin: { singolare: 'Amministratore', plurale: 'Amministratori' },
  office: { singolare: 'Ufficio', plurale: 'Ufficio' },
  tecnico: { singolare: 'Tecnico', plurale: 'Tecnici' },
  cliente: { singolare: 'Cliente', plurale: 'Clienti' },
};

/** Come si scrive un ruolo a schermo. `plurale` per i titoli di gruppo. */
export function etichettaRuolo(
  ruolo: unknown,
  forma: 'singolare' | 'plurale' = 'singolare',
): string {
  const e = typeof ruolo === 'string' ? ETICHETTE_RUOLO[ruolo] : undefined;
  if (!e) return forma === 'plurale' ? 'Altri' : 'Altro';
  return e[forma];
}

/** I ruoli vivi, in ordine di ampiezza. I dismessi (`owner`, `capo`) non ci sono. */
export const RUOLI_VIVI = ['admin', 'office', 'tecnico', 'cliente'] as const;

/**
 * **Entrare nell'applicazione come una persona di un cliente.**
 *
 * Serve all'assistenza: quando qualcuno segnala «non riesco a salvare le
 * note», il modo per capirlo è vedere la stessa schermata con i suoi poteri e
 * i suoi dati, non ricostruirla a mente.
 *
 * ## Perché è un posto condiviso e non tre pezzi nei pannelli
 *
 * ⭐ **I ruoli non sono una cosa del singolo cliente.** Sono un enum Postgres
 * (`app_role`) uguale per tutti: al 12/10/2026 Bertaiola ha 2 amministratori,
 * 4 dell'ufficio e 15 tecnici; FPM ne ha 1, 3 e 31. Stessa forma, numeri
 * diversi. Scrivere la scelta «per Bertaiola» vorrebbe dire inventare un caso
 * particolare dove non ce n'è nessuno — e il cliente dopo lo erediterebbe
 * sbagliato.
 *
 * Qui dentro sta quindi la parte che non dipende da nessun cliente: **chi si
 * può impersonare e chi no**, e **come si chiama a schermo** quello che stai
 * guardando. Dove si atterra invece dipende dal mondo del cliente, e lo decide
 * già il guscio (`casaPerRuolo` + i rimandi del middleware): non si duplica.
 *
 * ## La regola che vale per tutti
 *
 * ⚠️ **Lo stesso rifiuto da entrambi i lati.** `motivoNonImpersonabile` la
 * usano *sia* la tendina che propone le persone *sia* l'azione sul server che
 * esegue. Due regole separate vorrebbero dire una tendina che offre una voce e
 * un server che la rifiuta: l'utente legge un errore su una cosa che l'app gli
 * ha appena proposto.
 */

import { etichettaRuolo, RUOLI_VIVI } from './identita';
import type { OpzioneScelta } from './scelta-opzioni';

/** Una persona di un cliente, come serve a questa decisione. */
export interface PersonaImpersonabile {
  id: string;
  /** Il nome che si legge. Può mancare: gli account nati da invito. */
  nome: string | null;
  /** Con cosa accede: alias `<utente>@<sigla>.kommessa.local` o email vera. */
  login: string | null;
  /** Valore di `users.role`. */
  ruolo: string;
  attivo: boolean;
  /** `users.is_platform_admin`: un super admin non si impersona. */
  piattaforma?: boolean;
}

/** Come si chiama una persona quando il nome non c'è. */
export function nomeLeggibile(p: Pick<PersonaImpersonabile, 'nome' | 'login'>): string {
  const nome = (p.nome ?? '').trim();
  if (nome.length > 0) return nome;
  const login = (p.login ?? '').trim();
  if (login.length > 0) return login.split('@')[0] ?? login;
  return 'Senza nome';
}

/**
 * Perché **non** si può entrare come questa persona, oppure `null` se si può.
 *
 * ⚠️ Il messaggio lo legge un umano: dice cosa c'è che non va, non quale
 * campo l'ha fatto scattare.
 */
export function motivoNonImpersonabile(
  p: PersonaImpersonabile,
  /** Chi sta chiedendo, per non farlo entrare in se stesso. */
  attoreUserId?: string | null,
): string | null {
  if (!p.attivo) return 'Account disattivato';
  if (p.piattaforma === true) return 'È un super admin: non si impersona';
  if (attoreUserId && p.id === attoreUserId) return 'Sei già tu';
  // ⚠️ `cliente` è chiuso dal 16/09: il portale è spento per tutti i clienti e
  // nessuna policy dello staff lo ammette. Entrarci darebbe una schermata
  // vuota e farebbe credere a un guasto.
  if (p.ruolo === 'cliente') return 'Il portale clienti è spento';
  // `owner` e `capo` sono valori dormienti dell'enum, morti da marzo: nessun
  // account li ha più, ma se ne ricomparisse uno non è un ruolo con una casa.
  if (!RUOLI_VIVI.includes(p.ruolo as (typeof RUOLI_VIVI)[number])) {
    return 'Ruolo non più in uso';
  }
  return null;
}

/** L'ordine dei gruppi: dal più ampio al più ristretto, come `RUOLI_VIVI`. */
function pesoRuolo(ruolo: string): number {
  const i = RUOLI_VIVI.indexOf(ruolo as (typeof RUOLI_VIVI)[number]);
  return i === -1 ? RUOLI_VIVI.length : i;
}

/**
 * Le voci della tendina «entra come», raggruppate per mestiere.
 *
 * ⚠️ **Chi non si può impersonare resta nell'elenco, spento e col motivo.**
 * Toglierlo farebbe cercare a vuoto una persona che nell'elenco utenti si
 * vede: «non c'è» e «non si può» sono due risposte diverse, e la seconda è
 * quella vera.
 *
 * ⭐ Il nome utente va in `cerca` e non solo in `dettaglio`: su FPM i tecnici
 * sono trentuno, e chi fa assistenza ha in mano il nome con cui la persona
 * accede, non come l'abbiamo scritta in anagrafica.
 */
export function opzioniImpersonazione(
  persone: readonly PersonaImpersonabile[],
  attoreUserId?: string | null,
): OpzioneScelta[] {
  return [...persone]
    .sort((a, b) => {
      const dp = pesoRuolo(a.ruolo) - pesoRuolo(b.ruolo);
      if (dp !== 0) return dp;
      return nomeLeggibile(a).localeCompare(nomeLeggibile(b), 'it');
    })
    .map((p) => {
      const motivo = motivoNonImpersonabile(p, attoreUserId);
      return {
        valore: p.id,
        etichetta: nomeLeggibile(p),
        dettaglio: motivo
          ? `${etichettaRuolo(p.ruolo)} · ${motivo}`
          : `${etichettaRuolo(p.ruolo)} · ${p.login ?? 'senza nome utente'}`,
        gruppo: etichettaRuolo(p.ruolo, 'plurale'),
        cerca: [p.login ?? '', p.ruolo].join(' '),
        ...(motivo ? { disabilitata: true as const } : {}),
      };
    });
}

/** Quante persone si possono davvero impersonare, per il caso vuoto. */
export function contaImpersonabili(
  persone: readonly PersonaImpersonabile[],
  attoreUserId?: string | null,
): number {
  return persone.filter((p) => motivoNonImpersonabile(p, attoreUserId) === null).length;
}

/**
 * La frase che dice **cosa stai guardando**: chi, con quale mestiere, di chi.
 *
 * ⭐ Il ruolo non è un dettaglio decorativo: sapere di essere «Erica
 * Zantedeschi» senza sapere che è *ufficio* non dice se quello che vedi è
 * quello che vede un tecnico. Ed è l'unica frase: la legge la barra in cima
 * all'app e la legge la pagina di rientro, così non divergono.
 */
export function etichettaImpersonazione(dati: {
  nome?: string | null;
  login?: string | null;
  ruolo?: string | null;
  cliente?: string | null;
}): string {
  const chi = nomeLeggibile({ nome: dati.nome ?? null, login: dati.login ?? null });
  const pezzi = [chi];
  if (dati.ruolo) pezzi.push(etichettaRuolo(dati.ruolo).toLowerCase());
  if (dati.cliente) pezzi.push(dati.cliente);
  return pezzi.join(' · ');
}

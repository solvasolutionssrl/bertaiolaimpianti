import 'server-only';

import { waitUntil } from '@vercel/functions';

import { createServiceSupabase } from '@kommessa/api/service';
import { avvisoAmmesso, pushAttiva } from '@kommessa/api/avvisi';

import { inviaPushAUtente } from '@/lib/push';

/**
 * **Mandare un avviso. Un posto solo, in app e sul telefono.**
 *
 * ## Com'era
 *
 * Otto punti del codice inserivano a mano una riga in `notifiche`; quattro di
 * questi chiamavano anche `inviaPushAUtente`, ognuno con la sua forma. E
 * **nessuno di loro guardava le preferenze della persona**: l'unico posto che
 * le consultava era `/api/push/send-internal`, una rotta senza chiamanti. Era
 * la premessa esatta perché il pannello delle notifiche tornasse a essere un
 * pannello che promette e non fa niente: le caselle a schermo, e gli avvisi
 * che partono comunque.
 *
 * Quindi: le preferenze si leggono **qui**, nel mittente. La pagina le scrive,
 * questa funzione le rispetta, e non c'è nessun percorso che le scavalchi.
 *
 * ## Tre decisioni
 *
 * **L'avviso in app è il registro, e si scrive sempre** (per chi lo può
 * ricevere). La preferenza governa la notifica sul *telefono*, che è quella
 * che interrompe; l'elenco nella campanella resta completo, altrimenti
 * spegnere una push cancellerebbe anche la traccia di cosa è successo.
 *
 * **Chi non lo può ricevere non lo riceve affatto**, nemmeno in app: se il
 * mestiere non prevede quell'avviso, una riga nella campanella sarebbe solo
 * una cosa in più da scorrere. La regola sta in `@kommessa/api/avvisi`.
 *
 * **⚠️ Il `waitUntil` sta qui dentro, non nei chiamanti.** Senza, su Vercel la
 * funzione si chiude appena risponde e la push si perde a metà. Tre chiamanti
 * su quattro se lo ricordavano e uno no — `pianificazione.ts` mandava le push
 * della settimana con un `await` secco, cioè a volte le mandava e a volte no,
 * senza che si vedesse niente. Una cosa che va ricordata a ogni chiamata prima
 * o poi si dimentica: la si mette dove si decide.
 */

export interface Avviso {
  /** Chi riceve. */
  userId: string;
  /** Il codice dell'avviso: deve esistere in `@kommessa/api/avvisi`. */
  codice: string;
  /** Cosa è successo: compare come titolo, anche sulla schermata bloccata. */
  titolo: string;
  /** Di cosa si tratta. */
  corpo: string;
  /** Dove portare chi tocca la notifica sul telefono. */
  url?: string | null;
  /** Campi in più nel payload, per i collegamenti già in uso nella PWA. */
  extra?: Record<string, unknown>;
}

export interface EsitoAvvisi {
  /** Quanti hanno avuto la riga in app. */
  registrati: number;
  /** Quanti erano fuori dal loro mestiere e sono stati saltati. */
  saltati: number;
}

/**
 * Manda uno o più avvisi.
 *
 * Una lista e non una chiamata per destinatario: la pianificazione avvisa
 * tutta la squadra in un colpo, e trenta letture del ruolo più trenta insert
 * sono trenta giri di rete per una cosa che è una.
 */
export async function avvisa(avvisi: Avviso[]): Promise<EsitoAvvisi> {
  if (avvisi.length === 0) return { registrati: 0, saltati: 0 };

  let service: ReturnType<typeof createServiceSupabase>;
  try {
    service = createServiceSupabase();
  } catch (e) {
    console.error('[avvisa] configurazione incompleta, nessun avviso mandato:', e);
    return { registrati: 0, saltati: avvisi.length };
  }

  const utenti = [...new Set(avvisi.map((a) => a.userId))];
  const codici = [...new Set(avvisi.map((a) => a.codice))];

  // Il mestiere di chi riceve, e cosa ha scelto. Due letture per tutti, non
  // due per ciascuno.
  const [ruoliRes, prefRes] = await Promise.all([
    service.from('users').select('id, tenant_id, role, attivo').in('id', utenti),
    service
      .from('notification_preferences' as never)
      .select('user_id, event_code, push')
      .in('user_id', utenti)
      .in('event_code', codici),
  ]);

  const anagrafica = new Map<string, { tenantId: string; ruolo: string; attivo: boolean }>();
  for (const u of (ruoliRes.data ?? []) as Array<{
    id: string;
    tenant_id: string;
    role: string;
    attivo: boolean | null;
  }>) {
    anagrafica.set(u.id, { tenantId: u.tenant_id, ruolo: u.role, attivo: u.attivo !== false });
  }

  const scelte = new Map<string, boolean | null>();
  for (const p of (prefRes.data ?? []) as Array<{
    user_id: string;
    event_code: string;
    push: boolean | null;
  }>) {
    scelte.set(`${p.user_id}:${p.event_code}`, p.push);
  }

  const righe: Array<Record<string, unknown>> = [];
  const push: Array<{ userId: string; titolo: string; corpo: string; url?: string | null }> = [];
  let saltati = 0;

  for (const a of avvisi) {
    const chi = anagrafica.get(a.userId);
    // Un account che non c'è più o chiuso non riceve niente: la riga
    // resterebbe in una campanella che nessuno apre.
    if (!chi || !chi.attivo || !avvisoAmmesso(a.codice, chi.ruolo)) {
      saltati += 1;
      continue;
    }

    // ⚠️ Il tenant lo dice la riga dell'utente, non il chiamante: così un
    // avviso non può finire nello spazio di lavoro sbagliato per un parametro
    // passato male.
    righe.push({
      tenant_id: chi.tenantId,
      user_id: a.userId,
      type: a.codice,
      payload: {
        title: a.titolo,
        body: a.corpo,
        ...(a.url ? { url: a.url } : {}),
        ...(a.extra ?? {}),
      },
    });

    if (pushAttiva(a.codice, chi.ruolo, scelte.get(`${a.userId}:${a.codice}`))) {
      push.push({ userId: a.userId, titolo: a.titolo, corpo: a.corpo, url: a.url });
    }
  }

  if (righe.length === 0) return { registrati: 0, saltati };

  // L'avviso in app si aspetta: è il registro di cosa è successo, e se non
  // entra bisogna saperlo.
  const { error } = await service.from('notifiche').insert(righe as never);
  if (error) {
    console.error(`[avvisa] ${righe.length} avvisi NON registrati: ${error.message}`);
    return { registrati: 0, saltati };
  }

  // La notifica sul telefono no: è un extra, e non vale il fallimento
  // dell'azione che l'ha scatenata. Ma deve sopravvivere alla risposta.
  if (push.length > 0) {
    waitUntil(
      Promise.all(
        push.map((p) =>
          inviaPushAUtente(service as never, p.userId, {
            title: p.titolo,
            body: p.corpo,
            ...(p.url ? { url: p.url } : {}),
          }).catch((e: unknown) =>
            console.error(
              `[avvisa] push non consegnata a ${p.userId}: ${e instanceof Error ? e.message : 'errore sconosciuto'}`,
            ),
          ),
        ),
      ),
    );
  }

  return { registrati: righe.length, saltati };
}

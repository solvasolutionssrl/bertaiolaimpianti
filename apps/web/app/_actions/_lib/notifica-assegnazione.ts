import 'server-only';

import { createServiceSupabase } from '@kommessa/api/service';

/**
 * Avvisa chi si è appena preso un task o una richiesta.
 *
 * Fino al 05/10/2026 assegnare un task scriveva **solo** su `audit_events`:
 * l'interessato non riceveva niente e lo scopriva solo se gli veniva in mente
 * di aprire la lista. Un post-it digitale che non avvisa nessuno è ancora un
 * post-it, e il senso della funzione era proprio togliere il passaggio a mano.
 *
 * Service role perché la RLS di `notifiche` è self-only (ognuno vede le sue):
 * è il pattern di casa, vedi `office/_actions/bulk.ts`. Best-effort: se la
 * notifica non parte, l'assegnazione resta valida — ma l'errore si vede nei
 * log invece di sparire.
 *
 * Non si avvisa chi assegna a se stesso: lo sa già.
 */
export async function notificaAssegnazione(opts: {
  tenantId: string;
  /** Chi riceve. */
  userId: string;
  /** Chi ha assegnato: se è la stessa persona non si manda niente. */
  attoreUserId: string;
  todoId: string;
  titolo: string;
  /** Null = è una richiesta, non ancora agganciata a una commessa. */
  commessaId: string | null;
}): Promise<void> {
  if (opts.userId === opts.attoreUserId) return;
  const eRichiesta = opts.commessaId === null;
  try {
    const service = createServiceSupabase();
    const { error } = await service.from('notifiche').insert({
      tenant_id: opts.tenantId,
      user_id: opts.userId,
      type: 'todo_assegnato',
      payload: {
        title: eRichiesta
          ? `Richiesta da gestire: ${opts.titolo}`
          : `Ti è stato assegnato: ${opts.titolo}`,
        todo_id: opts.todoId,
        // Solo se c'è: il renderer della PWA ricava il link da questo campo, e
        // una richiesta non ha una commessa da aprire.
        ...(opts.commessaId ? { commessa_id: opts.commessaId } : {}),
        e_richiesta: eRichiesta,
        actor_user_id: opts.attoreUserId,
      } as unknown as never,
    } as never);
    if (error) {
      console.error(
        `[notificaAssegnazione] notifica NON inviata a ${opts.userId}: ${error.message}`,
      );
    }
  } catch (e) {
    console.error(
      `[notificaAssegnazione] notifica NON inviata a ${opts.userId}: ${e instanceof Error ? e.message : 'errore sconosciuto'}`,
    );
  }
}

import 'server-only';

import type { createServiceSupabase } from '@kommessa/api/service';
import { romeDay } from '@kommessa/api/rome-time';

import { avvisa, type Avviso } from '@/app/_actions/_lib/avvisa';

import { chiaveGiornata, leggiGiornateTimbro } from './giornate';

/**
 * **Il promemoria che parte quando la persona dice «fine giornata».**
 *
 * Fino al 26/10/2026 l'unico promemoria «ora dicci su quali commesse hai
 * lavorato» era quello della sera (`/api/cron/promemoria-ore`, 18:00 per FPM) e
 * il sollecito a mano dell'ufficio. Da quando il terminale chiede la fase
 * (`Logiche_Integrazione_Timbro.md` §10) c'e' un momento migliore: quello in
 * cui la persona **dichiara** di aver finito. Arriva entro il giro di import —
 * due minuti dal cron, qualche secondo col webhook — cioe' mentre e' ancora
 * davanti al terminale col telefono in mano.
 *
 * ⭐ **Non e' un avviso nuovo**: riusa `ore_da_inserire`, lo stesso interruttore
 * che la persona ha nel profilo. La domanda («vuoi che ti ricordi le ore?») e'
 * una, e un interruttore in piu' l'avrebbe spezzata in due.
 *
 * ⚠️ **La finestra e' `fine_turno`.** Il promemoria della sera salta chi ha
 * ricevuto `utente|giorno|finestra` nelle ultime 20 ore: con una finestra sua,
 * questo non spegne ne' il sollecito dell'ufficio ne' il giro della mattina —
 * che resta la seconda occasione vera, il giorno dopo. Chi lo riceve qui, la
 * sera non lo risente: lo salta `promemoria-ore` guardando questa finestra.
 *
 * ⚠️ **Solo la giornata di OGGI.** Un terminale rimasto senza rete riversa i
 * passaggi anche giorni dopo: avvisare alle 23 di una fine giornata di
 * mercoledi' sarebbe una notifica che non si puo' piu' capire. Ai giorni
 * passati pensa la finestra della mattina.
 *
 * ⚠️ **Solo se la giornata ha davvero bisogno delle ore**: `da_ripartire` o
 * `da_chiudere`, lo stesso predicato dei tre consumatori di
 * `leggiGiornateTimbro`, cosi' «da fare» vuol dire la stessa cosa in tutti.
 */

type Supa = ReturnType<typeof createServiceSupabase>;

/** La finestra del promemoria: la sua ragione sta nel commento sopra. */
export const FINESTRA_FINE_TURNO = 'fine_turno';

export interface FineDichiarata {
  dipendenteId: string;
  /** L'istante del passaggio, ISO. */
  ts: string;
}

const ORA_ROMA = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'Europe/Rome',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export async function avvisaFineGiornata(
  service: Supa,
  tenantId: string,
  fini: readonly FineDichiarata[],
): Promise<number> {
  if (fini.length === 0) return 0;
  const adesso = new Date();
  const oggi = romeDay(adesso);

  // Una sola per persona, la piu' recente: un lotto puo' contenere la stessa
  // fine riletta (il minuto di margine) o una correzione.
  const ultima = new Map<string, FineDichiarata>();
  for (const f of fini) {
    if (romeDay(new Date(f.ts)) !== oggi) continue;
    const p = ultima.get(f.dipendenteId);
    if (!p || f.ts > p.ts) ultima.set(f.dipendenteId, f);
  }
  if (ultima.size === 0) return 0;

  const { data: dipRaw } = await service
    .from('dipendenti' as never)
    .select('id, user_id')
    .eq('tenant_id', tenantId)
    .in('id', [...ultima.keys()]);
  const utenteDi = new Map(
    ((dipRaw ?? []) as { id: string; user_id: string | null }[])
      .filter((d) => d.user_id)
      .map((d) => [d.id, d.user_id!]),
  );
  if (utenteDi.size === 0) return 0;

  const giornate = await leggiGiornateTimbro(service, tenantId, { dalGiorno: oggi, alGiorno: oggi });

  // Chi l'ha gia' ricevuto per oggi in questa finestra: il webhook e il cron
  // rileggono lo stesso passaggio, e un `punch.updated` lo ripresenta.
  const da20h = new Date(adesso.getTime() - 20 * 3_600_000).toISOString();
  const { data: giaRaw } = await service
    .from('notifiche')
    .select('user_id, payload')
    .eq('tenant_id', tenantId)
    .eq('type', 'ore_da_inserire')
    .gte('created_at', da20h);
  const gia = new Set(
    ((giaRaw ?? []) as { user_id: string; payload: { giorno?: string; finestra?: string } | null }[])
      .filter((n) => n.payload?.finestra === FINESTRA_FINE_TURNO && n.payload?.giorno === oggi)
      .map((n) => n.user_id),
  );

  const avvisi: Avviso[] = [];
  for (const [dipendenteId, f] of ultima) {
    const userId = utenteDi.get(dipendenteId);
    if (!userId || gia.has(userId)) continue;
    const g = giornate.get(chiaveGiornata(dipendenteId, oggi));
    if (!g || (g.stato !== 'da_ripartire' && g.stato !== 'da_chiudere')) continue;
    avvisi.push({
      userId,
      codice: 'ore_da_inserire',
      // Registro formale e oggettivo: il fatto misurato, e l'azione richiesta.
      titolo: 'Fine giornata registrata',
      corpo: `Fine giornata registrata alle ${ORA_ROMA.format(new Date(f.ts))}. Indicare su quali commesse è stato svolto il lavoro di oggi.`,
      url: '/mobile/kantiere/ore',
      extra: { giorno: oggi, finestra: FINESTRA_FINE_TURNO },
    });
  }
  if (avvisi.length === 0) return 0;
  const esito = await avvisa(avvisi);
  return esito.registrati;
}

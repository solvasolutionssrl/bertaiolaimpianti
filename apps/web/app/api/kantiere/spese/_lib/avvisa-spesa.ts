import 'server-only';

import type { createServiceSupabase } from '@kommessa/api/service';

import { avvisa } from '@/app/_actions/_lib/avvisa';

/**
 * **Quando la lettura dello scontrino non riesce, lo si dice alla persona.**
 *
 * Prima succedeva in silenzio: la spesa restava in `bozza` con un codice in
 * `analisi_errore` che nessuno andava a leggere, e il tecnico se ne accorgeva
 * solo riaprendo l'elenco delle spese — o non se ne accorgeva affatto, e la
 * spesa arrivava a fine mese senza importo. Nei casi `ai_non_disponibile` si
 * avvisava **il super admin**, cioè chi può riparare il servizio ma non chi
 * deve rimettere i dati.
 *
 * ⚠️ **Un avviso solo per tutte le cause**, con il corpo che dice quale: la
 * domanda per chi lo riceve è sempre la stessa — «questa spesa aspetta te» — e
 * tre interruttori per tre modi di fallire sarebbero tre modi di spegnere la
 * stessa cosa.
 *
 * ⚠️ **Una volta sola per spesa.** «Rianalizza» rifà il giro, e chi l'ha
 * premuto sta guardando lo schermo: un secondo avviso identico sarebbe rumore.
 * Il controllo guarda `payload.spesaId` fra le notifiche di quella persona.
 */

type Supa = ReturnType<typeof createServiceSupabase>;

export type CausaSpesa = 'ai_non_disponibile' | 'illeggibile' | 'non_estratto' | 'foto_assente';

const CORPO: Record<CausaSpesa, string> = {
  ai_non_disponibile:
    'La lettura automatica non era disponibile. Aprire la spesa e completare i dati a mano.',
  illeggibile:
    'Non è stato possibile leggere tutti i dati dello scontrino. Aprire la spesa e completarli a mano.',
  non_estratto:
    'Non è stato possibile leggere tutti i dati dello scontrino. Aprire la spesa e completarli a mano.',
  foto_assente: 'La foto dello scontrino non è arrivata. Aprire la spesa e allegarla di nuovo.',
};

export async function avvisaSpesaDaCompletare(
  service: Supa,
  opts: { tenantId: string; spesaId: string; causa: CausaSpesa },
): Promise<void> {
  try {
    const { data: row } = await service
      .from('spese' as never)
      .select('dipendente_id')
      .eq('id', opts.spesaId)
      .eq('tenant_id', opts.tenantId)
      .maybeSingle();
    const dipendenteId = (row as { dipendente_id: string | null } | null)?.dipendente_id ?? null;
    if (!dipendenteId) return; // spesa inserita dall'ufficio: non c'è una persona da avvisare

    const { data: dip } = await service
      .from('dipendenti' as never)
      .select('user_id')
      .eq('id', dipendenteId)
      .maybeSingle();
    const userId = (dip as { user_id: string | null } | null)?.user_id ?? null;
    if (!userId) return; // senza accesso all'app non può ricevere niente

    const { data: gia } = await service
      .from('notifiche')
      .select('id, payload')
      .eq('tenant_id', opts.tenantId)
      .eq('user_id', userId)
      .eq('type', 'spesa_da_completare')
      .gte('created_at', new Date(Date.now() - 30 * 86_400_000).toISOString());
    const giaMandato = ((gia ?? []) as { payload: { spesaId?: string } | null }[]).some(
      (n) => n.payload?.spesaId === opts.spesaId,
    );
    if (giaMandato) return;

    await avvisa([
      {
        userId,
        codice: 'spesa_da_completare',
        // Registro formale e oggettivo: il fatto, e l'azione richiesta.
        titolo: 'Scontrino da completare',
        corpo: CORPO[opts.causa],
        url: '/mobile/kantiere/spese',
        extra: { spesaId: opts.spesaId, causa: opts.causa },
      },
    ]);
  } catch (e) {
    // ⚠️ Non può far cadere l'analisi: una notifica persa costa un giro in
    // più all'elenco spese, un'analisi caduta costa la spesa.
    console.error('[spese] avviso «da completare» fallito:', e instanceof Error ? e.message : e);
  }
}

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

import { createServerSupabase } from '@kommessa/api/server';
import { avvisiPerRuolo, pushAttiva } from '@kommessa/api/avvisi';

import { guardMobile } from '../../_lib/guard';
import { SuQuestoTelefono } from './_components/su-questo-telefono';
import { CosaFartiSapere } from './_components/cosa-farti-sapere';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Notifiche · Kommessa' };

/**
 * **Le notifiche: cosa arriva, e su quale telefono.**
 *
 * ## Perché questa pagina torna, e com'è diversa da quella di prima
 *
 * Il 07/10 è stata tolta dal profilo una matrice di ventuno caselle, con
 * questa nota: «governavano una strada che non corre… quando colleghiamo
 * l'invio, questo pannello torna con una riga». L'invio è collegato, e il
 * pannello torna — ma con tre differenze che sono tutto il punto:
 *
 *   1. **Mostra solo gli avvisi che qualcuno manda davvero.** L'elenco esce da
 *      `@kommessa/api/avvisi`, dove la regola per aggiungere una voce è che
 *      esista la riga di codice che la spedisce.
 *   2. **Mostra solo quelli previsti per questo mestiere.** Un tecnico non
 *      vede l'interruttore delle richieste di permesso da approvare, perché
 *      non le approva — e non le riceverebbe comunque.
 *   3. **Quello che si spegne, si spegne davvero**: il mittente unico
 *      (`avvisa()`) legge queste preferenze prima di mandare. Prima nessuno le
 *      leggeva, ed è il motivo per cui il pannello andava tolto.
 */
export default async function NotifichePage() {
  const ctx = await guardMobile();
  const supabase = createServerSupabase();

  const avvisi = avvisiPerRuolo(ctx.role);

  // Cosa ha scelto questa persona. Chi non ha mai toccato niente non ha
  // nessuna riga: vale il predefinito del mestiere, e lo decide il modulo
  // puro — non un `?? true` scritto qui, che sarebbe la seconda verità.
  const { data } = await supabase
    .from('notification_preferences' as never)
    .select('event_code, push')
    .eq('user_id', ctx.userId);

  const scelte = new Map<string, boolean | null>();
  for (const r of (data ?? []) as Array<{ event_code: string; push: boolean | null }>) {
    scelte.set(r.event_code, r.push);
  }

  const sceltiAttivi: Record<string, boolean> = {};
  for (const a of avvisi) {
    sceltiAttivi[a.codice] = pushAttiva(a.codice, ctx.role, scelte.get(a.codice));
  }

  return (
    <div className="animate-content-in flex min-h-[100dvh] flex-col gap-5 p-4 pb-24">
      <header className="flex items-center gap-2">
        <Link
          href="/mobile/profilo"
          aria-label="Torna al profilo"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground active:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">Notifiche</h1>
          <p className="text-xs text-muted-foreground">Cosa farti sapere, e su quale telefono.</p>
        </div>
      </header>

      <section className="space-y-2">
        <h2 className="px-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Su questo telefono
        </h2>
        <SuQuestoTelefono />
      </section>

      <section className="space-y-2">
        <h2 className="px-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Cosa farti sapere
        </h2>
        {avvisi.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground">
            Per il tuo profilo non è previsto nessun avviso.
          </p>
        ) : (
          <CosaFartiSapere avvisi={avvisi} sceltiAttivi={sceltiAttivi} />
        )}
      </section>
    </div>
  );
}

import 'server-only';
import { cache } from 'react';

import { createServerSupabase } from '@kommessa/api/server';
import { haCapacita, type Capacita } from '@kommessa/api/capacita';

import { getTenantContextCached } from './tenant-cache';

/**
 * Cosa può fare, in più del suo ruolo, la persona collegata adesso.
 *
 * Una lettura per richiesta (`cache()`), perché la stessa domanda la fanno il
 * guscio per decidere cosa mostrare e le azioni per decidere se accettare — e
 * le due risposte devono essere la stessa, altrimenti si mostra un tasto che
 * poi rifiuta.
 *
 * ⚠️ **In caso di guasto risponde NO.** Per i poteri l'errore va nel verso di
 * toglierli: una lettura che non riesce non deve regalare a nessuno il
 * permesso di aprire lavori. È l'opposto di `devoCambiarePassword`, che in caso
 * di guasto lascia passare — e la differenza è voluta: là il guasto
 * bloccherebbe tutti, qui aprirebbe una porta.
 */
export const mieiPoteri = cache(
  async (): Promise<{ role: string; permissions: unknown } | null> => {
    const ctx = await getTenantContextCached();
    if (!ctx) return null;
    try {
      const supabase = createServerSupabase();
      const { data, error } = await supabase
        .from('users')
        .select('role, permissions')
        .eq('id', ctx.userId)
        .maybeSingle();
      if (error || !data) {
        if (error) console.warn('[capacita] lettura non riuscita:', error.message);
        // Il ruolo dal JWT è comunque attendibile: un amministratore resta
        // amministratore anche se la riga non si legge.
        return { role: ctx.role, permissions: null };
      }
      const r = data as { role: string; permissions: unknown };
      return { role: r.role ?? ctx.role, permissions: r.permissions };
    } catch (e) {
      console.warn('[capacita] lettura non riuscita:', e);
      return { role: ctx.role, permissions: null };
    }
  },
);

/** «Posso fare questa cosa?» per la persona collegata adesso. */
export async function posso(capacita: Capacita): Promise<boolean> {
  const u = await mieiPoteri();
  if (!u) return false;
  return haCapacita(u, capacita);
}

/** Scorciatoia per il potere che conta oggi. */
export async function possoAprireLavori(): Promise<boolean> {
  return posso('capo_squadra');
}

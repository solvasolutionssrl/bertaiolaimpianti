import 'server-only';

import type { createServerSupabase } from '@kommessa/api/server';

type Supa = ReturnType<typeof createServerSupabase>;

/** La scheda dipendente di chi guarda: ogni pagina di `/office/mio` filtra per questa. */
export interface MioProfilo {
  dipendenteId: string;
  nome: string;
  cognome: string;
  modalita: 'ufficio' | 'esterno';
}

/**
 * «Il mio lavoro» da computer esiste solo per chi ha una scheda dipendente:
 * senza, non ci sono ore, cantieri in squadra o spese da mostrare. Le pagine
 * dicono il perche' invece di restare vuote.
 */
export async function mioDipendente(supabase: Supa, tenantId: string, userId: string): Promise<MioProfilo | null> {
  const { data } = await supabase
    .from('dipendenti' as never)
    .select('id, nome, cognome, modalita_lavoro')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();
  const d = data as { id: string; nome: string | null; cognome: string | null; modalita_lavoro: string | null } | null;
  if (!d) return null;
  return {
    dipendenteId: d.id,
    nome: d.nome ?? '',
    cognome: d.cognome ?? '',
    modalita: d.modalita_lavoro === 'ufficio' ? 'ufficio' : 'esterno',
  };
}

/** AAAA-MM-GG spostato di `n` giorni (UTC, va bene per date di calendario). */
export function spostaGiorno(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

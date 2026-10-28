import 'server-only';

import type { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { romeDay } from '@kommessa/api/rome-time';

/**
 * Cio' che serve a chi corregge la propria giornata dal telefono, in un posto
 * solo: la finestra dei giorni ammessi, il nome di chi corregge e l'avviso
 * all'ufficio. Lo usano «Modifica giornata» e la riallocazione (28/10/2026).
 * Sta qui e non nei file delle azioni perche' una funzione esportata da un
 * file `'use server'` diventa un indirizzo chiamabile dal browser.
 */

/** Oggi + i 3 giorni precedenti. */
export const FINESTRA_MODIFICA_GIORNI = 3;

/**
 * Giorni (YYYY-MM-DD) in cui il tecnico puo' ancora modificare la propria
 * giornata. Confini Europe/Rome, ancorati a mezzogiorno UTC del giorno
 * italiano corrente, cosi' lo scivolamento di data non capita a mezzanotte.
 */
export function giorniModificabiliTecnico(): string[] {
  const noon = Date.parse(`${romeDay(new Date())}T12:00:00Z`);
  const out: string[] = [];
  for (let i = 0; i <= FINESTRA_MODIFICA_GIORNI; i += 1) {
    out.push(new Date(noon - i * 86400000).toISOString().slice(0, 10));
  }
  return out;
}

export async function nomeDipendente(
  supabase: ReturnType<typeof createServerSupabase>,
  id: string,
): Promise<string | null> {
  const { data } = await supabase.from('dipendenti' as never).select('nome, cognome').eq('id', id).maybeSingle();
  const d = data as { nome: string; cognome: string } | null;
  return d ? `${d.nome} ${d.cognome}`.trim() : null;
}

/**
 * Avvisa l'ufficio (campanella) che un tecnico ha corretto le ore di una
 * giornata. Best-effort via service role: il tecnico non vede le notifiche altrui.
 */
export async function notificaModificaTecnicoOffice(
  tenantId: string,
  attoreUserId: string,
  info: { rapportinoId: string; dipendenteId: string; dipendenteNome: string; data: string },
): Promise<void> {
  try {
    const service = createServiceSupabase();
    const { data: destRaw } = await service
      .from('users')
      .select('id')
      .eq('tenant_id', tenantId)
      .in('role', ['admin', 'office'])
      .eq('attivo', true);
    const dest = ((destRaw as { id: string }[] | null) ?? []).filter((u) => u.id !== attoreUserId);
    if (dest.length === 0) return;

    const url = `/office/kantiere/rapportini?giorno=${info.data}`;
    const rows = dest.map((u) => ({
      tenant_id: tenantId,
      user_id: u.id,
      type: 'kantiere_modifica_tecnico',
      payload: {
        rapportinoId: info.rapportinoId,
        dipendenteId: info.dipendenteId,
        dipendenteNome: info.dipendenteNome,
        data: info.data,
        url,
      },
    }));
    await service.from('notifiche').insert(rows);
  } catch (e) {
    console.warn('[modifica giornata] notifica office fallita', e);
  }
}

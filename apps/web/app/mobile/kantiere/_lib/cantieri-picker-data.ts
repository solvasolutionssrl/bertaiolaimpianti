import 'server-only';

import { createServerSupabase } from '@kommessa/api/server';
import type { PickerCantiere } from '@/app/mobile/kantiere/_components/cantiere-picker';

/**
 * Elenco cantieri (attivi/sospesi) del tenant nel formato del picker riusabile
 * (`CantiereSearchList`): campi arricchiti per la ricerca a token
 * codice/cliente/nome/indirizzo. Usato dove serve SCEGLIERE un cantiere — qui
 * per la nuova spesa (cantiere prima della foto).
 */
export async function elencoCantieriPicker(tenantId: string): Promise<PickerCantiere[]> {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from('cantieri' as never)
    .select('id, codice, codice_commessa, nome, cliente_nome, indirizzo, categoria')
    .eq('tenant_id', tenantId)
    .in('stato', ['attivo', 'sospeso'])
    .order('nome', { ascending: true });
  return ((data as Array<{
    id: string;
    codice: string | null;
    codice_commessa: string | null;
    nome: string | null;
    cliente_nome: string | null;
    indirizzo: string | null;
    categoria: string | null;
  }>) ?? []).map((c) => ({
    id: c.id,
    codice: c.codice,
    codice_commessa: c.codice_commessa,
    nome: c.nome,
    cliente_nome: c.cliente_nome,
    indirizzo: c.indirizzo,
    categoria: c.categoria,
  }));
}

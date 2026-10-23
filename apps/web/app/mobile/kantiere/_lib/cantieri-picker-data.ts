import 'server-only';

import { createServerSupabase } from '@kommessa/api/server';
import { fasiScegibili } from '@kommessa/api/sottocantieri';
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
    .select('id, codice, codice_commessa, nome, cliente_nome, indirizzo, categoria, sottocantieri(id, nome, codice, descrizione, stato)')
    .eq('tenant_id', tenantId)
    .in('stato', ['attivo', 'sospeso'])
    .order('nome', { ascending: true });
  return conFasiScegibili((data as PickerCantiere[] | null) ?? []);
}

/**
 * Le fasi arrivano con l'embed del picker: si tengono solo quelle aperte, in
 * ordine di codice e nome, e il campo sparisce se non ce n'e' nessuna.
 */
export function conFasiScegibili(cantieri: PickerCantiere[]): PickerCantiere[] {
  return cantieri.map((c) => {
    const fasi = fasiScegibili(c.sottocantieri).sort((a, b) =>
      (a.codice ?? '').localeCompare(b.codice ?? '', 'it', { numeric: true }) || a.nome.localeCompare(b.nome, 'it'),
    );
    return { ...c, sottocantieri: fasi.length > 0 ? fasi : undefined };
  });
}

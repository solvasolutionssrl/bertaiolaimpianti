import { redirect, notFound } from 'next/navigation';

import { createServerSupabase } from '@kommessa/api/server';
import { guardMobile } from '../../../_lib/guard';
import { EditWizardMobile } from './_components/edit-wizard';
import type {
  CommessaEditorValue,
  ResponsabileOption,
} from '../../../../_components/commessa-editor/types';
import type {
  TipologiaVoce,
  TipologiaPreset,
} from '../../../../_components/aggiungi-tipologie-dialog';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Modifica commessa' };

export default async function ModificaCommessaMobilePage({
  params,
}: {
  params: { id: string };
}) {
  const ctx = await guardMobile();
  if (ctx.role !== 'admin' && ctx.role !== 'office') {
    redirect(`/mobile/commessa/${params.id}`);
  }

  const supabase = createServerSupabase();
  const { data: comRaw } = await supabase
    .from('commesse')
    .select(
      'id, codice_interno, nome_cartella, descrizione_ai_finale, cliente_indirizzo_cantiere, note_iniziali, is_critica, stato, responsabile_id, cliente:clienti(ragione_sociale)',
    )
    .eq('id', params.id)
    .maybeSingle();
  if (!comRaw) notFound();
  const com = comRaw as unknown as {
    id: string;
    codice_interno: string;
    nome_cartella: string;
    descrizione_ai_finale: string | null;
    cliente_indirizzo_cantiere: string | null;
    note_iniziali: string | null;
    is_critica: boolean | null;
    stato: string | null;
    responsabile_id: string | null;
    cliente: { ragione_sociale: string | null } | { ragione_sociale: string | null }[] | null;
  };
  const cliente = Array.isArray(com.cliente) ? com.cliente[0] : com.cliente;

  const [referentiRes, vociRes, catalogoRes, presetRes, utentiRes] =
    await Promise.all([
      supabase
        .from('contatto_cliente' as never)
        .select('nome, ruolo, telefono, email')
        .eq('commessa_id', params.id),
      supabase.from('commessa_voci').select('voce_id').eq('commessa_id', params.id),
      supabase
        .from('voci_catalogo')
        .select('id, nome, categoria')
        .order('ordine_visualizzazione'),
      supabase
        .from('preset')
        .select('id, nome, voci_default')
        .eq('tenant_id', ctx.tenantId)
        .order('nome'),
      supabase
        .from('users')
        .select('id, display_name, role')
        .eq('tenant_id', ctx.tenantId)
        .eq('attivo', true),
    ]);

  const referenti = ((referentiRes.data ?? []) as unknown as Array<{
    nome: string;
    ruolo: string | null;
    telefono: string | null;
    email: string | null;
  }>).map((r) => ({
    nome: r.nome ?? '',
    ruolo: r.ruolo ?? '',
    telefono: r.telefono ?? '',
    email: r.email ?? '',
  }));
  const vociPresenti = ((vociRes.data ?? []) as Array<{ voce_id: number }>).map(
    (v) => v.voce_id,
  );
  const voci: TipologiaVoce[] = ((catalogoRes.data ?? []) as Array<{
    id: number;
    nome: string;
    categoria: string | null;
  }>).map((v) => ({ id: v.id, nome: v.nome, categoria: v.categoria }));
  const presets: TipologiaPreset[] = ((presetRes.data ?? []) as Array<{
    id: string;
    nome: string;
    voci_default: unknown;
  }>).map((p) => ({
    id: p.id,
    nome: p.nome,
    vociIds: Array.isArray(p.voci_default) ? (p.voci_default as number[]) : [],
  }));
  const responsabili: ResponsabileOption[] = (
    (utentiRes.data ?? []) as Array<{ id: string; display_name: string | null; role: string }>
  )
    .filter((u) => u.role !== 'cliente')
    .map((u) => ({ id: u.id, display_name: u.display_name }));

  const initial: CommessaEditorValue = {
    descrizioneFinale: com.descrizione_ai_finale ?? '',
    indirizzoCantiere: com.cliente_indirizzo_cantiere ?? '',
    noteIniziali: com.note_iniziali ?? '',
    isCritica: Boolean(com.is_critica),
    stato: (com.stato as CommessaEditorValue['stato']) ?? 'aperta',
    responsabileId: com.responsabile_id ?? null,
    referenti,
  };

  return (
    <EditWizardMobile
      commessaId={params.id}
      codiceInterno={com.codice_interno}
      clienteNome={cliente?.ragione_sociale ?? null}
      nomeCartella={com.nome_cartella}
      initial={initial}
      responsabili={responsabili}
      vociPresenti={vociPresenti}
      voci={voci}
      presets={presets}
    />
  );
}

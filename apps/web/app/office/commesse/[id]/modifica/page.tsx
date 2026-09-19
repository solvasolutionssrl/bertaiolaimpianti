import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { redirect } from 'next/navigation';

import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';

import { loadCommessa } from '../_lib/get-commessa';
import { CommessaEditClient } from './_components/edit-client';
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

export default async function ModificaCommessaPage({
  params,
}: {
  params: { id: string };
}) {
  const ctx = await requireTenantContext();
  if (ctx.role !== 'admin' && ctx.role !== 'office') {
    redirect(`/office/commesse/${params.id}`);
  }

  const c = await loadCommessa(params.id);
  const cliente = Array.isArray(c.cliente) ? c.cliente[0] : c.cliente;
  const resp = Array.isArray(c.responsabile) ? c.responsabile[0] : c.responsabile;

  const supabase = createServerSupabase();
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
    descrizioneFinale: (c.descrizione_ai_finale as string | null) ?? '',
    indirizzoCantiere: (c.cliente_indirizzo_cantiere as string | null) ?? '',
    noteIniziali: (c.note_iniziali as string | null) ?? '',
    isCritica: Boolean(c.is_critica),
    stato: (c.stato as CommessaEditorValue['stato']) ?? 'aperta',
    responsabileId: (resp?.id as string | undefined) ?? null,
    referenti,
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 pb-10 pt-2 md:px-6">
      <Link
        href={`/office/commesse/${params.id}`}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        Torna alla commessa
      </Link>

      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
          {c.codice_interno}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Modifica commessa
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {cliente?.ragione_sociale ?? '—'}
        </p>
      </header>

      <CommessaEditClient
        commessaId={params.id}
        nomeCartella={(c.nome_cartella as string | null) ?? ''}
        initial={initial}
        responsabili={responsabili}
        vociPresenti={vociPresenti}
        voci={voci}
        presets={presets}
      />
    </div>
  );
}

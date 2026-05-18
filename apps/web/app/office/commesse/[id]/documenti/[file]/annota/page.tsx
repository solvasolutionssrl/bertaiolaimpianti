/**
 * Route standalone /office/commesse/[id]/documenti/[file]/annota
 *
 * Apre l'annotator PDF a tutto schermo a partire dal `file_ref_id`
 * passato come parametro di URL.
 *
 * Casi d'uso:
 *  - Deep link da email "questo PDF ha 5 nuove annotazioni"
 *  - Bookmarking di un PDF in editing
 *  - Apertura da app esterne (mobile share sheet → URL)
 *
 * Differenza dal dialog modale: la URL è bookmarkable, il browser back
 * funziona (back = lista documenti). Niente conferma close se non dirty.
 */

import { notFound, redirect } from 'next/navigation';

import { createServerSupabase } from '@impiantixplus/api/server';

import { PdfAnnotatorStandalone } from './client';

export const dynamic = 'force-dynamic';

export default async function AnnotaPdfPage({
  params,
}: {
  params: { id: string; file: string };
}) {
  // Validazione lato server: il file_ref deve esistere ed essere PDF della
  // stessa commessa (RLS filtra cross-tenant automaticamente).
  const supabase = createServerSupabase();
  const { data: fileRef } = await supabase
    .from('file_refs')
    .select('id, filename, mime, commessa_id')
    .eq('id', params.file)
    .single();

  if (!fileRef) notFound();
  if (fileRef.commessa_id !== params.id) {
    redirect(`/office/commesse/${fileRef.commessa_id}/documenti`);
  }
  if (!fileRef.mime?.toLowerCase().includes('pdf')) {
    redirect(`/office/commesse/${params.id}/documenti`);
  }

  return (
    <PdfAnnotatorStandalone
      commessaId={params.id}
      fileRefId={fileRef.id}
      filename={fileRef.filename}
    />
  );
}

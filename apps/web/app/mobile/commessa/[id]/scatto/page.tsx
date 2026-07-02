import { notFound } from 'next/navigation';
import { MobileBackButton } from '../../../_components/mobile-back-button';

import { createServerSupabase } from '@kommessa/api/server';

import { guardMobile } from '../../../_lib/guard';
import { ScattoForm, type VoceOption } from './scatto-form';

export const metadata = {
  title: 'Scatta foto',
};

/**
 * Schermata "scatto foto" (Mockup_UI §4).
 *
 *  - input file capture="environment" (apre camera nativa)
 *  - select fase (solo voci attive sulla commessa)
 *  - radio momento (Sopralluogo / In corso / Fine)
 *  - geo-tag automatico + timestamp
 *  - nota opzionale
 *  - upload via Server Action `uploadFotoFromForm`
 *  - durante upload, progress via `useFormStatus`
 *  - sotto: grid "Ultime caricate oggi" (max 8)
 */
export default async function ScattoPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { voce?: string };
}) {
  await guardMobile();
  const supabase = createServerSupabase();

  const { data: commessa } = await supabase
    .from('commesse')
    .select(
      `
        id, codice_interno, nome_cartella,
        cliente:clienti ( ragione_sociale ),
        voci:commessa_voci (
          voce_id, stato,
          voce:voci_catalogo ( nome )
        )
      `,
    )
    .eq('id', params.id)
    .single();

  if (!commessa) notFound();

  const cliente = Array.isArray(commessa.cliente)
    ? (commessa.cliente[0] ?? null)
    : commessa.cliente;

  const voci: VoceOption[] = (commessa.voci ?? [])
    .filter((v) => v.stato !== 'completata' && v.stato !== 'bloccata')
    .map((v) => ({
      id: v.voce_id,
      nome: (Array.isArray(v.voce) ? v.voce[0]?.nome : v.voce?.nome) ?? `Voce #${v.voce_id}`,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));

  const preselectedVoceId = searchParams?.voce ? Number(searchParams.voce) : null;

  return (
    <div className="flex min-h-[100dvh] flex-col gap-4 p-4">
      <MobileBackButton href={`/mobile/commessa/${params.id}`} />

      <header>
        <p className="font-mono text-sm text-muted-foreground">
          {commessa.codice_interno}
        </p>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight">
          {cliente?.ragione_sociale ?? '—'}
        </h1>
      </header>

      <ScattoForm
        commessaId={params.id}
        voci={voci}
        preselectedVoceId={preselectedVoceId}
      />
    </div>
  );
}

import type { Metadata } from 'next';

import { createServerSupabase } from '@impiantixplus/api/server';

import { guardMobile } from '../_lib/guard';
import { VoiceIntakeFlow, type VoceOption } from './_components/voice-intake-flow';

export const metadata: Metadata = {
  title: 'Dettato vocale',
  other: {
    // Disabilita pinch-zoom sulla pagina voice per evitare zoom accidentali
    // durante la registrazione (mani sporche). Il root layout ha già i meta
    // apple-mobile-web-app-*; qui aggiungiamo viewport stretto.
    viewport:
      'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover',
  },
};

/**
 * Voice intake: flow rapido "dettato → review → crea commessa", pensato
 * per il capo in cantiere. State machine a 3 schermi gestita lato client
 * dal componente `VoiceIntakeFlow`.
 *
 * Server-side qui carichiamo solo il catalogo voci (servirà al review per
 * mostrare il nome leggibile delle voci_ids estratte dall'AI) e i preset
 * eventuali (al momento non usati, ma pronti).
 */
export default async function VoiceIntakePage() {
  await guardMobile();
  const supabase = createServerSupabase();

  const { data: vociRaw } = await supabase
    .from('voci_catalogo')
    .select('id, nome, default')
    .order('ordine_visualizzazione');

  const voci: VoceOption[] = (vociRaw ?? []).map((v: any) => ({
    id: v.id as number,
    nome: v.nome as string,
    default: Boolean(v.default),
  }));

  const vociDefault = voci.filter((v) => v.default).map((v) => v.id);

  return (
    <div className="bg-aurora-brand min-h-[100dvh]">
      <div className="bg-grid-radial">
        <VoiceIntakeFlow voci={voci} vociDefault={vociDefault} />
      </div>
    </div>
  );
}

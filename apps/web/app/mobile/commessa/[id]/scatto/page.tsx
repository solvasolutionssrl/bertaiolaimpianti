import { notFound } from 'next/navigation';
import { MobileBackButton } from '../../../_components/mobile-back-button';

import { createServerSupabase } from '@kommessa/api/server';

import { guardMobile } from '../../../_lib/guard';
import { ScattoForm } from './scatto-form';

/**
 * Dati dell'utente, quindi sempre freschi. Next lo dedurrebbe comunque dalla
 * lettura dei cookie, ma dichiararlo rende la regola la stessa su tutte le
 * rotte dell'app invece di dipendere da cosa capita di leggere.
 */
export const dynamic = 'force-dynamic';


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
 *  - upload con il motore unico dei caricamenti (`/api/upload/media`)
 *  - durante upload, progress via `useFormStatus`
 *  - sotto: grid "Ultime caricate oggi" (max 8)
 */
export default async function ScattoPage({
  params,
}: {
  params: { id: string };
}) {
  await guardMobile();
  const supabase = createServerSupabase();

  const { data: commessa } = await supabase
    .from('commesse')
    .select(
      `
        id, codice_interno, nome_cartella, stato,
        cliente:clienti ( ragione_sociale )
      `,
    )
    .eq('id', params.id)
    .single();

  if (!commessa) notFound();

  // Serve al modulo: se la commessa e' chiusa si carica lo stesso, ma prima
  // di far partire i file si chiede conferma.
  const statoCommessa = (commessa as { stato?: string | null }).stato;

  const cliente = Array.isArray(commessa.cliente)
    ? (commessa.cliente[0] ?? null)
    : commessa.cliente;

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
        statoCommessa={statoCommessa}
        nomeCommessa={commessa.codice_interno}
      />
    </div>
  );
}

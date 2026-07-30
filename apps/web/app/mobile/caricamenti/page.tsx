import type { Metadata } from 'next';
import { UploadCloud } from 'lucide-react';

import { guardMobile } from '../_lib/guard';
import { MobileBackButton } from '../_components/mobile-back-button';
import { CaricamentiList } from './_components/caricamenti-list';

export const metadata: Metadata = { title: 'Caricamenti' };
export const dynamic = 'force-dynamic';

/**
 * /mobile/caricamenti — stato di TUTTI i file in salita.
 *
 * Il pannello fluttuante mostra solo l'essenziale e sparisce quando ha finito.
 * Qui invece si vede tutto, anche a freddo: quello che è rimasto indietro da
 * una sessione precedente (ambra), quello che è fallito e va ritentato (rosso)
 * e quello appena concluso (verde). È il posto dove tornare quando ci si
 * chiede "ma le foto di ieri sono salite?".
 */
export default async function CaricamentiPage() {
  await guardMobile();

  return (
    <div className="animate-content-in flex min-h-[100dvh] flex-col gap-4 p-4">
      <header className="pt-2">
        <MobileBackButton tone="light" label="Indietro" />
        <p className="mt-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />
          Caricamenti
        </p>
        <h1 className="mt-1 text-xl font-semibold leading-tight">
          Foto e video in salita
        </h1>
      </header>

      <CaricamentiList />
    </div>
  );
}

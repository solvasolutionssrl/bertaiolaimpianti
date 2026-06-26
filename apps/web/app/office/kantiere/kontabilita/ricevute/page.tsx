import { redirect } from 'next/navigation';
import { tenantHasModule } from '@/app/_lib/modules';
import { SubNav } from '../_components/sub-nav';
import { BrowserClient } from './_components/browser-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Kantiere · Ricevute' };

/**
 * Browser dei file ricevuta archiviati su cloud (R2). Naviga anno → mese → file;
 * ogni file è arricchito coi dati della spesa collegata. Tutto il lavoro pesante
 * (listing R2 + arricchimento) lo fa l'endpoint /api/kantiere/spese/browse, qui
 * rendiamo solo il chrome e il client che fa fetch dalla radice.
 */
export default async function RicevutePage() {
  if (!(await tenantHasModule('kantiere'))) redirect('/office');

  return (
    <div className="w-full space-y-5">
      <header>
        <h1 className="text-lg font-semibold">Ricevute</h1>
        <p className="text-sm text-muted-foreground">Archivio file su cloud</p>
      </header>

      <SubNav />

      <BrowserClient />
    </div>
  );
}

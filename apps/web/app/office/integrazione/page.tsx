import { notFound } from 'next/navigation';
import { Link2 } from 'lucide-react';

import { tenantHasModule } from '../../_lib/modules';
import { caricaCollegamenti } from '../../_actions/integrazione-collegamenti';
import { SectionHeader } from '../../_components/section-header';
import { CollegamentiClient } from './_components/collegamenti-client';

export const metadata = { title: 'Collegamento anagrafiche' };
export const dynamic = 'force-dynamic';

/**
 * /office/integrazione — collegamento delle anagrafiche col gestionale.
 *
 * E' il passo che sblocca tutto: finche' non e' fatto, ogni ora e ogni spesa
 * si ferma con "anagrafica non collegata".
 */
export default async function IntegrazionePage() {
  // Chi non ha un gestionale collegato non deve nemmeno vedere la pagina.
  if (!(await tenantHasModule('integrazione'))) notFound();

  const dati = await caricaCollegamenti();

  return (
    <div className="space-y-5">
      <SectionHeader
        eyebrow="Gestionale"
        title="Collegamento anagrafiche"
        description="Abbina i tuoi cantieri a quelli del gestionale. Finché un cantiere non è collegato, le sue ore e le sue spese non vengono inviate."
        icon={<Link2 className="h-4 w-4" aria-hidden="true" />}
      />
      <CollegamentiClient dati={dati} />
    </div>
  );
}

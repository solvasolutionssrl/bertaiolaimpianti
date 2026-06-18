import { LavoriSection } from '../_components/lavori-section';

export const dynamic = 'force-dynamic';

/**
 * Route legacy /lavori — il contenuto è ora integrato nella tab Commessa.
 * Resta come wrapper per back-compat dei deep link esistenti.
 */
export default async function LavoriTab({ params }: { params: { id: string } }) {
  return <LavoriSection id={params.id} />;
}

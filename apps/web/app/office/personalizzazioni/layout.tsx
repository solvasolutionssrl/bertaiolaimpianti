import { redirect } from 'next/navigation';
import { requireTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '../../_lib/modules';

/**
 * Area "Personalizzazioni": il contenitore delle funzioni costruite su misura
 * per un cliente. Qui si chiude solo la porta dell'area; quale funzione sia
 * accesa lo controlla la sua pagina, perche' l'area puo' averne piu' di una.
 * La sidebar nasconde, non protegge: il controllo va fatto anche qui. Solo
 * admin e ufficio, dentro ci sono i dati di tutti.
 */
export default async function PersonalizzazioniLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireTenantContext();
  // Gli stessi ruoli delle azioni e del download: un gate incoerente e' un gate
  // che prima o poi si aggira.
  if (!['owner', 'admin', 'office'].includes(ctx.role)) redirect('/office');
  if (!(await tenantHasModule('personalizzazioni'))) redirect('/office');
  return <>{children}</>;
}

import { redirect } from 'next/navigation';

import { getAppModeCached } from '@/app/_lib/app-mode';

/**
 * I ticket sono del mondo commesse: per i tenant solo Kantiere l'area non è
 * raggiungibile nemmeno per URL diretto, come /office/commesse.
 * Tenant 'kommessa' e 'full' → nessun effetto.
 */
export default async function TicketsLayout({ children }: { children: React.ReactNode }) {
  if ((await getAppModeCached()) === 'kantiere') redirect('/office/kantiere');
  return <>{children}</>;
}

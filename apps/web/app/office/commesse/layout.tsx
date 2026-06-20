import { redirect } from 'next/navigation';

import { getAppModeCached } from '@/app/_lib/app-mode';

/**
 * Guard d'area: l'intero sottoalbero "Commesse" è disattivato per i tenant
 * puro-Kantiere (`app_mode='kantiere'`, es. FPM) — non basta nasconderlo
 * dalla sidebar, va reso irraggiungibile anche per URL diretto.
 * Tenant 'kommessa' (Bertaiola) e 'full' → nessun effetto.
 */
export default async function CommesseLayout({ children }: { children: React.ReactNode }) {
  if ((await getAppModeCached()) === 'kantiere') redirect('/office/kantiere');
  return <>{children}</>;
}

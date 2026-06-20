import { redirect } from 'next/navigation';

import { getAppModeCached } from '@/app/_lib/app-mode';

/**
 * Guard d'area: "Turni & ore" è il foglio-ore aggregato per commessa →
 * disattivato per i tenant puro-Kantiere (`app_mode='kantiere'`), che
 * gestiscono le ore in Kantiere (Ore e costi / Rapportini). Tenant
 * 'kommessa' (Bertaiola) e 'full' → nessun effetto.
 */
export default async function TurniLayout({ children }: { children: React.ReactNode }) {
  if ((await getAppModeCached()) === 'kantiere') redirect('/office/kantiere');
  return <>{children}</>;
}

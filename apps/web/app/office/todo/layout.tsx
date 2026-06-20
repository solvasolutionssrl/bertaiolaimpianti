import { redirect } from 'next/navigation';

import { getAppModeCached } from '@/app/_lib/app-mode';

/**
 * Guard d'area: i Task (todo) appartengono al mondo commessa → disattivati
 * per i tenant puro-Kantiere (`app_mode='kantiere'`). Tenant 'kommessa'
 * (Bertaiola) e 'full' → nessun effetto.
 */
export default async function TodoLayout({ children }: { children: React.ReactNode }) {
  if ((await getAppModeCached()) === 'kantiere') redirect('/office/kantiere');
  return <>{children}</>;
}

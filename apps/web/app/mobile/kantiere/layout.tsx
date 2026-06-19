import { redirect } from 'next/navigation';

import { guardMobile } from '../_lib/guard';
import { tenantHasModule } from '@/app/_lib/modules';
import { getAppModeCached } from './_lib/app-mode';

/**
 * Layout della shell Kantiere mobile.
 *
 * Gating: utente autenticato (guardMobile) + modulo `kantiere` attivo +
 * `app_mode` in ('kantiere','full'). Altrimenti redirect a /mobile.
 * Per i tenant 'kommessa' (incluso Bertaiola) queste route non sono
 * raggiungibili: zero diff sul percorso esistente.
 */
export default async function KantiereMobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await guardMobile();

  const [haModulo, appMode] = await Promise.all([
    tenantHasModule('kantiere'),
    getAppModeCached(),
  ]);

  if (!haModulo || (appMode !== 'kantiere' && appMode !== 'full')) {
    redirect('/mobile');
  }

  return <>{children}</>;
}

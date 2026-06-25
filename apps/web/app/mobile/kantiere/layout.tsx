import { redirect } from 'next/navigation';

import { createServerSupabase } from '@kommessa/api/server';

import { guardMobile } from '../_lib/guard';
import { tenantHasModule } from '@/app/_lib/modules';
import { getAppModeCached } from '@/app/_lib/app-mode';
import { NotificheBell } from './_components/notifiche-bell';

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
  const ctx = await guardMobile();

  const [haModulo, appMode] = await Promise.all([
    tenantHasModule('kantiere'),
    getAppModeCached(),
  ]);

  if (!haModulo || (appMode !== 'kantiere' && appMode !== 'full')) {
    redirect('/mobile');
  }

  // Conteggio notifiche non lette per la campanella fissa (best-effort: se la
  // query fallisce mostriamo comunque la campanella senza badge).
  let unreadCount = 0;
  const { count } = await createServerSupabase()
    .from('notifiche' as never)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenantId)
    .eq('user_id', ctx.userId)
    .is('read_at', null);
  unreadCount = count ?? 0;

  return (
    <>
      <NotificheBell unreadCount={unreadCount} />
      {children}
    </>
  );
}

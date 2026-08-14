import type { Metadata } from 'next';
import { Bell } from 'lucide-react';

import { LiveRefresh } from '@/app/_components/live-refresh';

import { createServerSupabase } from '@kommessa/api/server';

import { guardMobile } from '../_lib/guard';
import { MobileBackButton } from '../_components/mobile-back-button';
import { NotificheList, type NotificaRow } from './_components/notifiche-list';

export const metadata: Metadata = { title: 'Notifiche' };
export const dynamic = 'force-dynamic';

/**
 * /mobile/notifiche — centro NOTIFICHE (tabella `notifiche`, quella che alimenta
 * il contatore della campanella). Ogni utente vede le proprie: per admin/office
 * sono le cose che richiedono attenzione (ore modificate dai tecnici, ticket,
 * ecc.). Tap → marca come letta + deep-link. Header con tasto Indietro.
 *
 * NB: prima qui c'era la timeline `audit_events` ("Attività"), scollegata dalla
 * campanella (che conta invece `notifiche`) → sostituita.
 */
export default async function NotifichePage() {
  const ctx = await guardMobile();
  const supabase = createServerSupabase();

  const { data } = await supabase
    .from('notifiche')
    .select('id, type, payload, read_at, created_at')
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = (data ?? []) as NotificaRow[];
  const nUnread = rows.filter((r) => !r.read_at).length;

  return (
    <div className="animate-content-in flex min-h-[100dvh] flex-col gap-4 p-4">
      <header className="pt-2">
        <MobileBackButton tone="light" label="Indietro" />
        <p className="mt-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          <Bell className="h-3.5 w-3.5" aria-hidden="true" />
          Notifiche
        </p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold tracking-tight">
            {nUnread > 0
              ? `${nUnread} da leggere`
              : rows.length === 0
                ? 'Notifiche'
                : 'Tutto letto'}
          </h1>
          {/* Gli avvisi arrivano mentre la pagina è aperta: è proprio il posto
              dove non si deve ricaricare a mano. */}
          <LiveRefresh className="shrink-0 text-[11px]" />
        </div>
      </header>

      <NotificheList rows={rows} />
    </div>
  );
}

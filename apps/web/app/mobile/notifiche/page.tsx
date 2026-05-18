import type { Metadata } from 'next';
import { createServerSupabase } from '@impiantixplus/api/server';
import { guardMobile } from '../_lib/guard';
import { NotificheList, type NotificaItem } from './notifiche-list';

export const metadata: Metadata = {
  title: 'Notifiche',
};

export const dynamic = 'force-dynamic';

/**
 * /mobile/notifiche — Centro notifiche PWA tecnici.
 *
 * Render server-side della pagina iniziale (ultime 50, ordinate desc),
 * poi il client component si abbona a Supabase Realtime sulla tabella
 * `notifiche` per push live in-app.
 *
 * Design: "field log" — colonna verticale, strip colorate per event_type
 * sul bordo sinistro, timestamp monospaziati, marker arancio (brand) per
 * non lette con pulse subtile. Tipografia: display tracking-tight grande
 * per i titoli, body con line-clamp.
 */
export default async function MobileNotificheePage() {
  const ctx = await guardMobile();
  const supabase = createServerSupabase();

  const { data } = await supabase
    .from('notifiche')
    .select('id, type, payload, read_at, created_at')
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: false })
    .limit(50);

  const items: NotificaItem[] = ((data ?? []) as any[]).map((n) => ({
    id: n.id,
    type: n.type,
    title: (n.payload?.title as string) ?? 'Notifica',
    body: (n.payload?.body as string) ?? '',
    url: (n.payload?.url as string) ?? null,
    read_at: n.read_at,
    created_at: n.created_at,
  }));

  return <NotificheList initial={items} userId={ctx.userId} />;
}

'use client';

import * as React from 'react';
import { createBrowserSupabase } from '@impiantixplus/api/client';

/**
 * Hook real-time unread badge — si subscribe alla tabella `notifiche`
 * via Supabase Realtime e aggiorna il counter senza refresh pagina.
 *
 * - INSERT con read_at NULL → counter +1
 * - UPDATE che setta read_at → counter -1 (se cala da unread a read)
 *
 * Initial value: passato dal server (SSR), così c'è subito il count
 * giusto al primo render anche prima che la subscription parta.
 *
 * Cleanup robusto: la subscription si chiude on unmount.
 */
export function useRealtimeUnread({
  userId,
  tenantId,
  initialCount,
}: {
  userId: string;
  tenantId: string;
  initialCount: number;
}): number {
  const [count, setCount] = React.useState(initialCount);

  // Sync se cambia l'initialCount (es. navigation, server refresh)
  React.useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  React.useEffect(() => {
    if (!userId) return;
    const supabase = createBrowserSupabase();
    const channel = supabase
      .channel(`notifiche:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifiche',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { read_at: string | null; tenant_id: string };
          if (row.tenant_id !== tenantId) return;
          if (!row.read_at) setCount((c) => c + 1);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifiche',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const before = payload.old as { read_at: string | null } | null;
          const after = payload.new as { read_at: string | null; tenant_id: string };
          if (after.tenant_id !== tenantId) return;
          // Da unread → read: decrementa
          if (before && !before.read_at && after.read_at) {
            setCount((c) => Math.max(0, c - 1));
          }
          // Da read → unread (raro): incrementa
          if (before && before.read_at && !after.read_at) {
            setCount((c) => c + 1);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, tenantId]);

  return count;
}

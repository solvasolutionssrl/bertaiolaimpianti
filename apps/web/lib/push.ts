/**
 * Web Push helper (server-only).
 *
 * Usa la lib `web-push` con VAPID. Funziona su Node runtime (non Edge).
 * Le route che inviano push devono dichiarare `export const runtime = 'nodejs'`.
 *
 * Esempio:
 *   import { inviaPushAUtente } from '@/lib/push';
 *   await inviaPushAUtente(supabaseService, userId, {
 *     title: 'Nuovo intervento assegnato',
 *     body: 'BER-26-003 · Rossi Mario · domani 9:00',
 *     url: '/mobile/commesse/abc-123',
 *   });
 */

import webpush from 'web-push';

// Tipo locale minimale del client supabase (evita drift con i Database
// types generati). I metodi usati: from().select/update/delete con `eq`.
type SupabaseLike = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => Promise<{ data: any[] | null; error: any }>;
    };
    update: (patch: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: any }>;
    };
    delete: () => {
      eq: (col: string, val: string) => Promise<{ error: any }>;
    };
  };
};

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY ?? '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:dev@example.com';

let configured = false;
function ensureConfigured() {
  if (configured) return;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE || VAPID_PUBLIC === 'placeholder') {
    throw new Error('VAPID keys non configurate in env');
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  data?: Record<string, unknown>;
}

/**
 * Invia una notifica a tutte le subscription di un utente.
 * Le subscription scadute (410 / 404) vengono eliminate dal DB.
 *
 * Restituisce contatori per logging.
 */
export async function inviaPushAUtente(
  supabase: SupabaseLike,
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; pruned: number; failed: number }> {
  ensureConfigured();

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);
  if (error) throw error;
  if (!subs || subs.length === 0) {
    return { sent: 0, pruned: 0, failed: 0 };
  }

  let sent = 0;
  let pruned = 0;
  let failed = 0;

  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint as string,
            keys: { p256dh: s.p256dh as string, auth: s.auth as string },
          },
          body,
        );
        sent++;
        await supabase
          .from('push_subscriptions')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', s.id as string);
      } catch (err) {
        const status =
          (err as { statusCode?: number; status?: number }).statusCode ??
          (err as { status?: number }).status;
        if (status === 404 || status === 410) {
          // Subscription scaduta o rimossa lato browser
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('id', s.id as string);
          pruned++;
        } else {
          console.warn('[push] send failed', status, err);
          failed++;
        }
      }
    }),
  );

  return { sent, pruned, failed };
}

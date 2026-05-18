import webpush from 'web-push';

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = process.env.VAPID_SUBJECT ?? 'mailto:ops@solva.example';
  if (!pub || !priv) throw new Error('Missing VAPID keys');
  webpush.setVapidDetails(subj, pub, priv);
  configured = true;
}

export interface PushSubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  badge?: string;
  tag?: string;
}

export async function sendPush(sub: PushSubscriptionRecord, payload: PushPayload) {
  ensureConfigured();
  return webpush.sendNotification(sub, JSON.stringify(payload));
}

export const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;

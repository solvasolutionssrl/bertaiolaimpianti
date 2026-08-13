/**
 * Aggiunge SOLO l'utente admin mancante al tenant DEMOC (Nordest Cantieri DEMO),
 * necessario perché l'impersonation cerca un utente role='admin' del tenant.
 * NON tocca gli altri utenti/tenant. Stampa l'uid creato.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../../apps/web/.env.local'), 'utf8')
    .split('\n').filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const BASE = env['NEXT_PUBLIC_SUPABASE_URL'];
const KEY = env['SUPABASE_SERVICE_ROLE_KEY'];
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const TENANT_ID = 'a0d30000-0000-4000-8000-000000000002';
const email = 'demo@democ.kommessa.local';

// dedup: se esiste già, cancellalo
const list = await (await fetch(`${BASE}/auth/v1/admin/users?page=1&per_page=200`, { headers: H })).json();
const prev = (list.users || list).find((u) => String(u.email).toLowerCase() === email);
if (prev) {
  await fetch(`${BASE}/auth/v1/admin/users/${prev.id}`, { method: 'DELETE', headers: H });
  console.error(`~ rimosso esistente ${email} ${prev.id}`);
}

const body = {
  email, password: 'Demo2026!', email_confirm: true,
  user_metadata: { display_name: 'Ufficio · Nordest Cantieri' },
  app_metadata: { tenant_id: TENANT_ID, tenant_slug: 'DEMOC', role: 'admin', manual_account: true },
};
const r = await fetch(`${BASE}/auth/v1/admin/users`, { method: 'POST', headers: H, body: JSON.stringify(body) });
if (!r.ok) throw new Error(`create ${email} -> ${r.status} ${await r.text()}`);
const j = await r.json();
console.log(JSON.stringify({ email, id: j.id }));

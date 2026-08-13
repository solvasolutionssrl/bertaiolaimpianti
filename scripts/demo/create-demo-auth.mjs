/**
 * Crea gli utenti auth dei DUE tenant DEMO (Kommessa + Kantiere) via GoTrue
 * Admin API. Idempotente: se l'email esiste già la cancella e ricrea.
 * Stampa un JSON { "kommessa:demo": "<uid>", ... } da usare nel seed SQL.
 *
 * NON tocca i tenant reali (BER / FPMIMP): opera solo su email @demok./@democ.
 *
 *   node scripts/demo/create-demo-auth.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../../apps/web/.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const BASE = env['NEXT_PUBLIC_SUPABASE_URL'];
const KEY = env['SUPABASE_SERVICE_ROLE_KEY'];
if (!BASE || !KEY) throw new Error('Manca NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local');
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

// UUID fissi dei tenant demo — DEVONO combaciare con quelli del seed SQL.
const TENANTS = {
  kommessa: { id: 'a0d30000-0000-4000-8000-000000000001', slug: 'demok' },
  kantiere: { id: 'a0d30000-0000-4000-8000-000000000002', slug: 'democ' },
};
const PASSWORD = 'Demo2026!';

const USERS = [
  { world: 'kommessa', username: 'demo', role: 'admin', name: 'Ufficio · Rossi Impianti' },
  { world: 'kommessa', username: 'ufficio', role: 'office', name: 'Chiara Bianchi' },
  { world: 'kommessa', username: 'marco', role: 'tecnico', name: 'Marco Rossi' },
  { world: 'kommessa', username: 'luca', role: 'tecnico', name: 'Luca Ferrari' },
  { world: 'kantiere', username: 'ufficio', role: 'office', name: 'Ufficio · Nordest Cantieri' },
  { world: 'kantiere', username: 'marco', role: 'tecnico', name: 'Marco Rinaldi' },
  { world: 'kantiere', username: 'luca', role: 'tecnico', name: 'Luca Fabbri' },
  { world: 'kantiere', username: 'andrea', role: 'tecnico', name: 'Andrea Pozzi' },
];

// Elenco utenti esistenti (per dedup) — paginato
async function listUsers() {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const r = await fetch(`${BASE}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: H });
    if (!r.ok) throw new Error(`list users ${r.status} ${await r.text()}`);
    const j = await r.json();
    const users = j.users || j;
    if (!users.length) break;
    out.push(...users);
    if (users.length < 200) break;
  }
  return out;
}

const existing = await listUsers();
const byEmail = new Map(existing.map((u) => [String(u.email).toLowerCase(), u.id]));
const result = {};

for (const u of USERS) {
  const t = TENANTS[u.world];
  const email = `${u.username}@${t.slug}.kommessa.local`;
  // dedup: cancella se già presente
  const prev = byEmail.get(email.toLowerCase());
  if (prev) {
    const d = await fetch(`${BASE}/auth/v1/admin/users/${prev}`, { method: 'DELETE', headers: H });
    console.error(`  ~ elimino esistente ${email} (${prev}) -> ${d.status}`);
  }
  const body = {
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: u.name },
    app_metadata: { tenant_id: t.id, tenant_slug: t.slug.toUpperCase(), role: u.role, manual_account: true },
  };
  const r = await fetch(`${BASE}/auth/v1/admin/users`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`create ${email} -> ${r.status} ${await r.text()}`);
  const j = await r.json();
  result[`${u.world}:${u.username}`] = j.id;
  console.error(`  ✓ ${email}  role=${u.role}  ${j.id}`);
}

console.error(`\nPassword unica: ${PASSWORD}`);
console.log(JSON.stringify(result, null, 2));

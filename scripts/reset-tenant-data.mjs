/**
 * Reset dati business tenant — usa fetch nativo, zero dipendenze.
 * node scripts/reset-tenant-data.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../apps/web/.env.local'), 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const BASE = env['NEXT_PUBLIC_SUPABASE_URL'];
const KEY  = env['SUPABASE_SERVICE_ROLE_KEY'];
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'count=exact' };

async function del(table, tenantId) {
  const res = await fetch(`${BASE}/rest/v1/${table}?tenant_id=eq.${tenantId}`, {
    method: 'DELETE',
    headers: HEADERS,
  });
  const count = res.headers.get('content-range')?.split('/')[1] ?? '?';
  if (!res.ok) {
    const body = await res.text();
    console.error(`  ✗ ${table}: ${res.status} ${body}`);
  } else {
    console.log(`  ✓ ${table}: ${count} righe`);
  }
}

// Prima leggiamo il tenant_id
const tRes = await fetch(`${BASE}/rest/v1/tenants?select=id,nome,slug&limit=1`, {
  headers: HEADERS,
});
const tenants = await tRes.json();
const tenant = Array.isArray(tenants) ? tenants[0] : tenants;
if (!tenant?.id) throw new Error(`Tenant non trovato: ${JSON.stringify(tenants)}`);

const tid = tenant.id;
console.log(`\nReset tenant: "${tenant.nome}" (${tenant.slug})\n`);

await del('commessa_riunione_allegato', tid);
await del('commessa_todo_allegato',     tid);
await del('commessa_todo_nota',         tid);
await del('commessa_riunione',          tid);
await del('commessa_todo',              tid);
await del('file_annotations',           tid);
await del('file_refs',                  tid);
await del('commessa_tecnici',           tid);
await del('commessa_voci',              tid);
await del('interventi',                 tid);
await del('ticket_messages',            tid);
await del('tickets',                    tid);
await del('commesse',                   tid);
await del('clienti',                    tid);
await del('notifiche',                  tid);
await del('audit_events',               tid);
await del('commessa_counter',           tid);

console.log('\n✅ Done. Utenti e config tenant intatti.\n');

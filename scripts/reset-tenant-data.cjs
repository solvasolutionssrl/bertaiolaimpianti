/**
 * Reset dati business tenant Bertaiola.
 * node scripts/reset-tenant-data.cjs
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../apps/web/.env.local');
const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const url = env['NEXT_PUBLIC_SUPABASE_URL'];
const key = env['SUPABASE_SERVICE_ROLE_KEY'];
if (!url || !key) throw new Error('Env vars mancanti');

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function del(table, tenantId) {
  const { error, count } = await supabase
    .from(table)
    .delete({ count: 'exact' })
    .eq('tenant_id', tenantId);
  if (error) {
    console.error(`  ✗ ${table}: ${error.message}`);
  } else {
    console.log(`  ✓ ${table}: ${count ?? '?'} righe eliminate`);
  }
}

async function main() {
  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .select('id, name, slug')
    .single();

  if (tErr || !tenant) throw new Error(`Tenant non trovato: ${tErr?.message}`);

  const tid = tenant.id;
  console.log(`\nReset tenant: "${tenant.name}" (${tenant.slug})\n`);

  await del('commessa_riunione_allegato', tid);
  await del('commessa_todo_allegato', tid);
  await del('commessa_todo_nota', tid);
  await del('commessa_riunione', tid);
  await del('commessa_todo', tid);
  await del('file_annotations', tid);
  await del('file_refs', tid);
  await del('commessa_tecnici', tid);
  await del('commessa_voci', tid);
  await del('interventi', tid);
  await del('ticket_messages', tid);
  await del('tickets', tid);
  await del('commesse', tid);
  await del('clienti', tid);
  await del('notifiche', tid);
  await del('audit_events', tid);
  await del('commessa_counter', tid);

  console.log('\n✅ Done. Utenti e config tenant intatti.\n');
}

main().catch(e => { console.error(e); process.exit(1); });

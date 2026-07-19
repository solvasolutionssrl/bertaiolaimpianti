/**
 * Ripulisce i DOPPIONI in pianificazione: blocchi "equivalenti" (stesso tenant,
 * giorno, tipo, cantiere/titolo, fascia, orari) in cui la STESSA persona compare
 * in più di uno. Per ciascun gruppo con doppione: unisce (merge) tutti i membri
 * nel blocco con più membri (il "keeper") e cancella gli altri. Non perde mai un
 * membro. Idempotente.
 *
 *   node scripts/cleanup-pianificazione-duplicati.mjs                 # DRY-RUN (default)
 *   node scripts/cleanup-pianificazione-duplicati.mjs --apply         # esegue
 *   node scripts/cleanup-pianificazione-duplicati.mjs --slug FPMIMP   # tenant (default FPMIMP)
 *
 * Zero dipendenze: fetch nativo + PostgREST + service role.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');
const slugArg = process.argv.indexOf('--slug');
const SLUG = slugArg >= 0 ? process.argv[slugArg + 1] : 'FPMIMP';

const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../apps/web/.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const BASE = env['NEXT_PUBLIC_SUPABASE_URL'];
const KEY = env['SUPABASE_SERVICE_ROLE_KEY'];
if (!BASE || !KEY) throw new Error('Env mancante: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function get(path) {
  const r = await fetch(`${BASE}/rest/v1/${path}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}
async function del(path) {
  const r = await fetch(`${BASE}/rest/v1/${path}`, { method: 'DELETE', headers: H });
  if (!r.ok) throw new Error(`DELETE ${path} → ${r.status} ${await r.text()}`);
}
async function post(path, body) {
  const r = await fetch(`${BASE}/rest/v1/${path}`, {
    method: 'POST',
    headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST ${path} → ${r.status} ${await r.text()}`);
}

const [tenant] = await get(`tenants?slug=eq.${SLUG}&select=id,nome`);
if (!tenant) throw new Error(`Tenant ${SLUG} non trovato`);
console.log(`Tenant: ${tenant.nome} (${tenant.id}) · modalità: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

const blocchi = await get(
  `pianificazione_blocchi?tenant_id=eq.${tenant.id}` +
    `&select=id,data,tipo,cantiere_id,titolo,fascia,ora_inizio,ora_fine,created_at,membri:pianificazione_membri(dipendente_id)` +
    `&order=created_at.asc`,
);

// Raggruppa per chiave "equivalente"
const gruppi = new Map();
for (const b of blocchi) {
  const key = [b.data, b.tipo, b.cantiere_id ?? '', b.titolo ?? '', b.fascia, b.ora_inizio, b.ora_fine].join('|');
  if (!gruppi.has(key)) gruppi.set(key, []);
  gruppi.get(key).push({ ...b, membri: (b.membri ?? []).map((m) => m.dipendente_id) });
}

let gruppiDoppione = 0;
let bloccheliminati = 0;
let membriAggiunti = 0;

for (const [key, gs] of gruppi) {
  if (gs.length < 2) continue;
  // c'è un doppione solo se qualche persona è in ≥2 blocchi del gruppo
  const conteggio = new Map();
  for (const g of gs) for (const m of g.membri) conteggio.set(m, (conteggio.get(m) ?? 0) + 1);
  const duplicati = [...conteggio.values()].some((c) => c > 1);
  if (!duplicati) continue;

  gruppiDoppione++;
  // keeper = blocco con più membri (tie → più vecchio, già ordinati per created_at)
  const keeper = gs.reduce((a, b) => (b.membri.length > a.membri.length ? b : a));
  const union = new Set(gs.flatMap((g) => g.membri));
  const mancanti = [...union].filter((m) => !keeper.membri.includes(m));
  const daEliminare = gs.filter((g) => g.id !== keeper.id);

  const [data, , , titolo, , ora] = key.split('|');
  console.log(`• ${data} ${ora} ${titolo || keeper.cantiere_id || ''}: ${gs.length} blocchi equivalenti`);
  console.log(`   keeper ${keeper.id} (${keeper.membri.length} membri) + ${mancanti.length} da unire`);
  console.log(`   elimino: ${daEliminare.map((g) => `${g.id}(${g.membri.length})`).join(', ')}`);

  if (APPLY) {
    if (mancanti.length) {
      await post('pianificazione_membri', mancanti.map((m) => ({ blocco_id: keeper.id, dipendente_id: m, tenant_id: tenant.id })));
      membriAggiunti += mancanti.length;
    }
    for (const g of daEliminare) {
      await del(`pianificazione_membri?blocco_id=eq.${g.id}`);
      await del(`pianificazione_blocco_mezzi?blocco_id=eq.${g.id}`);
      await del(`pianificazione_blocchi?id=eq.${g.id}&tenant_id=eq.${tenant.id}`);
      bloccheliminati++;
    }
  }
}

console.log(
  `\n${APPLY ? 'FATTO' : 'DRY-RUN'}: ${gruppiDoppione} gruppi con doppione` +
    (APPLY ? ` · ${bloccheliminati} blocchi eliminati · ${membriAggiunti} membri uniti al keeper` : ' (nessuna modifica; usa --apply)'),
);

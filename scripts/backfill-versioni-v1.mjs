/**
 * Backfill versione 1 ('creazione') per le commesse esistenti che non hanno
 * ancora righe in commessa_versioni. Idempotente: salta quelle già versionate.
 *
 *   node scripts/backfill-versioni-v1.mjs --dry-run   # solo conteggio
 *   node scripts/backfill-versioni-v1.mjs             # esegue
 *
 * Usa fetch nativo + service role key (zero dipendenze). NON tocca codice /
 * nome cartella / voci: scrive solo lo snapshot contenuto come v1.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes('--dry-run');

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
const HEADERS = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

async function get(path) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

function normReferenti(rows) {
  return rows
    .map((r) => ({
      nome: (r.nome ?? '').trim(),
      ruolo: r.ruolo?.trim() || null,
      telefono: r.telefono?.trim() || null,
      email: r.email?.trim() || null,
    }))
    .filter((r) => r.nome.length > 0)
    .sort((a, b) =>
      `${a.nome}|${a.telefono ?? ''}`.localeCompare(`${b.nome}|${b.telefono ?? ''}`),
    );
}

async function main() {
  // 1) Commesse + 2) versioni esistenti + 3) referenti scope-commessa
  const commesse = await get(
    'commesse?select=id,tenant_id,descrizione_ai_finale,cliente_indirizzo_cantiere,note_iniziali,is_critica,stato,responsabile_id,cliente_id',
  );
  const versioni = await get('commessa_versioni?select=commessa_id');
  const referenti = await get(
    'contatto_cliente?select=commessa_id,nome,ruolo,telefono,email&commessa_id=not.is.null',
  );

  const giaVersionate = new Set(versioni.map((v) => v.commessa_id));
  const refByCommessa = new Map();
  for (const r of referenti) {
    if (!refByCommessa.has(r.commessa_id)) refByCommessa.set(r.commessa_id, []);
    refByCommessa.get(r.commessa_id).push(r);
  }

  const daFare = commesse.filter((c) => !giaVersionate.has(c.id));
  console.log(`\nCommesse totali: ${commesse.length}`);
  console.log(`Già versionate: ${giaVersionate.size}`);
  console.log(`Da popolare con v1: ${daFare.length}\n`);

  if (DRY) {
    console.log('(dry-run) nessuna scrittura eseguita.');
    return;
  }

  const rows = daFare.map((c) => ({
    tenant_id: c.tenant_id,
    commessa_id: c.id,
    versione: 1,
    snapshot: {
      descrizioneFinale: c.descrizione_ai_finale ?? null,
      indirizzoCantiere: c.cliente_indirizzo_cantiere ?? null,
      noteIniziali: c.note_iniziali ?? null,
      isCritica: c.is_critica ?? null,
      stato: c.stato ?? null,
      responsabileId: c.responsabile_id ?? null,
      clienteId: c.cliente_id ?? null,
      referenti: normReferenti(refByCommessa.get(c.id) ?? []),
    },
    diff: [],
    modificato_da: null,
    modificato_da_nome: 'sistema',
    azione: 'creazione',
  }));

  if (rows.length === 0) {
    console.log('Niente da fare.');
    return;
  }

  // Insert in batch (PostgREST accetta array).
  const res = await fetch(`${BASE}/rest/v1/commessa_versioni`, {
    method: 'POST',
    headers: { ...HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`INSERT → ${res.status} ${await res.text()}`);
  console.log(`✓ Inserite ${rows.length} versioni v1 ('creazione').`);
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});

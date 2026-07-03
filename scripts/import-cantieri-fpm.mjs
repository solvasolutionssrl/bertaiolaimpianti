/**
 * Import massivo dei cantieri FPM in public.cantieri (mondo kantiere).
 *
 * SICUREZZA:
 *   - DRY-RUN di default: senza --apply non scrive NULLA, stampa solo il piano.
 *   - Target ESPLICITO obbligatorio: --target=local | --target=prod.
 *   - Scrittura su prod richiede anche --yes-prod (doppia conferma).
 *   - Idempotente: rerun => 0 insert, N update. MAI delete.
 *   - Guard Monfalcone: la riga esistente (QR attivo, turni possibili) viene
 *     AGGIORNATA per id, MAI ricreata/duplicata (id preservato => timbrature,
 *     QR e rapportini restano attaccati).
 *
 * Uso:
 *   node scripts/import-cantieri-fpm.mjs --target=prod                 # dry-run (read-only)
 *   node scripts/import-cantieri-fpm.mjs --target=prod --apply --yes-prod
 *   node scripts/import-cantieri-fpm.mjs --target=local --apply
 *
 * Env:
 *   prod  -> apps/web/.env.local : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   local -> http://127.0.0.1:54321 + SUPABASE_LOCAL_SERVICE_ROLE_KEY (da `supabase status`)
 *
 * Non stampa mai chiavi/segreti a video.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (k) => {
  const a = args.find((x) => x.startsWith(`${k}=`));
  return a ? a.slice(k.length + 1) : null;
};
const TARGET = val('--target'); // 'local' | 'prod'
const APPLY = has('--apply');
const YES_PROD = has('--yes-prod');

if (TARGET !== 'local' && TARGET !== 'prod') {
  console.error('ERRORE: specifica --target=local oppure --target=prod');
  process.exit(1);
}
if (APPLY && TARGET === 'prod' && !YES_PROD) {
  console.error('ERRORE: scrittura su PROD richiede anche --yes-prod (doppia conferma).');
  process.exit(1);
}

// ── env / connessione ────────────────────────────────────────────────────────
function loadEnvLocal() {
  return Object.fromEntries(
    readFileSync(resolve(ROOT, 'apps/web/.env.local'), 'utf8')
      .split('\n')
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
}

let BASE, KEY;
if (TARGET === 'prod') {
  const env = loadEnvLocal();
  BASE = env['NEXT_PUBLIC_SUPABASE_URL'];
  KEY = env['SUPABASE_SERVICE_ROLE_KEY'];
} else {
  const env = (() => { try { return loadEnvLocal(); } catch { return {}; } })();
  BASE = process.env.SUPABASE_LOCAL_URL || 'http://127.0.0.1:54321';
  KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY || env['SUPABASE_LOCAL_SERVICE_ROLE_KEY'];
}
if (!BASE || !KEY) {
  console.error(`ERRORE: connessione mancante per target=${TARGET} (BASE/KEY). ` +
    (TARGET === 'local' ? 'Esegui `supabase status` e imposta SUPABASE_LOCAL_SERVICE_ROLE_KEY.' : ''));
  process.exit(1);
}
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const TENANT_SLUG = 'FPMIMP';
const DATA = resolve(__dirname, 'data/cantieri-fpm.json');
// Codice commessa che corrisponde al cantiere Monfalcone GIÀ esistente in prod
// (QR attivo). SOLO questo aggiorna la riga esistente; le altre commesse
// Fincantieri (Riva Trigoso, ecc.) sono cantieri diversi -> insert normale.
const MONFALCONE_CC = '25098';

async function rest(method, path, body, prefer) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    method,
    headers: prefer ? { ...HEADERS, Prefer: prefer } : HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${txt}`);
  return txt ? JSON.parse(txt) : null;
}

// Stessa logica di prossimoCodiceCantiere (packages/api/src/kantiere.ts).
function maxCan(codici) {
  let max = 0;
  for (const c of codici) {
    const m = typeof c === 'string' ? c.match(/^CAN-(\d+)$/) : null;
    if (m && m[1] !== undefined) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}
const canCode = (n) => `CAN-${String(n).padStart(5, '0')}`;

function isMonfalcone(nome) {
  return /monfalcone|fincantieri/i.test(nome || '');
}

async function main() {
  const banner = TARGET === 'prod' ? '*** PROD ***' : 'locale';
  console.log(`Target: ${banner}  |  Modalità: ${APPLY ? 'APPLY (scrive)' : 'DRY-RUN (read-only)'}`);

  const records = JSON.parse(readFileSync(DATA, 'utf8'));
  console.log(`Sorgente: ${records.length} cantieri da ${DATA}`);

  // 1) tenant FPM
  const tRows = await rest('GET', `tenants?slug=eq.${TENANT_SLUG}&select=id,slug`);
  if (!Array.isArray(tRows) || tRows.length === 0) {
    console.error(`ERRORE: tenant ${TENANT_SLUG} non trovato su questo target. ` +
      (TARGET === 'local' ? '(il seed locale contiene solo Bertaiola: FPM non esiste in locale)' : ''));
    process.exit(1);
  }
  const tenantId = tRows[0].id;
  console.log(`Tenant ${TENANT_SLUG} = ${tenantId}`);

  // 2) precheck migration applicata (colonna codice_commessa)
  let migrationApplied = true;
  try {
    await rest('GET', `cantieri?select=codice_commessa&limit=1`);
  } catch {
    migrationApplied = false;
  }
  if (!migrationApplied) {
    const msg = 'La colonna codice_commessa non esiste ancora (migration 20260703000000 non applicata).';
    if (APPLY) {
      console.error(`ERRORE: ${msg} Applicala prima di importare.`);
      process.exit(1);
    }
    console.log(`\n⚠️  ${msg}\n   DRY-RUN comunque possibile: pianifico come se nessun cantiere avesse codice_commessa.`);
  }

  // 3) cantieri esistenti del tenant
  const existing = await rest(
    'GET',
    `cantieri?tenant_id=eq.${tenantId}&select=${migrationApplied ? 'id,codice,codice_commessa,nome' : 'id,codice,nome'}`,
  );
  const byCC = new Map();
  for (const c of existing) if (c.codice_commessa) byCC.set(String(c.codice_commessa), c);
  const monfEsistente = existing.find((c) => !c.codice_commessa && isMonfalcone(c.nome));
  let nextCan = maxCan(existing.map((c) => c.codice)) + 1;

  // 4) piano
  const ops = [];
  for (const r of records) {
    const cc = String(r.codice_commessa);
    const fields = {
      codice_commessa: cc,
      nome: r.nome,
      cliente_nome: r.cliente_nome,
      indirizzo: r.indirizzo,
      indirizzo_lat: r.indirizzo_lat,
      indirizzo_lng: r.indirizzo_lng,
      categoria: r.categoria,
      indirizzo_da_verificare: Boolean(r.da_verificare),
    };
    const already = byCC.get(cc);
    if (already) {
      ops.push({ kind: 'update', id: already.id, fields, cc, nome: r.nome });
    } else if (cc === MONFALCONE_CC && monfEsistente) {
      // Guard Monfalcone: SOLO la 25098 aggiorna la riga esistente per id
      // (id preservato -> turni/QR intatti). Le altre Fincantieri sono insert.
      ops.push({ kind: 'update-monfalcone', id: monfEsistente.id, fields, cc, nome: r.nome });
    } else {
      const codice = canCode(nextCan++);
      ops.push({ kind: 'insert', codice, fields, cc, nome: r.nome });
    }
  }

  const nIns = ops.filter((o) => o.kind === 'insert').length;
  const nUpd = ops.filter((o) => o.kind === 'update').length;
  const nMonf = ops.filter((o) => o.kind === 'update-monfalcone').length;
  console.log(`\nPIANO: ${nIns} insert · ${nUpd} update · ${nMonf} update-Monfalcone`);
  if (monfEsistente) console.log(`  Monfalcone esistente id=${monfEsistente.id} ("${monfEsistente.nome}") -> update in-place (25098)`);
  else console.log('  Monfalcone: nessuna riga esistente trovata -> verrà inserita come nuova');
  console.log(`  Codici interni nuovi: ${nIns ? `${canCode(maxCan(existing.map((c) => c.codice)) + 1)} .. ${canCode(nextCan - 1)}` : '—'}`);

  if (!APPLY) {
    console.log('\nDRY-RUN: nessuna scrittura. Aggiungi --apply per eseguire' +
      (TARGET === 'prod' ? ' (+ --yes-prod).' : '.'));
    return;
  }

  // 5) apply
  let done = 0;
  for (const o of ops) {
    if (o.kind === 'insert') {
      await rest('POST', 'cantieri', { tenant_id: tenantId, codice: o.codice, stato: 'attivo', ...o.fields }, 'return=minimal');
    } else {
      await rest('PATCH', `cantieri?id=eq.${o.id}&tenant_id=eq.${tenantId}`, o.fields, 'return=minimal');
    }
    done++;
    if (done % 25 === 0) console.log(`  ...${done}/${ops.length}`);
  }
  console.log(`\nOK — applicati ${done} record (${nIns} insert, ${nUpd + nMonf} update).`);

  const after = await rest('GET', `cantieri?tenant_id=eq.${tenantId}&select=id`, null, 'count=exact');
  console.log(`Totale cantieri FPM ora: ${Array.isArray(after) ? after.length : '?'}`);
  if (monfEsistente) {
    const check = await rest('GET', `cantieri?id=eq.${monfEsistente.id}&select=id,codice,codice_commessa,nome`);
    console.log('Monfalcone dopo:', JSON.stringify(check?.[0] ?? null));
  }
}

main().catch((e) => { console.error('ERRORE:', e.message); process.exit(1); });

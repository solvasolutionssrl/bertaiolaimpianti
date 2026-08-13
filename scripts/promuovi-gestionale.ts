/**
 * Esegue a mano la promozione «deposito → dati veri» per un cliente.
 *
 * In produzione gira da sola alla chiusura di un giro di lettura
 * (`POST /api/v1/esecuzioni {chiudi}`). Questo script serve per il primo giro
 * e per il supporto, quando si vuole vedere l'esito subito invece di
 * aspettare che l'agente ripassi.
 *
 * Uso: pnpm tsx scripts/promuovi-gestionale.ts --tenant=FPMIMP
 *
 * ⚠️ `integrazione-promuovi` importa `server-only`, che non e' un pacchetto
 * vero: lo fornisce il bundler di Next. Per lanciarlo da riga di comando serve
 * uno stub locale, una volta sola:
 *
 *   mkdir -p node_modules/server-only
 *   echo '{"name":"server-only","version":"0.0.0","main":"index.js"}' \
 *     > node_modules/server-only/package.json
 *   echo 'module.exports = {};' > node_modules/server-only/index.js
 */
import { createClient } from '@supabase/supabase-js';

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(resolve(QUI, '../apps/web/.env.local'), 'utf8');
for (const riga of raw.split('\n')) {
  const i = riga.indexOf('=');
  if (i < 1 || riga.trimStart().startsWith('#')) continue;
  const k = riga.slice(0, i).trim();
  if (!process.env[k]) {
    process.env[k] = riga.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
}

async function main() {
  const { promuoviDalGestionale } = await import(
    '../apps/web/app/_lib/integrazione-promuovi'
  );

  const slug = process.argv.find((a) => a.startsWith('--tenant='))?.split('=')[1];
  if (!slug) throw new Error('Serve --tenant=SLUG');

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data } = await db.from('tenants').select('id, nome').eq('slug', slug).maybeSingle();
  if (!data) throw new Error(`Tenant ${slug} inesistente`);

  console.log(`\n▸ ${(data as { nome: string }).nome}`);
  const esito = await promuoviDalGestionale((data as { id: string }).id);
  console.log(JSON.stringify(esito, null, 2), '\n');
}

main().catch((e) => {
  console.error('\n✗', e instanceof Error ? e.message : e, '\n');
  process.exit(1);
});

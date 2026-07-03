/**
 * Fase 2 — Geocoding degli indirizzi cantieri FPM (Google Geocoding API).
 *
 * Arricchisce scripts/data/cantieri-fpm.json con indirizzo_lat/lng/normalizzato.
 * NON tocca il DB: produce un JSON riproducibile e committabile; i lat/lng
 * entrano in DB al successivo run di import-cantieri-fpm.mjs.
 *
 * SICUREZZA COSTI:
 *   - Di default NON chiama Google: stampa solo quanti indirizzi verrebbero
 *     geocodificati. Serve --run per fare le chiamate reali (a pagamento).
 *   - --limit=N per un batch di prova.
 *   - Idempotente: salta i record che hanno già indirizzo_lat.
 *   - Non stampa mai la key.
 *
 * Uso:
 *   node scripts/geocode-cantieri-fpm.mjs                # anteprima (0 chiamate)
 *   node scripts/geocode-cantieri-fpm.mjs --run --limit=5  # prova su 5
 *   node scripts/geocode-cantieri-fpm.mjs --run          # tutti i mancanti
 *
 * Env: GOOGLE_MAPS_API_KEY da apps/web/.env.local
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DATA = resolve(__dirname, 'data/cantieri-fpm.json');

const args = process.argv.slice(2);
const RUN = args.includes('--run');
const limArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limArg ? parseInt(limArg.split('=')[1], 10) : Infinity;

function envKey() {
  const env = Object.fromEntries(
    readFileSync(resolve(ROOT, 'apps/web/.env.local'), 'utf8')
      .split('\n')
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
  );
  return env['GOOGLE_MAPS_API_KEY'];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geocode(address, key) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=it&language=it&key=${key}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url);
    const json = await res.json();
    if (json.status === 'OK' && json.results?.[0]) {
      const g = json.results[0];
      return { lat: g.geometry.location.lat, lng: g.geometry.location.lng, normalizzato: g.formatted_address, partial: Boolean(g.partial_match) };
    }
    if (json.status === 'OVER_QUERY_LIMIT') { await sleep(1500 * (attempt + 1)); continue; }
    return { error: json.status || 'NO_RESULT' };
  }
  return { error: 'OVER_QUERY_LIMIT' };
}

async function main() {
  const records = JSON.parse(readFileSync(DATA, 'utf8'));
  const todo = records.filter((r) => r.indirizzo && r.indirizzo_lat == null);
  console.log(`Record totali: ${records.length}`);
  console.log(`Da geocodificare (indirizzo presente, lat mancante): ${todo.length}`);
  console.log(`Senza indirizzo (restano null, flaggati): ${records.filter((r) => !r.indirizzo).length}`);

  if (!RUN) {
    console.log('\nAnteprima: nessuna chiamata a Google. Aggiungi --run per geocodificare (a pagamento).');
    return;
  }
  const key = envKey();
  if (!key) { console.error('ERRORE: GOOGLE_MAPS_API_KEY mancante in apps/web/.env.local'); process.exit(1); }

  let ok = 0, fail = 0, partial = 0;
  const batch = todo.slice(0, LIMIT);
  console.log(`\nGeocoding di ${batch.length} indirizzi...`);
  for (const r of batch) {
    const g = await geocode(r.indirizzo, key);
    if (g.error) {
      fail++;
      r.indirizzo_da_verificare = true; // fallito -> serve controllo manuale
      r.motivo_verifica = r.motivo_verifica || `Geocoding non riuscito (${g.error})`;
      console.log(`  ✗ ${r.codice_commessa} ${g.error} — ${r.indirizzo}`);
    } else {
      ok++;
      r.indirizzo_lat = g.lat;
      r.indirizzo_lng = g.lng;
      r.indirizzo_normalizzato = g.normalizzato;
      if (g.partial) { partial++; r.indirizzo_da_verificare = true; r.motivo_verifica = r.motivo_verifica || 'Match parziale — verificare pin'; }
    }
    // salvataggio incrementale (resiliente a interruzioni)
    writeFileSync(DATA, JSON.stringify(records, null, 2), 'utf8');
    await sleep(80); // gentile con l'API
  }
  console.log(`\nFatto: ${ok} ok (${partial} match parziali da verificare) · ${fail} falliti. JSON aggiornato.`);
  console.log('Prossimo passo: rerun import-cantieri-fpm.mjs per portare i lat/lng in DB.');
}

main().catch((e) => { console.error('ERRORE:', e.message); process.exit(1); });

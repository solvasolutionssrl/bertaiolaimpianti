/**
 * Toglie la commessa dimostrativa `BER-DEMO-01` dal tenant vero di Bertaiola.
 *
 * PERCHE' ESISTE: una commessa finta serve mezz'ora, e poi resta. Nell'elenco
 * dell'ufficio, fra le cose da fare dei tecnici, nella campanella di tutti,
 * nei conteggi della scrivania. Il gemello di `crea-commessa-demo.ts` esiste
 * perche' la pulizia non sia una cosa da fare a mano, tabella per tabella,
 * ricordandosi anche degli oggetti su R2 che nessuna schermata mostra.
 *
 * ⚠️ CANCELLA DAL DATABASE DI PRODUZIONE (tenant BER) e dal bucket R2 di
 * produzione. In prova non cancella niente: senza `--apply` elenca riga per
 * riga cosa toglierebbe.
 *
 * COSA TOGLIE
 *   - Gli oggetti su R2: l'originale **e** la miniatura di ogni media.
 *   - Le righe collegate, in ordine di dipendenza: allegati di riunione e di
 *     cosa-da-fare, note, annotazioni sulle foto, riunioni, cose da fare,
 *     file, assegnazioni ai tecnici, tipologie, versioni, etichette, link
 *     pubblici, bozze agganciate.
 *   - Gli avvisi in campanella che citano questa commessa.
 *   - La commessa.
 *   - Il cliente dimostrativo, **ma solo se** non ha altre commesse e le sue
 *     note dicono che e' un dato dimostrativo. Un'anagrafica cancellata non
 *     torna indietro: non si tira a indovinare.
 *
 * COME LA TROVA
 *   Dal `codice_interno` `BER-DEMO-01` sul tenant con sigla `BER`. Mai da un
 *   uuid scritto a mano: un uuid copiato da una sessione di ieri e incollato
 *   oggi e' il modo piu' rapido per cancellare il lavoro di qualcun altro.
 *
 * ⚠️ MOLTE DI QUESTE RIGHE SPARIREBBERO DA SOLE
 *   Quasi tutte le chiavi esterne verso `commesse` sono a cascata: cancellare
 *   la commessa basterebbe. Si cancellano lo stesso, una per una, per due
 *   motivi: perche' il conteggio a schermo dica davvero cosa e' stato tolto, e
 *   perche' gli oggetti su R2 vanno letti **prima** che le righe `file_refs`
 *   spariscano — dopo, le chiavi non le sa piu' nessuno e restano li' a pagare
 *   spazio per sempre.
 *
 * USO
 *   pnpm tsx scripts/demo/togli-commessa-demo.ts            # prova
 *   pnpm tsx scripts/demo/togli-commessa-demo.ts --apply    # cancella davvero
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

import {
  R2StorageProvider,
  getR2ProviderFromTenantConfig,
} from '../../packages/integrations/src/storage/r2';

const QUI = dirname(fileURLToPath(import.meta.url));
const RADICE = resolve(QUI, '../..');
const flag = (n: string) => process.argv.includes(`--${n}`);

/** Gli stessi due valori di `crea-commessa-demo.ts`. */
const SLUG = 'BER';
const CODICE = 'BER-DEMO-01';

/**
 * La prova che il cliente e' finto.
 *
 * ⚠️ Non basta che si chiami «Elena Vallerini»: un'omonima vera, entrata in
 * anagrafica nel frattempo, verrebbe cancellata insieme alla demo. Deve
 * dirlo la riga stessa.
 */
const PROVA_CLIENTE_FINTO = 'Dato dimostrativo creato il 08/10/2026';

function env(): Record<string, string> {
  const raw = readFileSync(resolve(RADICE, 'apps/web/.env.local'), 'utf8');
  const out: Record<string, string> = {};
  for (const riga of raw.split('\n')) {
    if (!riga || riga.startsWith('#') || !riga.includes('=')) continue;
    const i = riga.indexOf('=');
    out[riga.slice(0, i).trim()] = riga
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  return out;
}

async function main() {
  const applica = flag('apply');

  const e = env();
  const url = e['NEXT_PUBLIC_SUPABASE_URL'];
  const key = e['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) {
    console.error('Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local');
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  console.log(
    applica
      ? '\n*** CANCELLO DAVVERO dal tenant di PRODUZIONE BER ***\n'
      : '\n--- PROVA: non cancello niente, né dal database né da R2 (aggiungi --apply) ---\n',
  );

  // ----- 1) Il tenant, sempre per sigla ------------------------------------
  const { data: tenantRaw, error: tErr } = await db
    .from('tenants')
    .select('id, slug, nome, r2_config')
    .eq('slug', SLUG)
    .maybeSingle();
  if (tErr || !tenantRaw) {
    console.error(`Nessuno spazio di lavoro con sigla ${SLUG}: ${tErr?.message ?? 'non trovato'}`);
    process.exit(1);
  }
  const tenant = tenantRaw as unknown as {
    id: string;
    slug: string;
    nome: string;
    r2_config: Record<string, unknown> | null;
  };

  // ----- 2) La commessa, dal codice ----------------------------------------
  const { data: comRaw } = await db
    .from('commesse')
    .select('id, codice_interno, nome_cartella, cliente_id, stato')
    .eq('tenant_id', tenant.id)
    .eq('codice_interno', CODICE)
    .maybeSingle();
  const commessa = comRaw as {
    id: string;
    codice_interno: string;
    nome_cartella: string;
    cliente_id: string;
    stato: string;
  } | null;

  if (!commessa) {
    console.log(`Su ${tenant.nome} (${tenant.slug}) non c'è nessuna commessa ${CODICE}: niente da togliere.\n`);
    return;
  }

  console.log(`Spazio di lavoro: ${tenant.nome} (${tenant.slug})`);
  console.log(`Commessa:         ${commessa.codice_interno} · ${commessa.nome_cartella} · stato «${commessa.stato}»`);
  console.log(`                  ${commessa.id}\n`);

  // ----- 3) I media, PRIMA di cancellare le righe --------------------------
  // ⚠️ Le chiavi R2 vivono solo dentro `file_refs`: lette dopo, non si leggono
  // più, e gli oggetti restano nel bucket senza che niente li nomini.
  const { data: fileRaw, error: fErr } = await db
    .from('file_refs')
    .select('id, filename, mime, size_bytes, r2_key, r2_thumb_key')
    .eq('tenant_id', tenant.id)
    .eq('commessa_id', commessa.id);
  if (fErr) {
    console.error(`Lettura dei media fallita: ${fErr.message}`);
    process.exit(1);
  }
  const files = (fileRaw ?? []) as {
    id: string;
    filename: string | null;
    mime: string | null;
    size_bytes: number | null;
    r2_key: string | null;
    r2_thumb_key: string | null;
  }[];

  const chiaviR2 = files.flatMap((f) => [f.r2_key, f.r2_thumb_key].filter(Boolean) as string[]);

  console.log(`Media collegati: ${files.length} file, ${chiaviR2.length} oggetti su R2`);
  for (const f of files) {
    console.log(`  · ${f.filename ?? f.id}  (${f.mime ?? 'tipo ignoto'}, ${((f.size_bytes ?? 0) / 1024 / 1024).toFixed(1)} MB)`);
    if (f.r2_key) console.log(`      originale  ${f.r2_key}`);
    if (f.r2_thumb_key) console.log(`      anteprima  ${f.r2_thumb_key}`);
  }

  // ----- 4) Gli avvisi in campanella ---------------------------------------
  // Non hanno una chiave esterna verso la commessa: la citano dentro il
  // payload, quindi nessuna cascata li porterebbe via. Restano a far suonare
  // la campanella per un lavoro che non esiste più.
  //
  // Una lettura senza paginazione si ferma a 1000 righe, e qui va bene: gli
  // avvisi di questa commessa sono uno per tecnico, quattordici in tutto.
  const { data: notRaw } = await db
    .from('notifiche')
    .select('id, user_id, type')
    .eq('tenant_id', tenant.id)
    .eq('payload->>commessa_id', commessa.id);
  const notifiche = (notRaw ?? []) as { id: string; user_id: string; type: string }[];
  console.log(`\nAvvisi in campanella che citano questa commessa: ${notifiche.length}`);

  // ----- 5) Le cose da fare e le riunioni, per contarle --------------------
  const { data: todoRaw } = await db
    .from('commessa_todo')
    .select('id, titolo')
    .eq('tenant_id', tenant.id)
    .eq('commessa_id', commessa.id);
  const todo = (todoRaw ?? []) as { id: string; titolo: string }[];

  const { data: riunRaw } = await db
    .from('commessa_riunione' as never)
    .select('id, titolo, data_riunione')
    .eq('tenant_id', tenant.id)
    .eq('commessa_id', commessa.id);
  const riunioni = (riunRaw ?? []) as unknown as {
    id: string;
    titolo: string | null;
    data_riunione: string;
  }[];

  const { data: tecRaw } = await db
    .from('commessa_tecnici')
    .select('user_id')
    .eq('tenant_id', tenant.id)
    .eq('commessa_id', commessa.id);
  const assegnazioni = (tecRaw ?? []).length;

  console.log(`Cose da fare: ${todo.length}`);
  for (const t of todo) console.log(`  · ${t.titolo}`);
  console.log(`Riunioni: ${riunioni.length}`);
  for (const r of riunioni) console.log(`  · ${r.data_riunione} ${r.titolo ?? ''}`);
  console.log(`Assegnazioni a tecnici: ${assegnazioni}`);

  // ----- 6) Il cliente: si tocca solo se è davvero quello finto ------------
  const { data: cliRaw } = await db
    .from('clienti')
    .select('id, ragione_sociale, note')
    .eq('id', commessa.cliente_id)
    .maybeSingle();
  const cliente = cliRaw as { id: string; ragione_sociale: string; note: string | null } | null;

  const { count: altreCommesse } = await db
    .from('commesse')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)
    .eq('cliente_id', commessa.cliente_id)
    .neq('id', commessa.id);

  const eFinto = (cliente?.note ?? '').includes(PROVA_CLIENTE_FINTO);
  const clienteDaTogliere = Boolean(cliente) && eFinto && (altreCommesse ?? 0) === 0;

  console.log(`\nCliente: ${cliente?.ragione_sociale ?? '(non trovato)'}`);
  if (!cliente) {
    console.log('  → niente da fare: la commessa punta a un cliente che non c’è più.');
  } else if (!eFinto) {
    console.log('  → NON lo tolgo: le sue note non dicono che è un dato dimostrativo.');
  } else if ((altreCommesse ?? 0) > 0) {
    console.log(`  → NON lo tolgo: ha altre ${altreCommesse} commesse.`);
  } else {
    console.log('  → lo tolgo: è marcato come dimostrativo e non ha altre commesse.');
  }

  if (!applica) {
    console.log('\n--- Fine della prova: non è stato cancellato niente. Rilancia con --apply. ---\n');
    return;
  }

  // ----- 7) R2 prima di tutto ----------------------------------------------
  // Se la cancellazione su R2 fallisce ci si ferma: le righe restano, e con
  // loro le chiavi, quindi si può riprovare. Al contrario — righe via, oggetti
  // rimasti — non si recupera più niente.
  console.log('\nTolgo gli oggetti da R2:');
  const r2 =
    getR2ProviderFromTenantConfig(tenant.r2_config) ??
    (e['R2_ACCOUNT_ID'] && e['R2_BUCKET'] && e['R2_ACCESS_KEY_ID'] && e['R2_SECRET_ACCESS_KEY']
      ? new R2StorageProvider({
          accountId: e['R2_ACCOUNT_ID']!,
          bucket: e['R2_BUCKET']!,
          accessKeyId: e['R2_ACCESS_KEY_ID']!,
          secretAccessKey: e['R2_SECRET_ACCESS_KEY']!,
          endpoint: e['R2_ENDPOINT'],
        })
      : null);

  if (chiaviR2.length === 0) {
    console.log('  (nessun oggetto)');
  } else if (!r2) {
    console.error('  ✗ R2 non configurato: mi fermo, altrimenti resterebbero oggetti senza nessuno che li nomina.\n');
    process.exit(1);
  } else {
    for (const k of chiaviR2) {
      try {
        await r2.delete(k);
        console.log(`  ✓ ${k}`);
      } catch (err) {
        console.error(`  ✗ ${k}: ${err instanceof Error ? err.message : 'errore'}`);
        console.error('\n  Mi fermo qui: le righe del database restano, così si può riprovare.\n');
        process.exit(1);
      }
    }
  }

  // ----- 8) Le righe, in ordine di dipendenza ------------------------------
  // L'ordine è quello di `scripts/reset-tenant-data.mjs`: prima ciò che punta
  // ai file e alle riunioni, poi i file, poi la commessa, poi il cliente (che
  // la commessa trattiene con un vincolo RESTRICT, non a cascata).
  console.log('\nTolgo le righe:');

  const fileIds = files.map((f) => f.id);
  const riunioneIds = riunioni.map((r) => r.id);
  const todoIds = todo.map((t) => t.id);

  /** Esito di una cancellazione, al netto dei tipi generati che qui non servono. */
  type Esito = PromiseLike<{ count: number | null; error: { message: string } | null }>;

  async function cancella(
    tabella: string,
    colonna: string,
    valori: string[] | string,
    etichetta: string,
  ) {
    // Un elenco vuoto non si manda a PostgREST: `in.()` è una condizione che
    // non seleziona niente, ma è pur sempre una DELETE spedita in produzione.
    if (Array.isArray(valori) && valori.length === 0) {
      console.log(`  — ${etichetta}: niente`);
      return;
    }
    const q = db.from(tabella as never).delete({ count: 'exact' }) as unknown as {
      in: (c: string, v: string[]) => Esito;
      eq: (c: string, v: string) => Esito;
    };
    const { count, error } = await (Array.isArray(valori)
      ? q.in(colonna, valori)
      : q.eq(colonna, valori));
    if (error) {
      console.error(`  ✗ ${etichetta}: ${error.message}`);
      process.exit(1);
    }
    console.log(`  ✓ ${etichetta}: ${count ?? 0} righe`);
  }

  await cancella('commessa_riunione_allegato', 'riunione_id', riunioneIds, 'allegati delle riunioni');
  await cancella('commessa_todo_allegato', 'todo_id', todoIds, 'allegati delle cose da fare');
  await cancella('commessa_todo_nota', 'todo_id', todoIds, 'note delle cose da fare');
  await cancella('file_annotations', 'file_ref_id', fileIds, 'annotazioni sulle foto');
  await cancella('commessa_riunione', 'commessa_id', commessa.id, 'riunioni');
  await cancella('commessa_todo', 'commessa_id', commessa.id, 'cose da fare');
  await cancella('file_refs', 'commessa_id', commessa.id, 'media');
  await cancella('commessa_tecnici', 'commessa_id', commessa.id, 'assegnazioni ai tecnici');
  await cancella('commessa_voci', 'commessa_id', commessa.id, 'tipologie');
  await cancella('commessa_versioni', 'commessa_id', commessa.id, 'versioni');
  await cancella('commessa_tags', 'commessa_id', commessa.id, 'etichette');
  await cancella('commessa_link_pubblici', 'commessa_id', commessa.id, 'link pubblici');
  await cancella('contatto_cliente', 'commessa_id', commessa.id, 'referenti di cantiere');
  await cancella('commessa_bozze', 'commessa_id', commessa.id, 'bozze agganciate');
  await cancella(
    'notifiche',
    'id',
    notifiche.map((n) => n.id),
    'avvisi in campanella',
  );
  await cancella('commesse', 'id', commessa.id, 'la commessa');

  if (clienteDaTogliere) {
    await cancella('clienti', 'id', commessa.cliente_id, 'il cliente dimostrativo');
  } else {
    console.log('  — il cliente: lasciato dov’è (vedi sopra il motivo)');
  }

  console.log(`\n✅ Fatto. Di ${CODICE} su ${tenant.nome} non resta niente.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

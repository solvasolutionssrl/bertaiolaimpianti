/**
 * scripts/rename-legacy-commesse.ts
 *
 * Migrazione one-shot: rinomina cartelle commesse nel formato legacy
 *   <cognome>_<YYYY-MM-DD>_<descrizione>
 * verso il nuovo formato canonico
 *   <codice_interno>_<cliente>_<descrizione>
 *
 * Operazioni per ogni commessa:
 *   1. Legge cliente.ragione_sociale + cliente.tipo per costruire segCliente
 *   2. Calcola nuovo nome cartella `${codice}_${segCliente}_${segDesc}`
 *   3. Se il vecchio `cloud_folder_path` differisce dal nuovo:
 *      - WebDAV MOVE su Nextcloud (best-effort, skip se non trovato)
 *   4. UPDATE commesse SET nome_cartella, cloud_folder_path
 *   5. INSERT audit_events action='platform.folder.renamed'
 *
 * Uso:
 *   pnpm tsx scripts/rename-legacy-commesse.ts --tenant=BER --dry-run
 *   pnpm tsx scripts/rename-legacy-commesse.ts --tenant=BER
 *
 * Credenziali: lette da apps/web/.env.local
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// ---------- Helpers ----------------------------------------------------

function loadEnv(): Record<string, string> {
  const envPath = path.resolve(__dirname, '..', 'apps', 'web', '.env.local');
  if (!fs.existsSync(envPath)) {
    throw new Error(`File env non trovato: ${envPath}`);
  }
  const text = fs.readFileSync(envPath, 'utf8');
  const env: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    env[m[1]] = m[2].trim();
  }
  return env;
}

function sanitize(input: string, max = 40): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '')
    .slice(0, max);
}

interface Args {
  tenant: string;
  dryRun: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const a: Args = { tenant: 'BER', dryRun: false };
  for (const x of args) {
    if (x === '--dry-run') a.dryRun = true;
    else if (x.startsWith('--tenant=')) a.tenant = x.slice('--tenant='.length);
  }
  return a;
}

// ---------- WebDAV --------------------------------------------------------

interface NextcloudCfg {
  baseUrl: string;
  user: string;
  appPassword: string;
}

function webdavUrl(cfg: NextcloudCfg, relPath: string): string {
  const clean = relPath.replace(/^\/+|\/+$/g, '');
  return `${cfg.baseUrl.replace(/\/+$/, '')}/remote.php/dav/files/${cfg.user}/${clean}`;
}

function authHeader(cfg: NextcloudCfg): string {
  return (
    'Basic ' + Buffer.from(`${cfg.user}:${cfg.appPassword}`).toString('base64')
  );
}

async function webdavMove(
  cfg: NextcloudCfg,
  fromPath: string,
  toPath: string,
): Promise<{ ok: boolean; status: number; reason?: string }> {
  const res = await fetch(webdavUrl(cfg, fromPath), {
    method: 'MOVE',
    headers: {
      Authorization: authHeader(cfg),
      Destination: webdavUrl(cfg, toPath),
      Overwrite: 'F', // non sovrascrivere se esiste già
    },
  });
  return {
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
    reason: !res.ok ? await res.text().catch(() => undefined) : undefined,
  };
}

// ---------- Main --------------------------------------------------------

async function main() {
  const args = parseArgs();
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Manca NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Tenant + storage config
  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .select('id, slug, storage_provider, storage_config')
    .eq('slug', args.tenant)
    .maybeSingle();
  if (tErr) throw tErr;
  if (!tenant) throw new Error(`Tenant ${args.tenant} non trovato`);

  const ncCfg =
    tenant.storage_provider === 'nextcloud'
      ? (tenant.storage_config as NextcloudCfg | null)
      : null;
  if (tenant.storage_provider === 'nextcloud' && ncCfg) {
    console.log(`Storage Nextcloud: ${ncCfg.baseUrl} (user=${ncCfg.user})`);
  } else {
    console.log(`Storage provider: ${tenant.storage_provider} (no WebDAV rename)`);
  }

  // 2) Tutte le commesse del tenant
  const { data: commesse, error: cErr } = await supabase
    .from('commesse')
    .select(
      `id, codice_interno, nome_cartella, cloud_folder_path,
       cliente:cliente_id ( ragione_sociale, tipo )`,
    )
    .eq('tenant_id', tenant.id)
    .order('created_at');
  if (cErr) throw cErr;

  let renamed = 0;
  let skipped = 0;
  let failed = 0;

  for (const c of commesse ?? []) {
    const cli = Array.isArray(c.cliente) ? c.cliente[0] : c.cliente;
    if (!cli) {
      console.warn(`⚠ ${c.codice_interno}: cliente mancante, skip`);
      skipped++;
      continue;
    }
    const ragione = cli.ragione_sociale as string;
    const segCliente = sanitize(ragione) || 'Cliente';

    // Recupera descrizione dalla vecchia nome_cartella (terzo segmento)
    // formato legacy: <seg1>_YYYY-MM-DD_<segDesc>
    // formato nuovo: <codice>_<seg1>_<segDesc>
    const old = c.nome_cartella as string;
    let segDesc = '';
    const legacyMatch = old.match(/^.+?_\d{4}-\d{2}-\d{2}_(.+)$/);
    if (legacyMatch) {
      segDesc = legacyMatch[1];
    } else {
      // Forse già nel nuovo formato? skip
      const newMatch = old.match(/^([A-Z]+-\d{2}-\d{3})_/);
      if (newMatch) {
        console.log(`⏭  ${c.codice_interno}: già nel nuovo formato, skip`);
        skipped++;
        continue;
      }
      // Fallback: lascia la vecchia descrizione "Commessa"
      segDesc = 'Commessa';
    }

    const newName = `${c.codice_interno}_${segCliente}_${segDesc}`;
    const newPath = `/${newName}/`;

    if (old === newName) {
      console.log(`✓ ${c.codice_interno}: nome già coerente`);
      skipped++;
      continue;
    }

    console.log(`\n→ ${c.codice_interno}`);
    console.log(`  Da:  ${old}`);
    console.log(`  A:   ${newName}`);

    if (args.dryRun) {
      console.log('  [dry-run] no changes');
      continue;
    }

    // 3) WebDAV MOVE
    if (ncCfg && ncCfg.baseUrl && ncCfg.user && ncCfg.appPassword) {
      const moveRes = await webdavMove(ncCfg, old, newName);
      if (moveRes.ok) {
        console.log(`  ✓ WebDAV MOVE → ${moveRes.status}`);
      } else if (moveRes.status === 404) {
        console.log(`  ⚠ Cartella Nextcloud non trovata (probabilmente mai creata)`);
      } else {
        console.error(
          `  ✗ WebDAV MOVE fallito: ${moveRes.status} ${moveRes.reason?.slice(0, 200)}`,
        );
        failed++;
        continue;
      }
    }

    // 4) UPDATE DB
    const { error: upErr } = await supabase
      .from('commesse')
      .update({
        nome_cartella: newName,
        cloud_folder_path: newPath,
      })
      .eq('id', c.id);
    if (upErr) {
      console.error(`  ✗ UPDATE DB fallito: ${upErr.message}`);
      failed++;
      continue;
    }
    console.log(`  ✓ DB aggiornato`);

    // 5) Audit
    await supabase.from('audit_events').insert({
      tenant_id: tenant.id,
      actor_user_id: null,
      entity_type: 'commessa',
      entity_id: c.id,
      action: 'platform.folder.renamed',
      metadata: {
        platform: true,
        from: old,
        to: newName,
      } as Record<string, unknown>,
    });

    renamed++;
  }

  console.log(
    `\n=== RIEPILOGO ===\n` +
      `  Rinominate: ${renamed}\n` +
      `  Saltate:    ${skipped}\n` +
      `  Fallite:    ${failed}\n` +
      `  Totale:     ${(commesse ?? []).length}`,
  );
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});

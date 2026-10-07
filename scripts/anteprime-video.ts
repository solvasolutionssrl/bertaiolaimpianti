/**
 * Genera le anteprime mancanti dei video, estraendo un fotogramma vero.
 *
 * PERCHE' ESISTE: le miniature le fa `generateAndUploadThumb()` alla fine del
 * caricamento, ma **solo per le immagini** — `sharp` non legge i video. Dal
 * 06/10/2026 il fotogramma lo estrae il telefono all'invio e lo manda a
 * `/api/upload/media/[id]/poster`; tutto quello che era stato caricato prima,
 * e tutto quello che arriva da strade che non passano da quel pezzo di codice
 * (il comando iOS, l'API, una PWA in cache), resta senza.
 *
 * Senza anteprima la galleria chiede `/api/photo/<id>?size=thumb`, riceve 404 e
 * mostra un riquadro grigio. Non e' un difetto che si nota guardando una
 * commessa: si nota quando si manda un collegamento a un cliente e si vedono
 * sei riquadri vuoti.
 *
 * ⚠️ SCRIVE SU R2 E SUL DATABASE DI PRODUZIONE. Dry-run di default.
 *
 * COME FA A NON SCARICARE 400 MB
 *   ffmpeg legge direttamente l'indirizzo firmato di R2 e chiede **intervalli
 *   di byte**: con `-ss` prima di `-i` salta al secondo indicato invece di
 *   decodificare dal principio. Misurato: un fotogramma da un `.mov` di 93 MB
 *   in 1,8 secondi. L'alternativa — scaricare il file intero — sarebbe decine
 *   di gigabyte per l'archivio.
 *
 * ⚠️ NON TOCCA CHI HA GIA' UN'ANTEPRIMA. Rigenerarla non servirebbe a niente e
 * sovrascriverebbe il fotogramma che il telefono ha scelto, che e' migliore:
 * l'ha preso al momento della ripresa, non a un secondo fisso.
 *
 * USO
 *   pnpm tsx scripts/anteprime-video.ts --tenant=BER               # prova
 *   pnpm tsx scripts/anteprime-video.ts --tenant=BER --apply
 *   … --commessa=BER-26-209     # solo una commessa
 *   … --limite=10               # le prime N, per provare
 *   … --secondo=2               # da che punto prendere il fotogramma
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

import {
  R2StorageProvider,
  getR2ProviderFromTenantConfig,
} from '../packages/integrations/src/storage/r2';

const QUI = dirname(fileURLToPath(import.meta.url));
const RADICE = resolve(QUI, '..');
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const flag = (n: string) => process.argv.includes(`--${n}`);

/** Le stesse misure di `_lib/thumbnails.ts`: le anteprime devono essere identiche. */
const LATO = 400;
const QUALITA = 75;

/** Copiata da `_lib/thumbnails.ts`. Vedi la nota in fondo sul perche'. */
function derivaChiaveThumb(r2Key: string, fileRefId: string): string {
  const corto = fileRefId.replace(/-/g, '').slice(0, 8);
  const parti = r2Key.split('/');
  if (parti.length < 2) return `${r2Key}.thumb.webp`;
  return `${parti.slice(0, -1).join('/')}/thumbs/${corto}.webp`;
}

function env() {
  const raw = readFileSync(resolve(RADICE, 'apps/web/.env.local'), 'utf8');
  const leggi = (k: string) =>
    raw
      .split('\n')
      .find((r) => r.startsWith(`${k}=`))
      ?.slice(k.length + 1)
      .trim()
      .replace(/^["']|["']$/g, '') ?? '';
  return {
    url: leggi('NEXT_PUBLIC_SUPABASE_URL'),
    key: leggi('SUPABASE_SERVICE_ROLE_KEY'),
    r2: {
      accountId: leggi('R2_ACCOUNT_ID'),
      bucket: leggi('R2_BUCKET'),
      accessKeyId: leggi('R2_ACCESS_KEY_ID'),
      secretAccessKey: leggi('R2_SECRET_ACCESS_KEY'),
      endpoint: leggi('R2_ENDPOINT') || undefined,
    },
  };
}

/**
 * Un fotogramma, dall'indirizzo firmato, senza scaricare il filmato.
 *
 * ⚠️ `-ss` va **prima** di `-i`: dopo, ffmpeg decodifica dall'inizio fino al
 * punto indicato, cioe' scarica tutto. Prima, salta con una richiesta di
 * intervallo. La differenza fra 1,8 secondi e diversi minuti.
 */
function fotogramma(url: string, secondo: number, dove: string): Buffer | string {
  const esito = spawnSync(
    'ffmpeg',
    ['-y', '-ss', String(secondo), '-i', url, '-frames:v', '1', '-q:v', '3', dove],
    { stdio: ['ignore', 'ignore', 'pipe'], timeout: 180_000 },
  );
  if (esito.status !== 0 || !statSync(dove, { throwIfNoEntry: false })?.size) {
    const coda = String(esito.stderr ?? '').trim().split('\n').slice(-2).join(' ');
    return coda || `ffmpeg esito ${esito.status}`;
  }
  return readFileSync(dove);
}

async function main() {
  const slug = (arg('tenant') ?? '').toUpperCase();
  const codice = arg('commessa');
  const limite = Number(arg('limite') ?? 500);
  const secondo = Number(arg('secondo') ?? 1);
  const applica = flag('apply');

  if (!slug) {
    console.error('Uso: --tenant=SIGLA [--commessa=CODICE] [--limite=N] [--secondo=N] [--apply]');
    process.exit(1);
  }
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
    console.error('Serve ffmpeg nel PATH (brew install ffmpeg).');
    process.exit(1);
  }

  const e = env();
  const db = createClient(e.url, e.key, { auth: { persistSession: false } });

  const { data: tRaw } = await db
    .from('tenants')
    .select('id, slug, nome, r2_config')
    .eq('slug', slug)
    .maybeSingle();
  if (!tRaw) {
    console.error(`Nessuno spazio di lavoro con sigla ${slug}.`);
    process.exit(1);
  }
  const tenant = tRaw as unknown as {
    id: string;
    slug: string;
    nome: string;
    r2_config: Record<string, unknown> | null;
  };

  const r2 =
    getR2ProviderFromTenantConfig(tenant.r2_config) ??
    (e.r2.accountId && e.r2.bucket
      ? new R2StorageProvider(e.r2)
      : null);
  if (!r2) {
    console.error('R2 non configurato: ne' + '́ sul tenant né in env.');
    process.exit(1);
  }

  let commessaId: string | null = null;
  if (codice) {
    const { data } = await db
      .from('commesse')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('codice_interno', codice)
      .maybeSingle();
    if (!data) {
      console.error(`Nessuna commessa ${codice} su ${slug}.`);
      process.exit(1);
    }
    commessaId = (data as { id: string }).id;
  }

  let q = db
    .from('file_refs')
    .select('id, filename, mime, size_bytes, r2_key, commessa_id')
    .eq('tenant_id', tenant.id)
    .like('mime', 'video/%')
    .is('r2_thumb_key', null)
    .is('deleted_at', null)
    .not('r2_key', 'is', null)
    // Fuori i caricamenti a metà e i falliti: non c'è un filmato da cui
    // prendere un fotogramma.
    .in('status', ['uploaded', 'syncing', 'synced'])
    .order('size_bytes', { ascending: true })
    .limit(limite);
  if (commessaId) q = q.eq('commessa_id', commessaId);

  const { data: righe, error } = await q;
  if (error) {
    console.error(`Lettura fallita: ${error.message}`);
    process.exit(1);
  }
  const video = (righe ?? []) as unknown as Array<{
    id: string;
    filename: string;
    mime: string;
    size_bytes: number;
    r2_key: string;
  }>;

  console.log(`\n${tenant.nome} (${tenant.slug})${codice ? ` · commessa ${codice}` : ''}`);
  console.log(`Video senza anteprima: ${video.length}`);
  console.log(`Fotogramma preso al secondo ${secondo}`);
  console.log(applica ? '\n*** APPLICO ***\n' : '\n--- PROVA, non scrivo niente (aggiungi --apply) ---\n');

  const cartella = mkdtempSync(join(tmpdir(), 'anteprime-'));
  let fatte = 0;
  let falliti = 0;

  for (const v of video) {
    const mb = (v.size_bytes / 1024 / 1024).toFixed(0).padStart(4);
    const etichetta = `${v.filename.padEnd(32)} ${mb} MB`;
    if (!applica) {
      console.log(`  + ${etichetta}  →  ${derivaChiaveThumb(v.r2_key, v.id)}`);
      continue;
    }

    const t0 = Date.now();
    const grezzo = join(cartella, `${v.id}.jpg`);
    const { url } = await r2.createPresignedGetUrl(v.r2_key, { ttlSec: 900 });
    const fg = fotogramma(url, secondo, grezzo);
    if (typeof fg === 'string') {
      console.log(`  ✗ ${etichetta}  ${fg}`);
      falliti += 1;
      continue;
    }

    try {
      const thumb = await sharp(fg, { failOn: 'none' })
        .rotate()
        .resize(LATO, LATO, { fit: 'cover', position: 'centre' })
        .webp({ quality: QUALITA })
        .toBuffer();
      const chiave = derivaChiaveThumb(v.r2_key, v.id);
      await r2.putObject(chiave, thumb, 'image/webp');

      // ⚠️ Il database si aggiorna DOPO che l'oggetto è su R2: nell'ordine
      // inverso, un errore di caricamento lascerebbe una riga che promette
      // un'anteprima che non esiste — e la galleria chiederebbe un file
      // mancante invece di ripiegare sul segnaposto.
      const { error: uErr } = await db
        .from('file_refs')
        .update({ r2_thumb_key: chiave } as never)
        .eq('id', v.id);
      if (uErr) throw new Error(uErr.message);

      console.log(
        `  ✓ ${etichetta}  ${(thumb.length / 1024).toFixed(0)} KB  ${((Date.now() - t0) / 1000).toFixed(1)}s`,
      );
      fatte += 1;
    } catch (err) {
      console.log(`  ✗ ${etichetta}  ${err instanceof Error ? err.message : 'errore'}`);
      falliti += 1;
    } finally {
      try {
        unlinkSync(grezzo);
      } catch {
        /* il file temporaneo può già non esserci */
      }
    }
  }

  console.log(
    applica
      ? `\nFatto: ${fatte} anteprime create, ${falliti} non riuscite.`
      : `\nSarebbero ${video.length} anteprime da creare.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

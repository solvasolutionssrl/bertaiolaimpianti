/**
 * One-time script: configura le regole CORS sul bucket R2 per permettere
 * il PUT diretto da browser (upload foto/video dalla PWA e dall'ufficio).
 *
 * Senza CORS configurato sul bucket, l'XHR diretto da browser fallisce con
 * "R2 PUT network error" (il browser blocca la preflight OPTIONS e l'errore
 * non espone status HTTP — appare come network error).
 *
 * Uso:
 *   npx tsx scripts/setup-r2-cors.ts
 *
 * Richiede le variabili d'ambiente R2_ACCOUNT_ID, R2_BUCKET,
 * R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (stesse di .env.local).
 */

import {
  S3Client,
  PutBucketCorsCommand,
  GetBucketCorsCommand,
} from '@aws-sdk/client-s3';
import 'dotenv/config';

const accountId = process.env.R2_ACCOUNT_ID;
const bucket = process.env.R2_BUCKET;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const endpoint = process.env.R2_ENDPOINT;

if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
  console.error(
    'Variabili mancanti: R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY',
  );
  process.exit(1);
}

const client = new S3Client({
  region: 'auto',
  endpoint: endpoint ?? `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: false,
});

const CORS_RULES = [
  {
    // Origini di produzione + sviluppo locale
    AllowedOrigins: [
      'https://kommessa.it',
      'https://www.kommessa.it',
      'https://bertaiolaimpianti.vercel.app',
      // Preview Vercel (pattern wildcard non supportato da R2 — aggiungere
      // i domini preview specifici se necessario)
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://m.localhost:3000',
    ],
    AllowedMethods: ['PUT', 'GET', 'HEAD'],
    AllowedHeaders: [
      'Content-Type',
      'Content-Length',
      'Content-MD5',
      'x-amz-content-sha256',
      'x-amz-date',
      'Authorization',
    ],
    // ETag deve essere esposto: serve per multipart (ogni part restituisce ETag)
    ExposeHeaders: ['ETag'],
    MaxAgeSeconds: 3600,
  },
];

async function main() {
  console.log(`Bucket: ${bucket}`);

  // Leggi la config attuale (se esiste)
  try {
    const current = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
    console.log(
      'CORS attuale:',
      JSON.stringify(current.CORSRules, null, 2),
    );
  } catch (e: any) {
    if (e?.name === 'NoSuchCORSConfiguration') {
      console.log('Nessuna config CORS attuale — verrà creata.');
    } else {
      console.warn('Impossibile leggere config attuale:', e.message);
    }
  }

  // Applica le nuove regole
  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: { CORSRules: CORS_RULES },
    }),
  );

  console.log('✓ CORS configurato correttamente.');
  console.log('Regole applicate:', JSON.stringify(CORS_RULES, null, 2));
}

main().catch((e) => {
  console.error('Errore:', e);
  process.exit(1);
});

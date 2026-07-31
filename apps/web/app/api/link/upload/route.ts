import { type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createHash, randomUUID } from 'node:crypto';
import { waitUntil } from '@vercel/functions';

import { createServiceSupabase } from '@kommessa/api/service';
import {
  buildR2Key,
  getR2ProviderFromEnv,
  getR2ProviderFromTenantConfig,
} from '@kommessa/integrations/storage';

import { autenticaToken } from '../../../_lib/api-token';
import { etichettaCommessa } from '../../../_lib/link-etichetta';
import { generateAndUploadThumb } from '../../../_lib/thumbnails';
import { syncOneFile } from '../../../_lib/sync-r2-to-nextcloud';

export const maxDuration = 300;

/**
 * POST /api/link/upload — uno o più file in `multipart/form-data`.
 *
 * È l'ingresso del comando iOS "Carica su Kommessa" (menu Condividi dell'app
 * Foto). A differenza degli upload dell'app, qui il client non puo' fare il
 * giro init → PUT su R2 → complete: gli Shortcut sanno solo mandare un form.
 * Quindi il byte-shovelling lo fa il server, ma **la pipeline a valle e' la
 * stessa** — stessa chiave R2, stessa riga `file_refs`, stessa thumbnail,
 * stessa sync su Nextcloud. Un file arrivato da qui e' indistinguibile da uno
 * caricato dall'app.
 *
 * Campi del form:
 *   commessaId  (uuid)  — destinazione
 *   file        (blob)  — ripetibile: tutta la selezione in una richiesta
 *
 * Vedi `documentazione_generale/08_LOGICHE/Logiche_Upload_Media.md`.
 */

/** Oltre questa soglia il buffer in memoria su Vercel diventa imprudente. */
const MAX_BYTES = 200 * 1024 * 1024;

interface RigaCommessa {
  id: string;
  codice_interno: string | null;
  nome_cartella: string | null;
  cloud_folder_path: string | null;
}

export async function POST(request: NextRequest) {
  const ctx = await autenticaToken(request, 'upload');
  if (!ctx) {
    return Response.json(
      {
        error: 'Token non valido',
        messaggio: 'Token non valido: controlla la prima azione del comando.',
      },
      { status: 401 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: 'Form non valido' }, { status: 400 });
  }

  const commessaId = String(form.get('commessaId') ?? '').trim();
  // Lo Shortcut manda l'ETICHETTA scelta, non l'id: far scegliere fra stringhe
  // e' l'unico modo per avere una lista leggibile su iOS. La si ri-risolve qui.
  const etichetta = String(form.get('etichetta') ?? '').trim();
  // Il campo `file` puo' ripetersi: lo Shortcut manda l'intera selezione in una
  // richiesta sola, così il comando iOS non ha bisogno di un ciclo (meno azioni
  // = meno cose che si rompono a un aggiornamento di iOS).
  const files = form
    .getAll('file')
    .filter((f): f is File => f instanceof File && f.size > 0);
  // Errori DISTINTI: "commessa o file mancante" non dice quale dei due, e sul
  // telefono non c'e' altro modo di capirlo. Si riporta anche cosa e' arrivato.
  if (!commessaId && !etichetta) {
    const campi = [...form.keys()].join(', ') || 'nessuno';
    return Response.json(
      {
        error: 'commessaId/etichetta mancante',
        messaggio: `Non ho ricevuto la commessa. Campi arrivati: ${campi}.`,
      },
      { status: 400 },
    );
  }
  if (files.length === 0) {
    const campi = [...form.keys()].join(', ') || 'nessuno';
    const nonFile = form.getAll('file').length;
    return Response.json(
      {
        error: 'nessun file',
        messaggio:
          `Commessa ok, ma non ho ricevuto nessun file. ` +
          `Campi arrivati: ${campi}` +
          (nonFile > 0 ? ` — «file» c'era ma non come allegato.` : '.'),
      },
      { status: 400 },
    );
  }
  const totale = files.reduce((acc, f) => acc + f.size, 0);
  if (totale > MAX_BYTES) {
    return Response.json(
      {
        error: `Selezione troppo grande (${Math.round(totale / 1024 / 1024)} MB, max ${Math.round(MAX_BYTES / 1024 / 1024)} MB). Manda meno file per volta.`,
      },
      { status: 413 },
    );
  }

  const service = createServiceSupabase();

  // La commessa deve essere DI QUESTO tenant: il token non e' un lasciapassare
  // per l'intero database. Lo scoping esplicito e' la difesa, non la RLS
  // (qui giriamo con service role, che la bypassa).
  let commessa: RigaCommessa | null = null;
  if (commessaId) {
    const { data } = await service
      .from('commesse')
      .select('id, codice_interno, nome_cartella, cloud_folder_path')
      .eq('id', commessaId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();
    commessa = data as unknown as RigaCommessa | null;
  } else {
    // Risoluzione per etichetta: si ricostruiscono le stesse etichette di
    // /api/link/commesse e si cerca la corrispondenza esatta.
    commessa = await risolviPerEtichetta(service, ctx.tenantId, etichetta);
  }
  if (!commessa) {
    return Response.json(
      { error: 'Commessa non trovata', messaggio: 'Commessa non trovata.' },
      { status: 404 },
    );
  }
  if (!commessa.cloud_folder_path) {
    return Response.json(
      { error: 'Commessa senza cartella cloud' },
      { status: 409 },
    );
  }

  const { data: tenantRow } = await service
    .from('tenants')
    .select('slug, r2_config, storage_provider')
    .eq('id', ctx.tenantId)
    .maybeSingle();

  const r2 =
    getR2ProviderFromTenantConfig(
      (tenantRow?.r2_config as Record<string, unknown> | null) ?? null,
    ) ?? getR2ProviderFromEnv();
  if (!r2) {
    return Response.json({ error: 'R2 non configurato' }, { status: 503 });
  }

  const caricati: string[] = [];
  const duplicati: string[] = [];
  const falliti: Array<{ nome: string; errore: string }> = [];

  for (const file of files) {
    const esito = await caricaUnFile({
      file,
      ctx,
      commessa,
      tenantSlug: (tenantRow?.slug as string | undefined) ?? null,
      r2,
      service,
      storageProvider: (tenantRow?.storage_provider as string | undefined) ?? null,
    });
    if (esito.stato === 'ok') caricati.push(esito.fileRefId);
    else if (esito.stato === 'duplicato') duplicati.push(esito.fileRefId);
    else falliti.push({ nome: file.name, errore: esito.errore });
  }

  revalidatePath(`/office/commesse/${commessa.id}`);
  revalidatePath(`/mobile/commessa/${commessa.id}`);

  // Il comando iOS mostra `messaggio` nella notifica finale: una frase pronta,
  // così non deve comporla lui con la logica limitata degli Shortcut.
  const parti = [`${caricati.length} caricati`];
  if (duplicati.length > 0) parti.push(`${duplicati.length} già presenti`);
  if (falliti.length > 0) parti.push(`${falliti.length} falliti`);

  return Response.json({
    ok: falliti.length === 0,
    caricati: caricati.length,
    duplicati: duplicati.length,
    falliti,
    messaggio: parti.join(' · '),
  });
}

/**
 * Ritrova la commessa dall'etichetta scelta nella lista dello Shortcut.
 * Le etichette sono generate da `/api/link/commesse` come "titolo · cliente"
 * (con il codice in coda se ambigue): qui si ricompone lo stesso testo e si
 * cerca l'unica corrispondenza esatta.
 */
async function risolviPerEtichetta(
  service: ReturnType<typeof createServiceSupabase>,
  tenantId: string,
  etichetta: string,
): Promise<RigaCommessa | null> {
  const { data } = await service
    .from('commesse')
    .select(
      'id, codice_interno, nome_cartella, cloud_folder_path, descrizione_ai_finale, descrizione_ai_proposta, note_iniziali, cliente:clienti(ragione_sociale)',
    )
    .eq('tenant_id', tenantId)
    .not('stato', 'in', '(archiviata,completata)')
    .order('updated_at', { ascending: false })
    .limit(300);

  for (const r of (data ?? []) as unknown as Array<
    RigaCommessa & {
      descrizione_ai_finale: string | null;
      descrizione_ai_proposta: string | null;
      note_iniziali: string | null;
      cliente: { ragione_sociale: string | null } | { ragione_sociale: string | null }[] | null;
    }
  >) {
    const cliente = Array.isArray(r.cliente) ? r.cliente[0] : r.cliente;
    const etichettaRiga = etichettaCommessa({
      codice_interno: r.codice_interno,
      nome_cartella: r.nome_cartella,
      descrizione_ai_finale: r.descrizione_ai_finale,
      descrizione_ai_proposta: r.descrizione_ai_proposta,
      note_iniziali: r.note_iniziali,
      clienteNome: cliente?.ragione_sociale ?? null,
    });
    if (etichettaRiga === etichetta) {
      return {
        id: r.id,
        codice_interno: r.codice_interno,
        nome_cartella: r.nome_cartella,
        cloud_folder_path: r.cloud_folder_path,
      };
    }
  }
  return null;
}

type EsitoFile =
  | { stato: 'ok'; fileRefId: string }
  | { stato: 'duplicato'; fileRefId: string }
  | { stato: 'errore'; errore: string };

/** Un singolo file: chiave R2, riga file_refs, PUT, miniatura, sync. */
async function caricaUnFile(input: {
  file: File;
  ctx: { tenantId: string; userId: string; tokenId: string };
  commessa: RigaCommessa;
  tenantSlug: string | null;
  r2: NonNullable<ReturnType<typeof getR2ProviderFromEnv>>;
  service: ReturnType<typeof createServiceSupabase>;
  storageProvider: string | null;
}): Promise<EsitoFile> {
  const { file, ctx, commessa, tenantSlug, r2, service, storageProvider } = input;

  const buffer = new Uint8Array(await file.arrayBuffer());
  const mime = file.type || 'application/octet-stream';

  // Nome file: stessa convenzione dell'app (timestamp + casuale), così i
  // file restano ordinabili e non collidono mai.
  const ts = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}` +
    `_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
  const estensione =
    /\.[a-zA-Z0-9]+$/.exec(file.name ?? '')?.[0]?.toLowerCase() ??
    (mime.startsWith('video/') ? '.mov' : mime === 'image/png' ? '.png' : '.jpg');
  const filename = `${stamp}_${randomUUID().slice(0, 6)}${estensione}`;

  const radice = (commessa.cloud_folder_path ?? '').replace(/^\/+|\/+$/g, '');
  const nextcloudPath = `${radice}/Foto/Sopralluogo/${filename}`;

  const fileRefId = randomUUID();
  const r2Key = buildR2Key({
    tenantId: ctx.tenantId,
    commessaId: commessa.id,
    fileRefId,
    filename,
    tenantSlug,
    codiceInterno: commessa.codice_interno,
    nomeCartella: commessa.nome_cartella,
    sectionLabel: 'media',
  });

  // Dedup: se lo stesso file e' già su questa commessa non lo riscriviamo.
  // Serve ai rilanci del comando (rete che cade a metà selezione) — senza
  // questo un secondo tentativo creerebbe doppioni.
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const { data: giaPresente } = await service
    .from('file_refs')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('commessa_id', commessa.id)
    .eq('sha256', sha256)
    .is('deleted_at', null)
    .maybeSingle();
  if (giaPresente) {
    return { stato: 'duplicato', fileRefId: (giaPresente as { id: string }).id };
  }

  const { error: insErr } = await service.from('file_refs').insert({
    id: fileRefId,
    tenant_id: ctx.tenantId,
    commessa_id: commessa.id,
    voce_id: null,
    momento: 'sopralluogo',
    path: nextcloudPath,
    filename,
    mime,
    size_bytes: buffer.byteLength,
    uploaded_by: ctx.userId,
    taken_at: ts.toISOString(),
    status: 'uploading',
    r2_key: r2Key,
  } as never);
  if (insErr) return { stato: 'errore', errore: insErr.message };

  try {
    await r2.putObject(r2Key, buffer, mime);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    await service
      .from('file_refs')
      .update({ status: 'failed', last_sync_error: msg } as never)
      .eq('id', fileRefId);
    return { stato: 'errore', errore: msg };
  }

  await service
    .from('file_refs')
    .update({
      status: 'uploaded',
      size_bytes: buffer.byteLength,
      sha256,
      last_sync_error: null,
    } as never)
    .eq('id', fileRefId);

  await service.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: 'api_token',
    entity_type: 'file_ref',
    entity_id: fileRefId,
    action: 'media.upload.link',
    metadata: {
      commessa_id: commessa.id,
      token_id: ctx.tokenId,
      r2_key: r2Key,
      size_bytes: buffer.byteLength,
      mime,
      via: 'shortcut_ios',
    },
  } as never);

  // Stessa coda di lavori dell'upload da app: miniatura su R2 e clone su
  // Nextcloud. `waitUntil` li tiene vivi dopo la Response (senza, su Vercel
  // la function viene congelata e i task si perdono).
  if (mime.startsWith('image/')) {
    waitUntil(generateAndUploadThumb(ctx.tenantId, fileRefId).catch(() => {}));
  }
  if (storageProvider !== 'r2') {
    waitUntil(syncOneFile(fileRefId).catch(() => {}));
  }

  return { stato: 'ok', fileRefId };
}

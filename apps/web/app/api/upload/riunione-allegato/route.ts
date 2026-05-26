import { type NextRequest } from 'next/server';

import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import {
  getStorageProvider,
  type StorageProviderName,
} from '@kommessa/integrations/storage';

/**
 * POST /api/upload/riunione-allegato
 *
 * Query params:
 *   - commessaId (uuid, required)
 *   - riunioneId (uuid, required)
 *   - kind ('foto' | 'pdf_acquisito', required)
 *   - data (YYYY-MM-DD, optional → default oggi locale)
 *   - titolo (string, optional)
 *
 * Body: multipart/form-data con field `file`.
 *
 * Salva il file su Nextcloud in:
 *   <commessa-root>/Riunioni/<YYYY-MM-DD>[_<titolo-slug>]/<filename>
 *
 * La cartella `Riunioni/` viene creata on-demand (idempotent). La
 * sotto-cartella per data/titolo viene creata alla prima riunione di
 * quel giorno.
 *
 * Inserisce un record in `file_refs` + uno in `commessa_riunione_allegato`.
 *
 * Permessi: admin / office (gli unici che possono creare riunioni).
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // 1. Auth
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return Response.json({ error: 'Non autenticato' }, { status: 401 });
  }
  if (ctx.role !== 'admin' && ctx.role !== 'office') {
    return Response.json(
      { error: 'Solo admin/office possono caricare allegati riunione' },
      { status: 403 },
    );
  }

  // 2. Params
  const { searchParams } = new URL(request.url);
  const commessaId = searchParams.get('commessaId');
  const riunioneId = searchParams.get('riunioneId');
  const kind = searchParams.get('kind');
  if (!commessaId || !riunioneId || !kind) {
    return Response.json(
      { error: 'commessaId, riunioneId, kind obbligatori' },
      { status: 400 },
    );
  }
  if (kind !== 'foto' && kind !== 'pdf_acquisito') {
    return Response.json({ error: `kind non valido: ${kind}` }, { status: 400 });
  }
  const dataParam = searchParams.get('data');
  const titoloParam = searchParams.get('titolo') ?? '';

  // 3. Validate riunione + commessa
  const service = createServiceSupabase();
  const supabase = createServerSupabase();

  const { data: riu } = await service
    .from('commessa_riunione' as never)
    .select('id, commessa_id, data_riunione, titolo, tenant_id')
    .eq('id', riunioneId)
    .maybeSingle();
  if (!riu) {
    return Response.json({ error: 'Riunione non trovata' }, { status: 404 });
  }
  const riuRow = riu as {
    id: string;
    commessa_id: string;
    data_riunione: string;
    titolo: string | null;
    tenant_id: string;
  };
  if (riuRow.commessa_id !== commessaId) {
    return Response.json({ error: 'Mismatch commessa/riunione' }, { status: 400 });
  }
  if (riuRow.tenant_id !== ctx.tenantId) {
    return Response.json({ error: 'Riunione di un altro tenant' }, { status: 403 });
  }

  const { data: com } = await service
    .from('commesse')
    .select('id, nome_cartella, cloud_folder_path, tenant_id')
    .eq('id', commessaId)
    .maybeSingle();
  if (!com || !com.cloud_folder_path) {
    return Response.json({ error: 'Commessa o cartella non disponibile' }, { status: 404 });
  }

  // 4. Body file
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof Blob)) {
    return Response.json({ error: 'File mancante' }, { status: 400 });
  }
  // Nome file: deriva da File.name se disponibile, altrimenti fallback
  const filename =
    (file as File).name && (file as File).name.trim().length > 0
      ? sanitizeFilename((file as File).name)
      : `riunione_${kind}_${Date.now()}${kind === 'pdf_acquisito' ? '.pdf' : '.jpg'}`;
  const mime = file.type || (kind === 'pdf_acquisito' ? 'application/pdf' : 'image/jpeg');

  // 5. Tenant storage config
  const { data: tenant } = await service
    .from('tenants')
    .select('storage_provider, storage_config')
    .eq('id', ctx.tenantId)
    .maybeSingle();
  const providerName = (tenant?.storage_provider as StorageProviderName) ?? 'supabase';
  const cfg = (tenant?.storage_config as Record<string, string> | null) ?? {};

  // 6. Costruisce path destinazione
  // <commessa-root-sanza-slash>/Riunioni/<YYYY-MM-DD>[_<titolo-slug>]/<filename>
  const data = (dataParam || riuRow.data_riunione || todayLocal()).replace(/[^0-9-]/g, '');
  const titoloSrc = titoloParam || riuRow.titolo || '';
  const titoloSlug = slugify(titoloSrc).slice(0, 60);
  const subfolder = titoloSlug ? `${data}_${titoloSlug}` : data;
  const commessaRoot = (com.cloud_folder_path ?? '').replace(/^\/+|\/+$/g, '');
  const riunioneFolder = `${commessaRoot}/Riunioni/${subfolder}`;
  const fullPath = `${riunioneFolder}/${filename}`;

  // 7. Upload
  let uploadedSize = 0;
  try {
    const provider = getStorageProvider({
      provider: providerName,
      bucket: cfg.bucket ?? 'commesse',
      baseUrl: cfg.baseUrl,
      user: cfg.user,
      appPassword: cfg.appPassword,
      basePath:
        typeof cfg.basePath === 'string' ? cfg.basePath : undefined,
    });
    // Crea la cartella riunione (idempotent — crea anche i parent)
    await provider.createFolder(riunioneFolder);
    const buffer = Buffer.from(await file.arrayBuffer());
    uploadedSize = buffer.byteLength;
    await provider.uploadFile(fullPath, buffer, { contentType: mime });
  } catch (e) {
    return Response.json(
      {
        error: 'Upload fallito',
        detail: e instanceof Error ? e.message.slice(0, 300) : 'unknown',
      },
      { status: 502 },
    );
  }

  // 8. Insert file_refs
  const { data: fileRef, error: refErr } = await supabase
    .from('file_refs')
    .insert({
      tenant_id: ctx.tenantId,
      commessa_id: commessaId,
      filename,
      mime,
      path: `/${fullPath}`,
      size_bytes: uploadedSize,
      uploaded_by: ctx.userId,
    } as never)
    .select('id')
    .single();
  if (refErr || !fileRef) {
    return Response.json(
      { error: `Insert file_refs fallita: ${refErr?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  // 9. Link allegato riunione
  const { error: allErr } = await supabase
    .from('commessa_riunione_allegato' as never)
    .upsert(
      {
        tenant_id: ctx.tenantId,
        riunione_id: riunioneId,
        file_ref_id: (fileRef as { id: string }).id,
        kind,
      } as never,
      { onConflict: 'riunione_id,file_ref_id' },
    );
  if (allErr) {
    return Response.json(
      { error: `Insert allegato fallita: ${allErr.message}` },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    fileRefId: (fileRef as { id: string }).id,
    path: `/${fullPath}`,
    folder: `/${riunioneFolder}`,
  });
}

// ─── helpers ────────────────────────────────────────────────────────

function sanitizeFilename(s: string): string {
  // Normalizza, rimuove accenti, sostituisce char non sicuri.
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._\- ]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 200);
}

function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function todayLocal(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
}

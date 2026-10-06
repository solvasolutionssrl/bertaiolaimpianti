import { type NextRequest } from 'next/server';

import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import {
  getR2ProviderFromEnv,
  getR2ProviderFromTenantConfig,
} from '@kommessa/integrations/storage';

import { deriveThumbKey } from '../../../../../_lib/thumbnails';

/**
 * `POST /api/upload/media/[id]/poster` — la miniatura di un **video**.
 *
 * `sharp` non decodifica video, quindi fino a oggi `file_refs.r2_thumb_key`
 * restava `null` per ogni video e le gallerie ripiegavano su
 * `<video preload="metadata">` puntato al file intero: decine di MB scaricati
 * per cella, sperando che il browser disegnasse il primo fotogramma. Su iPhone
 * (`.mov` HEVC) non succedeva quasi mai, e restava un rettangolo nero.
 *
 * Il fotogramma lo estrae il **telefono**, che il file ce l'ha già in mano
 * (`_lib/poster-video.ts`), e lo manda qui. Da questo momento il video ha una
 * miniatura indistinguibile da quella di una foto: stessa colonna, stesso
 * endpoint di lettura, stesso comportamento in galleria.
 *
 * **Deliberatamente innocuo**: è chiamato dopo che il caricamento è già
 * riuscito, e qualunque esito negativo lascia le cose come stavano prima. Un
 * poster mancato è un'anteprima in meno, mai un file perso.
 */

export const maxDuration = 30;

/** Un poster è piccolo per costruzione: oltre questo c'è qualcosa che non va. */
const MAX_BYTES = 2 * 1024 * 1024;

const TIPI_AMMESSI: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

/**
 * La chiave della miniatura, con l'estensione del tipo che è arrivato davvero.
 *
 * `deriveThumbKey` produce sempre `.webp` perché le miniature delle foto le
 * genera `sharp`, che il webp lo sa fare sempre. Qui invece il formato lo
 * decide il browser del tecnico: Safari vecchio ripiega su PNG. Scrivere un
 * PNG dentro un nome `.webp` sarebbe una bugia che un domani costa un'ora a
 * qualcuno.
 */
function chiavePoster(r2Key: string, fileRefId: string, tipo: string): string {
  const base = deriveThumbKey(r2Key, fileRefId);
  const ext = TIPI_AMMESSI[tipo] ?? 'webp';
  return base.replace(/\.webp$/, `.${ext}`);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: fileRefId } = await params;

  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return Response.json({ error: 'Non autenticato' }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: 'Corpo non valido' }, { status: 400 });
  }
  const poster = form.get('poster');
  if (!(poster instanceof Blob) || poster.size === 0) {
    return Response.json({ error: 'Poster mancante' }, { status: 400 });
  }
  if (poster.size > MAX_BYTES) {
    return Response.json({ error: 'Poster troppo grande' }, { status: 413 });
  }
  const tipo = poster.type;
  if (!TIPI_AMMESSI[tipo]) {
    return Response.json({ error: 'Formato non ammesso' }, { status: 415 });
  }

  // Lettura con il client dell'utente: le policy decidono se può vedere quel
  // file. Nessuna scorciatoia col service role qui.
  const supabase = createServerSupabase();
  const { data: refRaw, error } = await supabase
    .from('file_refs')
    .select('id, tenant_id, r2_key, mime')
    .eq('id', fileRefId)
    .single();
  const ref = refRaw as unknown as {
    id: string;
    tenant_id: string;
    r2_key: string | null;
    mime: string;
  } | null;

  if (error || !ref) {
    return Response.json({ error: 'Media non trovato' }, { status: 404 });
  }
  if (ref.tenant_id !== ctx.tenantId) {
    return Response.json({ error: 'Non autorizzato' }, { status: 403 });
  }
  if (!ref.mime?.startsWith('video/')) {
    // Le foto hanno la loro miniatura, fatta sul server da `sharp`: accettarne
    // una dal browser vorrebbe dire due sorgenti per la stessa cosa.
    return Response.json({ error: 'Solo per i video' }, { status: 409 });
  }
  if (!ref.r2_key) {
    return Response.json({ error: 'File non su R2' }, { status: 409 });
  }

  const service = createServiceSupabase();
  const { data: tenantRow } = await service
    .from('tenants')
    .select('r2_config')
    .eq('id', ctx.tenantId)
    .maybeSingle();
  const r2 =
    getR2ProviderFromTenantConfig(
      (tenantRow?.r2_config as Record<string, unknown> | null) ?? null,
    ) ?? getR2ProviderFromEnv();
  if (!r2) {
    return Response.json({ error: 'R2 non configurato' }, { status: 503 });
  }

  const chiave = chiavePoster(ref.r2_key, ref.id, tipo);
  try {
    const buf = Buffer.from(await poster.arrayBuffer());
    await r2.putObject(chiave, buf, tipo);
  } catch (e) {
    console.error('[poster] caricamento su R2 fallito:', e);
    return Response.json({ error: 'Caricamento fallito' }, { status: 502 });
  }

  // `r2_thumb_key` non è nei tipi generati (migration 20260528010000).
  const { error: uErr } = await service
    .from('file_refs')
    .update({ r2_thumb_key: chiave } as never)
    .eq('id', ref.id);
  if (uErr) {
    // L'oggetto su R2 c'è ma nessuno lo troverà: va detto, altrimenti il
    // sintomo sarebbe «le anteprime a volte non ci sono».
    console.error('[poster] r2_thumb_key non aggiornata:', uErr.message);
    return Response.json({ error: 'Salvataggio fallito' }, { status: 500 });
  }

  return Response.json({ ok: true, thumbKey: chiave });
}

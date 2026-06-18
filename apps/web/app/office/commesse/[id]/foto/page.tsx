import Link from 'next/link';
import { createServerSupabase } from '@kommessa/api/server';
import { getTenantContext } from '@kommessa/api/tenant';
import { Image as ImgIcon } from 'lucide-react';
import { EmptyState } from '../../../../_components/empty-state';
import { FotoGrid, type FotoItem } from './foto-grid';

export const dynamic = 'force-dynamic';

const MOMENTI = [
  { value: '', label: 'Tutte' },
  { value: 'sopralluogo', label: 'Sopralluogo' },
  { value: 'in_corso', label: 'In corso' },
  { value: 'finale', label: 'Finali' },
] as const;

const TIPI = [
  { value: '', label: 'Tutti' },
  { value: 'foto', label: 'Foto' },
  { value: 'video', label: 'Video' },
] as const;

interface SearchParams {
  momento?: string;
  voce?: string;
  tipo?: string;
}

export default async function FotoTab({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: SearchParams;
}) {
  const supabase = createServerSupabase();

  let q = supabase
    .from('file_refs')
    .select(
      `
        id, path, filename, mime, thumbnail_url, r2_key, taken_at, uploaded_at,
        momento, voce_id,
        voce:voce_id ( id, nome ),
        annotations:file_annotations ( id, layer_json, width_px, height_px, version )
      `,
    )
    .eq('commessa_id', params.id)
    .in('status', ['uploaded', 'syncing', 'synced', 'sync_failed'])
    .is('deleted_at', null)
    .order('uploaded_at', { ascending: false })
    .limit(60);

  // Filtro tipo: foto (image/%) o video (video/%); altrimenti entrambi.
  if (searchParams.tipo === 'foto') {
    q = q.like('mime', 'image/%');
  } else if (searchParams.tipo === 'video') {
    q = q.like('mime', 'video/%');
  } else {
    q = q.or('mime.like.image/%,mime.like.video/%');
  }
  if (searchParams.momento) {
    q = q.eq('momento', searchParams.momento as any);
  }
  if (searchParams.voce) {
    q = q.eq('voce_id', Number(searchParams.voce));
  }

  // Le foto della commessa, l'elenco fasi (per la select filtro) e il
  // contesto utente (per i permessi di eliminazione) sono indipendenti:
  // parallelizziamo per dimezzare la latenza.
  const [{ data, error }, fasi, ctx] = await Promise.all([
    q,
    supabase
      .from('commessa_voci')
      .select('voce_id, voce:voce_id ( id, nome )')
      .eq('commessa_id', params.id),
    getTenantContext(),
  ]);
  const canDelete = ctx?.role === 'admin' || ctx?.role === 'office';
  const rawFoto = error ? [] : data ?? [];

  // Riduci a max-version per ciascuna foto (la join è 1:N su versioni)
  const foto: FotoItem[] = rawFoto.map((f: any) => {
    const annList = Array.isArray(f.annotations) ? f.annotations : [];
    const maxAnn =
      annList.length > 0
        ? annList.reduce((acc: any, cur: any) =>
            cur.version > acc.version ? cur : acc,
          )
        : null;
    return {
      id: f.id,
      filename: f.filename,
      mime: f.mime,
      thumbnail_url: f.thumbnail_url ?? null,
      r2_key: f.r2_key ?? null,
      taken_at: f.taken_at ?? null,
      uploaded_at: f.uploaded_at ?? null,
      momento: f.momento ?? null,
      annotation: maxAnn
        ? {
            id: maxAnn.id,
            layer_json: maxAnn.layer_json,
            width_px: maxAnn.width_px,
            height_px: maxAnn.height_px,
          }
        : null,
    };
  });

  return (
    <div className="space-y-4">
      <form
        method="GET"
        className="flex flex-wrap items-center gap-2 text-sm"
      >
        <label className="text-xs uppercase tracking-wide text-muted-foreground">
          Tipo
        </label>
        <select
          name="tipo"
          defaultValue={searchParams.tipo ?? ''}
          className="h-9 rounded-md border border-input bg-background px-2"
        >
          {TIPI.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <label className="text-xs uppercase tracking-wide text-muted-foreground">
          Momento
        </label>
        <select
          name="momento"
          defaultValue={searchParams.momento ?? ''}
          className="h-9 rounded-md border border-input bg-background px-2"
        >
          {MOMENTI.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <label className="text-xs uppercase tracking-wide text-muted-foreground">
          Fase
        </label>
        <select
          name="voce"
          defaultValue={searchParams.voce ?? ''}
          className="h-9 rounded-md border border-input bg-background px-2"
        >
          <option value="">Tutte</option>
          {(fasi.data ?? []).map((f: any) => {
            const v = Array.isArray(f.voce) ? f.voce[0] : f.voce;
            return (
              <option key={f.voce_id} value={f.voce_id}>
                {v?.nome ?? `Voce ${f.voce_id}`}
              </option>
            );
          })}
        </select>
        <button
          type="submit"
          className="h-9 rounded-md bg-secondary px-3 text-sm font-medium text-secondary-foreground"
        >
          Filtra
        </button>
        <Link
          href={`/office/commesse/${params.id}/foto`}
          className="text-xs text-muted-foreground hover:underline"
        >
          Reset
        </Link>
      </form>

      {foto.length === 0 ? (
        <EmptyState
          icon={ImgIcon}
          title="Nessun media"
          description="Foto e video vengono caricati dai tecnici tramite l'app mobile (PWA), tab Scatto, durante sopralluoghi e cantieri."
        />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {foto.length} {foto.length === 1 ? 'elemento' : 'elementi'}
            {foto.length === 60 ? ' (primi 60)' : ''}
          </p>
          <FotoGrid foto={foto} commessaId={params.id} canDelete={canDelete} />
        </>
      )}
    </div>
  );
}

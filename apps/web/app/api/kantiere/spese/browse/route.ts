import { type NextRequest } from 'next/server';

import { createServiceSupabase } from '@kommessa/api/service';

import { r2SpeseContext, isErr, dentroBase } from '../_lib/r2-spese';

export const dynamic = 'force-dynamic';

/**
 * Browser dei file ricevuta su R2 per il tenant (solo office/admin).
 * Struttura: anno → mese → file. Ai primi due livelli ritorna le cartelle;
 * dentro un mese ritorna i file (ricorsivo), arricchiti coi dati della spesa
 * collegata (esercente, importo, chi). Le miniature (thumb.webp) sono escluse.
 */
export async function GET(request: NextRequest) {
  const c = await r2SpeseContext();
  if (isErr(c)) return Response.json({ ok: false, code: c.error }, { status: c.status });

  const rawPrefix = request.nextUrl.searchParams.get('prefix') ?? c.base;
  const prefix = rawPrefix.endsWith('/') ? rawPrefix : `${rawPrefix}/`;
  if (!dentroBase(prefix, c.base)) {
    return Response.json({ ok: false, code: 'PREFISSO_NON_VALIDO' }, { status: 400 });
  }

  // profondità relativa alla radice: 0 = radice (anni), 1 = mesi, 2 = file
  const rel = prefix.slice(c.base.length).replace(/\/+$/, '');
  const depth = rel === '' ? 0 : rel.split('/').length;

  if (depth < 2) {
    // livello cartelle (anni o mesi)
    const res = await c.r2.listObjects(prefix, { delimiter: '/' });
    const folders = res.prefixes
      .map((p) => ({ prefix: p, label: p.slice(prefix.length).replace(/\/$/, '') }))
      .filter((f) => f.label.length > 0)
      .sort((a, b) => b.label.localeCompare(a.label));
    return Response.json({ ok: true, level: 'folders', prefix, base: c.base, folders });
  }

  // livello file (dentro un mese): elenco ricorsivo
  const res = await c.r2.listObjects(prefix, { maxKeys: 1000 });
  const fileKeys = res.keys
    .map((k) => k.key)
    .filter((k) => !k.includes('/thumbs/') && !/\/thumb\.webp$/.test(k));

  // arricchimento coi dati spesa (service: i file sono del tenant, già validato)
  const service = createServiceSupabase();
  const spesaByKey = new Map<
    string,
    {
      id: string;
      esercente: string | null;
      importo: number | null;
      valuta: string | null;
      categoria: string | null;
      dipendenteId: string | null;
      dataScontrino: string | null;
    }
  >();
  if (fileKeys.length > 0) {
    const { data: spese } = await service
      .from('spese' as never)
      .select('id, r2_key, ragione_sociale, importo_totale, valuta, categoria, dipendente_id, data_scontrino')
      .eq('tenant_id', c.tenantId)
      .in('r2_key', fileKeys);
    const dipIds = new Set<string>();
    for (const s of (spese as Array<Record<string, unknown>> | null) ?? []) {
      const key = s.r2_key as string | null;
      if (!key) continue;
      const dipId = (s.dipendente_id as string | null) ?? null;
      if (dipId) dipIds.add(dipId);
      spesaByKey.set(key, {
        id: s.id as string,
        esercente: (s.ragione_sociale as string | null) ?? null,
        importo: (s.importo_totale as number | null) ?? null,
        valuta: (s.valuta as string | null) ?? null,
        categoria: (s.categoria as string | null) ?? null,
        dipendenteId: dipId,
        dataScontrino: (s.data_scontrino as string | null) ?? null,
      });
    }
    // nomi dipendenti
    if (dipIds.size > 0) {
      const { data: dips } = await service
        .from('dipendenti' as never)
        .select('id, nome, cognome')
        .in('id', [...dipIds]);
      const nomi = new Map(
        ((dips as { id: string; nome: string; cognome: string }[] | null) ?? []).map((d) => [
          d.id,
          `${d.nome} ${d.cognome}`.trim(),
        ]),
      );
      for (const v of spesaByKey.values()) {
        (v as { dipendenteNome?: string }).dipendenteNome = v.dipendenteId
          ? nomi.get(v.dipendenteId) ?? undefined
          : undefined;
      }
    }
  }

  const files = res.keys
    .filter((k) => !k.key.includes('/thumbs/') && !/\/thumb\.webp$/.test(k.key))
    .map((k) => ({
      key: k.key,
      name: k.key.slice(k.key.lastIndexOf('/') + 1),
      size: k.size,
      lastModified: k.lastModified,
      spesa: spesaByKey.get(k.key) ?? null,
    }))
    .sort((a, b) => (b.lastModified ?? '').localeCompare(a.lastModified ?? ''));

  return Response.json({ ok: true, level: 'files', prefix, base: c.base, files });
}

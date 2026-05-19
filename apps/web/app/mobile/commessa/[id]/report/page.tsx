import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, Printer } from 'lucide-react';

import { createServerSupabase } from '@impiantixplus/api/server';
import { getStorageProvider } from '@impiantixplus/integrations/storage';

import { guardMobile } from '../../../_lib/guard';
import { Hero, HeroMeta } from '../../../_components/blueprint';
import { fmtData, fmtDataOra } from '../../../../office/_lib/format';
import { loadCommessa } from '../../../../office/commesse/[id]/_lib/get-commessa';
import { PrintButton } from './_components/print-button';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Report commessa' };

const STATO_LABEL: Record<string, string> = {
  da_iniziare: 'Da iniziare',
  in_corso: 'In corso',
  completata: 'Completata',
  bloccata: 'Bloccata',
};

const MOMENTI_FINALI = ['finale', 'in_corso'] as const;

/**
 * Report di chiusura commessa — versione MOBILE-NATIVE.
 *
 * Rispetto a /office/commesse/[id]/report:
 *  - chrome mobile (Hero blueprint, back blueprint, niente sidebar office)
 *  - bottone "Stampa / Salva PDF" prominente in alto (non perso nello scroll)
 *  - stesso CSS print A4 portrait → il PDF generato dal browser è
 *    identico a quello desktop (cliente, foto, fasi, DICO, firme)
 *  - layout screen mobile-readable (no max-w 210mm a vista, solo in stampa)
 *
 * Lo stesso flusso resta dentro il layout /mobile (bottom-nav, install
 * prompt, ecc.) — niente più "uscita" verso office. È un'app.
 */
export default async function ReportPageMobile({
  params,
}: {
  params: { id: string };
}) {
  await guardMobile();
  const supabase = createServerSupabase();

  const cRaw = await loadCommessa(params.id);
  if (!cRaw) notFound();
  const c = cRaw as any;

  const tenantQ = supabase
    .from('tenants')
    .select('id, nome, slug, brand_color, logo_url, storage_provider, storage_config')
    .eq('id', c.tenant_id)
    .maybeSingle();

  const vociQ = supabase
    .from('commessa_voci')
    .select(`
      voce_id, stato, min_foto_richieste, foto_caricate_count, note, updated_at,
      voce:voce_id ( id, nome, categoria, ordine_visualizzazione )
    `)
    .eq('commessa_id', params.id);

  const fotoQ = supabase
    .from('file_refs')
    .select('id, path, filename, taken_at, uploaded_at, momento, voce_id, voce:voce_id ( nome )')
    .eq('commessa_id', params.id)
    .like('mime', 'image/%')
    .in('momento', MOMENTI_FINALI as unknown as string[])
    .order('taken_at', { ascending: true })
    .limit(60);

  const documentiQ = supabase
    .from('file_refs')
    .select('id, path, filename, mime, uploaded_at, size_bytes')
    .eq('commessa_id', params.id)
    .or('path.ilike.%Documenti/DICO/%,path.ilike.%Documenti/Certificazioni/%')
    .order('uploaded_at', { ascending: false })
    .limit(40);

  const [tenantR, vociR, fotoR, documentiR] = await Promise.all([
    tenantQ, vociQ, fotoQ, documentiQ,
  ]);

  const tenant = tenantR.data as any;
  const voci = (vociR.data ?? []).sort((a: any, b: any) => {
    const va = Array.isArray(a.voce) ? a.voce[0] : a.voce;
    const vb = Array.isArray(b.voce) ? b.voce[0] : b.voce;
    return (va?.ordine_visualizzazione ?? 0) - (vb?.ordine_visualizzazione ?? 0);
  });
  const fotoRaw = fotoR.data ?? [];
  const documentiRaw = documentiR.data ?? [];

  let provider: ReturnType<typeof getStorageProvider> | null = null;
  try {
    const cfg = (tenant?.storage_config as Record<string, string> | null) ?? {};
    provider = getStorageProvider({
      provider: (tenant?.storage_provider as any) ?? 'supabase',
      bucket: cfg.bucket ?? 'commesse',
      baseUrl: cfg.baseUrl,
      user: cfg.user,
      appPassword: cfg.appPassword,
    });
  } catch {
    provider = null;
  }

  async function signed(path: string): Promise<string | null> {
    if (!provider) return null;
    try {
      const u = await provider.getDownloadUrl(path, 600);
      return u.url;
    } catch {
      return null;
    }
  }

  const [fotoUrls, docUrls] = await Promise.all([
    Promise.all(fotoRaw.map((f: any) => signed(f.path))),
    Promise.all(documentiRaw.map((d: any) => signed(d.path))),
  ]);

  const foto = fotoRaw.map((f: any, i: number) => ({
    ...f,
    url: fotoUrls[i],
    voceNome: Array.isArray(f.voce) ? f.voce[0]?.nome : f.voce?.nome,
  }));
  const documenti = documentiRaw.map((d: any, i: number) => ({
    ...d,
    url: docUrls[i],
  }));

  const cliente = Array.isArray(c.cliente) ? c.cliente[0] : c.cliente;
  const resp = Array.isArray(c.responsabile) ? c.responsabile[0] : c.responsabile;

  const brandColor = tenant?.brand_color ?? '#1340A6';
  const dataReport = new Date().toLocaleDateString('it-IT', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  return (
    <>
      {/* CSS scoped: screen mobile-readable + print A4 perfetto */}
      <style
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: `
            .report-page { background: #fff; color: #0a0a0a; }
            .report-page .page-shell { padding: 16px 18px 32px; }
            .report-page .brand-line { height: 4px; background: linear-gradient(90deg, ${brandColor} 0%, ${brandColor} 55%, #F26B23 55%, #F26B23 100%); border-radius: 2px; }
            .report-page h2 { letter-spacing: -0.02em; }
            .report-page .section { break-inside: avoid; page-break-inside: avoid; margin-top: 18px; }
            .report-page table { width: 100%; border-collapse: collapse; font-size: 11pt; }
            .report-page th, .report-page td { border-bottom: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; vertical-align: top; }
            .report-page th { background: #f8fafc; font-weight: 600; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.04em; color: #475569; }
            .report-page .photo-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
            .report-page .photo-card { border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; break-inside: avoid; }
            .report-page .photo-card img { width: 100%; aspect-ratio: 4/3; object-fit: cover; display: block; }
            .report-page .photo-cap { padding: 4px 6px; font-size: 8.5pt; color: #475569; }
            .report-page .doc-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 11pt; }
            .report-page .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 9pt; font-weight: 600; }
            .report-page .pill-da_iniziare { background: #e2e8f0; color: #334155; }
            .report-page .pill-in_corso    { background: #F26B23; color: #fff; }
            .report-page .pill-completata  { background: #16a34a; color: #fff; }
            .report-page .pill-bloccata    { background: #dc2626; color: #fff; }
            .report-page .firma-box { margin-top: 12px; border-top: 1px solid #94a3b8; padding-top: 4px; font-size: 9.5pt; color: #475569; height: 60px; }
            .report-page .header-grid { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
            .report-page .header-grid .logo-wrap { width: 64px; height: 64px; display: flex; align-items: center; justify-content: center; }
            .report-page .header-grid .logo-wrap img { max-width: 100%; max-height: 100%; object-fit: contain; }
            .report-page .meta-grid { display: grid; grid-template-columns: 1fr; gap: 6px; font-size: 11pt; }
            .report-page .meta-grid dt { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
            .report-page .meta-grid dd { margin: 0 0 6px; font-weight: 500; }
            .report-page .firma-grid { display: grid; grid-template-columns: 1fr; gap: 20px; }

            @media (min-width: 640px) {
              .report-page .page-shell { max-width: 210mm; margin: 0 auto; padding: 24px 28px 40px; }
              .report-page .photo-grid { grid-template-columns: repeat(3, 1fr); }
              .report-page .meta-grid { grid-template-columns: 1fr 1fr; column-gap: 16px; }
              .report-page .firma-grid { grid-template-columns: 1fr 1fr; gap: 32px; }
            }

            @media print {
              /* In print nascondi TUTTO tranne il report — niente bottom nav,
                 niente toolbar, niente Hero blu */
              body * { visibility: hidden !important; }
              .report-page, .report-page * { visibility: visible !important; }
              .report-page { position: absolute; left: 0; top: 0; width: 100%; background: #fff !important; }
              .no-print { display: none !important; }
              body { background: #fff !important; }
              .report-page .page-shell { padding: 0; max-width: none; margin: 0; }
              @page { size: A4 portrait; margin: 12mm 14mm; }
              a { color: inherit !important; text-decoration: none !important; }
              .photo-card, .section, table, tr { page-break-inside: avoid; break-inside: avoid; }
              .report-page .photo-grid { grid-template-columns: repeat(3, 1fr); }
              .report-page .meta-grid { grid-template-columns: 1fr 1fr; column-gap: 16px; }
              .report-page .firma-grid { grid-template-columns: 1fr 1fr; gap: 32px; }
            }
          `,
        }}
      />

      <div className="flex min-h-[100dvh] flex-col">
        {/* Hero blueprint con toolbar — no-print */}
        <div className="no-print">
          <Hero>
            <div className="flex items-center justify-between">
              <Link
                href={`/mobile/commessa/${params.id}`}
                className="inline-flex items-center gap-1.5 text-primary-foreground/80 transition-colors hover:text-primary-foreground"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span className="font-mono text-[11px] uppercase tracking-[0.18em]">
                  Commessa
                </span>
              </Link>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary-foreground/60">
                {c.codice_interno}
              </span>
            </div>

            <div className="mt-5">
              <HeroMeta>Report · {dataReport}</HeroMeta>
              <h1 className="mt-1 font-mono text-2xl font-bold leading-none tracking-tightest text-primary-foreground">
                CHIUSURA
              </h1>
              <p className="mt-2 text-sm text-primary-foreground/70">
                {cliente?.ragione_sociale ?? '—'}
              </p>
            </div>

            {/* CTA Stampa/Salva PDF prominente */}
            <div className="mt-4 flex flex-col gap-2">
              <PrintButton />
              <p className="text-center font-mono text-[10px] uppercase tracking-[0.14em] text-primary-foreground/60">
                Tap "Stampa" → Salva come PDF dal tuo browser
              </p>
            </div>
          </Hero>
        </div>

        {/* Report body — print-ready */}
        <div className="report-page flex-1">
          <div className="page-shell">
            {/* 1. Header brandizzato */}
            <div className="header-grid">
              <div>
                <p className="text-[10pt] uppercase tracking-widest" style={{ color: '#64748b' }}>
                  Report di chiusura commessa
                </p>
                <h1 className="mt-1 text-[20pt] font-semibold leading-tight" style={{ color: '#0f172a' }}>
                  {tenant?.nome ?? 'impiantiXplus'}
                </h1>
                <p className="text-[11pt]" style={{ color: '#475569' }}>
                  Codice <span className="font-mono">{c.codice_interno}</span> · {dataReport}
                </p>
              </div>
              <div className="logo-wrap">
                {tenant?.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tenant.logo_url} alt={tenant?.nome ?? ''} />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center rounded-md text-[16pt] font-bold text-white"
                    style={{ background: brandColor }}
                  >
                    {tenant?.slug?.slice(0, 3) ?? 'iX+'}
                  </div>
                )}
              </div>
            </div>
            <div className="brand-line mt-4" />

            {/* 2. Commessa */}
            <section className="section">
              <h2 className="mb-3 text-[14pt] font-semibold" style={{ color: '#0f172a' }}>
                Dati commessa
              </h2>
              <dl className="meta-grid">
                <div>
                  <dt>Codice interno</dt>
                  <dd className="font-mono">{c.codice_interno}</dd>
                </div>
                <div>
                  <dt>Nome cartella</dt>
                  <dd className="font-mono">{c.nome_cartella ?? '—'}</dd>
                </div>
                <div>
                  <dt>Cliente</dt>
                  <dd>{cliente?.ragione_sociale ?? '—'}</dd>
                </div>
                <div>
                  <dt>Indirizzo cantiere</dt>
                  <dd>{c.cliente_indirizzo_cantiere ?? cliente?.indirizzo ?? '—'}</dd>
                </div>
                <div>
                  <dt>Responsabile</dt>
                  <dd>{resp?.display_name ?? '—'}</dd>
                </div>
                <div>
                  <dt>Data apertura</dt>
                  <dd>{fmtData(c.data_apertura)}</dd>
                </div>
                <div>
                  <dt>Stato attuale</dt>
                  <dd>{c.stato}</dd>
                </div>
                <div>
                  <dt>Ultimo aggiornamento</dt>
                  <dd>{fmtDataOra(c.updated_at)}</dd>
                </div>
              </dl>
              {c.descrizione_ai_finale ? (
                <p className="mt-3 text-[11pt] leading-relaxed" style={{ color: '#334155' }}>
                  {c.descrizione_ai_finale}
                </p>
              ) : null}
            </section>

            {/* 3. Fasi */}
            <section className="section">
              <h2 className="mb-3 text-[14pt] font-semibold" style={{ color: '#0f172a' }}>
                Riepilogo fasi
              </h2>
              {voci.length === 0 ? (
                <p className="text-[11pt]" style={{ color: '#64748b' }}>
                  Nessuna fase registrata.
                </p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '35%' }}>Voce</th>
                      <th style={{ width: '15%' }}>Stato</th>
                      <th style={{ width: '15%' }}>Foto</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {voci.map((f: any) => {
                      const v = Array.isArray(f.voce) ? f.voce[0] : f.voce;
                      return (
                        <tr key={f.voce_id}>
                          <td>
                            <div className="font-medium">{v?.nome ?? `Voce ${f.voce_id}`}</div>
                            {v?.categoria ? (
                              <div style={{ fontSize: '9pt', color: '#64748b' }}>{v.categoria}</div>
                            ) : null}
                          </td>
                          <td>
                            <span className={`pill pill-${f.stato}`}>
                              {STATO_LABEL[f.stato] ?? f.stato}
                            </span>
                          </td>
                          <td>
                            {f.foto_caricate_count ?? 0}
                            {f.min_foto_richieste > 0 ? ` / ${f.min_foto_richieste}` : ''}
                          </td>
                          <td style={{ fontSize: '10pt' }}>{f.note ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>

            {/* 4. Foto */}
            <section className="section">
              <h2 className="mb-3 text-[14pt] font-semibold" style={{ color: '#0f172a' }}>
                Galleria foto ({foto.length})
              </h2>
              {foto.length === 0 ? (
                <p className="text-[11pt]" style={{ color: '#64748b' }}>
                  Nessuna foto finale o in corso disponibile per questa commessa.
                </p>
              ) : (
                <div className="photo-grid">
                  {foto.map((f: any) => (
                    <figure key={f.id} className="photo-card">
                      {f.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.url} alt={f.filename} loading="lazy" />
                      ) : (
                        <div
                          style={{
                            aspectRatio: '4/3', background: '#f1f5f9',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#94a3b8', fontSize: '9pt',
                          }}
                        >
                          anteprima non disponibile
                        </div>
                      )}
                      <figcaption className="photo-cap">
                        <div className="truncate font-medium" style={{ color: '#0f172a' }}>
                          {f.filename}
                        </div>
                        <div>
                          {f.voceNome ? `${f.voceNome} · ` : ''}
                          {fmtDataOra(f.taken_at ?? f.uploaded_at)}
                        </div>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </section>

            {/* 5. Documenti */}
            <section className="section">
              <h2 className="mb-3 text-[14pt] font-semibold" style={{ color: '#0f172a' }}>
                Documenti di chiusura
              </h2>
              {documenti.length === 0 ? (
                <p className="text-[11pt]" style={{ color: '#64748b' }}>
                  Nessun documento DICO o di certificazione caricato.
                </p>
              ) : (
                <div>
                  {documenti.map((d: any) => (
                    <div key={d.id} className="doc-row">
                      <div>
                        <div className="font-medium" style={{ color: '#0f172a' }}>
                          {d.url ? (
                            <a href={d.url} target="_blank" rel="noopener noreferrer">
                              {d.filename}
                            </a>
                          ) : (
                            d.filename
                          )}
                        </div>
                        <div style={{ fontSize: '9pt', color: '#64748b' }}>{d.path}</div>
                      </div>
                      <div style={{ fontSize: '9.5pt', color: '#64748b' }}>
                        {fmtData(d.uploaded_at)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 6. Firme */}
            <section className="section">
              <div className="firma-grid">
                <div>
                  <p className="text-[10pt] uppercase tracking-widest" style={{ color: '#64748b' }}>
                    Firma responsabile
                  </p>
                  <div className="firma-box">&nbsp;</div>
                  <p className="text-[9pt]" style={{ color: '#64748b' }}>
                    {resp?.display_name ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10pt] uppercase tracking-widest" style={{ color: '#64748b' }}>
                    Firma cliente
                  </p>
                  <div className="firma-box">&nbsp;</div>
                  <p className="text-[9pt]" style={{ color: '#64748b' }}>
                    {cliente?.ragione_sociale ?? '—'}
                  </p>
                </div>
              </div>
            </section>

            <footer
              className="mt-8 border-t pt-3 text-center text-[9pt]"
              style={{ borderColor: '#e5e7eb', color: '#64748b' }}
            >
              Generato da impiantiXplus · Powered by SOLVA · {dataReport}
            </footer>
          </div>
        </div>
      </div>
    </>
  );
}

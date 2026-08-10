import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContextCached as requireTenantContext } from '../../../_lib/tenant-cache';
import { risolviTitoloCommessa } from '../../../_lib/commessa-display';
import { PanoramicaClient, type PanoramicaRow } from './_components/panoramica-client';

export const metadata = { title: 'Panoramica commesse' };
export const dynamic = 'force-dynamic';

/**
 * Panoramica commesse — tabellone schematico + stampa/PDF.
 *
 * Mostra le commesse **vive** (aperta = Non presa, in_corso, collaudo) piu' le
 * **completate**, filtrabili dai segmenti in alto a destra: serve anche a
 * stampare il consuntivo di quelle chiuse (aggiunta 10/08/2026). Restano fuori
 * le bozze (non ancora commesse) e le archiviate (fuori dal giro).
 * Il "Creato da" viene dal log audit (evento `create` della commessa →
 * `users.display_name`), con fallback al responsabile.
 * Stampa via `window.print()` + CSS `@media print` (nessuna libreria PDF).
 */
export default async function PanoramicaCommessePage() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  const tenantQ = supabase
    .from('tenants')
    .select('nome, logo_url, brand_color')
    .eq('id', ctx.tenantId)
    .maybeSingle();

  const commesseQ = supabase
    .from('commesse')
    .select(
      `
        id,
        codice_interno,
        stato,
        created_at,
        data_apertura,
        descrizione_ai_finale,
        descrizione_ai_proposta,
        note_iniziali,
        nome_cartella,
        responsabile:responsabile_id ( display_name ),
        cliente:cliente_id ( ragione_sociale )
      `,
    )
    .in('stato', ['aperta', 'in_corso', 'collaudo', 'completata'])
    .order('data_apertura', { ascending: false })
    .order('codice_interno', { ascending: false })
    .limit(1000);

  const [tenantR, commesseR] = await Promise.all([tenantQ, commesseQ]);
  const tenant = (tenantR.data ?? null) as {
    nome: string | null;
    logo_url: string | null;
    brand_color: string | null;
  } | null;
  const commesse = (commesseR.data ?? []) as Array<any>;

  // "Creato da" dal log audit (evento create). Fallback: responsabile.
  const creatoreById = new Map<string, string>();
  const ids = commesse.map((c) => c.id as string);
  if (ids.length > 0) {
    const { data: eventi } = await supabase
      .from('audit_events')
      .select('entity_id, actor_user_id, created_at')
      .eq('entity_type', 'commessa')
      .eq('action', 'create')
      .in('entity_id', ids)
      .order('created_at', { ascending: true });

    const attoreByCommessa = new Map<string, string>();
    for (const e of (eventi ?? []) as Array<any>) {
      const cid = e.entity_id as string;
      if (!attoreByCommessa.has(cid) && e.actor_user_id) {
        attoreByCommessa.set(cid, e.actor_user_id as string);
      }
    }
    const attoreIds = [...new Set(attoreByCommessa.values())];
    if (attoreIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, display_name')
        .in('id', attoreIds);
      const nomeById = new Map(
        ((users ?? []) as Array<any>).map((u) => [u.id as string, u.display_name as string | null]),
      );
      attoreByCommessa.forEach((attoreId, cid) => {
        const nome = nomeById.get(attoreId);
        if (nome) creatoreById.set(cid, nome);
      });
    }
  }

  const rows: PanoramicaRow[] = commesse.map((c) => {
    const cliente = Array.isArray(c.cliente) ? c.cliente[0] : c.cliente;
    const resp = Array.isArray(c.responsabile) ? c.responsabile[0] : c.responsabile;
    const cliente_nome = (cliente?.ragione_sociale as string | undefined) ?? '—';
    const titolo =
      risolviTitoloCommessa({
        descrizione_ai_finale: c.descrizione_ai_finale,
        descrizione_ai_proposta: c.descrizione_ai_proposta,
        note_iniziali: c.note_iniziali,
        nome_cartella: c.nome_cartella,
        codice_interno: c.codice_interno,
        cliente_nome,
      }) || '—';
    return {
      id: c.id as string,
      codice_interno: c.codice_interno as string,
      stato: c.stato as PanoramicaRow['stato'],
      cliente_nome,
      titolo,
      inserita: (c.created_at as string | null) ?? null,
      creatore:
        creatoreById.get(c.id as string) ??
        (resp?.display_name as string | undefined) ??
        '—',
    };
  });

  const tenantName = tenant?.nome ?? 'Kommessa';
  const brandColor = tenant?.brand_color ?? '#1340A6';
  const logoUrl = tenant?.logo_url ?? null;
  const aggiornatoAl = new Date().toLocaleString('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <>
      {/* CSS scoped alla panoramica — print-ready. Inline così resta locale. */}
      <style
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: `
            .panoramica-page { color:#0f172a; background:#fff; }
            .panoramica-page .page-shell { max-width:100%; }
            .panoramica-page .doc-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }
            .panoramica-page .doc-eyebrow { margin:0; font-size:8.5pt; text-transform:uppercase; letter-spacing:.16em; font-weight:700; color:${brandColor}; }
            .panoramica-page .doc-title { margin:2px 0 3px; font-size:20pt; font-weight:600; letter-spacing:-.02em; line-height:1.1; color:#0f172a; }
            .panoramica-page .doc-sub { margin:0; font-size:10pt; color:#475569; }
            .panoramica-page .doc-sub strong { color:#0f172a; font-weight:600; }
            .panoramica-page .doc-logo { width:64px; height:64px; display:flex; align-items:center; justify-content:center; flex:none; }
            .panoramica-page .doc-logo img { max-width:100%; max-height:100%; object-fit:contain; }
            .panoramica-page .brand-line { height:4px; border-radius:2px; margin:12px 0 14px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
            .panoramica-page .doc-chips { display:flex; flex-wrap:wrap; gap:8px 16px; margin-bottom:12px; }
            .panoramica-page .doc-chip { display:inline-flex; align-items:center; gap:6px; font-size:9.5pt; color:#475569; }
            .panoramica-page .doc-chip strong { font-size:11pt; }
            .panoramica-page .stato { display:inline-flex; align-items:center; gap:6px; font-weight:600; font-size:9pt; white-space:nowrap; }
            .panoramica-page .stato-dot { width:8px; height:8px; border-radius:999px; display:inline-block; flex:none; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
            .panoramica-page table { width:100%; border-collapse:collapse; font-size:10pt; }
            .panoramica-page thead th { text-align:left; font-weight:600; font-size:8pt; text-transform:uppercase; letter-spacing:.05em; color:#64748b; padding:7px 10px; border-bottom:1.5px solid #e2e8f0; background:#f8fafc; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
            .panoramica-page tbody td { padding:7px 10px; border-bottom:1px solid #eef2f6; vertical-align:middle; }
            .panoramica-page tbody tr:nth-child(even) td { background:#fafbfc; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
            .panoramica-page .col-codice { font-family: var(--font-geist-mono), ui-monospace, monospace; font-weight:600; color:${brandColor}; white-space:nowrap; }
            .panoramica-page .col-cliente { font-weight:500; }
            .panoramica-page .col-oggetto { color:#334155; }
            .panoramica-page .col-small { font-size:8.5pt; color:#64748b; white-space:nowrap; }
            .panoramica-page .w-code { width:9%; }
            .panoramica-page .w-stato { width:11%; }
            .panoramica-page .w-cliente { width:22%; }
            .panoramica-page .w-small { width:12%; }
            .panoramica-page .doc-empty { padding:28px 0; text-align:center; color:#64748b; font-size:10.5pt; }
            .panoramica-page .doc-footer { margin-top:16px; padding-top:8px; border-top:1px solid #e5e7eb; text-align:center; font-size:8pt; color:#94a3b8; }

            @media screen {
              .panoramica-page { border:1px solid hsl(30 12% 89%); border-radius:14px; box-shadow:0 1px 2px rgba(15,23,42,.05), 0 12px 30px -18px rgba(15,23,42,.18); }
              .panoramica-page .page-shell { padding:22px 24px; }
              .panoramica-page tbody tr { cursor:pointer; transition:background-color .12s ease; }
              .panoramica-page tbody tr:hover td { background:#eef2ff !important; }
              .panoramica-page tbody tr:focus-visible { outline:2px solid ${brandColor}; outline-offset:-2px; }
              .panoramica-page thead th { position:sticky; top:0; z-index:1; }
            }

            @media print {
              body * { visibility:hidden !important; }
              .panoramica-page, .panoramica-page * { visibility:visible !important; }
              .panoramica-page { position:absolute; left:0; top:0; width:100%; border:0 !important; box-shadow:none !important; border-radius:0 !important; }
              .panoramica-page .page-shell { padding:0 !important; max-width:none; }
              .no-print { display:none !important; }
              body { background:#fff !important; }
              @page { size:A4 landscape; margin:10mm 12mm; }
              a { color:inherit !important; text-decoration:none !important; }
              tr { page-break-inside:avoid; break-inside:avoid; }
              thead { display:table-header-group; }
            }
          `,
        }}
      />

      <PanoramicaClient
        rows={rows}
        tenantName={tenantName}
        logoUrl={logoUrl}
        brandColor={brandColor}
        aggiornatoAl={aggiornatoAl}
      />
    </>
  );
}

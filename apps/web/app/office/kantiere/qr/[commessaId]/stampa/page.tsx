import { notFound, redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { qrUrl, risolviTemplateQr } from '@kommessa/api/kantiere-qr';
import { risolviTitoloCommessa } from '@/app/_lib/commessa-display';
import { appOrigin } from '@/app/_lib/app-origin';
import { StampaQrClient } from './_components/stampa-qr-client';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { commessaId: string };
  searchParams?: { template?: string };
}

export default async function StampaQrPage({ params, searchParams }: PageProps) {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  // Carica commessa verificando che appartenga al tenant corrente
  const { data: commessa } = await supabase
    .from('commesse')
    .select(
      `id,
       codice_interno,
       nome_cartella,
       descrizione_ai_finale,
       descrizione_ai_proposta,
       note_iniziali,
       cliente_indirizzo_cantiere,
       cliente:clienti ( ragione_sociale )`,
    )
    .eq('id', params.commessaId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (!commessa) notFound();

  // Carica QR attivo per questa commessa
  const { data: qrRow } = await supabase
    .from('cantiere_qr' as never)
    .select('token')
    .eq('commessa_id', params.commessaId)
    .eq('tenant_id', ctx.tenantId)
    .eq('attivo', true)
    .maybeSingle();

  if (!qrRow) redirect('/office/kantiere/qr');

  const token = (qrRow as { token: string }).token;

  // Carica branding tenant
  const { data: tenantRow } = await supabase
    .from('tenants' as never)
    .select('nome, logo_url, brand_color')
    .eq('id', ctx.tenantId)
    .maybeSingle();

  const tenantData = tenantRow as { nome: string; logo_url: string | null; brand_color: string | null } | null;

  // Genera QR data URL lato server
  const url = qrUrl(appOrigin(), token);
  const qrDataUrl = await QRCode.toDataURL(url, {
    width: 900,
    margin: 1,
    errorCorrectionLevel: 'M',
  });

  // Risolvi titolo commessa
  const clienteObj = commessa.cliente as { ragione_sociale: string } | { ragione_sociale: string }[] | null;
  const clienteNome = Array.isArray(clienteObj)
    ? (clienteObj[0]?.ragione_sociale ?? null)
    : (clienteObj?.ragione_sociale ?? null);

  const titolo =
    risolviTitoloCommessa({
      descrizione_ai_finale: commessa.descrizione_ai_finale,
      descrizione_ai_proposta: commessa.descrizione_ai_proposta,
      note_iniziali: commessa.note_iniziali,
      nome_cartella: commessa.nome_cartella,
      codice_interno: commessa.codice_interno,
      cliente_nome: clienteNome,
    }) || commessa.codice_interno || commessa.id;

  const templateIniziale = risolviTemplateQr(searchParams?.template);

  return (
    <StampaQrClient
      qrDataUrl={qrDataUrl}
      url={url}
      titolo={titolo}
      codice={commessa.codice_interno}
      cliente={clienteNome}
      indirizzo={commessa.cliente_indirizzo_cantiere ?? null}
      tenant={{
        nome: tenantData?.nome ?? '',
        logoUrl: tenantData?.logo_url ?? null,
        brandColor: tenantData?.brand_color ?? null,
      }}
      templateIniziale={templateIniziale}
    />
  );
}

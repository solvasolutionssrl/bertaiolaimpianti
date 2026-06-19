import { notFound, redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { qrUrl, risolviTemplateQr } from '@kommessa/api/kantiere-qr';
import { appOrigin } from '@/app/_lib/app-origin';
import { StampaQrClient } from '../../../qr/[commessaId]/stampa/_components/stampa-qr-client';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
  searchParams?: { template?: string };
}

export default async function StampaCantierePage({ params, searchParams }: PageProps) {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  // Carica cantiere verificando che appartenga al tenant corrente
  const { data: cantiereRaw } = await supabase
    .from('cantieri' as never)
    .select('id, codice, nome, indirizzo, commessa_id')
    .eq('id', params.id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (!cantiereRaw) notFound();

  const cantiere = cantiereRaw as {
    id: string;
    codice: string;
    nome: string;
    indirizzo: string | null;
    commessa_id: string | null;
  };

  // Carica QR attivo per questo cantiere
  const { data: qrRaw } = await supabase
    .from('cantiere_qr' as never)
    .select('token')
    .eq('cantiere_id', params.id)
    .eq('tenant_id', ctx.tenantId)
    .eq('attivo', true)
    .maybeSingle();

  if (!qrRaw) redirect(`/office/kantiere/cantieri/${params.id}`);

  const token = (qrRaw as { token: string }).token;

  // Carica branding tenant
  const { data: tenantRow } = await supabase
    .from('tenants' as never)
    .select('nome, logo_url, brand_color')
    .eq('id', ctx.tenantId)
    .maybeSingle();

  const tenantData = tenantRow as {
    nome: string;
    logo_url: string | null;
    brand_color: string | null;
  } | null;

  // Titolo commessa collegata (se presente)
  let clienteLabel: string | null = null;
  if (cantiere.commessa_id) {
    const { data: commessaRaw } = await supabase
      .from('commesse')
      .select('codice_interno, nome_cartella, descrizione_ai_finale, descrizione_ai_proposta, note_iniziali')
      .eq('id', cantiere.commessa_id)
      .maybeSingle();
    if (commessaRaw) {
      const c = commessaRaw as {
        codice_interno: string | null;
        nome_cartella: string | null;
        descrizione_ai_finale: string | null;
        descrizione_ai_proposta: string | null;
        note_iniziali: string | null;
      };
      const { risolviTitoloCommessa } = await import('@/app/_lib/commessa-display');
      clienteLabel =
        risolviTitoloCommessa({
          descrizione_ai_finale: c.descrizione_ai_finale,
          descrizione_ai_proposta: c.descrizione_ai_proposta,
          note_iniziali: c.note_iniziali,
          nome_cartella: c.nome_cartella,
          codice_interno: c.codice_interno,
        }) || c.codice_interno || null;
    }
  }

  // Genera QR data URL lato server
  const url = qrUrl(appOrigin(), token);
  const qrDataUrl = await QRCode.toDataURL(url, {
    width: 900,
    margin: 1,
    errorCorrectionLevel: 'M',
  });

  const templateIniziale = risolviTemplateQr(searchParams?.template);

  return (
    <StampaQrClient
      qrDataUrl={qrDataUrl}
      url={url}
      titolo={cantiere.nome}
      codice={cantiere.codice}
      cliente={clienteLabel}
      indirizzo={cantiere.indirizzo}
      tenant={{
        nome: tenantData?.nome ?? '',
        logoUrl: tenantData?.logo_url ?? null,
        brandColor: tenantData?.brand_color ?? null,
      }}
      templateIniziale={templateIniziale}
    />
  );
}

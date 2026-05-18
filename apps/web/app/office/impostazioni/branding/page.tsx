import { Palette } from 'lucide-react';
import { requireTenantContext } from '@impiantixplus/api/tenant';
import { createServerSupabase } from '@impiantixplus/api/server';
import { SectionHeader } from '../_components/section-header';
import { AdminRequiredNotice } from '../_components/admin-required';
import { canManageTenant } from '../_components/role-gate';
import { BrandingForm } from './_components/branding-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Branding · Impostazioni' };

export default async function BrandingPage() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();
  const canEdit = canManageTenant(ctx);

  const { data: tenant } = await supabase
    .from('tenants')
    .select('nome, brand_color, logo_url, inbound_email, slug')
    .eq('id', ctx.tenantId)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Branding tenant"
        description="Personalizza nome visibile, colore accent, logo e indirizzo email inbound per i ticket."
        icon={<Palette />}
      />
      {!canEdit ? <AdminRequiredNotice /> : null}
      <BrandingForm
        initialNome={tenant?.nome ?? ''}
        initialLogoUrl={tenant?.logo_url ?? ''}
        initialBrandColor={tenant?.brand_color ?? ''}
        initialInboundEmail={tenant?.inbound_email ?? ''}
        canEdit={canEdit}
      />
    </div>
  );
}

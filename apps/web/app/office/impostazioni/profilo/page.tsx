import { Card, CardContent } from '@impiantixplus/ui';
import { UserCog } from 'lucide-react';
import { requireTenantContext } from '@impiantixplus/api/tenant';
import { createServerSupabase } from '@impiantixplus/api/server';
import { SectionHeader } from '../_components/section-header';
import { ProfiloForm } from './_components/profilo-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Profilo · Impostazioni' };

export default async function ProfiloPage() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  const { data } = await supabase
    .from('users')
    .select('display_name, avatar_url, role')
    .eq('id', ctx.userId)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Profilo personale"
        description="Aggiorna nome visibile e avatar. Le modifiche vengono propagate all'header del prodotto."
        icon={<UserCog />}
      />
      <Card>
        <CardContent className="pt-6">
          <ProfiloForm
            email={ctx.email}
            displayName={data?.display_name ?? ''}
            avatarUrl={data?.avatar_url ?? ''}
            role={data?.role ?? ctx.role}
          />
        </CardContent>
      </Card>
    </div>
  );
}

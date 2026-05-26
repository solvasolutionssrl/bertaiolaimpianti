import { Card, CardContent } from '@kommessa/ui';
import { UserCog, ShieldCheck } from 'lucide-react';

import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';

import { SectionHeader } from '../_components/section-header';
import { ProfiloForm } from './_components/profilo-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Profilo · Impostazioni' };

const ROLE_LABEL: Record<string, string> = {
  admin: 'Amministratore',
  office: 'Ufficio',
  tecnico: 'Tecnico',
  cliente: 'Cliente',
};

const ROLE_DESCR: Record<string, string> = {
  admin: 'Accesso completo: commesse, utenti, impostazioni tenant.',
  office: 'Backoffice: gestione commesse e ticket senza accesso alle impostazioni avanzate.',
  tecnico: 'Operativo in cantiere tramite PWA mobile.',
  cliente: 'Accesso al portale white-label (visualizzazione).',
};

export default async function ProfiloPage() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  const { data } = await supabase
    .from('users')
    .select('display_name, avatar_url, role')
    .eq('id', ctx.userId)
    .maybeSingle();

  const role = data?.role ?? ctx.role;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">
      {/* Form principale */}
      <div className="space-y-4">
        <SectionHeader
          title="Profilo personale"
          description="Aggiorna nome visibile e avatar."
          icon={<UserCog />}
        />
        <Card>
          <CardContent className="pt-6">
            <ProfiloForm
              email={ctx.email}
              displayName={data?.display_name ?? ''}
              avatarUrl={data?.avatar_url ?? ''}
              role={role}
            />
          </CardContent>
        </Card>
      </div>

      {/* Sidebar: ruolo e account */}
      <div className="space-y-4 pt-[52px]">
        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Ruolo account
              </p>
            </div>
            <p className="text-sm font-semibold text-foreground">
              {ROLE_LABEL[role] ?? role}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {ROLE_DESCR[role] ?? ''}
            </p>
            <div className="mt-4 space-y-2 border-t border-border pt-4">
              <Row label="Email" value={ctx.email} />
              <Row label="ID utente" value={ctx.userId.slice(0, 8) + '…'} mono />
              <Row label="Tenant" value={ctx.tenantSlug} mono />
            </div>
          </CardContent>
        </Card>
        <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
          Per modificare email o ruolo contatta un amministratore del tenant.
        </p>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <span
        className={`min-w-0 truncate text-right text-xs ${mono ? 'font-mono' : ''}`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

import { Users } from 'lucide-react';
import { requireTenantContext } from '@kommessa/api/tenant';
import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { SectionHeader } from '../_components/section-header';
import { AdminRequiredNotice } from '../_components/admin-required';
import { canManageTenant } from '../_components/role-gate';
import { UtentiTable, type UtenteRow } from './_components/utenti-table';
import type { AppRole } from '@kommessa/api';
import type { UserPermissionOverrides } from '@kommessa/api/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Utenti · Impostazioni' };

interface UserAppRow {
  id: string;
  display_name: string | null;
  role: AppRole;
  attivo: boolean;
  avatar_url: string | null;
  permissions: UserPermissionOverrides | null;
}

const ROLE_LABEL: Record<AppRole, string> = {
  admin: 'Admin',
  office: 'Office',
  tecnico: 'Tecnico',
  cliente: 'Cliente',
};

export default async function UtentiPage() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();
  const canEdit = canManageTenant(ctx);

  const { data: appUsers, error } = await supabase
    .from('users')
    .select('id, display_name, role, attivo, avatar_url, permissions')
    .eq('tenant_id', ctx.tenantId)
    .order('attivo', { ascending: false })
    .order('display_name', { ascending: true });

  // Query separata per le colonne aggiunte dalla migration invite_tracking
  // (non ancora nei tipi generati da Supabase, cast esplicito).
  const { data: inviteRaw } = await (supabase as unknown as any)
    .from('users')
    .select('id, invite_sent_at, invite_accepted_at')
    .eq('tenant_id', ctx.tenantId);
  const inviteMap = new Map<string, { invite_sent_at: string | null; invite_accepted_at: string | null }>(
    ((inviteRaw ?? []) as Array<{ id: string; invite_sent_at: string | null; invite_accepted_at: string | null }>)
      .map((r) => [r.id, { invite_sent_at: r.invite_sent_at, invite_accepted_at: r.invite_accepted_at }]),
  );

  const enriched: UtenteRow[] = [];
  if (appUsers && appUsers.length > 0) {
    let admin;
    try {
      admin = createServiceSupabase();
    } catch {
      admin = null;
    }

    if (admin) {
      const ids = (appUsers as unknown as UserAppRow[]).map((u) => u.id);
      const lookups = await Promise.all(
        ids.map((id) =>
          admin!.auth.admin
            .getUserById(id)
            .then((res) => ({
              id,
              email: res.data.user?.email ?? '',
              last_sign_in_at: res.data.user?.last_sign_in_at ?? null,
            }))
            .catch(() => ({ id, email: '', last_sign_in_at: null })),
        ),
      );
      const byId = new Map(lookups.map((l) => [l.id, l]));
      for (const u of appUsers as UserAppRow[]) {
        const meta = byId.get(u.id);
        enriched.push({
          id: u.id,
          display_name: u.display_name,
          role: u.role,
          attivo: u.attivo,
          avatar_url: u.avatar_url,
          email: meta?.email ?? '',
          last_sign_in_at: meta?.last_sign_in_at ?? null,
          invite_sent_at: inviteMap.get(u.id)?.invite_sent_at ?? null,
          invite_accepted_at: inviteMap.get(u.id)?.invite_accepted_at ?? null,
          permission_overrides: (u.permissions as UserPermissionOverrides | null) ?? null,
        });
      }
    } else {
      for (const u of appUsers as UserAppRow[]) {
        enriched.push({
          id: u.id,
          display_name: u.display_name,
          role: u.role,
          attivo: u.attivo,
          avatar_url: u.avatar_url,
          email: '—',
          last_sign_in_at: null,
          invite_sent_at: inviteMap.get(u.id)?.invite_sent_at ?? null,
          invite_accepted_at: inviteMap.get(u.id)?.invite_accepted_at ?? null,
          permission_overrides: (u.permissions as UserPermissionOverrides | null) ?? null,
        });
      }
    }
  }

  // Calcola stats per la strip
  const totale = enriched.length;
  const attivi = enriched.filter((u) => u.attivo).length;
  const perRuolo = (['admin', 'office', 'tecnico', 'cliente'] as AppRole[]).map(
    (r) => ({
      role: r,
      label: ROLE_LABEL[r],
      count: enriched.filter((u) => u.role === r && u.attivo).length,
    }),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <SectionHeader
          title="Utenti del tenant"
          description="Gestisci accessi, ruoli e disattivazioni."
          icon={<Users />}
        />
        {/* Stats strip inline */}
        <div className="flex shrink-0 items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-2">
          <Stat label="Totale" value={totale} />
          <div className="h-6 w-px bg-border" />
          <Stat label="Attivi" value={attivi} accent />
          <div className="h-6 w-px bg-border" />
          {perRuolo
            .filter((r) => r.count > 0)
            .map((r) => (
              <Stat key={r.role} label={r.label} value={r.count} />
            ))}
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Errore di caricamento: {error.message}
        </p>
      ) : null}

      {!canEdit ? <AdminRequiredNotice /> : null}

      <UtentiTable
        utenti={enriched}
        canEdit={canEdit}
        currentUserId={ctx.userId}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="text-center">
      <p className={`text-base font-semibold tabular-nums ${accent ? 'text-primary' : 'text-foreground'}`}>
        {value}
      </p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

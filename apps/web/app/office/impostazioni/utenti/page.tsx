import { Users } from 'lucide-react';
import { requireTenantContext } from '@impiantixplus/api/tenant';
import { createServerSupabase } from '@impiantixplus/api/server';
import { createServiceSupabase } from '@impiantixplus/api/service';
import { SectionHeader } from '../_components/section-header';
import { AdminRequiredNotice } from '../_components/admin-required';
import { canManageTenant } from '../_components/role-gate';
import { UtentiTable, type UtenteRow } from './_components/utenti-table';
import type { AppRole } from '@impiantixplus/api';
import type { UserPermissionOverrides } from '@impiantixplus/api/types';

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

  // Per arricchire con email + ultimo accesso usiamo la service-role
  // (auth.users non è esposta dietro RLS in modo praticabile).
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
      // listUsers non supporta filtro by-id batch: leggiamo i singoli via getUserById in parallelo
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
          permission_overrides: (u.permissions as UserPermissionOverrides | null) ?? null,
        });
      }
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Utenti del tenant"
        description="Gestisci accessi, ruoli e disattivazioni. L'invito invia un'email con link per impostare la password."
        icon={<Users />}
      />

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

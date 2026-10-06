import { Users } from 'lucide-react';
import { requireTenantContext } from '@kommessa/api/tenant';
import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { SectionHeader } from '../_components/section-header';
import { AdminRequiredNotice } from '../_components/admin-required';
import { canManageTenant } from '../_components/role-gate';
import { UtentiTable, type UtenteRow } from './_components/utenti-table';
import type { AppRole } from '@kommessa/api';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Utenti · Impostazioni' };

interface UserAppRow {
  id: string;
  display_name: string | null;
  role: AppRole;
  attivo: boolean;
  avatar_url: string | null;
  permissions: unknown;
  must_change_password: boolean | null;
  invite_sent_at: string | null;
  invite_accepted_at: string | null;
}

const ROLE_LABEL: Record<AppRole, string> = {
  admin: 'Amministratori',
  office: 'Ufficio',
  tecnico: 'Tecnici',
  cliente: 'Clienti',
};

export default async function UtentiPage() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();
  const canEdit = canManageTenant(ctx);

  // Una query sola. `permissions`, `must_change_password` e le colonne
  // dell'invito non stanno nei tipi generati: il cast è lo stesso idioma usato
  // in tutto il repo per le tabelle rimaste indietro.
  const { data: appUsers, error } = await (supabase as any)
    .from('users')
    .select(
      'id, display_name, role, attivo, avatar_url, permissions, must_change_password, invite_sent_at, invite_accepted_at',
    )
    .eq('tenant_id', ctx.tenantId)
    .order('attivo', { ascending: false })
    .order('display_name', { ascending: true });

  const righeApp = (appUsers ?? []) as UserAppRow[];

  /**
   * Con che cosa entra ogni persona, e quando è entrata l'ultima volta.
   *
   * ⚠️ Prima qui c'era una chiamata `getUserById` **per ogni utente**: nove
   * round-trip con nove persone, trecento con trecento — e domani si creano
   * venti account in un pomeriggio. Ora è una chiamata sola che prende l'elenco
   * e ne tiene gli id che servono.
   */
  const perId = new Map<string, { email: string; last_sign_in_at: string | null }>();
  if (righeApp.length > 0) {
    try {
      const admin = createServiceSupabase();
      const voluti = new Set(righeApp.map((u) => u.id));
      const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      for (const au of data?.users ?? []) {
        if (!voluti.has(au.id)) continue;
        perId.set(au.id, {
          email: au.email ?? '',
          last_sign_in_at: au.last_sign_in_at ?? null,
        });
      }
    } catch {
      // Senza service role non si sa con cosa entrano: si mostra il resto.
    }
  }

  const enriched: UtenteRow[] = righeApp.map((u) => ({
    id: u.id,
    display_name: u.display_name,
    role: u.role,
    attivo: u.attivo,
    avatar_url: u.avatar_url,
    email: perId.get(u.id)?.email ?? '',
    last_sign_in_at: perId.get(u.id)?.last_sign_in_at ?? null,
    invite_sent_at: u.invite_sent_at,
    invite_accepted_at: u.invite_accepted_at,
    permissions: u.permissions,
    must_change_password: u.must_change_password === true,
  }));

  // Calcola stats per la strip
  const totale = enriched.length;
  const attivi = enriched.filter((u) => u.attivo).length;
  // Chi ha ancora la password consegnata dall'ufficio: è la domanda del giorno
  // in cui si distribuiscono gli accessi.
  const daConsegnare = enriched.filter((u) => u.attivo && u.must_change_password).length;
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
          title="Chi entra nell’app"
          description="Accessi, mestiere, poteri in più. I tecnici entrano con nome utente e password, senza email."
          icon={<Users />}
        />
        {/* Stats strip inline */}
        <div className="flex shrink-0 items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-2">
          <Stat label="Totale" value={totale} />
          <div className="h-6 w-px bg-border" />
          <Stat label="Attivi" value={attivi} accent />
          <div className="h-6 w-px bg-border" />
          {daConsegnare > 0 ? (
            <>
              <Stat label="Password da scegliere" value={daConsegnare} avviso />
              <div className="h-6 w-px bg-border" />
            </>
          ) : null}
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
  avviso,
}: {
  label: string;
  value: number;
  accent?: boolean;
  avviso?: boolean;
}) {
  const colore = avviso
    ? 'text-amber-600 dark:text-amber-400'
    : accent
      ? 'text-primary'
      : 'text-foreground';
  return (
    <div className="text-center">
      <p className={`text-base font-semibold tabular-nums ${colore}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

import Link from 'next/link';
import type { Metadata } from 'next';
import { ShieldCheck, Smartphone } from 'lucide-react';

import { createServerSupabase } from '@impiantixplus/api/server';
import { Avatar, AvatarFallback, Button } from '@impiantixplus/ui';

import { guardMobile } from '../_lib/guard';
import { LogoutButton } from './logout-button';
import { PushToggle } from './push-toggle';
import { PreferenzeNotifiche, type PrefRow } from './preferenze-notifiche';

export const metadata: Metadata = {
  title: 'Profilo',
};

export default async function ProfiloPage() {
  const ctx = await guardMobile();
  const supabase = createServerSupabase();

  const { data: profilo } = await supabase
    .from('users')
    .select('display_name, role, avatar_url')
    .eq('id', ctx.userId)
    .single();

  const { data: tenant } = await supabase
    .from('tenants')
    .select('nome, slug')
    .eq('id', ctx.tenantId)
    .single();

  // Preferenze notifiche (vista effettiva = riga utente ∨ default catalogo)
  const [prefsRes, quietRes] = await Promise.all([
    supabase
      .from('notification_preferences_effective')
      .select('event_code, label, description, critical, in_app, push, email, ordine')
      .eq('user_id', ctx.userId)
      .order('ordine'),
    supabase
      .from('users')
      .select('quiet_hours_start, quiet_hours_end')
      .eq('id', ctx.userId)
      .maybeSingle(),
  ]);
  const prefs: PrefRow[] = ((prefsRes.data ?? []) as any[]).map((r) => ({
    event_code: r.event_code,
    label: r.label,
    description: r.description ?? null,
    critical: r.critical ?? false,
    in_app: r.in_app ?? true,
    push: r.push ?? true,
    email: r.email ?? false,
  }));
  const quiet = (quietRes.data ?? null) as {
    quiet_hours_start: number | null;
    quiet_hours_end: number | null;
  } | null;

  const displayName = profilo?.display_name ?? ctx.email.split('@')[0];
  const initials = displayName
    .split(/\s+/)
    .map((s) => s.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');

  return (
    <div className="flex min-h-[100dvh] flex-col gap-5 p-4">
      <header className="mt-2 flex items-center gap-3">
        <Avatar className="h-14 w-14">
          <AvatarFallback className="text-base">{initials}</AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-lg font-semibold">{displayName}</h1>
          <p className="text-xs text-muted-foreground">{ctx.email}</p>
          <p className="mt-0.5 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              {profilo?.role ?? ctx.role}
            </span>
          </p>
        </div>
      </header>

      <section className="rounded-lg border bg-card p-4 text-sm">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Azienda
        </p>
        <p className="mt-1 font-medium">{tenant?.nome ?? ctx.tenantSlug}</p>
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Notifiche push
        </p>
        <PushToggle />
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Cosa, quando, come
        </p>
        <PreferenzeNotifiche
          initial={prefs}
          quietStart={quiet?.quiet_hours_start ?? null}
          quietEnd={quiet?.quiet_hours_end ?? null}
        />
      </section>

      <nav aria-label="Azioni profilo" className="flex flex-col gap-2">
        <Link href="/mobile/installazione" passHref>
          <Button
            variant="outline"
            size="lg"
            className="min-h-[48px] w-full justify-start"
          >
            <Smartphone className="h-4 w-4" aria-hidden="true" />
            Aggiungi alla schermata Home
          </Button>
        </Link>
      </nav>

      <LogoutButton />

      <footer className="mt-auto pt-6 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
        impiantiXplus · powered by SOLVA
      </footer>
    </div>
  );
}

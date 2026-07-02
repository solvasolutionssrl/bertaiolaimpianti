import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, Receipt, ChevronRight } from 'lucide-react';

import { createServerSupabase } from '@kommessa/api/server';
import { Avatar, AvatarFallback } from '@kommessa/ui';
import type { CategoriaSpesa } from '@kommessa/api/spese';
import { CATEGORIA_META } from '@/app/_components/spese/categoria';
import { titoloCase } from '@/app/mobile/_lib/display-case';

import { guardMobile } from '../_lib/guard';
import { InstallPromptHint } from '../_components/install-prompt-hint';
import { LogoutButton } from './logout-button';
import { PushToggle } from './push-toggle';
import { PreferenzeNotifiche, type PrefRow } from './preferenze-notifiche';
import { NuovaSpesa } from '../kantiere/spese/_components/nuova-spesa';

export const metadata: Metadata = {
  title: 'Profilo',
};

type SpesaMini = {
  id: string;
  esercente: string | null;
  categoria: CategoriaSpesa;
  importo: number | null;
  valuta: string | null;
  data: string | null;
};

function fmtData(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(d);
}

function fmtImporto(n: number | null): string {
  if (n == null) return '—';
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function ProfiloPage() {
  const ctx = await guardMobile();
  const supabase = createServerSupabase();

  const [profRes, tenRes] = await Promise.all([
    supabase.from('users').select('display_name, role, avatar_url').eq('id', ctx.userId).single(),
    // `app_mode` non è nei tipi generati → cast (come nel layout mobile).
    supabase.from('tenants' as never).select('nome, slug, app_mode').eq('id', ctx.tenantId).single(),
  ]);
  const profilo = profRes.data as {
    display_name: string | null;
    role: string | null;
    avatar_url: string | null;
  } | null;
  const tenant = tenRes.data as {
    nome: string | null;
    slug: string | null;
    app_mode: string | null;
  } | null;

  const appMode = tenant?.app_mode ?? null;
  const isKantiere = appMode === 'kantiere' || appMode === 'full';
  const isManager = ctx.role === 'admin' || ctx.role === 'office';

  // Preferenze notifiche: solo mondo COMMESSE. In Kantiere le notifiche si
  // gestiscono dalla campanella fissa → niente matrice/quiet-hours (erano di
  // kommessa). Si evita anche di interrogarle.
  let prefs: PrefRow[] = [];
  let quiet: { quiet_hours_start: number | null; quiet_hours_end: number | null } | null = null;
  if (!isKantiere) {
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
    prefs = ((prefsRes.data ?? []) as any[]).map((r) => ({
      event_code: r.event_code,
      label: r.label,
      description: r.description ?? null,
      critical: r.critical ?? false,
      in_app: r.in_app ?? true,
      push: r.push ?? true,
      email: r.email ?? false,
    }));
    quiet = (quietRes.data ?? null) as {
      quiet_hours_start: number | null;
      quiet_hours_end: number | null;
    } | null;
  }

  // Panoramica spese: solo Kantiere + admin/office con profilo dipendente (per
  // registrare a proprio nome). Ultime 2 + opzioni cantiere per l'aggiunta.
  let mioDip: string | null = null;
  let ultimeSpese: SpesaMini[] = [];
  let cantieriOpts: { id: string; nome: string }[] = [];
  if (isKantiere && isManager) {
    const { data: dipRow } = await supabase
      .from('dipendenti' as never)
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('user_id', ctx.userId)
      .maybeSingle();
    mioDip = (dipRow as { id: string } | null)?.id ?? null;
    if (mioDip) {
      const [speseRes, cantRes] = await Promise.all([
        supabase
          .from('spese' as never)
          .select('id, ragione_sociale, categoria, importo_totale, valuta, data_scontrino, created_at')
          .eq('tenant_id', ctx.tenantId)
          .eq('dipendente_id', mioDip)
          .order('created_at', { ascending: false })
          .limit(2),
        supabase
          .from('cantieri' as never)
          .select('id, nome, codice')
          .eq('tenant_id', ctx.tenantId)
          .order('nome', { ascending: true }),
      ]);
      ultimeSpese = ((speseRes.data as any[] | null) ?? []).map((r) => ({
        id: r.id,
        esercente: r.ragione_sociale ?? null,
        categoria: r.categoria as CategoriaSpesa,
        importo: r.importo_totale,
        valuta: r.valuta,
        data: r.data_scontrino ?? r.created_at ?? null,
      }));
      cantieriOpts = ((cantRes.data as { id: string; nome: string | null; codice: string | null }[] | null) ?? []).map(
        (c) => ({ id: c.id, nome: c.nome ? titoloCase(c.nome) : c.codice || 'Cantiere' }),
      );
    }
  }

  const displayName = profilo?.display_name ?? ctx.email.split('@')[0] ?? 'Utente';
  const initials = displayName
    .split(/\s+/)
    .map((s) => s.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');

  return (
    <div className="animate-content-in flex min-h-[100dvh] flex-col gap-5 p-4">
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

      {/* Panoramica spese (Kantiere, admin/office con profilo dipendente):
          ultime 2 + aggiungi + vedi tutte. L'admin non ha una tab Spese dedicata. */}
      {isKantiere && isManager && mioDip ? (
        <section className="rounded-xl border border-border bg-card p-4 shadow-soft">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
              <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
              Le tue spese
            </p>
            <Link
              href="/mobile/kantiere/spese"
              className="flex items-center gap-0.5 text-xs font-medium text-primary active:opacity-70"
            >
              Vedi tutte
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>

          {ultimeSpese.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {ultimeSpese.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium">
                      {s.esercente || CATEGORIA_META[s.categoria]?.label || 'Spesa'}
                    </span>
                    {fmtData(s.data) ? (
                      <span className="ml-1.5 text-xs text-muted-foreground">{fmtData(s.data)}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {fmtImporto(s.importo)} {s.valuta || 'EUR'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Nessuna spesa registrata.</p>
          )}

          <div className="mt-3">
            <NuovaSpesa
              adminMode
              cantieri={cantieriOpts}
              dipendenteId={mioDip}
              triggerVariant="quick"
            />
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border bg-card p-4 text-sm">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Azienda
        </p>
        <p className="mt-1 font-medium">{tenant?.nome ?? ctx.tenantSlug}</p>
      </section>

      {/* Gestione notifiche granulare: solo mondo commesse (in Kantiere è la
          campanella a gestire tutto). */}
      {!isKantiere ? (
        <>
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
        </>
      ) : null}

      <section aria-label="Installazione app" className="flex flex-col gap-2">
        <InstallPromptHint />
      </section>

      <LogoutButton />

      <footer className="mt-auto pt-6 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
        Kommessa · powered by SOLVA
      </footer>
    </div>
  );
}

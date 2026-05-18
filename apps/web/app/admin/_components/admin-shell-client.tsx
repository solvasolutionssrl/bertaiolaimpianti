'use client';

import * as React from 'react';
import NextLink from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  BarChart3,
  Building2,
  HeartPulse,
  Layers,
  LogOut,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Badge, cn } from '@impiantixplus/ui';
import { createBrowserSupabase } from '@impiantixplus/api/client';

interface AdminNavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
}

const NAV: AdminNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/admin', icon: BarChart3 },
  { id: 'tenants', label: 'Tenants', href: '/admin/tenants', icon: Building2 },
  { id: 'piani', label: 'Piani', href: '/admin/piani', icon: Layers },
  { id: 'utenti', label: 'Utenti globali', href: '/admin/utenti', icon: Users },
  { id: 'audit', label: 'Audit', href: '/admin/audit', icon: Activity },
  { id: 'salute', label: 'Salute sistema', href: '/admin/salute', icon: HeartPulse },
  { id: 'profilo', label: 'Profilo', href: '/admin/profilo', icon: UserCog },
];

interface Props {
  user: { name: string; email: string };
  children: React.ReactNode;
}

/**
 * Shell platform admin.
 *
 * Scelte cromatiche (volutamente DIVERSE da OfficeShell):
 *  - Header h-14 `bg-foreground text-background` (ink near-black)
 *  - Sidebar w-60 `bg-foreground` con text-background
 *  - Active state: bg-white/10 + bordo arancio sx + text bianco
 *  - Niente blu Bertaiola: questa UI rappresenta SOLVA Platform, non
 *    il tenant. L'unico colore vivace è l'arancio SOLVA accent.
 */
export function AdminShellClient({ user, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  const activeId = React.useMemo(() => {
    if (!pathname) return undefined;
    // longest prefix match (exact first)
    const exact = NAV.find((n) => n.href === pathname);
    if (exact) return exact.id;
    const matches = NAV
      .filter((n) => n.href !== '/' && pathname.startsWith(n.href + '/'))
      .sort((a, b) => b.href.length - a.href.length);
    return matches[0]?.id;
  }, [pathname]);

  const handleSignOut = React.useCallback(async () => {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }, [router]);

  const initials = React.useMemo(() => {
    const parts = user.name.split(/\s+/).filter(Boolean);
    return (
      parts
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? '')
        .join('') || '?'
    );
  }, [user.name]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* ===================== Header ink ===================== */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-foreground px-4 text-background md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent font-mono text-xs font-bold leading-none text-accent-foreground"
          >
            S
          </span>
          <div className="flex min-w-0 items-baseline gap-2 leading-none">
            <span className="font-mono text-sm font-semibold tracking-tight">
              SOLVA · Platform
            </span>
            <Badge className="hidden border-transparent bg-accent text-accent-foreground sm:inline-flex">
              PLATFORM ADMIN
            </Badge>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <NextLink
            href="/office"
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 text-xs font-medium tracking-tight text-background/90 transition-colors hover:bg-white/10 hover:text-background',
            )}
            title="Esci come admin e torna alla UI tenant"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Torna come tenant</span>
            <span className="sm:hidden">Tenant</span>
          </NextLink>
          <div className="ml-1 flex items-center gap-2 border-l border-white/10 pl-3">
            <span
              aria-hidden="true"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 font-mono text-[11px] font-semibold tracking-tight"
            >
              {initials}
            </span>
            <div className="hidden flex-col leading-tight md:flex">
              <span className="text-xs font-semibold tracking-tight">
                {user.name}
              </span>
              <span className="font-mono text-[10px] text-background/60">
                {user.email}
              </span>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              title="Esci"
              aria-label="Esci"
              className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-background/70 transition-colors hover:bg-white/10 hover:text-background"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* ===================== Sidebar ink ===================== */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 flex-col justify-between bg-foreground text-background/85 md:flex">
          <div className="flex-1 overflow-y-auto">
            <div className="px-5 pb-2 pt-5">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-background/50">
                Platform
              </p>
            </div>
            <nav
              aria-label="Navigazione platform"
              className="flex flex-col gap-0.5 px-3"
            >
              {NAV.map((item) => {
                const Icon = item.icon;
                const isActive = item.id === activeId;
                return (
                  <NextLink
                    key={item.id}
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'relative group flex min-h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium tracking-tight transition-colors',
                      isActive
                        ? 'bg-white/10 font-semibold text-background'
                        : 'text-background/70 hover:bg-white/5 hover:text-background',
                    )}
                  >
                    {isActive ? (
                      <span
                        aria-hidden="true"
                        className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent shadow-[0_0_10px_hsl(var(--accent)/0.65)]"
                      />
                    ) : null}
                    <Icon
                      className={cn(
                        'h-4 w-4 shrink-0 transition-colors',
                        isActive ? 'text-accent' : 'text-background/55 group-hover:text-background',
                      )}
                      aria-hidden="true"
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                  </NextLink>
                );
              })}
            </nav>
          </div>

          <div className="border-t border-white/10 px-4 py-3">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-background/45">
              SOLVA Platform
            </p>
            <p className="mt-1 font-mono text-[11px] text-background/70">
              v0.1
            </p>
          </div>
        </aside>

        {/* ===================== Main ===================== */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="mx-auto w-full max-w-screen-2xl flex-1 px-6 py-8 md:px-10 md:py-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

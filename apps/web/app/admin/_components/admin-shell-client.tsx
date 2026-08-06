'use client';

import * as React from 'react';
import NextLink from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  BarChart3,
  Building2,
  CloudUpload,
  FileEdit,
  HardDrive,
  Plug,
  HardHat,
  HeartPulse,
  KeyRound,
  Layers,
  LogOut,
  Menu,
  QrCode,
  ReceiptText,
  Timer,
  UserCog,
  Users,
  X,
  Smartphone,
  type LucideIcon,
} from 'lucide-react';
import { Badge, cn } from '@kommessa/ui';
import { createBrowserSupabase } from '@kommessa/api/client';
import { registraEventoAccesso } from '@/app/_actions/auth-events';

interface AdminNavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
}

interface AdminNavGroup {
  label: string;
  items: AdminNavItem[];
}

/**
 * Nav raggruppata per tipologia (la lista piatta era cresciuta troppo).
 * Le superfici Kantiere vivono in un gruppo dedicato.
 */
const NAV_GROUPS: AdminNavGroup[] = [
  {
    label: 'Piattaforma',
    items: [
      { id: 'dashboard', label: 'Dashboard', href: '/admin', icon: BarChart3 },
      { id: 'tenants', label: 'Tenant', href: '/admin/tenants', icon: Building2 },
      { id: 'piani', label: 'Piani', href: '/admin/piani', icon: Layers },
      { id: 'utenti', label: 'Utenti globali', href: '/admin/utenti', icon: Users },
    ],
  },
  {
    label: 'Kantiere',
    items: [
      { id: 'kantiere', label: 'Panoramica', href: '/admin/kantiere', icon: HardHat },
      { id: 'kantiere-timbrature', label: 'Timbrature', href: '/admin/kantiere/timbrature', icon: Timer },
      { id: 'kantiere-kontabilita', label: 'Kontabilità', href: '/admin/kantiere/kontabilita', icon: ReceiptText },
      { id: 'kantiere-qr', label: 'QR cantiere', href: '/admin/kantiere-qr', icon: QrCode },
    ],
  },
  {
    label: 'Contenuti & storage',
    items: [
      { id: 'media', label: 'Media & sync', href: '/admin/media', icon: CloudUpload },
      { id: 'storage-r2', label: 'Storage R2', href: '/admin/storage-r2', icon: HardDrive },
      { id: 'bozze', label: 'Bozze', href: '/admin/bozze', icon: FileEdit },
      {
        id: 'integrazioni',
        label: 'Integrazioni',
        href: '/admin/integrazioni',
        icon: Plug,
      },
    ],
  },
  {
    label: 'Sistema & sicurezza',
    items: [
      { id: 'audit', label: 'Audit', href: '/admin/audit', icon: Activity },
      { id: 'accessi', label: 'Accessi', href: '/admin/accessi', icon: KeyRound },
      { id: 'token-app', label: 'Token app', href: '/admin/token-app', icon: Smartphone },
      { id: 'salute', label: 'Salute sistema', href: '/admin/salute', icon: HeartPulse },
    ],
  },
  {
    label: 'Account',
    items: [{ id: 'profilo', label: 'Profilo', href: '/admin/profilo', icon: UserCog }],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

interface Props {
  user: { name: string; email: string };
  children: React.ReactNode;
}

export function AdminShellClient({ user, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const activeId = React.useMemo(() => {
    if (!pathname) return undefined;
    const exact = ALL_ITEMS.find((n) => n.href === pathname);
    if (exact) return exact.id;
    const matches = ALL_ITEMS.filter(
      (n) => n.href !== '/' && pathname.startsWith(n.href + '/'),
    ).sort((a, b) => b.href.length - a.href.length);
    return matches[0]?.id;
  }, [pathname]);

  // Chiudi il drawer al cambio rotta.
  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const handleSignOut = React.useCallback(async () => {
    await registraEventoAccesso('logout');
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
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* ===================== Header ink (fisso: scrolla solo <main>) ===================== */}
      <header className="z-30 flex h-14 shrink-0 items-center gap-3 bg-foreground px-4 text-background md:px-6">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Apri menu"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-background/80 transition-colors hover:bg-white/10 md:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent font-mono text-xs font-bold leading-none text-accent-foreground"
          >
            S
          </span>
          <div className="flex min-w-0 items-baseline gap-2 leading-none">
            <span className="font-mono text-sm font-semibold tracking-tight">SOLVA · Platform</span>
            <Badge className="hidden border-transparent bg-accent text-accent-foreground sm:inline-flex">
              PLATFORM ADMIN
            </Badge>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <NextLink
            href="/office"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 text-xs font-medium tracking-tight text-background/90 transition-colors hover:bg-white/10 hover:text-background"
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
              <span className="text-xs font-semibold tracking-tight">{user.name}</span>
              <span className="font-mono text-[10px] text-background/60">{user.email}</span>
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

      <div className="flex flex-1 min-h-0">
        {/* ===================== Sidebar ink (desktop) — h-full, non scrolla ===================== */}
        <aside className="hidden h-full w-60 shrink-0 flex-col justify-between bg-foreground text-background/85 md:flex">
          <div className="flex-1 overflow-y-auto min-h-0 py-4">
            <NavGroups activeId={activeId} />
          </div>
          <div className="border-t border-white/10 px-4 py-3">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-background/45">
              SOLVA Platform
            </p>
            <p className="mt-1 font-mono text-[11px] text-background/70">v0.1</p>
          </div>
        </aside>

        {/* ===================== Drawer mobile ===================== */}
        {mobileOpen ? (
          <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
            <div className="absolute inset-y-0 left-0 flex w-72 max-w-[82%] flex-col bg-foreground text-background/85 shadow-2xl">
              <div className="flex h-14 items-center justify-between px-4">
                <span className="font-mono text-sm font-semibold tracking-tight text-background">
                  SOLVA · Platform
                </span>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Chiudi menu"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-background/80 hover:bg-white/10"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto py-2">
                <NavGroups activeId={activeId} />
              </div>
            </div>
          </div>
        ) : null}

        {/* ===================== Main (UNICA area che scrolla) ===================== */}
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          <div className="mx-auto w-full max-w-screen-2xl flex-1 px-4 py-6 sm:px-6 md:px-10 md:py-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function NavGroups({ activeId }: { activeId: string | undefined }) {
  return (
    <nav aria-label="Navigazione platform" className="flex flex-col gap-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="px-5 pb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-background/40">
            {group.label}
          </p>
          <div className="flex flex-col gap-0.5 px-3">
            {group.items.map((item) => {
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
          </div>
        </div>
      ))}
    </nav>
  );
}

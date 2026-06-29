'use client';

import * as React from 'react';
import {
  Bell,
  Briefcase,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  LayoutDashboard,
  Menu,
  Puzzle,
  Search,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '../lib/cn';
import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from './avatar';

export interface OfficeNavItem {
  id: string;
  label: string;
  href: string;
  icon?: React.ComponentType<{ className?: string }> | LucideIcon;
  count?: number;
  separator?: boolean;
  badge?: number;
  /**
   * Trattamento header come "sezione/separatore":
   * - `'section'`: tag uppercase muto (es. AZIENDA, ALTRO).
   * - `'module'`: tag uppercase con sfondino accent leggero + simbolo add-on (Puzzle).
   */
  variant?: 'module' | 'section';
  /** Apre di default il gruppo (sezione). */
  defaultOpen?: boolean;
  /** Sotto-voci (alberatura). Se presenti, l'item diventa collapsible. */
  children?: OfficeNavItem[];
}

export const DEFAULT_OFFICE_NAV: OfficeNavItem[] = [
  { id: 'home', label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { id: 'commesse', label: 'Commesse', href: '/commesse', icon: Briefcase },
  { id: 'todo', label: 'Task', href: '/todo', icon: CircleDot },
  { id: 'clienti', label: 'Clienti', href: '/clienti', icon: Users },
  { id: 'ricerca', label: 'Ricerca', href: '/ricerca', icon: Search },
  { id: 'notifiche', label: 'Avvisi', href: '/notifiche', icon: Bell },
  { id: 'settings', label: 'Impostazioni', href: '/impostazioni', icon: Settings },
];

export interface OfficeUser {
  name: string;
  email?: string;
  avatarUrl?: string;
  role?: string;
}

export interface OfficeShellProps {
  tenant: { name: string; logoUrl?: string; brandColor?: string };
  user: OfficeUser;
  navItems?: OfficeNavItem[];
  activeNavId?: string;
  notificationCount?: number;
  onNotificationsClick?: () => void;
  onLogout?: () => void;
  linkComponent?: React.ComponentType<{
    href: string;
    children: React.ReactNode;
    className?: string;
    'aria-current'?: 'page' | undefined;
    prefetch?: boolean;
  }>;
  children: React.ReactNode;
  defaultSidebarOpen?: boolean;
  version?: string;
  className?: string;
}

/**
 * OfficeShell — shell ufficio Bertaiola, palette light professionale.
 *
 * Sidebar: superficie chiara con accent state cobalt+arancio. Active item =
 * primary-soft + barra arancio sx + label primary. Footer "Made by SOLVA"
 * visibile sotto.
 */
function OfficeShell({
  tenant,
  user,
  navItems = DEFAULT_OFFICE_NAV,
  activeNavId,
  notificationCount = 0,
  onNotificationsClick,
  onLogout,
  linkComponent: LinkComp,
  children,
  defaultSidebarOpen = true,
  version,
  className,
}: OfficeShellProps) {
  const [sidebarOpen, setSidebarOpen] = React.useState(defaultSidebarOpen);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const initials = React.useMemo(
    () =>
      user.name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? '')
        .join('') || '?',
    [user.name],
  );

  // Set di parent attualmente espansi. Seed dai gruppi `defaultOpen`; poi
  // auto-espandi quelli con figlio attivo.
  const [expanded, setExpanded] = React.useState<Set<string>>(
    () => new Set(navItems.filter((i) => i.defaultOpen).map((i) => i.id)),
  );
  React.useEffect(() => {
    if (!activeNavId) return;
    const next = new Set(expanded);
    let changed = false;
    for (const item of navItems) {
      if (item.children?.some((c) => c.id === activeNavId)) {
        if (!next.has(item.id)) {
          next.add(item.id);
          changed = true;
        }
      }
    }
    if (changed) setExpanded(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNavId, navItems]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderNavLink = (
    item: OfficeNavItem,
    opts?: { forceLabel?: boolean; isChild?: boolean },
  ) => {
    const Icon = item.icon;
    const hasChildren = (item.children?.length ?? 0) > 0;
    const childActive = hasChildren
      ? item.children!.some((c) => c.id === activeNavId)
      : false;
    const isActive = item.id === activeNavId || (hasChildren && childActive);
    const isExpanded = expanded.has(item.id) || childActive;
    const count = item.count ?? item.badge ?? 0;
    const showLabel = opts?.forceLabel || sidebarOpen;
    const isChild = opts?.isChild ?? false;
    const isModule = !isChild && item.variant === 'module';
    // Header di sezione/separatore (AZIENDA/ALTRO = section, KOMMESSA/KANTIERE = module)
    const isSectionHeader =
      !isChild && hasChildren && (item.variant === 'module' || item.variant === 'section');

    const exactActive = item.id === activeNavId;

    const linkClasses = cn(
      'relative group flex items-center gap-2.5 rounded-md text-[13px] tracking-tight transition-all',
      'px-2.5',
      // Righe più compatte: top-level ~30px, figli ~26px.
      // pl ridotto: sotto-voci vicine alla linea verticale.
      isChild ? 'pl-3 text-[12.5px] min-h-[1.625rem]' : 'min-h-[1.875rem]',
      exactActive
        ? 'bg-primary text-primary-foreground shadow-soft-md font-semibold'
        : isActive && hasChildren
          ? 'font-semibold text-primary hover:bg-card'
          : isChild
            ? // Sotto-voci: peso più leggero per distinguerle dai capi-menu
              'font-normal text-foreground/75 hover:bg-card hover:text-foreground'
            : 'font-semibold text-foreground/90 hover:bg-card hover:text-foreground hover:shadow-soft',
      !showLabel && 'md:justify-center md:px-2',
    );

    // Classi/inner dedicati per gli header di sezione (tag uppercase).
    const sectionClasses = cn(
      'relative flex w-full items-center gap-2 rounded-md px-2.5 min-h-[1.625rem] text-left',
      'text-[10.5px] font-bold uppercase tracking-[0.13em] transition-colors',
      isModule
        ? // Sfondo arancione vivo, scritta nera (solo lo sfondo è colorato)
          '!bg-accent/[0.22] text-foreground hover:!bg-accent/[0.3]'
        : 'mt-1 text-muted-foreground/60 hover:text-muted-foreground/85',
    );
    const sectionInner = (
      <>
        {isModule ? (
          <Puzzle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        ) : null}
        <span className="flex-1 truncate">{item.label}</span>
        {showLabel ? (
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'h-3.5 w-3.5 shrink-0 opacity-60 transition-transform',
              isExpanded ? 'rotate-0' : '-rotate-90',
            )}
          />
        ) : null}
      </>
    );

    const inner = (
      <>
        {exactActive ? (
          <span
            aria-hidden="true"
            className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent shadow-[0_0_10px_hsl(var(--accent)/0.65)]"
          />
        ) : null}
        {Icon && !isChild ? (
          <Icon
            className={cn(
              'h-4 w-4 shrink-0 transition-colors',
              exactActive
                ? 'text-primary-foreground'
                : isModule
                  ? 'text-accent'
                  : isActive
                    ? 'text-primary'
                    : 'text-muted-foreground group-hover:text-foreground',
            )}
          />
        ) : null}
        {isChild ? (
          <span
            aria-hidden="true"
            className={cn(
              'inline-block h-1 w-1 rounded-full shrink-0',
              exactActive ? 'bg-primary-foreground' : 'bg-muted-foreground/60',
            )}
          />
        ) : null}
        <span className={cn('flex-1 truncate', !showLabel && 'md:hidden')}>
          {item.label}
        </span>
        {count > 0 && showLabel ? (
          <span
            aria-label={`${count} non letti`}
            className={cn(
              'ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums tracking-tight',
              exactActive
                ? 'bg-accent text-accent-foreground'
                : 'bg-card text-foreground/70 group-hover:bg-muted',
            )}
          >
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
        {hasChildren && showLabel ? (
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'ml-auto h-3.5 w-3.5 shrink-0 transition-transform',
              isExpanded ? 'rotate-0' : '-rotate-90',
              exactActive ? 'text-primary-foreground' : 'text-muted-foreground/70',
            )}
          />
        ) : null}
      </>
    );

    // Se l'item ha figli e siamo in label-mode: il click apre/chiude invece di
    // navigare. Su sidebar collapsata si comporta come link normale al parent.
    if (hasChildren && showLabel) {
      return (
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls={`nav-children-${item.id}`}
          className={isSectionHeader ? sectionClasses : cn(linkClasses, 'w-full text-left')}
          onClick={() => toggleExpanded(item.id)}
          title={!showLabel ? item.label : undefined}
        >
          {isSectionHeader ? sectionInner : inner}
        </button>
      );
    }

    const linkProps = {
      href: item.href,
      className: linkClasses,
      'aria-current': exactActive ? ('page' as const) : undefined,
      title: !showLabel ? item.label : undefined,
      prefetch: true,
    };

    return LinkComp ? (
      <LinkComp {...linkProps}>{inner}</LinkComp>
    ) : (
      <a {...linkProps}>{inner}</a>
    );
  };

  const renderNav = (opts?: { forceLabel?: boolean }) => (
    <nav aria-label="Navigazione laterale" className="flex flex-col gap-0.5 px-3">
      {navItems.map((item) => {
        const hasChildren = (item.children?.length ?? 0) > 0;
        const childActive =
          hasChildren && item.children!.some((c) => c.id === activeNavId);
        const isExpanded = expanded.has(item.id) || childActive;
        return (
          <React.Fragment key={item.id}>
            {item.separator ? (
              <div className="my-1.5 border-t border-border" role="separator" />
            ) : null}
            {renderNavLink(item, opts)}
            {hasChildren && isExpanded && (opts?.forceLabel || sidebarOpen) ? (
              <div
                id={`nav-children-${item.id}`}
                className="mt-0.5 flex flex-col gap-0.5 border-l border-primary/15 ml-4 pl-0 animate-fade-up"
              >
                {item.children!.map((child) => (
                  <React.Fragment key={child.id}>
                    {renderNavLink(child, { ...opts, isChild: true })}
                  </React.Fragment>
                ))}
              </div>
            ) : null}
          </React.Fragment>
        );
      })}
    </nav>
  );

  return (
    <div className={cn('flex min-h-screen flex-col bg-background', className)}>
      {/* Sticky top: righetta brand + header INSIEME in un solo contenitore
          sticky. Prima la righetta era fuori dallo sticky → scrollando scorreva
          via e l'header (sticky top-0) saliva di 2px, lasciando una lineetta
          grigia sotto. Ora restano agganciati a top:0 senza gap. */}
      <div className="sticky top-0 z-30 shrink-0">
        <div aria-hidden="true" className="border-brand-line h-[2px] w-full" />

        {/* ===================== Header ===================== */}
        <header className="flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 md:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label={mobileOpen ? 'Chiudi menu' : 'Apri menu'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          <Menu className="h-5 w-5" />
        </Button>

        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg shadow-glow-brand"
            style={{
              background:
                'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary)) 55%, hsl(var(--accent)) 100%)',
            }}
          >
            <span className="text-base font-extrabold leading-none tracking-tighter text-white">
              K
            </span>
          </span>
          <div className="flex min-w-0 flex-col leading-none">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Kommessa
            </span>
            <span className="mt-1 hidden truncate text-[15px] font-semibold tracking-tight text-foreground sm:inline-flex sm:items-center sm:gap-1.5">
              <Building2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              {tenant.name}
            </span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative hidden md:block">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70"
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder="Cerca commesse, clienti…"
              aria-label="Ricerca rapida"
              className={cn(
                'h-10 w-64 rounded-md border border-border bg-card pl-9 pr-14 text-sm text-foreground placeholder:text-muted-foreground/70',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:border-ring/40',
                'transition-[width,box-shadow] duration-200 focus-visible:w-80',
              )}
            />
            <kbd
              aria-hidden="true"
              className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground md:inline-flex"
            >
              ⌘K
            </kbd>
          </div>

          <Button
            variant="ghost"
            size="icon"
            aria-label={
              notificationCount > 0
                ? `Notifiche (${notificationCount} non lette)`
                : 'Notifiche'
            }
            onClick={onNotificationsClick}
            className="relative h-10 w-10"
          >
            <Bell className="h-4 w-4" aria-hidden="true" />
            {notificationCount > 0 ? (
              <span
                className="absolute right-2 top-2 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-accent-foreground ring-2 ring-background"
                aria-hidden="true"
              >
                {notificationCount > 99 ? '99+' : notificationCount}
              </span>
            ) : null}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex h-10 min-h-10 items-center gap-2 px-2"
                aria-label="Menu utente"
              >
                <Avatar className="h-8 w-8 ring-1 ring-border">
                  {user.avatarUrl ? (
                    <AvatarImage src={user.avatarUrl} alt={user.name} />
                  ) : null}
                  <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-xs font-semibold text-white">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden text-sm font-medium tracking-tight md:inline">
                  {user.name}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold tracking-tight">
                    {user.name}
                  </span>
                  {user.email ? (
                    <span className="text-xs font-normal text-muted-foreground">
                      {user.email}
                    </span>
                  ) : null}
                  {user.role ? (
                    <span className="text-xs font-normal text-muted-foreground capitalize">
                      Ruolo: {user.role}
                    </span>
                  ) : null}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onLogout}>Esci</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        </header>
      </div>

      <div className="flex flex-1">
        {/* ===================== Sidebar (desktop) — cobalt-tinted ===================== */}
        <aside
          className={cn(
            'sticky top-[4.125rem] hidden h-[calc(100vh-4.125rem)] shrink-0 flex-col justify-between border-r border-border transition-[width] duration-200 md:flex md:shadow-[3px_0_16px_-8px_hsl(220_40%_30%/0.14)]',
            sidebarOpen ? 'w-64' : 'md:w-[72px]',
          )}
          style={{
            background:
              'linear-gradient(180deg, hsl(220 60% 91%) 0%, hsl(220 52% 92%) 60%, hsl(28 78% 92%) 100%)',
          }}
        >
          <div className="flex-1 overflow-y-auto">
            {sidebarOpen ? (
              <div className="px-5 pb-3 pt-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Navigazione
                </p>
              </div>
            ) : (
              <div className="pt-5" />
            )}
            {renderNav()}
          </div>

          {/* Footer sidebar — "Made by SOLVA" sempre visibile + collapse */}
          <div className="border-t border-border bg-card/60">
            {sidebarOpen ? (
              <div className="flex items-center justify-between gap-2 px-4 py-3">
                <div className="flex min-w-0 flex-col leading-none">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Powered by
                  </span>
                  <span className="mt-1 font-semibold tracking-tight text-foreground">
                    SOLVA{' '}
                    <span className="font-normal text-muted-foreground">Solutions</span>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {version ? (
                    <span className="inline-flex h-5 items-center rounded-full border border-border bg-card px-1.5 font-mono text-[10px] tracking-tight text-muted-foreground">
                      {version}
                    </span>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 min-h-8"
                    aria-label="Comprimi sidebar"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-3">
                <span
                  aria-hidden="true"
                  className="font-mono text-[10px] font-semibold tracking-[0.16em] text-muted-foreground"
                >
                  S
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 min-h-8"
                  aria-label="Espandi sidebar"
                  onClick={() => setSidebarOpen(true)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </aside>

        {/* ===================== Mobile drawer ===================== */}
        {mobileOpen ? (
          <div className="fixed inset-0 z-40 md:hidden">
            <div
              className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
            <aside
              className="relative flex h-full w-72 flex-col bg-card shadow-soft-lg"
              onClick={() => setMobileOpen(false)}
            >
              <div className="border-brand-line h-[2px] w-full" aria-hidden="true" />
              <div className="flex h-16 items-center gap-3 border-b border-border px-4">
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-base font-extrabold leading-none tracking-tighter text-white"
                  style={{
                    background:
                      'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary)) 55%, hsl(var(--accent)) 100%)',
                  }}
                >
                  K
                </span>
                <div className="flex flex-col leading-none">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Kommessa
                  </span>
                  <span className="mt-1 text-sm font-semibold tracking-tight">
                    {tenant.name}
                  </span>
                </div>
              </div>
              <div className="px-5 pb-2 pt-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Navigazione
                </p>
              </div>
              <div className="flex-1 overflow-y-auto">
                {renderNav({ forceLabel: true })}
              </div>
              <div className="border-t border-border bg-muted/30 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Powered by
                </p>
                <p className="mt-1 font-semibold tracking-tight">
                  SOLVA{' '}
                  <span className="font-normal text-muted-foreground">Solutions</span>
                  {version ? (
                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                      {version}
                    </span>
                  ) : null}
                </p>
              </div>
            </aside>
          </div>
        ) : null}

        {/* ===================== Main ===================== */}
        <main className="flex min-w-0 flex-1 flex-col bg-canvas">
          <div className="mx-auto w-full max-w-[1760px] flex-1 px-4 py-5 md:px-7 md:py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

OfficeShell.displayName = 'OfficeShell';

export { OfficeShell };

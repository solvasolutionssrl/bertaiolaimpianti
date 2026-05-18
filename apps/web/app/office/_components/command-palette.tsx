'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  Bell,
  Briefcase,
  Building2,
  LayoutDashboard,
  LogOut,
  Plus,
  Search,
  Settings,
  TicketCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@impiantixplus/ui';
import { createBrowserSupabase } from '@impiantixplus/api/client';

/**
 * Tipi risultato — discriminated union per tenere stretto il payload
 * di navigazione e i metadati per il rendering.
 */
type ResultGroupId = 'commesse' | 'clienti' | 'tickets' | 'menu' | 'azioni';

interface BaseResult {
  id: string;
  group: ResultGroupId;
  title: string;
  subtitle?: string;
  icon: LucideIcon;
}

interface NavResult extends BaseResult {
  kind: 'nav';
  href: string;
}

interface ActionResult extends BaseResult {
  kind: 'action';
  run: () => void | Promise<void>;
}

type PaletteResult = NavResult | ActionResult;

const GROUP_LABEL: Record<ResultGroupId, string> = {
  commesse: 'Commesse',
  clienti: 'Clienti',
  tickets: 'Tickets',
  menu: 'Vai a',
  azioni: 'Azioni rapide',
};

const GROUP_ORDER: ResultGroupId[] = [
  'azioni',
  'commesse',
  'clienti',
  'tickets',
  'menu',
];

/** Voci di menu hardcoded — riflettono la nav della OfficeShell. */
const MENU_ITEMS: NavResult[] = [
  {
    id: 'menu-dashboard',
    kind: 'nav',
    group: 'menu',
    title: 'Dashboard',
    subtitle: 'Panoramica giornaliera',
    href: '/office',
    icon: LayoutDashboard,
  },
  {
    id: 'menu-commesse',
    kind: 'nav',
    group: 'menu',
    title: 'Commesse',
    href: '/office/commesse',
    icon: Briefcase,
  },
  {
    id: 'menu-commesse-nuova',
    kind: 'nav',
    group: 'menu',
    title: 'Nuova commessa',
    subtitle: 'Commesse · Nuova',
    href: '/office/commesse/nuova',
    icon: Briefcase,
  },
  {
    id: 'menu-tickets',
    kind: 'nav',
    group: 'menu',
    title: 'Tickets',
    href: '/office/tickets',
    icon: TicketCheck,
  },
  {
    id: 'menu-clienti',
    kind: 'nav',
    group: 'menu',
    title: 'Clienti',
    href: '/office/clienti',
    icon: Users,
  },
  {
    id: 'menu-cerca',
    kind: 'nav',
    group: 'menu',
    title: 'Ricerca avanzata',
    href: '/office/cerca',
    icon: Search,
  },
  {
    id: 'menu-notifiche',
    kind: 'nav',
    group: 'menu',
    title: 'Notifiche',
    href: '/office/notifiche',
    icon: Bell,
  },
  {
    id: 'menu-impostazioni',
    kind: 'nav',
    group: 'menu',
    title: 'Impostazioni',
    href: '/office/impostazioni',
    icon: Settings,
  },
  {
    id: 'menu-imp-profilo',
    kind: 'nav',
    group: 'menu',
    title: 'Profilo',
    subtitle: 'Impostazioni · Profilo',
    href: '/office/impostazioni/profilo',
    icon: Settings,
  },
  {
    id: 'menu-imp-voci',
    kind: 'nav',
    group: 'menu',
    title: 'Voci catalogo',
    subtitle: 'Impostazioni · Voci',
    href: '/office/impostazioni/voci',
    icon: Settings,
  },
  {
    id: 'menu-imp-preset',
    kind: 'nav',
    group: 'menu',
    title: 'Preset di lavoro',
    subtitle: 'Impostazioni · Preset',
    href: '/office/impostazioni/preset',
    icon: Settings,
  },
  {
    id: 'menu-imp-utenti',
    kind: 'nav',
    group: 'menu',
    title: 'Utenti',
    subtitle: 'Impostazioni · Utenti',
    href: '/office/impostazioni/utenti',
    icon: Settings,
  },
  {
    id: 'menu-imp-branding',
    kind: 'nav',
    group: 'menu',
    title: 'Branding',
    subtitle: 'Impostazioni · Branding',
    href: '/office/impostazioni/branding',
    icon: Settings,
  },
  {
    id: 'menu-imp-storage',
    kind: 'nav',
    group: 'menu',
    title: 'Storage',
    subtitle: 'Impostazioni · Storage',
    href: '/office/impostazioni/storage',
    icon: Settings,
  },
];

/** Genera le azioni rapide. `onLogout` viene iniettato dal parent. */
function buildQuickActions(router: ReturnType<typeof useRouter>, onLogout: () => void | Promise<void>): ActionResult[] {
  return [
    {
      id: 'azione-nuova-commessa',
      kind: 'action',
      group: 'azioni',
      title: 'Nuova commessa',
      subtitle: 'Apri il wizard creazione commessa',
      icon: Plus,
      run: () => router.push('/office/commesse/nuova'),
    },
    {
      id: 'azione-nuovo-ticket',
      kind: 'action',
      group: 'azioni',
      title: 'Nuovo ticket',
      subtitle: 'Registra una nuova richiesta',
      icon: Plus,
      run: () => router.push('/office/tickets/nuovo'),
    },
    {
      id: 'azione-nuovo-cliente',
      kind: 'action',
      group: 'azioni',
      title: 'Nuovo cliente',
      subtitle: 'Aggiungi anagrafica cliente',
      icon: Plus,
      run: () => router.push('/office/clienti/nuovo'),
    },
    {
      id: 'azione-logout',
      kind: 'action',
      group: 'azioni',
      title: 'Esci',
      subtitle: 'Termina la sessione corrente',
      icon: LogOut,
      run: onLogout,
    },
  ];
}

/**
 * Fuzzy match minimo: tutti i token della query devono comparire
 * (substring, case-insensitive) nel testo concatenato `title + subtitle`.
 */
function tokenMatch(haystack: string, query: string): boolean {
  if (!query.trim()) return true;
  const text = haystack.toLowerCase();
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  return tokens.every((t) => text.includes(t));
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogout: () => void | Promise<void>;
}

export function CommandPalette({ open, onOpenChange, onLogout }: CommandPaletteProps) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [query, setQuery] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);

  // Dati remoti
  const [commesse, setCommesse] = React.useState<NavResult[]>([]);
  const [clienti, setClienti] = React.useState<NavResult[]>([]);
  const [tickets, setTickets] = React.useState<NavResult[]>([]);
  const [loading, setLoading] = React.useState(false);

  // Reset stato all'apertura/chiusura
  React.useEffect(() => {
    if (!open) {
      setQuery('');
      setDebouncedQuery('');
      setActiveIndex(0);
      setCommesse([]);
      setClienti([]);
      setTickets([]);
      return;
    }
    // focus dopo che Radix monta il portal
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  // Debounce 150ms sulla query
  React.useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), 150);
    return () => clearTimeout(id);
  }, [query]);

  // Reset selezione quando cambiano i risultati / la query
  React.useEffect(() => {
    setActiveIndex(0);
  }, [debouncedQuery, commesse, clienti, tickets]);

  // Fetch Supabase con abort
  React.useEffect(() => {
    if (!open) return;
    const q = debouncedQuery;
    if (!q) {
      setCommesse([]);
      setClienti([]);
      setTickets([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const supabase = createBrowserSupabase();
    const pattern = `%${q}%`;

    Promise.all([
      supabase
        .from('commesse_con_cliente')
        .select('id, codice_interno, nome_cartella, cliente_ragione_sociale')
        .or(
          `codice_interno.ilike.${pattern},nome_cartella.ilike.${pattern},cliente_ragione_sociale.ilike.${pattern}`,
        )
        .limit(5)
        .abortSignal(controller.signal),
      supabase
        .from('clienti')
        .select('id, ragione_sociale')
        .ilike('ragione_sociale', pattern)
        .limit(5)
        .abortSignal(controller.signal),
      supabase
        .from('tickets')
        .select('id, codice, oggetto')
        .or(`codice.ilike.${pattern},oggetto.ilike.${pattern}`)
        .limit(5)
        .abortSignal(controller.signal),
    ])
      .then(([cmRes, clRes, tkRes]) => {
        if (controller.signal.aborted) return;

        setCommesse(
          ((cmRes.data ?? []) as Array<{
            id: string;
            codice_interno: string | null;
            nome_cartella: string | null;
            cliente_ragione_sociale: string | null;
          }>).map((row) => ({
            id: `commessa-${row.id}`,
            kind: 'nav' as const,
            group: 'commesse' as const,
            title: row.codice_interno
              ? `${row.codice_interno} · ${row.nome_cartella ?? ''}`.trim()
              : row.nome_cartella ?? row.id,
            subtitle: row.cliente_ragione_sociale ?? undefined,
            href: `/office/commesse/${row.id}`,
            icon: Briefcase,
          })),
        );

        setClienti(
          ((clRes.data ?? []) as Array<{ id: string; ragione_sociale: string }>).map(
            (row) => ({
              id: `cliente-${row.id}`,
              kind: 'nav' as const,
              group: 'clienti' as const,
              title: row.ragione_sociale,
              href: `/office/clienti/${row.id}`,
              icon: Building2,
            }),
          ),
        );

        setTickets(
          ((tkRes.data ?? []) as Array<{
            id: string;
            codice: string;
            oggetto: string;
          }>).map((row) => ({
            id: `ticket-${row.id}`,
            kind: 'nav' as const,
            group: 'tickets' as const,
            title: `${row.codice} · ${row.oggetto}`,
            href: `/office/tickets/${row.id}`,
            icon: TicketCheck,
          })),
        );
      })
      .catch(() => {
        // ignora abort / errori temporanei
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [open, debouncedQuery]);

  // Costruzione lista risultati ordinata per gruppo
  const quickActions = React.useMemo(
    () => buildQuickActions(router, onLogout),
    [router, onLogout],
  );

  const flatResults = React.useMemo<PaletteResult[]>(() => {
    const q = debouncedQuery;
    if (!q) {
      // Stato iniziale: suggerimenti = prime 3 azioni rapide (escludiamo logout)
      return quickActions.filter((a) => a.id !== 'azione-logout').slice(0, 3);
    }

    const filteredMenu = MENU_ITEMS.filter((m) =>
      tokenMatch(`${m.title} ${m.subtitle ?? ''}`, q),
    ).slice(0, 6);

    const filteredActions = quickActions.filter((a) =>
      tokenMatch(`${a.title} ${a.subtitle ?? ''}`, q),
    );

    const buckets: Record<ResultGroupId, PaletteResult[]> = {
      azioni: filteredActions,
      commesse,
      clienti,
      tickets,
      menu: filteredMenu,
    };

    const out: PaletteResult[] = [];
    for (const g of GROUP_ORDER) {
      out.push(...buckets[g]);
    }
    return out;
  }, [debouncedQuery, quickActions, commesse, clienti, tickets]);

  const selectResult = React.useCallback(
    (res: PaletteResult) => {
      onOpenChange(false);
      // piccolo defer per consentire la chiusura del dialog prima della nav
      setTimeout(() => {
        if (res.kind === 'nav') router.push(res.href);
        else void res.run();
      }, 0);
    },
    [router, onOpenChange],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (flatResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % flatResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + flatResults.length) % flatResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = flatResults[activeIndex];
      if (target) selectResult(target);
    }
  };

  // Raggruppa risultati per il rendering
  const grouped = React.useMemo(() => {
    const map = new Map<ResultGroupId, PaletteResult[]>();
    for (const r of flatResults) {
      const arr = map.get(r.group) ?? [];
      arr.push(r);
      map.set(r.group, arr);
    }
    return GROUP_ORDER
      .filter((g) => (map.get(g)?.length ?? 0) > 0)
      .map((g) => ({ group: g, items: map.get(g)! }));
  }, [flatResults]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          )}
        />
        <DialogPrimitive.Content
          aria-label="Command Palette"
          onKeyDown={onKeyDown}
          className={cn(
            // mobile: full-screen overlay; md+: centered top
            'fixed inset-x-0 top-0 z-50 mx-auto flex max-h-[100dvh] w-full flex-col overflow-hidden bg-card text-foreground',
            'md:inset-x-auto md:left-1/2 md:top-24 md:max-h-[70vh] md:w-full md:max-w-2xl md:-translate-x-1/2 md:rounded-xl md:border md:border-border md:shadow-soft-lg',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          )}
        >
          {/* hairline brand decorativa */}
          <div aria-hidden="true" className="border-brand-line h-[2px] w-full shrink-0" />

          <DialogPrimitive.Title className="sr-only">
            Cerca azioni e contenuti
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Digita per cercare commesse, clienti, tickets e azioni rapide.
          </DialogPrimitive.Description>

          {/* Input row */}
          <div className="relative flex h-14 items-center border-b border-border px-4">
            <Search
              className="pointer-events-none h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca commesse, clienti, tickets, azioni…"
              className={cn(
                'h-14 w-full bg-transparent pl-3 pr-3 text-base text-foreground outline-none',
                'placeholder:text-muted-foreground/70',
              )}
              aria-label="Cerca"
              autoComplete="off"
              spellCheck={false}
            />
            <kbd
              aria-hidden="true"
              className="ml-2 hidden shrink-0 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground md:inline-flex"
            >
              Esc
            </kbd>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto py-2">
            {grouped.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                {loading ? 'Cerco…' : debouncedQuery ? 'Nessun risultato' : 'Inizia a digitare per cercare'}
              </div>
            ) : (
              grouped.map(({ group, items }) => (
                <PaletteGroup key={group} label={GROUP_LABEL[group]}>
                  {items.map((res) => {
                    const idx = flatResults.indexOf(res);
                    return (
                      <PaletteRow
                        key={res.id}
                        result={res}
                        active={idx === activeIndex}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => selectResult(res)}
                      />
                    );
                  })}
                </PaletteGroup>
              ))
            )}

            {!debouncedQuery ? (
              <PaletteGroup label="Visitate di recente">
                <div className="px-4 py-3 text-[12px] text-muted-foreground">
                  Niente da mostrare ancora.
                </div>
              </PaletteGroup>
            ) : null}
          </div>

          {/* Footer hint */}
          <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
                naviga
              </span>
              <span className="inline-flex items-center gap-1">
                <Kbd>⏎</Kbd>
                apri
              </span>
              <span className="inline-flex items-center gap-1">
                <Kbd>Esc</Kbd>
                chiudi
              </span>
            </div>
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.16em] md:inline">
              impiantiXplus · ⌘K
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-componenti                                                       */
/* ------------------------------------------------------------------ */

function PaletteGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1">
      <div className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function PaletteRow({
  result,
  active,
  onMouseEnter,
  onClick,
}: {
  result: PaletteResult;
  active: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
}) {
  const Icon = result.icon;
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={cn(
        'group flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
        active
          ? 'bg-primary/8 text-foreground'
          : 'text-foreground/85 hover:bg-muted/60',
      )}
    >
      <span
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground shadow-soft',
          active && 'border-primary/40 text-primary',
        )}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-[13.5px] font-medium tracking-tight">
          {result.title}
        </span>
        {result.subtitle ? (
          <span className="truncate text-[11.5px] text-muted-foreground">
            {result.subtitle}
          </span>
        ) : null}
      </span>
      {active ? (
        <span
          aria-hidden="true"
          className="ml-auto inline-flex items-center gap-1 rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-accent"
        >
          ⏎
        </span>
      ) : null}
    </button>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-[1.25rem] select-none items-center justify-center rounded border border-border bg-card px-1 font-mono text-[10px] font-medium text-foreground/80">
      {children}
    </kbd>
  );
}

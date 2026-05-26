'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Brush,
  FolderLock,
  HardDrive,
  ListTree,
  Sparkles,
  Timer,
  User,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@kommessa/ui';

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'profilo',  label: 'Profilo',           href: '/office/impostazioni/profilo',  icon: User },
  { id: 'voci',     label: 'Voci catalogo',     href: '/office/impostazioni/voci',     icon: ListTree,    adminOnly: true },
  { id: 'preset',   label: 'Preset lavoro',     href: '/office/impostazioni/preset',   icon: Sparkles,    adminOnly: true },
  { id: 'sla',      label: 'SLA',               href: '/office/impostazioni/sla',      icon: Timer,       adminOnly: true },
  { id: 'utenti',   label: 'Utenti',            href: '/office/impostazioni/utenti',   icon: UsersRound,  adminOnly: true },
  { id: 'branding', label: 'Branding',          href: '/office/impostazioni/branding', icon: Brush,       adminOnly: true },
  { id: 'storage',  label: 'Storage',           href: '/office/impostazioni/storage',  icon: HardDrive,   adminOnly: true },
  { id: 'cartelle', label: 'Permessi cartelle', href: '/office/impostazioni/cartelle', icon: FolderLock,  adminOnly: true },
];

/** Sidebar verticale per la sezione impostazioni. */
export function SettingsSideNav() {
  const pathname = usePathname() ?? '';

  return (
    <nav aria-label="Sezioni impostazioni" className="sticky top-6">
      <ul className="space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                prefetch
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                  active
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * @deprecated usa SettingsSideNav
 * Mantenuto per compatibilità nel caso venga importato altrove.
 */
export { SettingsSideNav as SettingsTabs };

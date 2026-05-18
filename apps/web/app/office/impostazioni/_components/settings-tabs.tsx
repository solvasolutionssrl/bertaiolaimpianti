'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Brush,
  HardDrive,
  ListTree,
  Sparkles,
  Timer,
  User,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@impiantixplus/ui';

interface Tab {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
}

const TABS: Tab[] = [
  { id: 'profilo',  label: 'Profilo',          href: '/office/impostazioni/profilo',  icon: User },
  { id: 'voci',     label: 'Voci catalogo',    href: '/office/impostazioni/voci',     icon: ListTree },
  { id: 'preset',   label: 'Preset di lavoro', href: '/office/impostazioni/preset',   icon: Sparkles },
  { id: 'sla',      label: 'SLA',              href: '/office/impostazioni/sla',      icon: Timer },
  { id: 'utenti',   label: 'Utenti',           href: '/office/impostazioni/utenti',   icon: UsersRound },
  { id: 'branding', label: 'Branding',         href: '/office/impostazioni/branding', icon: Brush },
  { id: 'storage',  label: 'Storage',          href: '/office/impostazioni/storage',  icon: HardDrive },
];

export function SettingsTabs() {
  const pathname = usePathname() ?? '';

  return (
    <nav
      aria-label="Sezioni impostazioni"
      className="sticky top-16 z-20 -mx-6 border-b border-border bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <ul className="-mb-px flex gap-1 overflow-x-auto pt-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active =
            pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.id} className="shrink-0">
              <Link
                href={tab.href}
                prefetch
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors',
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

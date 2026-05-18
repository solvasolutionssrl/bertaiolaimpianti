'use client';

import * as React from 'react';
import {
  Briefcase,
  ClipboardCheck,
  Camera,
  User,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '../lib/cn';

export type MobileTabId = 'commesse' | 'sopralluogo' | 'foto' | 'profilo' | 'turno';

export interface MobileTab {
  id: MobileTabId;
  label: string;
  icon: LucideIcon;
  href: string;
  badge?: number;
}

export const DEFAULT_MOBILE_TABS: MobileTab[] = [
  { id: 'commesse', label: 'Commesse', icon: Briefcase, href: '/commesse' },
  {
    id: 'sopralluogo',
    label: 'Sopralluogo',
    icon: ClipboardCheck,
    href: '/sopralluogo',
  },
  { id: 'foto', label: 'Foto', icon: Camera, href: '/foto' },
  { id: 'profilo', label: 'Profilo', icon: User, href: '/profilo' },
];

export interface MobileBottomNavProps
  extends Omit<React.HTMLAttributes<HTMLElement>, 'onChange'> {
  /** Tab attualmente selezionata. */
  activeTab?: MobileTabId;
  /** Callback al cambio tab; se non fornita il link nativo gestisce la navigazione. */
  onTabChange?: (tab: MobileTab) => void;
  /** Override delle tab di default. */
  tabs?: MobileTab[];
  /** Render del link wrapper (es. next/link). Default: <a>. */
  linkComponent?: React.ComponentType<{
    href: string;
    children: React.ReactNode;
    className?: string;
    'aria-label'?: string;
    'aria-current'?: 'page' | undefined;
    onClick?: React.MouseEventHandler;
  }>;
}

/**
 * MobileBottomNav — tab bar PWA tecnici (Mockup_UI §"Layout mobile PWA").
 *
 * - Fixed bottom, h-16 + safe-area-inset-bottom.
 * - bg-background/95 + backdrop-blur, hairline border top.
 * - Tab attiva: text-primary + barretta cobalt 2px sopra l'icona.
 * - Niente emoji. Tap target ≥ 56px verticali per pollice.
 */
const MobileBottomNav = React.forwardRef<HTMLElement, MobileBottomNavProps>(
  (
    {
      activeTab,
      onTabChange,
      tabs = DEFAULT_MOBILE_TABS,
      linkComponent: LinkComp,
      className,
      ...rest
    },
    ref,
  ) => {
    return (
      <nav
        ref={ref}
        aria-label="Navigazione principale"
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur',
          'supports-[backdrop-filter]:bg-background/80',
          'pb-[env(safe-area-inset-bottom)]',
          className,
        )}
        {...rest}
      >
        <ul className="mx-auto flex h-16 max-w-screen-sm items-stretch justify-around">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === activeTab;
            const inner = (
              <span
                className={cn(
                  'relative flex h-16 min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 px-2',
                  'text-[10px] font-medium tracking-tight transition-colors',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {/* indicatore attivo: barretta cobalt 2px sopra */}
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute top-0 h-[2px] w-8 rounded-full transition-opacity',
                    isActive ? 'bg-primary opacity-100' : 'opacity-0',
                  )}
                />
                <span className="relative">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                  {tab.badge && tab.badge > 0 ? (
                    <span
                      aria-label={`${tab.badge} non letti`}
                      className="absolute -right-2 -top-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-none text-destructive-foreground"
                    >
                      {tab.badge > 99 ? '99+' : tab.badge}
                    </span>
                  ) : null}
                </span>
                <span className="leading-none">{tab.label}</span>
              </span>
            );

            const handleClick: React.MouseEventHandler = (e) => {
              if (onTabChange) {
                e.preventDefault();
                onTabChange(tab);
              }
            };

            return (
              <li key={tab.id} className="flex flex-1">
                {LinkComp ? (
                  <LinkComp
                    href={tab.href}
                    aria-label={tab.label}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={handleClick}
                    className="flex flex-1"
                  >
                    {inner}
                  </LinkComp>
                ) : (
                  <a
                    href={tab.href}
                    aria-label={tab.label}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={handleClick}
                    className="flex flex-1"
                  >
                    {inner}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    );
  },
);
MobileBottomNav.displayName = 'MobileBottomNav';

export { MobileBottomNav };

'use client';

import * as React from 'react';
import {
  Briefcase,
  Timer,
  Mic,
  Bell,
  User,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '../lib/cn';

export type MobileTabId =
  | 'commesse'
  | 'turno'
  | 'voce'
  | 'notifiche'
  | 'profilo'
  // Mantenuti per retro-compatibilità con eventuali consumer:
  | 'sopralluogo'
  | 'foto';

export interface MobileTab {
  id: MobileTabId;
  label: string;
  icon: LucideIcon;
  href: string;
  badge?: number;
  /** Se true il tab è disegnato come FAB centrale rialzato. */
  primary?: boolean;
}

export const DEFAULT_MOBILE_TABS: MobileTab[] = [
  { id: 'commesse', label: 'Oggi', icon: Briefcase, href: '/mobile' },
  { id: 'turno', label: 'Turno', icon: Timer, href: '/mobile/turno' },
  {
    id: 'voce',
    label: 'Voce',
    icon: Mic,
    href: '/mobile/voice-intake',
    primary: true,
  },
  { id: 'notifiche', label: 'Inbox', icon: Bell, href: '/mobile/notifiche' },
  { id: 'profilo', label: 'Profilo', icon: User, href: '/mobile/profilo' },
];

export interface MobileBottomNavProps
  extends Omit<React.HTMLAttributes<HTMLElement>, 'onChange'> {
  activeTab?: MobileTabId;
  onTabChange?: (tab: MobileTab) => void;
  tabs?: MobileTab[];
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
 * MobileBottomNav — field-tool tab bar per PWA tecnici.
 *
 * Layout: 5 slot, slot centrale rialzato come FAB (Voce).
 * Tap target ≥ 56px verticali. Hairline top, blur, safe-area pad.
 * Tab attiva: icona piena su pill scuro + barretta cobalto.
 * Badge: monospace su accento, tabular-nums.
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
          'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md',
          'supports-[backdrop-filter]:bg-background/80',
          'pb-[env(safe-area-inset-bottom)]',
          // safety-shadow leggera per separare dal contenuto su sfondo bianco
          'shadow-[0_-1px_0_0_rgba(0,0,0,0.02),0_-8px_24px_-12px_rgba(0,0,0,0.08)]',
          className,
        )}
        {...rest}
      >
        <ul className="relative mx-auto flex h-16 max-w-screen-sm items-stretch justify-around">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === activeTab;

            const handleClick: React.MouseEventHandler = (e) => {
              if (onTabChange) {
                e.preventDefault();
                onTabChange(tab);
              }
            };

            // FAB CENTRALE
            if (tab.primary) {
              const fabInner = (
                <span
                  className={cn(
                    'relative -mt-7 flex h-14 w-14 items-center justify-center rounded-2xl',
                    'border border-primary/30 bg-primary text-primary-foreground',
                    'shadow-[0_8px_20px_-6px_rgba(0,0,0,0.35),0_2px_4px_rgba(0,0,0,0.12)]',
                    'transition-transform active:scale-95',
                    isActive && 'ring-2 ring-primary/40 ring-offset-2 ring-offset-background',
                  )}
                >
                  {/* glow pulse molto leggero — segnala che è dinamico */}
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 -z-10 animate-pulse rounded-2xl bg-primary/30 blur-md"
                  />
                  <Icon className="h-6 w-6" strokeWidth={2.25} aria-hidden="true" />
                  {tab.badge && tab.badge > 0 ? (
                    <span
                      aria-label={`${tab.badge} non letti`}
                      className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1 font-mono text-[10px] font-bold tabular-nums text-accent-foreground shadow"
                    >
                      {tab.badge > 99 ? '99+' : tab.badge}
                    </span>
                  ) : null}
                </span>
              );

              const fabBlock = (
                <span className="relative flex h-16 w-full flex-col items-center justify-end pb-1.5">
                  {fabInner}
                  <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
                    {tab.label}
                  </span>
                </span>
              );

              return (
                <li key={tab.id} className="flex flex-1">
                  {LinkComp ? (
                    <LinkComp
                      href={tab.href}
                      aria-label={tab.label}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={handleClick}
                      className="flex flex-1 items-stretch justify-center"
                    >
                      {fabBlock}
                    </LinkComp>
                  ) : (
                    <a
                      href={tab.href}
                      aria-label={tab.label}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={handleClick}
                      className="flex flex-1 items-stretch justify-center"
                    >
                      {fabBlock}
                    </a>
                  )}
                </li>
              );
            }

            // TAB STANDARD
            const inner = (
              <span
                className={cn(
                  'relative flex h-16 min-w-[44px] flex-1 flex-col items-center justify-center gap-1 px-2',
                  'font-mono text-[9px] uppercase tracking-[0.16em] transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {/* barretta cobalto top */}
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute top-0 h-[2px] w-8 rounded-full bg-primary transition-opacity',
                    isActive ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <span
                  className={cn(
                    'relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
                    isActive ? 'bg-primary/10' : 'bg-transparent',
                  )}
                >
                  <Icon
                    className="h-[18px] w-[18px]"
                    strokeWidth={isActive ? 2.25 : 1.75}
                    aria-hidden="true"
                  />
                  {tab.badge && tab.badge > 0 ? (
                    <span
                      aria-label={`${tab.badge} non letti`}
                      className="absolute -right-1.5 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 font-mono text-[9px] font-bold tabular-nums text-accent-foreground shadow-sm"
                    >
                      {tab.badge > 9 ? '9+' : tab.badge}
                    </span>
                  ) : null}
                </span>
                <span className="leading-none">{tab.label}</span>
              </span>
            );

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

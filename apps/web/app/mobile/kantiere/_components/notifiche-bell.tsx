'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';

/**
 * Campanella notifiche fissa per la shell Kantiere mobile.
 *
 * Capo e tecnico non hanno più lo slot "Attività" nel bottom-nav (sostituito da
 * "Spese"): questa campanella tiene le notifiche sempre a portata di tap.
 * Posizionata in alto a destra, safe-area aware per iPhone con Dynamic Island.
 */
export function NotificheBell({ unreadCount = 0 }: { unreadCount?: number }) {
  return (
    <Link
      href="/mobile/notifiche"
      aria-label={
        unreadCount > 0 ? `Notifiche, ${unreadCount} non lette` : 'Notifiche'
      }
      className="hide-on-sheet fixed right-3 z-30 inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-soft backdrop-blur active:scale-95 transition-transform"
      style={{ top: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
    >
      <Bell className="h-5 w-5" aria-hidden="true" />
      {unreadCount > 0 ? (
        <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1 font-mono text-[10px] font-bold tabular-nums text-accent-foreground shadow">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      ) : null}
    </Link>
  );
}

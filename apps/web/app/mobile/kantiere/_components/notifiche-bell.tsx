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
 *
 * 14/09/2026: più piccola (34px) e più in alto. Da 44px scendeva fino alla riga
 * del titolo e copriva «Aggiornato alle» su Cantieri, Ore e Spese. Ora sta
 * all'altezza della riga piccola sopra il titolo; il tocco resta di 44px grazie
 * a un'area invisibile intorno (`before:`). Banco: `scripts/banco-ui/campanella.mjs`.
 */
export function NotificheBell({ unreadCount = 0 }: { unreadCount?: number }) {
  return (
    <Link
      href="/mobile/notifiche"
      aria-label={
        unreadCount > 0 ? `Notifiche, ${unreadCount} non lette` : 'Notifiche'
      }
      className="hide-on-sheet fixed right-3 z-30 inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-soft backdrop-blur transition-transform before:absolute before:-inset-[5px] before:content-[''] active:scale-95"
      style={{ top: 'calc(env(safe-area-inset-top) + 6px)' }}
    >
      <Bell className="h-4 w-4" aria-hidden="true" />
      {unreadCount > 0 ? (
        <span className="absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 font-mono text-[9px] font-bold leading-none tabular-nums text-accent-foreground shadow">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      ) : null}
    </Link>
  );
}

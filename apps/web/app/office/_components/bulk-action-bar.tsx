'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@impiantixplus/ui';

export interface BulkAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export interface BulkActionBarProps {
  count: number;
  actions: BulkAction[];
  onClear: () => void;
}

/**
 * Action bar sticky in basso che appare quando ci sono righe selezionate.
 * Pattern Gmail-like: scura su sfondo `bg-foreground`, full-width su mobile,
 * indentata di `md:left-64` per non passare sotto la sidebar office.
 *
 * Le azioni "danger" sono evidenziate in rosso; le altre in arancio
 * (token `--accent`).
 */
export function BulkActionBar({ count, actions, onClear }: BulkActionBarProps) {
  if (count <= 0) return null;

  return (
    <div
      role="region"
      aria-label={`${count} elementi selezionati`}
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 md:left-64',
        'border-t border-border bg-foreground text-background shadow-lg',
        'animate-in slide-in-from-bottom-4 duration-200',
      )}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-background/70 transition-colors hover:bg-background/10 hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/40"
            aria-label="Annulla selezione"
            title="Annulla selezione"
          >
            <X className="h-4 w-4" />
          </button>
          <p className="text-sm font-medium">
            {count} selezionat{count === 1 ? 'o' : 'i'}
          </p>
          <button
            type="button"
            onClick={onClear}
            className="hidden text-xs text-background/70 underline-offset-4 hover:text-background hover:underline sm:inline"
          >
            Annulla
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              disabled={a.disabled}
              className={cn(
                'inline-flex min-h-9 items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/40 focus-visible:ring-offset-2 focus-visible:ring-offset-foreground',
                'disabled:pointer-events-none disabled:opacity-50',
                a.danger
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : 'bg-accent text-accent-foreground hover:bg-accent/90',
              )}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

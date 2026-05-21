'use client';

import * as React from 'react';
import { BookUser, Loader2 } from 'lucide-react';

export interface ContactResult {
  name?: string;
  tel?: string;
  email?: string;
}

interface Props {
  onSelect: (c: ContactResult) => void;
  className?: string;
}

/**
 * Pulsante "Importa da rubrica" — usa la Web Contacts API (iOS Safari 14.4+,
 * Android Chrome). Se l'API non è disponibile il componente non rende nulla.
 */
export function ContactPickerButton({ onSelect, className }: Props) {
  const [supported, setSupported] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    setSupported(
      typeof navigator !== 'undefined' &&
        'contacts' in navigator &&
        typeof (navigator as any).contacts?.select === 'function',
    );
  }, []);

  if (!supported) return null;

  const pick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const contacts: Array<{
        name?: string[];
        tel?: string[];
        email?: string[];
      }> = await (navigator as any).contacts.select(['name', 'tel', 'email'], {
        multiple: false,
      });
      if (contacts.length > 0) {
        const c = contacts[0]!;
        onSelect({
          name: c.name?.[0] ?? undefined,
          tel: c.tel?.[0] ?? undefined,
          email: c.email?.[0] ?? undefined,
        });
      }
    } catch {
      // Utente ha annullato o API non disponibile — silenzioso
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={pick}
      disabled={loading}
      aria-label="Importa da rubrica"
      className={[
        'inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/8',
        'px-2.5 py-1 text-[11px] font-semibold text-primary',
        'transition-all active:scale-95 disabled:opacity-50',
        'hover:border-primary/50 hover:bg-primary/12',
        className ?? '',
      ].join(' ')}
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      ) : (
        <BookUser className="h-3 w-3" aria-hidden="true" />
      )}
      Rubrica
    </button>
  );
}

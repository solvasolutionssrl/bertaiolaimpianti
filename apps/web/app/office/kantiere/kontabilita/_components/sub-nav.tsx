'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@kommessa/ui';

const TABS = [
  { href: '/office/kantiere/kontabilita', label: 'Spese', exact: true },
  { href: '/office/kantiere/kontabilita/analisi', label: 'Analisi dei costi', exact: false },
  { href: '/office/kantiere/kontabilita/costo-cantiere', label: 'Costo cantiere', exact: false },
  { href: '/office/kantiere/kontabilita/ricevute', label: 'Ricevute', exact: false },
] as const;

/**
 * Sotto-navigazione segmentata della sezione Kontabilità (Spese / Analisi dei
 * costi / Costo cantiere). Stato attivo: match esatto per Spese, prefisso per
 * le altre. Le tab condividono i query param? No: ogni vista ha i suoi filtri.
 */
export function SubNav() {
  const pathname = usePathname();
  return (
    <nav className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
      {TABS.map((t) => {
        const attiva = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              attiva
                ? 'bg-background text-foreground shadow-soft'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@kommessa/ui';

interface Props {
  id: string;
}

/**
 * Navigazione a 2 livelli della scheda commessa:
 *  - PRIMARIE (Commessa · Anagrafica · Media): peso pieno, sottolineatura.
 *  - SECONDARIE (Fasi · Timeline · Documenti · Note · Cronologia): a destra,
 *    più piccole e muted, scopribili senza competere con le primarie.
 *
 * "Commessa" è la tab base (landing): è l'hub operativo. "Lavori" non esiste
 * più come tab: il suo contenuto è dentro Commessa.
 */
const PRIMARY = [
  { key: 'commessa', label: 'Commessa', sub: '' },
  { key: 'anagrafica', label: 'Anagrafica', sub: 'anagrafica' },
  { key: 'foto', label: 'Media', sub: 'foto' },
];

const SECONDARY = [
  { key: 'fasi', label: 'Fasi', sub: 'fasi' },
  { key: 'timeline', label: 'Timeline', sub: 'timeline' },
  { key: 'documenti', label: 'Documenti', sub: 'documenti' },
  { key: 'note', label: 'Note', sub: 'note' },
  { key: 'cronologia', label: 'Cronologia', sub: 'cronologia' },
];

export function CommessaTabs({ id }: Props) {
  const pathname = usePathname();
  const base = `/office/commesse/${id}`;

  const isActive = (sub: string) => {
    const href = sub ? `${base}/${sub}` : base;
    return sub ? pathname?.startsWith(href) : pathname === base || pathname === `${base}/`;
  };

  return (
    <nav
      className="sticky top-0 z-10 -mx-1 flex flex-wrap items-end gap-y-1 border-b border-border bg-background/95 px-1 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      aria-label="Tab commessa"
    >
      {/* Primarie */}
      <div className="flex items-center gap-1">
        {PRIMARY.map((t) => {
          const href = t.sub ? `${base}/${t.sub}` : base;
          const active = isActive(t.sub);
          return (
            <Link
              key={t.key}
              href={href}
              prefetch
              aria-current={active ? 'page' : undefined}
              className={cn(
                '-mb-px border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors',
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-foreground/70 hover:text-foreground',
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* Secondarie — subito accanto alle primarie, ma muted e più piccole */}
      <div className="flex items-center gap-0.5 pb-1.5 pl-1">
        <span
          aria-hidden="true"
          className="mr-1.5 h-4 w-px bg-border"
        />
        {SECONDARY.map((t) => {
          const href = `${base}/${t.sub}`;
          const active = isActive(t.sub);
          return (
            <Link
              key={t.key}
              href={href}
              prefetch
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-md px-2 py-1 text-xs font-medium transition-colors',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@impiantixplus/ui';

interface Props {
  id: string;
}

const TABS = [
  { key: 'anagrafica', label: 'Anagrafica', sub: '' },
  { key: 'fasi', label: 'Fasi', sub: 'fasi' },
  { key: 'timeline', label: 'Timeline', sub: 'timeline' },
  { key: 'documenti', label: 'Documenti', sub: 'documenti' },
  { key: 'foto', label: 'Foto', sub: 'foto' },
  { key: 'note', label: 'Note', sub: 'note' },
  { key: 'cronologia', label: 'Cronologia', sub: 'cronologia' },
];

export function CommessaTabs({ id }: Props) {
  const pathname = usePathname();
  const base = `/office/commesse/${id}`;
  return (
    <nav
      className="flex flex-wrap items-center gap-1 border-b border-border"
      aria-label="Tab commessa"
    >
      {TABS.map((t) => {
        const href = t.sub ? `${base}/${t.sub}` : base;
        const isActive = t.sub
          ? pathname?.startsWith(href)
          : pathname === base || pathname === `${base}/`;
        return (
          <Link
            key={t.key}
            href={href}
            prefetch
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { label: 'Dipendenti', href: '/office/kantiere/dipendenti' },
  { label: 'QR cantiere', href: '/office/kantiere/qr' },
  { label: 'Rapportini', href: '/office/kantiere/rapportini' },
  { label: 'Report', href: '/office/kantiere/report' },
] as const;

export function KantiereSubnav() {
  const pathname = usePathname();
  return (
    <nav className="border-b border-border bg-background">
      <div className="mx-auto flex w-full max-w-6xl gap-1 px-6">
        {ITEMS.map(({ label, href }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={[
                'inline-flex items-center border-b-2 px-3 py-3 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@kommessa/ui';

interface NavItem {
  id: string;
  label: string;
  href: string;
  superadminOnly?: boolean;
  kantiereOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'profilo',  label: 'Profilo',           href: '/office/impostazioni/profilo' },
  { id: 'voci',     label: 'Voci catalogo',     href: '/office/impostazioni/voci' },
  { id: 'preset',   label: 'Preset lavoro',     href: '/office/impostazioni/preset' },
  { id: 'sla',      label: 'SLA',               href: '/office/impostazioni/sla' },
  { id: 'utenti',   label: 'Utenti',            href: '/office/impostazioni/utenti' },
  { id: 'branding', label: 'Branding',          href: '/office/impostazioni/branding' },
  { id: 'storage',  label: 'Storage',           href: '/office/impostazioni/storage', superadminOnly: true },
  { id: 'cartelle', label: 'Permessi cartelle', href: '/office/impostazioni/cartelle' },
  { id: 'kantiere', label: 'Kantiere',          href: '/office/impostazioni/kantiere', kantiereOnly: true },
];

export function SettingsTopNav({
  isPlatformAdmin = false,
  hasKantiere = false,
}: {
  isPlatformAdmin?: boolean;
  hasKantiere?: boolean;
}) {
  const pathname = usePathname() ?? '';
  const visible = NAV_ITEMS.filter(
    (item) =>
      (!item.superadminOnly || isPlatformAdmin) &&
      (!item.kantiereOnly || hasKantiere),
  );

  return (
    <div className="border-b border-border">
      <nav aria-label="Sezioni impostazioni">
        <ul className="-mb-px flex flex-wrap gap-x-1">
          {visible.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  prefetch
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex items-center whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                    active
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

/** @deprecated usa SettingsTopNav */
export { SettingsTopNav as SettingsSideNav, SettingsTopNav as SettingsTabs };

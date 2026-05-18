import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';

import { TenantBranding } from '@impiantixplus/ui';

import { getPortalContextOrNull } from './_lib/portal-context';
import { LogoutButton } from './_components/logout-button';

export const metadata: Metadata = {
  title: {
    default: 'Portale Cliente',
    template: '%s · Portale Cliente',
  },
  description: 'Documenti, stato lavori e richieste — Portale cliente impiantiXplus',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0F172A',
};

/**
 * Layout del portale cliente finale (host `cliente.<tenant>.it`).
 *
 * Auth guard:
 *  - le pagine pubbliche (login, callback) restano accessibili (nessun context).
 *  - tutte le altre passano da `requirePortalContext()` nelle singole page
 *    e verranno reindirizzate a `/login` se non autenticate.
 *
 * White-label:
 *  - logo + colore brand letti da `tenants` (vedi PortalContext).
 *  - footer "powered by SOLVA" sempre presente.
 */
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = headers().get('x-invoke-path') ?? '';
  const isPublicRoute =
    pathname.endsWith('/portal/login') || pathname.includes('/portal/auth/');

  // Sulla pagina di login non abbiamo (ancora) un contesto cliente,
  // ma vogliamo comunque l'header brand. Caso particolare: se l'utente
  // è già loggato e atterra su /login, la page stessa farà redirect.
  const ctx = await getPortalContextOrNull();

  const brandColor = ctx?.tenant.brandColor ?? null;
  const logoUrl = ctx?.tenant.logoUrl ?? null;
  const tenantName = ctx?.tenant.nome ?? 'impiantiXplus';

  return (
    <div
      className="flex min-h-screen flex-col bg-background text-foreground"
      style={
        brandColor
          ? ({ ['--brand-color' as never]: brandColor } as React.CSSProperties)
          : undefined
      }
    >
      <header
        className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
        style={brandColor ? { borderTopColor: brandColor, borderTopWidth: 3 } : undefined}
      >
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href={ctx ? '/' : '/login'} className="flex items-center gap-3">
            <TenantBranding
              logoUrl={logoUrl ?? undefined}
              brandColor={brandColor ?? undefined}
              tenantName={tenantName}
              productName="Portale Cliente"
            />
          </Link>

          {ctx ? (
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium leading-tight">
                  {ctx.cliente.ragioneSociale}
                </p>
                <p className="text-xs text-muted-foreground leading-tight">
                  {ctx.email}
                </p>
              </div>
              <LogoutButton />
            </div>
          ) : null}
        </div>

        {ctx && !isPublicRoute ? (
          <nav className="mx-auto flex w-full max-w-5xl items-center gap-1 overflow-x-auto px-4 sm:px-6">
            <PortalNavLink href="/" label="Le mie commesse" />
            <PortalNavLink href="/richiedi" label="Richiedi intervento" />
          </nav>
        ) : null}
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        {children}
      </main>

      <footer className="border-t border-border bg-card/40 py-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-2 px-4 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <p>
            © {new Date().getFullYear()} {tenantName}. Tutti i diritti riservati.
          </p>
          <p>
            powered by{' '}
            <a
              href="https://solva.it"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-foreground hover:underline"
            >
              SOLVA
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

function PortalNavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-[var(--brand-color,theme(colors.primary.DEFAULT))] hover:text-foreground"
    >
      {label}
    </Link>
  );
}

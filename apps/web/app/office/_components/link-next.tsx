'use client';

import * as React from 'react';
import NextLink from 'next/link';

/**
 * Adapter di `next/link` con la signature richiesta da `OfficeShell.linkComponent`.
 * Restringe le props a quelle attese dal pacchetto UI (framework-agnostic).
 */
export const NextLinkAdapter = React.forwardRef<
  HTMLAnchorElement,
  {
    href: string;
    children: React.ReactNode;
    className?: string;
    'aria-current'?: 'page' | undefined;
    prefetch?: boolean;
  }
>(function NextLinkAdapter({ href, children, className, prefetch, ...rest }, ref) {
  return (
    <NextLink
      ref={ref}
      href={href}
      className={className}
      prefetch={prefetch ?? true}
      {...rest}
    >
      {children}
    </NextLink>
  );
});

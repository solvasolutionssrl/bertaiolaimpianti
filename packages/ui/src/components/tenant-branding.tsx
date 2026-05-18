import * as React from 'react';

import { cn } from '../lib/cn';

export interface TenantBrandingProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** URL del logo del tenant. Se assente mostra le iniziali su quadrato ink. */
  logoUrl?: string;
  /**
   * Colore primario brand tenant (hex/rgb). Applicato come CSS variable
   * `--brand-color` per permettere personalizzazioni a discendenti, ma
   * NON viene usato come background del fallback (più sobrio: ink/paper).
   */
  brandColor?: string;
  /** Nome tenant esposto a fianco del logo. */
  tenantName: string;
  /** Nome prodotto (default: impiantiXplus). */
  productName?: string;
  /** Nasconde il nome prodotto, lasciando solo il logo tenant. */
  hideProductName?: boolean;
}

/**
 * TenantBranding — blocco di branding header (logo tenant + product name).
 *
 * Fallback iniziali: quadrato `bg-foreground text-background` (ink su carta).
 * Più sobrio del brand_color tenant — quello viene comunque esposto come
 * CSS var `--brand-color` per accent secondari (es. bordi superiori, hover).
 *
 * Mockup_UI §"Layout generale Web": `[logo Bertaiola]  impiantiXplus`.
 */
const TenantBranding = React.forwardRef<HTMLDivElement, TenantBrandingProps>(
  (
    {
      logoUrl,
      brandColor,
      tenantName,
      productName = 'impiantiXplus',
      hideProductName,
      className,
      style,
      ...rest
    },
    ref,
  ) => {
    const initials =
      tenantName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? '')
        .join('') || '?';

    const mergedStyle = brandColor
      ? ({ ...style, ['--brand-color' as never]: brandColor } as React.CSSProperties)
      : style;

    return (
      <div
        ref={ref}
        className={cn('flex items-center gap-2.5', className)}
        style={mergedStyle}
        {...rest}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={`Logo ${tenantName}`}
            className="h-8 w-auto max-w-[140px] object-contain"
          />
        ) : (
          <span
            aria-label={`Logo ${tenantName}`}
            className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-[12px] font-semibold leading-none tracking-tight text-background"
          >
            {initials}
          </span>
        )}
        {!hideProductName && (
          <span className="font-mono text-sm font-medium tracking-tight text-foreground">
            {productName}
          </span>
        )}
      </div>
    );
  },
);
TenantBranding.displayName = 'TenantBranding';

export { TenantBranding };

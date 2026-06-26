'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@kommessa/ui';

/**
 * Tasto "Indietro" mobile chiaro e ben tappabile.
 *
 * Nasce dal feedback Bertaiola: il vecchio link in alto a sinistra era
 * piccolino e poco evidente, soprattutto su iPhone. Qui è una pill con
 * bordo, ombra e tap target >= 44px, in due tonalità:
 *  - `light`: su sfondi chiari (card, sezioni).
 *  - `dark`: dentro l'Hero blu (testo chiaro su sfondo scuro).
 *
 * Se `href` è valorizzato è un Link (destinazione esplicita, robusta anche
 * a freddo / deep-link); altrimenti usa la history del browser (router.back).
 */
interface MobileBackButtonProps {
  /** Destinazione esplicita. Se assente usa `router.back()`. */
  href?: string;
  label?: string;
  tone?: 'light' | 'dark';
  className?: string;
}

export function MobileBackButton({
  href,
  label = 'Indietro',
  tone = 'light',
  className,
}: MobileBackButtonProps) {
  const router = useRouter();

  const base =
    'inline-flex min-h-[44px] w-fit items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold shadow-sm transition-colors active:scale-[0.97]';
  const toneCls =
    tone === 'dark'
      ? 'border-white/25 bg-white/15 text-primary-foreground hover:bg-white/25'
      : 'border-border bg-card text-foreground hover:bg-muted';

  const content = (
    <>
      <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
      {label}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        aria-label={label}
        className={cn(base, toneCls, className)}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label={label}
      className={cn(base, toneCls, className)}
    >
      {content}
    </button>
  );
}

'use client';

import * as React from 'react';

/**
 * Parallasse decorativa dietro l'Hero della landing. Tre strati di "orbite"
 * brand sfocate (blu/arancio) che scorrono a velocità diverse rispetto al
 * contenuto → profondità. CSS-only non basta (background-attachment:fixed è
 * rotto su iOS), quindi muoviamo gli strati con scrollY + requestAnimationFrame.
 * Rispetta prefers-reduced-motion. Puramente estetico (aria-hidden).
 */
export function HeroParallax() {
  const a = React.useRef<HTMLDivElement>(null);
  const b = React.useRef<HTMLDivElement>(null);
  const c = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        if (a.current) a.current.style.transform = `translate3d(0, ${y * 0.2}px, 0)`;
        if (b.current) b.current.style.transform = `translate3d(0, ${y * 0.36}px, 0)`;
        if (c.current) c.current.style.transform = `translate3d(-50%, ${y * -0.14}px, 0)`;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[130vh] overflow-hidden"
    >
      <div
        ref={a}
        className="absolute left-[6%] top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl will-change-transform"
      />
      <div
        ref={b}
        className="absolute right-[4%] top-10 h-80 w-80 rounded-full bg-accent/20 blur-3xl will-change-transform"
      />
      <div
        ref={c}
        className="absolute left-1/2 top-56 h-64 w-[38rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl will-change-transform"
      />
    </div>
  );
}

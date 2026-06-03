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
        className="absolute left-[2%] top-20 h-80 w-80 rounded-full bg-primary/40 blur-[90px] will-change-transform sm:h-96 sm:w-96"
      />
      <div
        ref={b}
        className="absolute right-[-2%] top-6 h-80 w-80 rounded-full bg-accent/40 blur-[90px] will-change-transform sm:h-[26rem] sm:w-[26rem]"
      />
      <div
        ref={c}
        className="absolute left-1/2 top-52 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-primary/20 blur-[100px] will-change-transform"
      />
    </div>
  );
}

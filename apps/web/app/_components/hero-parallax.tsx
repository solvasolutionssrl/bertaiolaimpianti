'use client';

import * as React from 'react';

/**
 * Sfondo "gradient mesh" con parallasse. Più blob a gradiente radiale, colori
 * variati e sfocati, sovrapposti, che scorrono a velocità diverse rispetto al
 * contenuto. CSS-only non basta (background-attachment:fixed è rotto su iOS),
 * quindi muoviamo gli strati con scrollY + requestAnimationFrame.
 * Rispetta prefers-reduced-motion. Puramente estetico (aria-hidden).
 *
 * `tone='hero'` (default): blob vivaci su fondo chiaro.
 * `tone='dark'`: glow tenui (chiari) pensati per stagliarsi su un fondo scuro.
 */
type Blob = { bg: string; cls: string; speed: number; centered?: boolean };

const HERO_BLOBS: Blob[] = [
  {
    // azzurro, alto-sinistra
    bg: 'radial-gradient(circle at 35% 35%, hsl(218 92% 58% / 0.4), transparent 68%)',
    cls: 'left-[-8%] top-[-6rem] h-[34rem] w-[34rem]',
    speed: 0.22,
  },
  {
    // arancio, alto-destra
    bg: 'radial-gradient(circle at 60% 40%, hsl(24 95% 56% / 0.38), transparent 66%)',
    cls: 'right-[-10%] top-[-3rem] h-[32rem] w-[32rem]',
    speed: 0.4,
  },
];

const DARK_BLOBS: Blob[] = [
  {
    bg: 'radial-gradient(circle at 40% 40%, hsl(218 95% 62% / 0.28), transparent 70%)',
    cls: 'left-[-6%] top-[-4rem] h-[26rem] w-[26rem]',
    speed: 0.18,
  },
  {
    bg: 'radial-gradient(circle at 55% 45%, hsl(258 90% 66% / 0.22), transparent 72%)',
    cls: 'right-[-8%] top-[2rem] h-[28rem] w-[28rem]',
    speed: 0.34,
  },
  {
    bg: 'radial-gradient(circle at 50% 50%, hsl(24 92% 58% / 0.14), transparent 70%)',
    cls: 'left-1/2 top-[6rem] h-[22rem] w-[40rem] -translate-x-1/2',
    speed: -0.1,
    centered: true,
  },
];

export function HeroParallax({ tone = 'hero' }: { tone?: 'hero' | 'dark' }) {
  const blobs = tone === 'dark' ? DARK_BLOBS : HERO_BLOBS;
  const refs = React.useRef<Array<HTMLDivElement | null>>([]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        blobs.forEach((b, i) => {
          const el = refs.current[i];
          if (!el) return;
          const x = b.centered ? '-50%' : '0';
          el.style.transform = `translate3d(${x}, ${(y * b.speed).toFixed(1)}px, 0)`;
        });
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [blobs]);

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-x-0 top-0 -z-10 overflow-hidden ${
        tone === 'dark' ? 'h-full' : 'h-[140vh]'
      }`}
    >
      {blobs.map((b, i) => (
        <div
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          style={{ background: b.bg }}
          className={`absolute rounded-full blur-2xl will-change-transform ${b.cls}`}
        />
      ))}
    </div>
  );
}

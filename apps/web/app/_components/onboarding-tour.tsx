'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

/**
 * Tour guidato di onboarding mostrato al primo login di un utente tenant.
 *
 * Implementazione 100% custom (niente Driver.js / Shepherd / nuove dipendenze
 * npm). Renderizza:
 *  - un overlay scuro semi-trasparente con un "ritaglio" sul target del
 *    passo corrente, ottenuto via box-shadow inset trick (un `<div>`
 *    posizionato sopra al bounding-rect del target con
 *    `box-shadow: 0 0 0 9999px rgba(0,0,0,0.5)`);
 *  - un tooltip floating con titolo, descrizione, barra di progresso
 *    "Step N di M" e bottoni "Indietro / Avanti·Termina / Salta tour".
 *
 * Posizionamento: `getBoundingClientRect()` del target + auto-placement
 * (sceglie top/bottom/left/right in base allo spazio disponibile nel
 * viewport). Riposiziona su `scroll` e `resize`.
 *
 * Robustezza:
 *  - selector non trovato → skip automatico al passo successivo con
 *    `console.warn` (non blocca l'utente);
 *  - se l'ultimo passo non ha target valido, completa direttamente;
 *  - cleanup completo a unmount (event listener + observer).
 *
 * Accessibilità:
 *  - `role="dialog" aria-modal="true"` sul tooltip;
 *  - ESC chiude (skip);
 *  - focus trap sui controlli del tooltip + focus restore a chiusura;
 *  - rispetto di `prefers-reduced-motion`.
 *
 * Riferimento UX: README → Documento_Zero §"Primo login utente office".
 */
export interface TourStep {
  id: string;
  /** CSS selector unico per il bersaglio del passo. */
  target: string;
  title: string;
  description: string;
  /**
   * Forza un placement; default `'auto'` che sceglie in base allo spazio
   * disponibile rispetto al bounding-rect del target.
   */
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
}

interface OnboardingTourProps {
  steps: TourStep[];
  onComplete: () => void;
  onSkip: () => void;
}

const TOOLTIP_WIDTH = 360; // px (max-w-sm ≈ 24rem; lasciamo un margine)
const TOOLTIP_GAP = 12; // distanza tooltip ↔ target
const CUTOUT_PADDING = 6; // padding intorno al target nel ritaglio
const VIEWPORT_PADDING = 12; // margine minimo dal bordo del viewport

type ResolvedPlacement = 'top' | 'bottom' | 'left' | 'right';

interface Position {
  /** Bounding-rect del target (per il cutout). */
  rect: DOMRect | null;
  /** Top-left assoluti del tooltip nel viewport. */
  tooltipTop: number;
  tooltipLeft: number;
  /** Placement effettivo dopo l'auto-placement. */
  placement: ResolvedPlacement;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Sceglie il placement con più spazio. Preferenza: bottom → top → right → left.
 */
function autoPlacement(rect: DOMRect): ResolvedPlacement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const spaceBottom = vh - rect.bottom;
  const spaceTop = rect.top;
  const spaceRight = vw - rect.right;
  const spaceLeft = rect.left;

  const TOOLTIP_HEIGHT_EST = 180; // stima conservativa per la card
  if (spaceBottom >= TOOLTIP_HEIGHT_EST + TOOLTIP_GAP + VIEWPORT_PADDING) return 'bottom';
  if (spaceTop >= TOOLTIP_HEIGHT_EST + TOOLTIP_GAP + VIEWPORT_PADDING) return 'top';
  if (spaceRight >= TOOLTIP_WIDTH + TOOLTIP_GAP + VIEWPORT_PADDING) return 'right';
  if (spaceLeft >= TOOLTIP_WIDTH + TOOLTIP_GAP + VIEWPORT_PADDING) return 'left';
  // Fallback: stiamo stretti, mettiamo bottom comunque (il tooltip si centra).
  return 'bottom';
}

function computeTooltipPosition(
  rect: DOMRect,
  placement: ResolvedPlacement,
  tooltipEl: HTMLElement | null,
): { top: number; left: number } {
  const tooltipW = tooltipEl?.offsetWidth ?? TOOLTIP_WIDTH;
  const tooltipH = tooltipEl?.offsetHeight ?? 160;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top = 0;
  let left = 0;

  switch (placement) {
    case 'bottom':
      top = rect.bottom + TOOLTIP_GAP;
      left = rect.left + rect.width / 2 - tooltipW / 2;
      break;
    case 'top':
      top = rect.top - TOOLTIP_GAP - tooltipH;
      left = rect.left + rect.width / 2 - tooltipW / 2;
      break;
    case 'right':
      top = rect.top + rect.height / 2 - tooltipH / 2;
      left = rect.right + TOOLTIP_GAP;
      break;
    case 'left':
      top = rect.top + rect.height / 2 - tooltipH / 2;
      left = rect.left - TOOLTIP_GAP - tooltipW;
      break;
  }

  // Clamp dentro al viewport (mai oltre i bordi).
  left = Math.max(VIEWPORT_PADDING, Math.min(left, vw - tooltipW - VIEWPORT_PADDING));
  top = Math.max(VIEWPORT_PADDING, Math.min(top, vh - tooltipH - VIEWPORT_PADDING));

  return { top, left };
}

export function OnboardingTour({ steps, onComplete, onSkip }: OnboardingTourProps) {
  const [index, setIndex] = useState(0);
  const [position, setPosition] = useState<Position>({
    rect: null,
    tooltipTop: 0,
    tooltipLeft: 0,
    placement: 'bottom',
  });
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const skippedTargetsRef = useRef<Set<string>>(new Set());

  const reducedMotion = useMemo(prefersReducedMotion, []);
  const totalSteps = steps.length;
  const currentStep = steps[index];
  const isLast = index === totalSteps - 1;
  const isFirst = index === 0;

  /**
   * Avanza all'indice successivo gestendo selector mancanti: se il target
   * del prossimo passo non esiste, salta di nuovo (con warning). Se
   * esauriamo i passi, completa.
   */
  const advanceTo = useCallback(
    (nextIndex: number) => {
      if (nextIndex >= totalSteps) {
        onComplete();
        return;
      }
      const next = steps[nextIndex];
      if (!next) {
        onComplete();
        return;
      }
      if (typeof document === 'undefined') {
        setIndex(nextIndex);
        return;
      }
      const found = document.querySelector(next.target);
      if (!found) {
        if (!skippedTargetsRef.current.has(next.id)) {
          skippedTargetsRef.current.add(next.id);
          // eslint-disable-next-line no-console
          console.warn(
            `[OnboardingTour] target non trovato per step "${next.id}" ` +
              `(selector: ${next.target}). Salto al successivo.`,
          );
        }
        advanceTo(nextIndex + 1);
        return;
      }
      setIndex(nextIndex);
    },
    [onComplete, steps, totalSteps],
  );

  const handleNext = useCallback(() => {
    if (isLast) onComplete();
    else advanceTo(index + 1);
  }, [advanceTo, index, isLast, onComplete]);

  const handlePrev = useCallback(() => {
    if (isFirst) return;
    // andando indietro non saltiamo: se manca, lasciamo che il warning
    // si ripeta ma non avanziamo (il bottone resta gestibile).
    setIndex((i) => Math.max(0, i - 1));
  }, [isFirst]);

  const handleSkip = useCallback(() => {
    onSkip();
  }, [onSkip]);

  // --- Salvataggio focus precedente + ESC handler + focus trap -----------
  useEffect(() => {
    lastFocusedRef.current = (document.activeElement as HTMLElement) ?? null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleSkip();
        return;
      }
      if (e.key === 'Tab' && tooltipRef.current) {
        const focusables = tooltipRef.current.querySelectorAll<HTMLElement>(
          'button, [href], [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      // Focus restore solo se l'elemento è ancora nel DOM e visibile.
      const prev = lastFocusedRef.current;
      if (prev && document.contains(prev)) {
        prev.focus({ preventScroll: true });
      }
    };
  }, [handleSkip]);

  // --- Verifica selector al mount/cambio step: skip automatico se assente
  useEffect(() => {
    if (!currentStep) return;
    const found = document.querySelector(currentStep.target);
    if (!found) {
      if (!skippedTargetsRef.current.has(currentStep.id)) {
        skippedTargetsRef.current.add(currentStep.id);
        // eslint-disable-next-line no-console
        console.warn(
          `[OnboardingTour] target non trovato per step "${currentStep.id}" ` +
            `(selector: ${currentStep.target}). Salto al successivo.`,
        );
      }
      // Avanza (o completa se era l'ultimo)
      if (isLast) onComplete();
      else setIndex((i) => i + 1);
    }
  }, [currentStep, isLast, onComplete]);

  // --- Calcolo posizione: bounding-rect + auto-placement -----------------
  const recompute = useCallback(() => {
    if (!currentStep) return;
    const target = document.querySelector<HTMLElement>(currentStep.target);
    if (!target) {
      setPosition((p) => ({ ...p, rect: null }));
      return;
    }
    const rect = target.getBoundingClientRect();
    const placement: ResolvedPlacement =
      !currentStep.placement || currentStep.placement === 'auto'
        ? autoPlacement(rect)
        : currentStep.placement;
    const { top, left } = computeTooltipPosition(rect, placement, tooltipRef.current);
    setPosition({ rect, tooltipTop: top, tooltipLeft: left, placement });
  }, [currentStep]);

  useLayoutEffect(() => {
    if (!currentStep) return;
    const target = document.querySelector<HTMLElement>(currentStep.target);
    if (!target) return;

    // Scroll automatico verso il target se fuori viewport.
    const rect = target.getBoundingClientRect();
    const outOfViewport =
      rect.top < 0 ||
      rect.bottom > window.innerHeight ||
      rect.left < 0 ||
      rect.right > window.innerWidth;
    if (outOfViewport) {
      target.scrollIntoView({
        block: 'center',
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
    }

    // Posizionamento iniziale subito + un re-compute dopo paint (per
    // catturare l'offsetWidth/Height reali del tooltip).
    recompute();
    const raf = requestAnimationFrame(recompute);
    return () => cancelAnimationFrame(raf);
  }, [currentStep, recompute, reducedMotion]);

  useEffect(() => {
    const onScroll = () => recompute();
    const onResize = () => recompute();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [recompute]);

  // Focus iniziale sul primo bottone utile (Avanti) al cambio step.
  useEffect(() => {
    const t = setTimeout(() => {
      const btn = tooltipRef.current?.querySelector<HTMLButtonElement>(
        'button[data-tour-primary="true"]',
      );
      btn?.focus({ preventScroll: true });
    }, 0);
    return () => clearTimeout(t);
  }, [index]);

  if (!currentStep) return null;

  // --- Stili overlay/cutout/tooltip --------------------------------------
  const { rect, tooltipTop, tooltipLeft, placement } = position;

  // Cutout: un div alla posizione del target con un'enorme box-shadow inset
  // verso l'esterno (10000px) che oscura tutto il resto.
  const cutoutStyle: CSSProperties | null = rect
    ? {
        position: 'fixed',
        top: rect.top - CUTOUT_PADDING,
        left: rect.left - CUTOUT_PADDING,
        width: rect.width + CUTOUT_PADDING * 2,
        height: rect.height + CUTOUT_PADDING * 2,
        borderRadius: 12,
        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)',
        pointerEvents: 'none',
        zIndex: 9998,
        transition: reducedMotion ? 'none' : 'all 200ms ease-out',
      }
    : {
        // Fallback senza cutout (rect mancante): scuriamo l'intero viewport.
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        pointerEvents: 'none',
        zIndex: 9998,
      };

  const tooltipStyle: CSSProperties = {
    position: 'fixed',
    top: tooltipTop,
    left: tooltipLeft,
    zIndex: 10000,
    transition: reducedMotion ? 'none' : 'top 200ms ease-out, left 200ms ease-out',
  };

  // Freccia: piccolo quadrato ruotato 45° verso il target.
  const arrowStyle: CSSProperties | null = rect
    ? (() => {
        const base: CSSProperties = {
          position: 'absolute',
          width: 10,
          height: 10,
          background: 'hsl(var(--card))',
          borderTop: '1px solid hsl(var(--border))',
          borderLeft: '1px solid hsl(var(--border))',
          transform: 'rotate(45deg)',
        };
        switch (placement) {
          case 'bottom':
            return { ...base, top: -6, left: '50%', marginLeft: -5 };
          case 'top':
            return {
              ...base,
              bottom: -6,
              left: '50%',
              marginLeft: -5,
              transform: 'rotate(225deg)',
            };
          case 'right':
            return { ...base, left: -6, top: '50%', marginTop: -5, transform: 'rotate(-45deg)' };
          case 'left':
            return {
              ...base,
              right: -6,
              top: '50%',
              marginTop: -5,
              transform: 'rotate(135deg)',
            };
        }
      })()
    : null;

  // --- Render ------------------------------------------------------------
  return (
    <div aria-live="polite">
      <div style={cutoutStyle} aria-hidden="true" />

      {/*
        Clic-catcher trasparente sotto al tooltip: blocca interazioni col
        resto della pagina, ma lascia respirare il cutout. Non è sopra al
        cutout, ma copre tutto il viewport sotto al tooltip.
      */}
      <div
        aria-hidden="true"
        onClick={handleSkip}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9997,
          background: 'transparent',
          cursor: 'default',
        }}
      />

      <div
        ref={tooltipRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-tour-title"
        aria-describedby="onboarding-tour-desc"
        style={tooltipStyle}
        className="bg-card border border-border shadow-soft-lg rounded-xl p-5 w-[min(90vw,360px)]"
      >
        {arrowStyle ? <span style={arrowStyle} aria-hidden="true" /> : null}

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2
              id="onboarding-tour-title"
              className="text-base font-semibold tracking-tight text-foreground"
            >
              {currentStep.title}
            </h2>
            <div className="mt-2 h-1 w-16 rounded-full bg-brand-blu/20 overflow-hidden">
              <div
                className="h-full bg-brand-blu transition-[width] duration-300 ease-out"
                style={{
                  width: `${Math.round(((index + 1) / totalSteps) * 100)}%`,
                  transition: reducedMotion ? 'none' : undefined,
                }}
              />
            </div>
          </div>
          <span className="shrink-0 text-xs font-medium text-muted-foreground tabular-nums">
            {index + 1} / {totalSteps}
          </span>
        </div>

        <p
          id="onboarding-tour-desc"
          className="mt-3 text-sm text-muted-foreground leading-relaxed"
        >
          {currentStep.description}
        </p>

        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleSkip}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md"
          >
            Salta tour
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrev}
              disabled={isFirst}
              className="text-sm font-medium px-3 py-1.5 rounded-md border border-border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Indietro
            </button>
            <button
              type="button"
              data-tour-primary="true"
              onClick={handleNext}
              className="text-sm font-semibold px-3 py-1.5 rounded-md bg-brand-blu text-white hover:bg-brand-blu/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-arancio focus-visible:ring-offset-2 transition-colors"
            >
              {isLast ? 'Termina' : 'Avanti'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OnboardingTour;

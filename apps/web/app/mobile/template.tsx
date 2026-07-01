import type { ReactNode } from 'react';

/**
 * Template della superficie mobile.
 *
 * A differenza del layout (che persiste), il template si RIMONTA a ogni
 * navigazione: lo usiamo per applicare una transizione d'ingresso morbida
 * (fade + slide, ~220ms) a ogni cambio pagina/tab → feel "app" fluido.
 * Rispetta `prefers-reduced-motion`. Vale per entrambi i mondi (commesse +
 * kantiere). Il fill-mode `backwards` (nel preset) evita transform residui che
 * romperebbero elementi position:fixed dentro le pagine.
 */
export default function MobileTemplate({ children }: { children: ReactNode }) {
  return (
    <div className="animate-page-in motion-reduce:animate-none">{children}</div>
  );
}

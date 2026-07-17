import type { ReactNode } from 'react';

/**
 * Layout della landing pubblica QR (/t/[token]) — la pagina che si apre dopo
 * la scansione. Questa rotta NON sta sotto /mobile, quindi non ereditava il
 * trattamento status-bar del guscio PWA: su iPhone installato (status-bar iOS
 * 'black-translucent') il contenuto andava a tutto schermo SOTTO la Dynamic
 * Island → sembrava "shiftato in alto" e spariva la barra blu.
 *
 * Qui replichiamo lo scrim del guscio /mobile: una striscia blu brand alta
 * quanto il safe-area-inset-top, fissa dietro l'isola, così le icone bianche di
 * sistema restano leggibili. Il padding-top per non finire sotto l'isola è sui
 * container della pagina (che usano min-h-dvh). Su browser/Android l'inset è 0
 * → tutto invisibile.
 */
export default function TokenLandingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-30 bg-primary"
        style={{ height: 'env(safe-area-inset-top, 0px)' }}
      />
      {children}
    </>
  );
}

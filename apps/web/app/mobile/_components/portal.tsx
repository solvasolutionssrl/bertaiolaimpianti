'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';

/**
 * Renderizza i figli in `document.body`, fuori dal contesto di impilamento della
 * pagina. Serve ai modali/lightbox: dentro la pagina il loro z-index resta
 * "intrappolato" sotto gli elementi fissi del layout (bottom-nav, campanella),
 * anche con z alto. Portati sul body competono nel contesto radice → stanno
 * davvero sopra tutto. Monta solo lato client (niente portal in SSR).
 */
export function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

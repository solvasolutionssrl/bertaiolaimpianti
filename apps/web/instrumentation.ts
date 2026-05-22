/**
 * Next.js instrumentation hook — eseguito una volta al boot del processo
 * server/edge. Carica il config Sentry appropriato in base al runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// `onRequestError` esiste solo nelle versioni recenti di @sentry/nextjs (≥ 8.5)
// e Next ≥ 15. La versione attuale del progetto (Next 14.2 + Sentry 10.x)
// non lo esporta come hook nominato → lo escludiamo per non causare errori.
// Quando si farà l'upgrade Next 15 + Sentry recente, riabilitare.
// export { onRequestError } from '@sentry/nextjs';

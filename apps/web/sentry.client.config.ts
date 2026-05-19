/**
 * Sentry client config — error tracking lato browser.
 *
 * Self-disabling: se NEXT_PUBLIC_SENTRY_DSN non è settata (dev locale)
 * Sentry non parte e non emette errori. In prod su Vercel, basta
 * settare la env var perché si attivi.
 */
import * as Sentry from '@sentry/nextjs';

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    // Performance monitoring: sample 10% in prod, 100% in dev
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Session replay: sample 1% delle sessioni, 100% di quelle con errore
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    // Filtra rumore comune: warning DevTools, extension chrome, ecc.
    ignoreErrors: [
      'ResizeObserver loop',
      'Non-Error promise rejection captured',
      /Loading chunk \d+ failed/,
      /ChunkLoadError/,
    ],
    beforeSend(event) {
      // Skip eventi da localhost in produzione (preview deploys da utenti finali)
      if (
        event.request?.url?.includes('localhost') &&
        process.env.NODE_ENV === 'production'
      ) {
        return null;
      }
      return event;
    },
  });
}

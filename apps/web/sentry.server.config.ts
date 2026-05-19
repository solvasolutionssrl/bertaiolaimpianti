/**
 * Sentry server config — error tracking lato Node.js (Server Components,
 * Server Actions, Route Handlers, Middleware).
 */
import * as Sentry from '@sentry/nextjs';

const DSN = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Tag automatico con la regione Vercel per debug latenze
    initialScope: {
      tags: {
        region: process.env.VERCEL_REGION ?? 'unknown',
      },
    },
  });
}

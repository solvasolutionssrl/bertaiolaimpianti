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

export { onRequestError } from '@sentry/nextjs';

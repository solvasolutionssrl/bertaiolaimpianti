'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

// Cattura errori nel root layout (raro ma possibile — es. font fail).
// Non può usare componenti del layout (niente <html> wrapper esterno).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    console.error('[global error]', error.digest ?? error.message);
  }, [error]);

  return (
    <html lang="it">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'hsl(32,28%,98%)',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
          padding: '24px',
          gap: '16px',
        }}
      >
        <div
          style={{
            fontSize: '64px',
            fontWeight: 700,
            letterSpacing: '-2px',
            color: 'hsl(220,80%,32%)',
            opacity: 0.15,
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
          }}
        >
          ERR
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: '20px',
            fontWeight: 600,
            color: 'hsl(220,30%,9%)',
            letterSpacing: '-0.3px',
          }}
        >
          Errore critico dell&apos;applicazione
        </h1>
        <p style={{ margin: 0, color: 'hsl(220,10%,45%)', fontSize: '14px', maxWidth: '320px' }}>
          Si è verificato un errore che impedisce il caricamento dell&apos;app.
        </p>
        {error.digest ? (
          <code style={{ fontSize: '11px', color: 'hsl(220,10%,60%)', fontFamily: 'monospace' }}>
            ref: {error.digest}
          </code>
        ) : null}
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: '8px',
            height: '44px',
            padding: '0 20px',
            borderRadius: '10px',
            background: 'hsl(220,80%,32%)',
            color: 'white',
            border: 'none',
            fontFamily: 'monospace',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            cursor: 'pointer',
          }}
        >
          ↺ Ricarica
        </button>
      </body>
    </html>
  );
}

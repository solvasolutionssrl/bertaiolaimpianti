# Sentry env vars (opzionali)

Sentry è integrato ma **disabilitato di default** — niente errore senza DSN.

Per attivare in produzione, configura su Vercel:

| Variabile | Scope | Note |
|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | Client+Server | DSN del progetto Sentry. Senza questa, Sentry non parte. |
| `SENTRY_DSN` | Server | Alias del DSN solo server. Se non set, usa `NEXT_PUBLIC_SENTRY_DSN`. |
| `SENTRY_AUTH_TOKEN` | Build only | Token per upload source maps. Senza, `withSentryConfig` è bypassato (vedi `next.config.mjs`). |
| `SENTRY_ORG` | Build only | Slug org Sentry. Usato dal plugin per upload artifacts. |
| `SENTRY_PROJECT` | Build only | Slug progetto Sentry. |

## Setup veloce

1. Crea progetto Sentry (gratis fino a 5k errori/mese): https://sentry.io
2. Copia DSN → Vercel → Settings → Environment Variables → `NEXT_PUBLIC_SENTRY_DSN` (tutti gli env)
3. Opzionale per source maps: Internal Settings → Auth Tokens → crea token con scope `project:releases`, `org:read` → `SENTRY_AUTH_TOKEN`
4. Push → Sentry inizia a ricevere errori

## Cosa è già wired

- `error.tsx` e `global-error.tsx` chiamano `Sentry.captureException` automaticamente
- `sentry.client.config.ts` filtra rumore comune (ResizeObserver, chunk load failures, extension noise)
- Session replay: 1% sessioni normali + 100% sessioni con errore
- `tunnelRoute: /monitoring` → bypassa ad-blockers che bloccano i domini Sentry

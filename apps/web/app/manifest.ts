import type { MetadataRoute } from 'next';

/**
 * Web App Manifest — impiantiXplus PWA tecnici.
 * Riferimenti: Architettura_Soluzione.md §7 (PWA capabilities),
 *              CLAUDE.md (stack PWA, niente Expo),
 *              Mockup_UI §componenti (palette Ocra #D97706).
 *
 * Servito da Next 14 Metadata API a /manifest.webmanifest
 * (header Content-Type forzato in next.config.mjs).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'impiantiXplus',
    short_name: 'impiantiX+',
    description:
      'Gestione commesse impiantistiche — sopralluogo, foto cantiere, checklist per tecnici e capi.',
    start_url: '/mobile',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#D97706',
    background_color: '#FFFFFF',
    lang: 'it',
    dir: 'ltr',
    categories: ['productivity', 'business', 'utilities'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Nuovo sopralluogo',
        short_name: 'Sopralluogo',
        description: 'Avvia un nuovo sopralluogo cliente',
        url: '/mobile/sopralluogo',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Le mie commesse',
        short_name: 'Commesse',
        description: 'Lista commesse di oggi',
        url: '/mobile',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
    ],
  };
}

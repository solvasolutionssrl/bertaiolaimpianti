import type { MetadataRoute } from 'next';

/**
 * Web App Manifest — Kommessa PWA tecnici.
 * Riferimenti: Architettura_Soluzione.md §7 (PWA capabilities),
 *              CLAUDE.md (stack PWA, niente Expo),
 *              Mockup_UI §componenti (palette Ocra #D97706).
 *
 * Servito da Next 14 Metadata API a /manifest.webmanifest
 * (header Content-Type forzato in next.config.mjs).
 */
export default function manifest(): MetadataRoute.Manifest {
  // Cache-buster delle icone: bumpalo (v3, v4…) quando cambia il logo, così
  // i telefoni con l'icona vecchia (la "K" nera) la riscaricano. `id` resta
  // uguale allo start_url per NON creare una nuova app installata (solo update).
  const IV = 'v=2';
  return {
    id: '/mobile',
    name: 'Kommessa',
    short_name: 'Kommessa',
    description:
      'Gestione commesse impiantistiche — sopralluogo, foto cantiere, checklist per tecnici e capi. Suite SOLVA.',
    start_url: '/mobile',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#1340A6',
    background_color: '#FBFAF6',
    lang: 'it',
    dir: 'ltr',
    categories: ['productivity', 'business', 'utilities'],
    icons: [
      {
        src: `/icons/icon-192.png?${IV}`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `/icons/icon-192.png?${IV}`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: `/icons/icon-512.png?${IV}`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `/icons/icon-512.png?${IV}`,
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
        icons: [{ src: `/icons/icon-192.png?${IV}`, sizes: '192x192' }],
      },
      {
        name: 'Le mie commesse',
        short_name: 'Commesse',
        description: 'Lista commesse di oggi',
        url: '/mobile',
        icons: [{ src: `/icons/icon-192.png?${IV}`, sizes: '192x192' }],
      },
    ],
  };
}

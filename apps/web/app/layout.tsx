import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { ConfirmAlertProvider } from './_components/confirm-provider';
import { UploadQueueProvider } from './_components/upload-queue-provider';
import { UploadTray } from './_components/upload-tray';

export const metadata: Metadata = {
  title: {
    default: 'Kommessa — gestione commesse impiantistiche',
    template: '%s · Kommessa',
  },
  description:
    'Kommessa è la piattaforma di gestione commesse cantiere per impiantisti: voice intake, foto/video dal mobile, sync cloud, annotazioni e report. Suite SOLVA.',
  applicationName: 'Kommessa',
  manifest: '/manifest.webmanifest',
  // Icone con cache-buster `?v=2`: sui dispositivi che hanno ancora la "K" nera
  // vecchia, l'URL nuovo bypassa la cache e ricarica la K gradient. Bumpare la
  // versione (qui e in manifest.ts) a ogni cambio logo.
  icons: {
    icon: [{ url: '/icons/icon-192.png?v=3', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/icon-192.png?v=3', sizes: '192x192', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    // black-translucent: la status bar iOS diventa un overlay trasparente e il
    // contenuto va a tutto schermo SOTTO Dynamic Island / notch. Lo sfondo
    // dell'app prosegue dietro l'isola (niente più barra bianca). L'inset in
    // alto è gestito centralmente nel layout mobile (padding + scrim blu).
    // La PWA installata apre sempre /mobile (start_url), quindi vale lì.
    statusBarStyle: 'black-translucent',
    title: 'Kommessa',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAF9F7' },
    { media: '(prefers-color-scheme: dark)', color: '#0E0E13' },
  ],
  width: 'device-width',
  initialScale: 1,
  // maximumScale: 5 + userScalable: true → permette zoom accessibility
  // (utenti con vista debole). Lighthouse a11y richiede questo per WCAG 2.1.
  maximumScale: 5,
  userScalable: true,
  // Estende il layout sotto il notch su iPhone PWA in standalone
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="it"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className={GeistSans.className}>
        <ConfirmAlertProvider>
          <UploadQueueProvider>
            {children}
            <UploadTray />
          </UploadQueueProvider>
        </ConfirmAlertProvider>
      </body>
    </html>
  );
}

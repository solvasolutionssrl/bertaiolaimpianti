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
    // ⚠️ Dal 23/10/2026 `default` (barra di stato OPACA, la pagina parte sotto).
    // Con `black-translucent` iOS 26.1+ disegna un effetto vetro sfocato sui
    // primi ~40 punti (iOS 27: ~110) dell'app installata, sopra i nostri tasti
    // fissi in alto (campanella, «+ Spesa»); nessun meta o CSS lo spegne, e la
    // nostra fascia blu alta quanto l'inset non basta a farlo saltare. Con la
    // barra opaca `safe-area-inset-top` vale 0, la fascia blu del layout mobile
    // sparisce da sola e `--inset-top` tiene il minimo di 12px. Il colore della
    // barra lo da' `viewport.themeColor` (chiaro/scuro). Misurato su iOS 27.0.1.
    statusBarStyle: 'default',
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
  // Zoom DISABILITATO su tutte le superfici (mobile + office + portal, tutti i
  // tenant). Scelta di prodotto per l'uso in cantiere: un pinch-zoom accidentale
  // costringerebbe l'utente a "tornare indietro" col telefono sporco/guanti →
  // in cantiere è un problema. Trade-off di accessibilità accettato dal cliente.
  maximumScale: 1,
  userScalable: false,
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

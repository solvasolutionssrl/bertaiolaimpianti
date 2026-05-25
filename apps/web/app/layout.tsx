import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { ConfirmAlertProvider } from './_components/confirm-provider';

export const metadata: Metadata = {
  title: {
    default: 'Kommessa — gestione commesse impiantistiche',
    template: '%s · Kommessa',
  },
  description:
    'Kommessa è la piattaforma di gestione commesse cantiere per impiantisti: voice intake, foto/video dal mobile, sync cloud, annotazioni e report. Suite SOLVA.',
  applicationName: 'Kommessa',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
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
        <ConfirmAlertProvider>{children}</ConfirmAlertProvider>
      </body>
    </html>
  );
}

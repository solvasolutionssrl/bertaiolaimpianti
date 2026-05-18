'use client';

import * as React from 'react';
import { Smartphone, Share, Plus, MoreVertical, Download } from 'lucide-react';

import { Button, Card, CardContent, CardHeader, CardTitle } from '@impiantixplus/ui';

/**
 * Tipo del BeforeInstallPromptEvent (non-standard, Chromium-only).
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type Platform = 'ios-safari' | 'android-chromium' | 'desktop' | 'standalone' | 'other';

function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'other';

  // PWA già installata
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (isStandalone) return 'standalone';

  const ua = window.navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/i.test(ua) && !/CriOS|FxiOS/i.test(ua);
  if (isIOS) return 'ios-safari';

  const isAndroid = /Android/i.test(ua);
  if (isAndroid) return 'android-chromium';

  return 'desktop';
}

/**
 * InstallPromptHint — istruzioni "Aggiungi alla schermata Home".
 *
 * - Su Chromium (Android, desktop) intercetta `beforeinstallprompt` e mostra
 *   un bottone "Installa app" che innesca il prompt nativo.
 * - Su iOS Safari (no `beforeinstallprompt`) mostra istruzioni manuali
 *   in 3 step: Condividi → Aggiungi alla Home → Conferma.
 * - Se la PWA è già installata (display-mode standalone) il componente
 *   non renderizza nulla (degrado graceful).
 */
export function InstallPromptHint() {
  const [platform, setPlatform] = React.useState<Platform>('other');
  const [deferredPrompt, setDeferredPrompt] =
    React.useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    setPlatform(detectPlatform());

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  if (platform === 'standalone' || dismissed) return null;

  const triggerNativePrompt = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setDismissed(true);
    }
    setDeferredPrompt(null);
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Smartphone className="h-5 w-5 text-primary" aria-hidden="true" />
          Aggiungi alla schermata Home
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Per usare impiantiXplus come una vera app — full-screen e con icona
          dedicata — installala sul telefono.
        </p>

        {/* Chromium: bottone nativo */}
        {deferredPrompt ? (
          <Button
            type="button"
            className="min-h-[44px] w-full"
            onClick={triggerNativePrompt}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Installa app
          </Button>
        ) : null}

        {/* iOS Safari: istruzioni manuali */}
        {platform === 'ios-safari' ? (
          <ol className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                1
              </span>
              <span>
                Tocca{' '}
                <Share className="inline h-4 w-4 align-text-bottom" aria-hidden="true" />{' '}
                <strong>Condividi</strong> nella barra del browser.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                2
              </span>
              <span>
                Scorri e tocca{' '}
                <Plus className="inline h-4 w-4 align-text-bottom" aria-hidden="true" />{' '}
                <strong>Aggiungi alla schermata Home</strong>.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                3
              </span>
              <span>
                Conferma con <strong>Aggiungi</strong>: l'icona impiantiXplus
                comparirà nella schermata Home.
              </span>
            </li>
          </ol>
        ) : null}

        {/* Android senza beforeinstallprompt (es. Firefox, browser non-Chromium): istruzioni manuali */}
        {platform === 'android-chromium' && !deferredPrompt ? (
          <ol className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                1
              </span>
              <span>
                Tocca{' '}
                <MoreVertical
                  className="inline h-4 w-4 align-text-bottom"
                  aria-hidden="true"
                />{' '}
                il <strong>menu</strong> del browser (3 puntini).
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                2
              </span>
              <span>
                Tocca <strong>Installa app</strong> (o "Aggiungi alla schermata Home").
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                3
              </span>
              <span>
                Conferma con <strong>Installa</strong>.
              </span>
            </li>
          </ol>
        ) : null}

        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-xs text-muted-foreground underline"
        >
          Non mostrare più adesso
        </button>
      </CardContent>
    </Card>
  );
}

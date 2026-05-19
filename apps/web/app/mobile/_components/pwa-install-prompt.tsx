'use client';

import * as React from 'react';
import { Download, X, Share, MoreVertical } from 'lucide-react';

/**
 * PWA Install Prompt — popup custom alla prima visita.
 *
 * Comportamento:
 *  - Android/Chrome/Edge: cattura l'evento `beforeinstallprompt` e mostra
 *    un popup custom che, al click "Installa", chiama `event.prompt()`.
 *  - iOS Safari: non emette `beforeinstallprompt`, quindi rileva iOS +
 *    !standalone e mostra istruzioni "Condividi → Aggiungi alla Home".
 *  - Già installata (standalone display-mode): non mostra mai il prompt.
 *  - Dismiss "Più tardi": salva timestamp in localStorage; ripropone
 *    automaticamente dopo 30 giorni.
 *  - Install riuscito: salva flag permanente, mai più mostrato.
 *
 * Storage keys:
 *  - `pwa.installed`             → "1" se mai installato (mai più prompt)
 *  - `pwa.install-prompted-at`   → ISO timestamp ultimo dismiss
 *
 * Mount: nel layout /mobile, dopo SwRegistrar.
 */
const STORAGE_INSTALLED = 'pwa.installed';
const STORAGE_PROMPTED_AT = 'pwa.install-prompted-at';
const REPROMPT_DAYS = 30;
const FIRST_DELAY_MS = 8_000; // attesa minima prima di mostrare alla prima visita

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function PwaInstallPrompt() {
  const [deferred, setDeferred] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = React.useState(false);
  const [show, setShow] = React.useState(false);
  const [installing, setInstalling] = React.useState(false);

  // Rilevamento + listener
  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    // Già installata → exit immediato
    if (
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    ) {
      return;
    }
    if (localStorage.getItem(STORAGE_INSTALLED) === '1') return;

    // Controlla se è troppo presto per riproporre
    const lastPrompt = localStorage.getItem(STORAGE_PROMPTED_AT);
    if (lastPrompt) {
      const last = Date.parse(lastPrompt);
      if (!Number.isNaN(last)) {
        const diffDays = (Date.now() - last) / (1000 * 60 * 60 * 24);
        if (diffDays < REPROMPT_DAYS) return; // ancora dentro la finestra di silenzio
      }
    }

    // iOS Safari rilevamento (no beforeinstallprompt support)
    const ua = window.navigator.userAgent;
    const iosSafari =
      /iPhone|iPad|iPod/.test(ua) &&
      /Safari/.test(ua) &&
      !/CriOS|FxiOS|EdgiOS/.test(ua);
    if (iosSafari) {
      setIsIos(true);
      const t = setTimeout(() => setShow(true), FIRST_DELAY_MS);
      return () => clearTimeout(t);
    }

    // Android/Chromium path
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      // Aspetta un po' prima di mostrare per non infastidire (utente sta esplorando)
      setTimeout(() => setShow(true), FIRST_DELAY_MS);
    };
    const onAppInstalled = () => {
      localStorage.setItem(STORAGE_INSTALLED, '1');
      setShow(false);
      setDeferred(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferred) return;
    setInstalling(true);
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === 'accepted') {
        localStorage.setItem(STORAGE_INSTALLED, '1');
      } else {
        // Dismiss esplicito → re-prompt tra 30gg
        localStorage.setItem(STORAGE_PROMPTED_AT, new Date().toISOString());
      }
    } catch {
      /* utente ha chiuso, ignora */
    } finally {
      setDeferred(null);
      setShow(false);
      setInstalling(false);
    }
  };

  const handleLater = () => {
    localStorage.setItem(STORAGE_PROMPTED_AT, new Date().toISOString());
    setShow(false);
  };

  if (!show) return null;
  if (!deferred && !isIos) return null;

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Chiudi"
        onClick={handleLater}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-fade-in"
        style={{ animationDuration: '200ms' }}
      />

      {/* Sheet bottom */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-install-title"
        className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-screen-sm animate-fade-up"
        style={{ animationDuration: '300ms' }}
      >
        <div className="relative overflow-hidden rounded-t-2xl border border-b-0 border-border bg-card shadow-soft-lg">
          {/* Linea brand gradient in alto */}
          <span
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-0.5 border-brand-line"
          />
          {/* Grid pattern decorativo */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />

          {/* Close button */}
          <button
            type="button"
            onClick={handleLater}
            aria-label="Chiudi"
            className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="relative px-5 pt-7 pb-6">
            {/* Header label mono */}
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
              · Installa l'app ·
            </p>

            {/* Icon + title */}
            <div className="mt-3 flex items-start gap-4">
              <div
                className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl border border-primary/30 bg-primary text-primary-foreground shadow-glow-brand"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, rgba(255,255,255,0.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.10) 1px, transparent 1px)',
                  backgroundSize: '12px 12px',
                }}
              >
                <div className="flex items-baseline font-mono font-black leading-none tracking-tightest">
                  <span className="text-2xl text-accent">X</span>
                  <span className="text-xl text-primary-foreground">+</span>
                </div>
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <h2
                  id="pwa-install-title"
                  className="text-lg font-semibold leading-tight tracking-tight text-foreground"
                >
                  {isIos ? 'Aggiungi alla Home' : 'Installa impiantiXplus'}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isIos
                    ? 'Tienila a portata di pollice — apertura più veloce, niente barra browser.'
                    : 'Aprila come app dal tuo cantiere — più veloce, schermo intero, funziona anche offline.'}
                </p>
              </div>
            </div>

            {/* Body */}
            {isIos ? (
              <div className="mt-5 space-y-2 rounded-lg border border-border bg-muted/40 p-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Come fare su iPhone
                </p>
                <ol className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[10px] font-bold text-primary">
                      1
                    </span>
                    <span>
                      Tocca <Share className="inline h-4 w-4 -mt-0.5 align-middle text-primary" />
                      &nbsp;<strong>Condividi</strong> in basso al browser
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[10px] font-bold text-primary">
                      2
                    </span>
                    <span>
                      Scegli <strong>«Aggiungi a Home»</strong>
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[10px] font-bold text-primary">
                      3
                    </span>
                    <span>
                      Tocca <strong>«Aggiungi»</strong> in alto a destra
                    </span>
                  </li>
                </ol>
              </div>
            ) : (
              <ul className="mt-5 space-y-2">
                <BenefitLine text="Apertura più rapida — niente barra browser" />
                <BenefitLine text="Foto cantiere anche offline (Background Sync)" />
                <BenefitLine text="Notifiche push per nuovi tickets" />
              </ul>
            )}

            {/* Actions */}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
              <button
                type="button"
                onClick={handleLater}
                className="flex-1 rounded-lg border border-border bg-background px-4 py-3 font-mono text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.98]"
              >
                {isIos ? 'Capito' : 'Più tardi'}
              </button>
              {!isIos && (
                <button
                  type="button"
                  onClick={handleInstall}
                  disabled={installing}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-primary bg-primary px-4 py-3 font-mono text-xs font-bold uppercase tracking-[0.14em] text-primary-foreground shadow-glow-brand transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  {installing ? 'Installazione…' : 'Installa app'}
                </button>
              )}
            </div>

            {/* Footnote */}
            <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/60">
              {isIos
                ? 'Funziona anche su Android, dal browser Chrome o Samsung Internet'
                : 'Te lo ricordiamo tra 30 giorni se non lo fai ora'}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function BenefitLine({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2 text-sm text-foreground">
      <span
        aria-hidden="true"
        className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
      />
      <span>{text}</span>
    </li>
  );
}

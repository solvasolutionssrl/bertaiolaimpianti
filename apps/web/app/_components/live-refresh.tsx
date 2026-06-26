'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

/**
 * Auto-aggiornamento "soft" dei dati di una pagina (timbrature, pause, presenze).
 * Ogni `intervalMs` (default 60s) chiama `router.refresh()` — ri-fetch dei
 * Server Component senza reload, senza scatti di scroll. Si aggiorna anche
 * quando la tab torna visibile. Si ferma quando la tab è nascosta (no spreco).
 * Mostra un piccolo indicatore "Aggiornato alle HH:MM" non invadente.
 */
export function LiveRefresh({
  intervalMs = 60000,
  className,
}: {
  intervalMs?: number;
  className?: string;
}) {
  const router = useRouter();
  const [ultimo, setUltimo] = React.useState<Date | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  React.useEffect(() => {
    setUltimo(new Date()); // primo timestamp lato client (evita mismatch SSR)

    let timer: ReturnType<typeof setInterval> | null = null;

    const aggiorna = () => {
      if (document.visibilityState !== 'visible') return;
      setRefreshing(true);
      router.refresh();
      setUltimo(new Date());
      // breve pulse visivo
      window.setTimeout(() => setRefreshing(false), 800);
    };

    timer = setInterval(aggiorna, intervalMs);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') aggiorna();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [router, intervalMs]);

  const ora = ultimo
    ? new Intl.DateTimeFormat('it-IT', {
        timeZone: 'Europe/Rome',
        hour: '2-digit',
        minute: '2-digit',
      }).format(ultimo)
    : '--:--';

  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 text-[11px] text-muted-foreground select-none',
        className ?? '',
      ].join(' ')}
      title="I dati si aggiornano da soli ogni minuto"
      aria-live="polite"
    >
      <RefreshCw
        className={`h-3 w-3 ${refreshing ? 'animate-spin text-primary' : 'opacity-60'}`}
        aria-hidden="true"
      />
      Aggiornato alle {ora}
    </span>
  );
}

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

/**
 * Auto-aggiornamento "soft" dei dati di una pagina (timbrature, pause, presenze).
 * Ogni `intervalMs` (default 60s) chiama `router.refresh()` — ri-fetch dei
 * Server Component senza reload, senza scatti di scroll. Si aggiorna anche
 * quando la tab torna visibile. È anche un **bottone**: cliccando "Aggiornato
 * alle HH:MM" si forza un refresh manuale immediato (mini effetto di rotazione).
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

  const aggiorna = React.useCallback(
    (manuale = false) => {
      // L'auto-refresh salta se la tab è nascosta; il click manuale aggiorna sempre.
      if (!manuale && document.visibilityState !== 'visible') return;
      setRefreshing(true);
      router.refresh();
      setUltimo(new Date());
      window.setTimeout(() => setRefreshing(false), 800);
    },
    [router],
  );

  React.useEffect(() => {
    setUltimo(new Date()); // primo timestamp lato client (evita mismatch SSR)
    const timer = setInterval(() => aggiorna(false), intervalMs);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') aggiorna(false);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [aggiorna, intervalMs]);

  const ora = ultimo
    ? new Intl.DateTimeFormat('it-IT', {
        timeZone: 'Europe/Rome',
        hour: '2-digit',
        minute: '2-digit',
      }).format(ultimo)
    : '--:--';

  return (
    <button
      type="button"
      onClick={() => aggiorna(true)}
      disabled={refreshing}
      title="Aggiorna i dati adesso (si aggiornano comunque da soli ogni minuto)"
      aria-label="Aggiorna i dati adesso"
      className={[
        'group inline-flex select-none items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground transition-colors',
        'hover:bg-muted hover:text-foreground active:scale-95 disabled:opacity-70',
        className ?? '',
      ].join(' ')}
    >
      <RefreshCw
        className={[
          'h-3 w-3 transition-transform duration-200',
          refreshing
            ? 'animate-spin text-primary'
            : 'opacity-60 group-hover:rotate-90 group-hover:opacity-100',
        ].join(' ')}
        aria-hidden="true"
      />
      Aggiornato alle {ora}
    </button>
  );
}

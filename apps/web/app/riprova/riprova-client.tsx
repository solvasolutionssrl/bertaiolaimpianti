'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, WifiOff } from 'lucide-react';

import { createBrowserSupabase } from '@kommessa/api/client';

/** Oltre questi tentativi si smette di insistere e si chiede di rientrare. */
const TENTATIVI_MAX = 3;

/** Destinazione sicura: solo percorsi interni, mai un indirizzo di fuori. */
function destinazione(grezza: string | null): string {
  if (!grezza || !grezza.startsWith('/') || grezza.startsWith('//')) return '/mobile';
  if (grezza.startsWith('/riprova')) return '/mobile';
  return grezza;
}

export function RiprovaClient() {
  const params = useSearchParams();
  const dove = destinazione(params.get('dove'));
  const [tentativo, setTentativo] = React.useState(1);
  const [arreso, setArreso] = React.useState(false);

  React.useEffect(() => {
    let vivo = true;

    async function prova() {
      try {
        const supabase = createBrowserSupabase();
        // `getSession` legge il biglietto salvato; se l'accesso è scaduto lo
        // rinnova da solo e riscrive i cookie che il server legge.
        const { data } = await supabase.auth.getSession();
        if (!vivo) return;
        if (data.session) {
          window.location.replace(dove);
          return;
        }
        // Nessuna sessione: qui il collegamento è finito davvero.
        window.location.replace(`/login?next=${encodeURIComponent(dove)}`);
      } catch {
        if (!vivo) return;
        // Rete ancora giù. Si aspetta un po' di più a ogni giro.
        if (tentativo >= TENTATIVI_MAX) {
          setArreso(true);
          return;
        }
        window.setTimeout(() => vivo && setTentativo((n) => n + 1), tentativo * 1500);
      }
    }

    void prova();
    return () => {
      vivo = false;
    };
  }, [tentativo, dove]);

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-8 text-center">
      {arreso ? (
        <>
          <WifiOff className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-semibold">Non riesco a collegarmi</p>
            <p className="text-sm text-muted-foreground">
              Controlla la connessione e riprova. I dati che hai già mandato sono
              al sicuro.
            </p>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setArreso(false);
                setTentativo(1);
              }}
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground active:scale-95"
            >
              Riprova
            </button>
            <a
              href={`/login?next=${encodeURIComponent(dove)}`}
              className="px-5 py-2 text-sm text-muted-foreground underline underline-offset-4"
            >
              Entra di nuovo
            </a>
          </div>
        </>
      ) : (
        <>
          <Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Un attimo, ti riporto dentro…</p>
        </>
      )}
    </main>
  );
}

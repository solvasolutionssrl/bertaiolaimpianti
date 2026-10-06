'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';

import { entraNellaBacheca } from '../_actions';

/**
 * La porta: una password e nient'altro.
 *
 * Niente nome dell'azienda, niente logo, niente «bacheca di …»: questa pagina
 * si apre con un indirizzo che gira per l'ufficio, e prima della password non
 * deve dire di chi è. Dopo sì.
 */
export function PortaBacheca({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = React.useState('');
  const [errore, setErrore] = React.useState<string | null>(null);
  const [inCorso, avvia] = React.useTransition();

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-neutral-950 p-6 text-neutral-100">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setErrore(null);
          avvia(async () => {
            const r = await entraNellaBacheca({ token, password });
            if (!r.ok) {
              setErrore(r.errore);
              setPassword('');
              return;
            }
            router.refresh();
          });
        }}
        className="w-full max-w-xs space-y-4"
      >
        <div className="text-center">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
            <Lock aria-hidden="true" className="h-5 w-5" />
          </span>
          <h1 className="text-base font-semibold">Bacheca</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Serve la password dell&apos;ufficio.
          </p>
        </div>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          required
          aria-label="Password della bacheca"
          className="h-12 w-full rounded-lg border border-white/15 bg-white/5 px-4 text-center text-base text-neutral-100 placeholder:text-neutral-500 focus:border-white/40 focus:outline-none"
        />

        {errore ? (
          <p role="alert" className="text-center text-sm text-rose-300">
            {errore}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={inCorso || password.length === 0}
          className="h-12 w-full rounded-lg bg-white font-semibold text-neutral-900 transition active:scale-[0.99] disabled:opacity-50"
        >
          {inCorso ? 'Un momento…' : 'Entra'}
        </button>
      </form>
    </div>
  );
}

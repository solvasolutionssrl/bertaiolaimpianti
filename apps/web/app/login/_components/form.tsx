'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { createBrowserSupabase } from '@kommessa/api/client';
import { risolviLogin } from '../_actions/risolvi-login';
import { registraEventoAccesso } from '@/app/_actions/auth-events';

function pickHomeForDevice(): string {
  if (typeof window === 'undefined') return '/office';
  const isCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const isNarrow = window.innerWidth < 768;
  const ua = navigator.userAgent || '';
  const isMobileUa = /Android|iPhone|iPad|iPod|Mobile|Mobi/i.test(ua);
  return isNarrow || isCoarsePointer || isMobileUa ? '/mobile' : '/office';
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const explicitNext = searchParams.get('next');

  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(true);

  return (
    <div
      className="rounded-2xl border border-[hsl(30,12%,89%)] bg-white/90 px-7 py-8 shadow-[0_8px_40px_-12px_rgba(19,64,166,0.12),0_2px_8px_-2px_rgba(0,0,0,0.06)] backdrop-blur-sm"
    >
      <h1 className="mb-6 text-[22px] font-semibold leading-tight tracking-tight text-[hsl(220,30%,9%)]">
        Accedi
      </h1>

      <form
        action={(fd) => {
          setErr(null);
          const codice = String(fd.get('codice') ?? '').trim();
          const raw = String(fd.get('email') ?? '').trim();
          const password = String(fd.get('password') ?? '');
          if (!raw || !password) {
            setErr('Inserisci username e password.');
            return;
          }
          start(async () => {
            // Risoluzione deterministica: codice azienda + username → email
            // sintetica. Email completa (con @) passa invariata; codice vuoto →
            // tenant di default (Bertaiola, retrocompatibile).
            const res = await risolviLogin({ codice, identita: raw });
            if (!res.ok) {
              setErr(
                res.error === 'codice_non_valido'
                  ? 'Codice azienda non valido. Controlla il codice fornito dall\'azienda.'
                  : 'Username o email non validi.',
              );
              return;
            }
            const email = res.email;
            const supabase = createBrowserSupabase();
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) {
              setErr(
                error.message === 'Invalid login credentials'
                  ? 'Credenziali non valide. Controlla email/username e password.'
                  : error.message,
              );
              return;
            }
            // Tracking accessi (best-effort, non blocca il redirect).
            void registraEventoAccesso('login');
            let dest = explicitNext || '';
            if (!dest) {
              const { data: ures } = await supabase.auth.getUser();
              const meta = (ures.user?.app_metadata ?? {}) as Record<string, unknown>;
              const isPlatform =
                meta.platform_admin === true ||
                meta.platform_admin === 'true' ||
                (ures.user?.email ?? '').toLowerCase() === 'dev@solva.it';
              dest = isPlatform ? '/admin' : pickHomeForDevice();
            }
            router.replace(dest);
            router.refresh();
          });
        }}
        className="flex flex-col gap-4"
      >
        {/* Codice azienda (opzionale) */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="codice"
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(220,10%,45%)]"
          >
            Codice azienda
          </label>
          <input
            id="codice"
            name="codice"
            type="text"
            autoComplete="organization"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Codice azienda"
            disabled={pending}
            className="h-12 w-full rounded-xl border border-[hsl(30,12%,89%)] bg-[hsl(32,28%,99%)] px-4 text-[15px] uppercase text-[hsl(220,30%,9%)] placeholder:text-[hsl(220,10%,70%)] placeholder:normal-case transition-colors focus:border-[hsl(220,80%,32%)] focus:outline-none focus:ring-2 focus:ring-[hsl(220,80%,32%)]/20 disabled:opacity-60"
          />
          <p className="text-[11px] text-[hsl(220,10%,55%)]">
            Lascialo vuoto se la tua azienda non te ne ha fornito uno.
          </p>
        </div>

        {/* Email o username */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="email"
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(220,10%,45%)]"
          >
            Email o username
          </label>
          <input
            id="email"
            name="email"
            type="text"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            placeholder="nome@azienda.it  oppure  username"
            disabled={pending}
            className="h-12 w-full rounded-xl border border-[hsl(30,12%,89%)] bg-[hsl(32,28%,99%)] px-4 text-[15px] text-[hsl(220,30%,9%)] placeholder:text-[hsl(220,10%,70%)] transition-colors focus:border-[hsl(220,80%,32%)] focus:outline-none focus:ring-2 focus:ring-[hsl(220,80%,32%)]/20 disabled:opacity-60"
          />
        </div>

        {/* Password */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="password"
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(220,10%,45%)]"
          >
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPwd ? 'text' : 'password'}
              autoComplete="current-password"
              required
              placeholder="••••••••"
              disabled={pending}
              className="h-12 w-full rounded-xl border border-[hsl(30,12%,89%)] bg-[hsl(32,28%,99%)] px-4 pr-12 text-[15px] text-[hsl(220,30%,9%)] placeholder:text-[hsl(220,10%,70%)] transition-colors focus:border-[hsl(220,80%,32%)] focus:outline-none focus:ring-2 focus:ring-[hsl(220,80%,32%)]/20 disabled:opacity-60"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPwd((v) => !v)}
              aria-label={showPwd ? 'Nascondi password' : 'Mostra password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg text-[hsl(220,10%,55%)] transition-colors hover:bg-[hsl(220,80%,32%)]/8 hover:text-[hsl(220,80%,32%)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(220,80%,32%)]/30"
            >
              {showPwd ? (
                <EyeOff className="h-4 w-4" strokeWidth={1.75} />
              ) : (
                <Eye className="h-4 w-4" strokeWidth={1.75} />
              )}
            </button>
          </div>
        </div>

        {/* Ricordami */}
        <label className="flex cursor-pointer items-center gap-2.5 select-none">
          <span className="relative flex h-4.5 w-4.5 shrink-0 items-center justify-center">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="peer sr-only"
            />
            {/* Custom checkbox */}
            <span
              aria-hidden="true"
              className={[
                'flex h-[18px] w-[18px] items-center justify-center rounded-[4px] border transition-colors',
                remember
                  ? 'border-[hsl(220,80%,32%)] bg-[hsl(220,80%,32%)]'
                  : 'border-[hsl(30,12%,78%)] bg-white',
              ].join(' ')}
            >
              {remember ? (
                <svg viewBox="0 0 10 8" fill="none" className="h-2.5 w-2.5">
                  <path
                    d="M1 4L3.5 6.5L9 1"
                    stroke="white"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </span>
          </span>
          <span className="text-[13px] text-[hsl(220,10%,40%)]">Ricordami su questo dispositivo</span>
        </label>

        {/* Errore */}
        {err ? (
          <div
            role="alert"
            className="rounded-lg border border-[hsl(0,78%,50%)]/20 bg-[hsl(0,78%,50%)]/5 px-3.5 py-2.5 text-[13px] text-[hsl(0,72%,42%)]"
          >
            {err}
          </div>
        ) : null}

        {/* Submit */}
        <button
          type="submit"
          disabled={pending}
          className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[hsl(220,80%,32%)] font-mono text-[12px] uppercase tracking-[0.16em] text-white shadow-[0_4px_16px_-4px_hsl(220,80%,32%,0.4)] transition-all hover:bg-[hsl(220,80%,27%)] hover:shadow-[0_6px_20px_-4px_hsl(220,80%,32%,0.5)] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {pending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Accesso in corso…
            </>
          ) : (
            'Accedi'
          )}
        </button>
      </form>
    </div>
  );
}

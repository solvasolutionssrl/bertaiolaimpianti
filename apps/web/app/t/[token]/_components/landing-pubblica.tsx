import Link from 'next/link';
import { Button } from '@kommessa/ui';
import {
  LANDING_TAGLINE_DEFAULT,
  LANDING_PITCH,
  LANDING_FIRMA,
} from '@/app/_lib/kantiere-landing';

/**
 * Landing pubblica del QR cantiere.
 *
 * Mostrata a chiunque inquadri il QR senza essere autenticato (telefono
 * "normale", non un tecnico). È identica per ogni cantiere: cambiano solo il
 * nome azienda e il nome cantiere, presi dal DB. Il tecnico ha comunque il
 * pulsante "Accedi per timbrare" che porta al flusso reale.
 *
 * Server component puro (nessuna interattività oltre al Link di login):
 * niente prop-funzione, badge "K" come SVG/markup inline.
 */
export function LandingPubblica({
  azienda,
  tagline,
  cantiere,
  token,
}: {
  azienda: string;
  tagline: string | null;
  cantiere: string;
  token: string;
}) {
  const sottotitolo = tagline?.trim() || LANDING_TAGLINE_DEFAULT;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-between bg-gradient-to-b from-slate-50 to-slate-100 px-5 py-8">
      <div className="w-full max-w-sm">
        {/* Intestazione azienda */}
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
            Accesso cantiere
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {azienda}
          </h1>
          <p className="mx-auto mt-2 max-w-[19rem] text-sm leading-relaxed text-slate-500">
            {sottotitolo}
          </p>
        </div>

        {/* Card cantiere */}
        <div className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Cantiere
          </p>
          <p className="mt-1.5 text-xl font-semibold leading-snug tracking-tight text-slate-900">
            {cantiere}
          </p>

          <Link href={`/login?next=/t/${token}`} className="mt-5 block">
            <Button className="w-full" size="lg">
              Accedi per timbrare
            </Button>
          </Link>
          <p className="mt-2.5 text-center text-xs text-slate-400">
            Sei un tecnico? Accedi con il tuo account per registrare ingresso e
            uscita.
          </p>
        </div>

        {/* Pubblicità servizio */}
        <div className="mt-7 rounded-2xl border border-slate-200/70 bg-white/60 p-5">
          <div className="flex items-center gap-2.5">
            <KBadge />
            <span className="text-base font-bold tracking-tight text-slate-800">
              Kantiere
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            {LANDING_PITCH}
          </p>
        </div>
      </div>

      {/* Firma Solva */}
      <p className="mt-8 text-center text-[11px] leading-relaxed text-slate-400">
        {LANDING_FIRMA}
      </p>
    </div>
  );
}

/** Badge "K" con la stessa identità dell'icona PWA (gradiente cobalto→ambra). */
function KBadge() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-lg font-black text-white shadow-sm"
      style={{
        background:
          'linear-gradient(135deg, #1340A6 0%, #1340A6 55%, #D97706 100%)',
        letterSpacing: '-0.06em',
      }}
    >
      K
    </span>
  );
}

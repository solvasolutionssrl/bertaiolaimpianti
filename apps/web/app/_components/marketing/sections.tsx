import type { ReactNode, CSSProperties } from 'react';
import { CheckCircle2 } from 'lucide-react';

/* ──────────────────────────────────────────────────────────────────────── */
/*  Sistema di sezioni condiviso del sito vetrina (home · kantiere · contatti)*/
/*                                                                            */
/*  Ritmo di navigazione: le pagine alternano i fondi con un pattern         */
/*  ripetuto di PERIODO 3 → [navy] · [tinta chiara] · [gradient] → e via.     */
/*  - navy  = fondo scuro BLU (mai nero): punteggiatura, "palco" per i render */
/*  - mist  = chiaro freddo (azzurro) con puntini blu                         */
/*  - sand  = chiaro caldo (pesca) con puntini arancio                        */
/*  - glow  = gradient vivo blu↘arancio, la nota "energia"                    */
/*                                                                            */
/*  Regola: mai due sezioni chiare stark-white di fila; ogni chiara è         */
/*  TINTA + texture. Il navy ricorre a cadenza regolare così la pagina non    */
/*  "diventa tutta bianca". Server components: nessuno stato client.          */
/* ──────────────────────────────────────────────────────────────────────── */

export type Tone = 'glow' | 'mist' | 'sand' | 'navy';
export type Tex = 'dots' | 'dotsAccent' | 'grid' | 'gridDark';

const TONE: Record<
  Tone,
  { style?: CSSProperties; extra?: string; border?: string; dark?: boolean; seam?: boolean }
> = {
  glow: {
    style: {
      background:
        'radial-gradient(860px 480px at 6% -4%, hsl(214 92% 84% / 0.96), transparent 62%),' +
        'radial-gradient(800px 440px at 94% 4%, hsl(28 96% 84% / 0.94), transparent 64%),' +
        'linear-gradient(140deg, hsl(214 62% 94%), hsl(224 42% 96%) 46%, hsl(28 64% 93%))',
    },
    border: 'border-y border-primary/10',
  },
  mist: {
    style: { background: 'linear-gradient(180deg, hsl(213 48% 96%), hsl(219 38% 93%))' },
    border: 'border-y border-primary/10',
  },
  sand: {
    style: { background: 'linear-gradient(180deg, hsl(30 54% 96%), hsl(24 46% 93%))' },
    border: 'border-y border-accent/15',
  },
  navy: {
    // Blu profondo — sibling scuro del brand (#1340A6), MAI nero.
    style: { background: 'linear-gradient(180deg, hsl(219 54% 19%), hsl(222 52% 14%))' },
    border: 'border-y border-white/10',
    dark: true,
    seam: true,
  },
};

const TEX: Record<Tex, string> = {
  dots: 'bg-dots opacity-70',
  dotsAccent: 'bg-dots-accent opacity-70',
  grid: 'bg-grid opacity-50',
  gridDark: 'bg-grid-dark',
};

export function Section({
  tone = 'mist',
  texture,
  id,
  children,
  narrow,
}: {
  tone?: Tone;
  texture?: Tex;
  id?: string;
  children: ReactNode;
  narrow?: boolean;
}) {
  const cfg = TONE[tone];
  return (
    <section
      id={id}
      className={`relative isolate overflow-hidden ${cfg.dark ? 'dark ' : ''}${cfg.extra ?? ''} ${cfg.border ?? ''}`}
      style={cfg.style}
    >
      {/* seam: filo brand luminoso all'ingresso delle sezioni scure = way-finding */}
      {cfg.seam ? (
        <div aria-hidden className="border-brand-line absolute inset-x-0 top-0 z-10 h-px opacity-70" />
      ) : null}

      {texture ? (
        <div aria-hidden className={`pointer-events-none absolute inset-0 -z-10 ${TEX[texture]}`} />
      ) : null}

      {cfg.dark ? (
        <>
          <div
            aria-hidden
            style={{ background: 'radial-gradient(circle at 30% 30%, hsl(218 92% 55% / 0.24), transparent 60%)' }}
            className="absolute -left-24 -top-24 -z-10 h-96 w-96 rounded-full blur-3xl"
          />
          <div
            aria-hidden
            style={{ background: 'radial-gradient(circle at 60% 40%, hsl(24 95% 55% / 0.18), transparent 60%)' }}
            className="absolute -bottom-16 -right-16 -z-10 h-80 w-80 rounded-full blur-3xl"
          />
        </>
      ) : null}

      <div className={`mx-auto ${narrow ? 'max-w-4xl' : 'max-w-6xl'} px-6 py-20 md:py-24`}>{children}</div>
    </section>
  );
}

export function Split({ reverse, media, children }: { reverse?: boolean; media: ReactNode; children: ReactNode }) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
      <div className={reverse ? 'lg:order-2' : ''}>{children}</div>
      <div className={reverse ? 'lg:order-1' : ''}>{media}</div>
    </div>
  );
}

export function Copy({
  eyebrow,
  title,
  body,
  bullets,
  tone = 'light',
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  body: string;
  bullets?: string[];
  tone?: 'light' | 'dark';
  children?: ReactNode;
}) {
  return (
    <div>
      <p
        className={`font-mono text-[11px] uppercase tracking-[0.18em] ${
          tone === 'dark' ? 'text-accent' : 'text-primary'
        }`}
      >
        {eyebrow}
      </p>
      {/* text-foreground ESPLICITO: sulle sezioni dark il colore ereditato resta
          quello chiaro calcolato dal body → invisibile. Va forzato. */}
      <h2 className="mt-2 text-pretty text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {title}
      </h2>
      <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground sm:text-base">{body}</p>
      {bullets ? (
        <ul className="mt-5 space-y-2.5">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-2.5 text-sm text-foreground/90">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {children}
    </div>
  );
}

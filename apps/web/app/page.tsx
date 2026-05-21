import Link from 'next/link';
import {
  ArrowRight,
  Mic,
  Camera,
  CloudUpload,
  FileText,
  ShieldCheck,
  Sparkles,
  Folder,
  Hammer,
  HardHat,
  Building2,
  CheckCircle2,
  Image as ImageIcon,
  PenLine,
  ExternalLink,
} from 'lucide-react';

export const metadata = {
  title: 'Kommessa — gestione commesse cantiere',
  description:
    'Sopralluogo vocale, foto/video dal cantiere, sync cloud, annotazioni e report. La suite SOLVA per impiantisti.',
};

export default function RootPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-aurora-brand">
      <div className="absolute inset-0 -z-10 bg-grid-radial opacity-60" aria-hidden />
      <div
        aria-hidden
        className="border-brand-line absolute inset-x-0 top-0 -z-10 h-1"
      />

      <SiteNav />

      <Hero />

      <TrustBar />

      <ComeFunziona />

      <Funzionalita />

      <PerChi />

      <Architettura />

      <FinalCta />

      <SiteFooter />
    </main>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  NAV                                                                     */
/* ──────────────────────────────────────────────────────────────────────── */

function SiteNav() {
  return (
    <nav className="sticky top-0 z-40 mx-auto flex max-w-6xl items-center justify-between gap-3 border-b border-transparent bg-background/80 px-6 py-4 backdrop-blur transition-colors supports-[backdrop-filter]:bg-background/60">
      <Link href="/" className="flex items-center gap-2.5">
        <BrandMark />
        <span className="flex flex-col leading-none">
          <span className="text-base font-semibold tracking-tight">Kommessa</span>
          <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
            suite SOLVA
          </span>
        </span>
      </Link>

      <div className="hidden items-center gap-7 text-sm md:flex">
        <a
          href="#come-funziona"
          className="text-foreground/70 transition hover:text-foreground"
        >
          Come funziona
        </a>
        <a
          href="#funzionalita"
          className="text-foreground/70 transition hover:text-foreground"
        >
          Funzionalità
        </a>
        <a
          href="#per-chi"
          className="text-foreground/70 transition hover:text-foreground"
        >
          Per chi
        </a>
        <a
          href="#architettura"
          className="text-foreground/70 transition hover:text-foreground"
        >
          Architettura
        </a>
      </div>

      <Link
        href="/login"
        prefetch
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow-brand transition hover:opacity-95"
      >
        Accedi
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </nav>
  );
}

function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg shadow-glow-brand"
      style={{
        background:
          'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary)) 55%, hsl(var(--accent)) 100%)',
      }}
    >
      <span className="font-mono text-base font-bold tracking-tighter text-white">
        K
      </span>
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  HERO                                                                    */
/* ──────────────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="mx-auto max-w-3xl px-6 pb-16 pt-16 text-center sm:pb-24 sm:pt-24">
      <div className="animate-fade-up">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-success/60" />
            <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-success" />
          </span>
          pilot in produzione · Bertaiola Impianti
        </span>
      </div>

      <h1
        className="mt-7 text-balance text-5xl font-semibold tracking-tighter text-foreground sm:text-6xl md:text-7xl animate-fade-up"
        style={{ animationDelay: '60ms' }}
      >
        Le commesse di cantiere,
        <br />
        <span className="text-brand-grad">finalmente al passo dei tecnici.</span>
      </h1>

      <p
        className="mx-auto mt-6 max-w-xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg animate-fade-up"
        style={{ animationDelay: '120ms' }}
      >
        Dal sopralluogo dettato a voce alla consegna del report, in
        un&apos;unica app. Ticket, fasi, foto da cantiere, documenti annotati —
        tutto sincronizzato in cloud, tutto pronto per l&apos;ufficio.
      </p>

      <div
        className="mt-10 flex flex-wrap items-center justify-center gap-3 animate-fade-up"
        style={{ animationDelay: '180ms' }}
      >
        <Link
          href="/login"
          prefetch
          className="group inline-flex h-12 items-center gap-2 rounded-md bg-primary px-7 text-sm font-medium text-primary-foreground shadow-glow-brand transition hover:opacity-95 active:translate-y-px"
        >
          Apri l&apos;applicativo
          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </Link>
        <a
          href="#come-funziona"
          className="inline-flex h-12 items-center gap-2 rounded-md border border-border bg-card/80 px-6 text-sm font-medium text-foreground backdrop-blur transition hover:bg-card"
        >
          Scopri di più
        </a>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  TRUST BAR (loghi + claim sintetici)                                     */
/* ──────────────────────────────────────────────────────────────────────── */

function TrustBar() {
  const items = [
    { icon: ShieldCheck, label: 'GDPR · hosting EU' },
    { icon: Folder, label: 'Multi-tenant nativo' },
    { icon: Sparkles, label: 'AI naming + voice intake' },
    { icon: CloudUpload, label: 'Sync R2 ↔ Nextcloud' },
  ];
  return (
    <section className="mx-auto max-w-6xl px-6 pb-10">
      <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-xs text-muted-foreground">
        {items.map(({ icon: Icon, label }) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 text-primary/80" aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  COME FUNZIONA — 4 step                                                  */
/* ──────────────────────────────────────────────────────────────────────── */

function ComeFunziona() {
  const steps = [
    {
      n: '01',
      icon: Mic,
      title: 'Detti la commessa a voce',
      body: 'Whisper la trascrive, Claude estrae cliente · descrizione · fasi · indirizzo. Tu confermi in due tap.',
    },
    {
      n: '02',
      icon: Folder,
      title: 'Cartella e fasi pronte',
      body: 'Codice interno univoco, cartella cloud creata con scaffold completo, voci di lavoro pre-popolate.',
    },
    {
      n: '03',
      icon: Camera,
      title: 'Foto e video dal cantiere',
      body: 'Upload diretto verso R2 con multipart resiliente. Niente più video bloccati a 80% sul mobile.',
    },
    {
      n: '04',
      icon: FileText,
      title: 'Report e firma',
      body: 'PDF di chiusura generato in automatico con foto, fasi e DICO. Annota e firma in app, niente stampa.',
    },
  ];
  return (
    <section id="come-funziona" className="mx-auto max-w-6xl px-6 py-20">
      <SectionHeading
        eyebrow="Workflow"
        title="Dal sopralluogo alla consegna in quattro passi"
        subtitle="Tutto il flusso operativo del cantiere, senza fogli Excel né foto disperse su WhatsApp."
      />
      <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {steps.map(({ n, icon: Icon, title, body }) => (
          <div
            key={n}
            className="group relative overflow-hidden rounded-xl border border-border bg-card/80 p-5 backdrop-blur transition hover:-translate-y-0.5 hover:shadow-soft-md"
          >
            <span
              aria-hidden="true"
              className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground/60"
            >
              {n}
            </span>
            <div className="mt-3 inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary-soft text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-base font-semibold tracking-tight">{title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
            <span
              aria-hidden="true"
              className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-accent/0 transition group-hover:bg-accent/10"
            />
          </div>
        ))}
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  FUNZIONALITÀ — grid 6                                                   */
/* ──────────────────────────────────────────────────────────────────────── */

function Funzionalita() {
  const items = [
    {
      icon: Mic,
      title: 'Voice intake con AI',
      body: 'Detti, l\'AI estrae cliente, fasi e descrizione. Tu rivedi due card, confermi e parti.',
    },
    {
      icon: CloudUpload,
      title: 'Upload resiliente',
      body: 'Multipart diretto verso R2: bypass del limite Vercel, retry automatici, cancel pulito.',
    },
    {
      icon: ImageIcon,
      title: 'Lightbox in-app',
      body: 'Foto, video con player custom e PDF inline con scroll continuo. Niente popup browser.',
    },
    {
      icon: PenLine,
      title: 'Annotazioni con Pencil',
      body: 'Matita, freccia, evidenziatore, testo. Sensibilità Apple Pencil, lock pessimistico per editing condiviso.',
    },
    {
      icon: Folder,
      title: 'Nextcloud come verità',
      body: 'Sync R2 → Nextcloud in background. I file appaiono dove i ragazzi in ufficio li cercano già.',
    },
    {
      icon: Sparkles,
      title: 'AI naming',
      body: 'La cartella si nomina da sola in modo coerente: codice + cliente + descrizione, niente ambiguità.',
    },
  ];
  return (
    <section
      id="funzionalita"
      className="relative mx-auto max-w-6xl px-6 py-20"
    >
      <SectionHeading
        eyebrow="Funzionalità"
        title="Tutto ciò che serve in cantiere, niente di più"
        subtitle="Scelte fatte: dialogo con la voce, upload che reggono la rete debole, annotazioni reali, sync con quello che già usate."
      />
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="rounded-xl border border-border bg-card/80 p-5 backdrop-blur transition hover:border-primary/30 hover:shadow-soft-md"
          >
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary-soft text-primary">
                <Icon className="h-4 w-4" />
              </span>
              <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  PER CHI                                                                 */
/* ──────────────────────────────────────────────────────────────────────── */

function PerChi() {
  const profili = [
    {
      icon: Building2,
      label: 'Ufficio',
      title: 'Visione completa, audit incluso',
      body: 'Dashboard cross-tenant, tickets, report PDF, ricerca full-text, gestione utenti e quote.',
      tag: 'Web desktop',
    },
    {
      icon: HardHat,
      label: 'Capo cantiere',
      title: 'Apre la commessa in 30 secondi',
      body: 'Voice intake, briefing iniziale come "verità sacrosanta", lista commesse ordinata sempre.',
      tag: 'PWA mobile',
    },
    {
      icon: Hammer,
      label: 'Tecnico',
      title: 'Foto, fasi, note senza pensieri',
      body: 'Scatto guidato, upload offline-friendly, viewer media in-app, niente passaggi extra.',
      tag: 'PWA mobile',
    },
  ];
  return (
    <section
      id="per-chi"
      className="relative mx-auto max-w-6xl px-6 py-20"
    >
      <SectionHeading
        eyebrow="Per chi"
        title="Tre ruoli, una sola fonte di verità"
        subtitle="Stesso DB, stessa cartella, viste diverse. Niente sincronizzazioni manuali tra ufficio e cantiere."
      />
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {profili.map(({ icon: Icon, label, title, body, tag }) => (
          <div
            key={label}
            className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-card via-card to-primary/5 p-6 transition hover:shadow-soft-md"
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Icon className="h-5 w-5" />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {tag}
              </span>
            </div>
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
              {label}
            </p>
            <h3 className="mt-1 text-lg font-semibold tracking-tight">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  ARCHITETTURA — strip tech                                               */
/* ──────────────────────────────────────────────────────────────────────── */

function Architettura() {
  const stack = [
    { label: 'Next.js 14 · Vercel', sub: 'Fluid Compute · EU dub1' },
    { label: 'Supabase EU', sub: 'Postgres · Auth · RLS' },
    { label: 'Cloudflare R2', sub: 'Staging multipart · EU' },
    { label: 'Nextcloud', sub: 'Source of truth aziendale' },
    { label: 'Claude + Whisper', sub: 'AI naming + voice intake' },
  ];
  const garanzie = [
    'GDPR · hosting esclusivamente EU (Frankfurt, Dublino, EEUR)',
    'Multi-tenant con RLS Postgres + scoping JWT da day 1',
    'Audit trail completo: ogni upload, annotation, edit',
    'Backup giornaliero gestito, retention 30 giorni',
  ];
  return (
    <section
      id="architettura"
      className="relative mx-auto max-w-6xl px-6 py-20"
    >
      <SectionHeading
        eyebrow="Architettura"
        title="Tecnologia europea, sotto controllo"
        subtitle="Niente dipendenze americane critiche, niente backdoor. Il vostro dato resta in Europa, tracciato e ripristinabile."
      />

      <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {stack.map(({ label, sub }) => (
          <div
            key={label}
            className="rounded-lg border border-border bg-card/60 p-4 backdrop-blur"
          >
            <p className="text-sm font-semibold tracking-tight">{label}</p>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {sub}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-2 sm:grid-cols-2">
        {garanzie.map((g) => (
          <div
            key={g}
            className="flex items-start gap-2 rounded-md border border-border/60 bg-card/40 px-3 py-2.5 text-sm backdrop-blur"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            <span className="text-foreground/85">{g}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  FINAL CTA                                                               */
/* ──────────────────────────────────────────────────────────────────────── */

function FinalCta() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20 text-center">
      <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
        Pronto a smettere di cercare le foto su WhatsApp?
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-balance text-sm leading-relaxed text-muted-foreground sm:text-base">
        Apri l&apos;applicativo se sei già del team Bertaiola, oppure scrivici
        per una demo personalizzata sulla tua realtà.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/login"
          prefetch
          className="group inline-flex h-12 items-center gap-2 rounded-md bg-primary px-7 text-sm font-medium text-primary-foreground shadow-glow-brand transition hover:opacity-95"
        >
          Apri l&apos;applicativo
          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </Link>
        <a
          href="https://solva.it"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-12 items-center gap-2 rounded-md border border-border bg-card/80 px-6 text-sm font-medium text-foreground backdrop-blur transition hover:bg-card"
        >
          Contattaci
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  FOOTER                                                                  */
/* ──────────────────────────────────────────────────────────────────────── */

function SiteFooter() {
  return (
    <footer className="mt-10 border-t border-border/70 bg-background/40 backdrop-blur">
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <span className="flex flex-col leading-none">
              <span className="text-base font-semibold tracking-tight">Kommessa</span>
              <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                suite SOLVA
              </span>
            </span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
            La piattaforma di gestione commesse cantiere per impiantisti.
            Costruita in Italia, ospitata in Europa, fatta per chi lavora
            davvero sul campo.
          </p>
        </div>

        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Prodotto
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <a href="#come-funziona" className="text-foreground/80 hover:text-foreground">
                Come funziona
              </a>
            </li>
            <li>
              <a href="#funzionalita" className="text-foreground/80 hover:text-foreground">
                Funzionalità
              </a>
            </li>
            <li>
              <a href="#per-chi" className="text-foreground/80 hover:text-foreground">
                Per chi
              </a>
            </li>
            <li>
              <a href="#architettura" className="text-foreground/80 hover:text-foreground">
                Architettura
              </a>
            </li>
          </ul>
        </div>

        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Azienda
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <a
                href="https://solva.it"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-foreground/80 hover:text-foreground"
              >
                solva.it <ExternalLink className="h-3 w-3" />
              </a>
            </li>
            <li>
              <a
                href="https://impiantix.app"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-foreground/80 hover:text-foreground"
              >
                impiantiX <ExternalLink className="h-3 w-3" />
              </a>
            </li>
            <li>
              <Link href="/login" className="text-foreground/80 hover:text-foreground">
                Accedi
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-2 px-6 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <span>
            © {new Date().getFullYear()} Solva Solutions S.r.l. · Tutti i diritti
            riservati.
          </span>
          <span className="font-mono">
            powered by{' '}
            <a
              href="https://solva.it"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground/80 hover:text-foreground"
            >
              SOLVA
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Section heading shared                                                  */
/* ──────────────────────────────────────────────────────────────────────── */

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h2>
      {subtitle && (
        <p className="mx-auto mt-3 max-w-xl text-balance text-sm leading-relaxed text-muted-foreground sm:text-base">
          {subtitle}
        </p>
      )}
    </div>
  );
}

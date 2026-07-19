import Link from 'next/link';
import { HeroParallax } from './_components/hero-parallax';
import {
  MarketingNav,
  MarketingFooter,
  SectionHeading,
} from './_components/marketing/chrome';
import { Section } from './_components/marketing/sections';
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
  MapPin,
  ListChecks,
  User,
  ScanLine,
  LifeBuoy,
  Users,
  QrCode,
  Clock,
  Receipt,
  Route,
  Radio,
} from 'lucide-react';

export const metadata = {
  title: 'Kommessa · gestione commesse e cantiere',
  description:
    'Sopralluogo vocale, foto/video dal cantiere, sync cloud, annotazioni e report. Con il modulo Kantiere: presenze col QR, ore, viaggi e note spese. La suite SOLVA per impiantisti.',
};

export default function RootPage() {
  return (
    <main className="relative isolate min-h-screen bg-aurora-brand pt-3">
      <div className="absolute inset-0 -z-10 bg-grid-radial opacity-[0.55]" aria-hidden />
      {/* Fascia colorata al bordo top */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-40"
        style={{
          background:
            'linear-gradient(105deg, hsl(214 82% 80%) 0%, hsl(217 64% 83%) 50%, hsl(27 84% 83%) 100%)',
          maskImage: 'linear-gradient(180deg, black 0%, black 16%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(180deg, black 0%, black 16%, transparent 100%)',
        }}
      />
      <HeroParallax />

      {/* Filo brand sottile inchiodato in cima */}
      <div aria-hidden className="border-brand-line fixed inset-x-0 top-0 z-50 h-[3px]" />

      <MarketingNav active="commesse" />

      <Hero />
      <HeroShowcase />
      <TrustBar />
      <ComeFunziona />
      <Funzionalita />
      <PerChi />
      <KantiereTeaser />
      <Architettura />
      <FinalCta />

      <MarketingFooter />
    </main>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  HERO                                                                     */
/* ──────────────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="mx-auto max-w-4xl px-6 pb-16 pt-16 text-center sm:pb-24 sm:pt-24">
      <div className="animate-fade-up">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-success/60" />
            <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-success" />
          </span>
          già in uso su cantieri reali · suite SOLVA
        </span>
      </div>

      <h1
        className="mt-7 text-balance text-5xl font-semibold tracking-tighter text-foreground sm:text-6xl md:text-[5rem] md:leading-[1.02] animate-fade-up"
        style={{ animationDelay: '60ms' }}
      >
        Le commesse di cantiere,{' '}
        <span className="text-brand-grad">finalmente al passo dei tecnici.</span>
      </h1>

      <p
        className="mx-auto mt-6 max-w-2xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg animate-fade-up"
        style={{ animationDelay: '120ms' }}
      >
        Dal sopralluogo dettato a voce alla consegna del report, in un&apos;unica
        app. Ticket, fasi, foto da cantiere, documenti annotati. Tutto
        sincronizzato in cloud, tutto pronto per l&apos;ufficio.
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
/*  HERO SHOWCASE — render "il dettato": voce → commessa estratta            */
/* ──────────────────────────────────────────────────────────────────────── */

function HeroShowcase() {
  const campi = [
    { icon: User, label: 'Cliente', value: 'Rossi S.r.l.' },
    { icon: Hammer, label: 'Lavoro', value: 'Rifacimento impianto idrico' },
    { icon: MapPin, label: 'Indirizzo', value: 'Via Po 12, Torino' },
    { icon: ListChecks, label: 'Fasi generate', value: '4 voci di lavoro' },
  ];
  return (
    <section
      className="mx-auto max-w-5xl px-6 pb-20 animate-fade-up"
      style={{ animationDelay: '240ms' }}
      aria-label="Esempio: dal dettato vocale alla commessa pronta"
    >
      <div className="relative animate-float-soft">
        <div
          aria-hidden
          className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-tr from-primary/10 via-transparent to-accent/15 blur-2xl"
        />
        <div className="overflow-hidden rounded-2xl border border-border bg-card/90 shadow-soft-lg backdrop-blur">
          {/* window bar */}
          <div className="flex items-center gap-2 border-b border-border/70 bg-muted/40 px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
            <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Kommessa · nuova commessa
            </span>
          </div>

          <div className="grid gap-px bg-border/60 md:grid-cols-2">
            {/* ── Sinistra: il dettato ── */}
            <div className="bg-card p-6">
              <div className="flex items-center gap-3">
                <span className="relative inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-glow-brand">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/40" />
                  <Mic className="relative h-5 w-5" />
                </span>
                {/* waveform */}
                <span className="flex h-10 items-end gap-1" aria-hidden>
                  {[0.6, 1, 0.45, 0.85, 0.35, 0.95, 0.55, 0.75, 0.4].map((h, i) => (
                    <span
                      key={i}
                      className="w-1 animate-wave rounded-full bg-accent/70"
                      style={{
                        height: `${Math.round(h * 36)}px`,
                        animationDelay: `${i * 90}ms`,
                      }}
                    />
                  ))}
                </span>
                <span className="ml-auto font-mono text-xs text-muted-foreground">0:08</span>
              </div>

              <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-accent">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                In ascolto
              </p>

              <p className="mt-3 rounded-xl rounded-tl-sm bg-muted/60 px-4 py-3 text-sm leading-relaxed text-foreground/90">
                «Sopralluogo da Rossi, bagno al primo piano, rifacimento impianto
                idrico, materiale da ordinare, tre giorni di lavoro.»
              </p>
            </div>

            {/* ── Destra: estratto AI ── */}
            <div className="bg-card p-6">
              <p className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                Estratto in automatico
              </p>
              <ul className="mt-4 space-y-2.5">
                {campi.map(({ icon: Icon, label, value }) => (
                  <li
                    key={label}
                    className="flex items-center gap-3 rounded-lg border border-border/70 bg-background/60 px-3 py-2"
                  >
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                        {label}
                      </span>
                      <span className="block truncate text-sm font-medium text-foreground">
                        {value}
                      </span>
                    </span>
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* footer del pannello: foto sync + cta */}
          <div className="flex flex-wrap items-center gap-3 border-t border-border/70 bg-muted/30 px-6 py-3">
            <span className="flex items-center gap-1.5" aria-hidden>
              {['from-primary/30 to-primary/10', 'from-accent/30 to-accent/10', 'from-success/30 to-success/10'].map(
                (g, i) => (
                  <span
                    key={i}
                    className={`h-7 w-7 rounded-md bg-gradient-to-br ${g} ring-1 ring-border`}
                  />
                ),
              )}
            </span>
            <span className="text-xs text-muted-foreground">
              foto del cantiere già sincronizzate
            </span>
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-medium text-success">
              <CloudUpload className="h-3.5 w-3.5" />
              sync ✓
            </span>
          </div>
        </div>

        {/* badge flottante */}
        <span className="absolute -top-3 right-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-foreground shadow-soft-md">
          <Sparkles className="h-3 w-3 text-accent" />
          voce → commessa in ~8&nbsp;secondi
        </span>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  TRUST BAR                                                                */
/* ──────────────────────────────────────────────────────────────────────── */

function TrustBar() {
  const items = [
    { icon: ShieldCheck, label: 'Conforme GDPR' },
    { icon: CloudUpload, label: 'Sync automatico con il cloud aziendale' },
    { icon: Folder, label: 'Cartelle create da sole' },
    { icon: Sparkles, label: 'Voce → commessa pronta' },
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
/*  COME FUNZIONA — 4 step                                                   */
/* ──────────────────────────────────────────────────────────────────────── */

function ComeFunziona() {
  const steps = [
    {
      n: '01',
      icon: Mic,
      title: 'Detti la commessa a voce',
      body: 'Parli al telefono, l\'app estrae cliente, descrizione, fasi e indirizzo. Tu confermi in due tap.',
    },
    {
      n: '02',
      icon: Folder,
      title: 'Cartella pronta in automatico',
      body: 'Codice interno univoco, struttura cartelle creata con un click, voci di lavoro pre-popolate.',
    },
    {
      n: '03',
      icon: Camera,
      title: 'Foto e video dal cantiere',
      body: 'Upload anche su rete debole, niente video bloccati a metà. Caricano da soli mentre lavori.',
    },
    {
      n: '04',
      icon: FileText,
      title: 'Report e consegna',
      body: 'PDF di chiusura generato in automatico con foto, fasi e documenti. Annota e firma direttamente in app.',
    },
  ];
  return (
    <Section tone="navy" texture="gridDark" id="come-funziona">
      <SectionHeading
        eyebrow="Workflow"
        title="Dal sopralluogo alla consegna in quattro passi"
        subtitle="Tutto il flusso operativo del cantiere, senza fogli Excel né foto disperse su WhatsApp."
        tone="dark"
      />
      <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {steps.map(({ n, icon: Icon, title, body }) => (
          <div
            key={n}
            className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.05] p-5 shadow-soft backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/[0.08]"
          >
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">
              {n}
            </span>
            <div className="mt-3 inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-base font-semibold tracking-tight text-foreground">{title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
            <span className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-accent/0 transition group-hover:bg-accent/10" />
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  FUNZIONALITÀ — grid 9 (aggiornata)                                       */
/* ──────────────────────────────────────────────────────────────────────── */

function Funzionalita() {
  const items = [
    { icon: Mic, title: 'Voce → commessa pronta', body: 'Detti due frasi, l\'app capisce cliente, lavori, indirizzo. Tu confermi e parti.' },
    { icon: CloudUpload, title: 'Sync con il cloud aziendale', body: 'Foto e video appaiono nel vostro cloud d\'ufficio entro un minuto, dove i ragazzi li cercano già.' },
    { icon: Folder, title: 'Cartelle senza pensieri', body: 'Struttura creata in automatico per ogni commessa: foto per fase, documenti, materiali, chiusura.' },
    { icon: PenLine, title: 'Annota le foto in app', body: 'Frecce, cerchi, evidenziatore e note sopra alle foto. Funziona con la penna dell\'iPad.' },
    { icon: Sparkles, title: 'Riunioni con verbale AI', body: 'Registri la riunione di cantiere, l\'AI ne fa un verbale con decisioni e cose da fare.' },
    { icon: ScanLine, title: 'Scansione documenti', body: 'Inquadri un documento e lo trasformi in PDF multipagina, pulito e già in cartella.' },
    { icon: ImageIcon, title: 'Galleria e PDF integrati', body: 'Foto e video si aprono nell\'app con swipe. I PDF si sfogliano pagina dopo pagina.' },
    { icon: LifeBuoy, title: 'Ticket e assistenza', body: 'Le richieste dei clienti diventano ticket, e da lì una commessa, senza perdere niente.' },
    { icon: FileText, title: 'Report con un click', body: 'PDF di chiusura cantiere con foto, fasi e documenti. Pronto da inviare o archiviare.' },
  ];
  return (
    <Section tone="mist" texture="dots" id="funzionalita">
      <SectionHeading
        eyebrow="Funzionalità"
        title="Tutto ciò che serve in cantiere, niente di più"
        subtitle="Dialogo con la voce, upload che reggono la rete debole, annotazioni reali, verbali AI e sync con quello che già usate."
      />
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="rounded-xl border border-border bg-card p-5 shadow-soft-md transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-soft-lg"
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
    </Section>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  PER CHI                                                                  */
/* ──────────────────────────────────────────────────────────────────────── */

function PerChi() {
  const profili = [
    {
      icon: Building2,
      label: 'Ufficio',
      title: 'Visione completa, audit incluso',
      body: 'Dashboard, ticket, report PDF, ricerca full-text, gestione utenti e quote. Tutto tracciato.',
      tag: 'Web desktop',
    },
    {
      icon: HardHat,
      label: 'Capo cantiere',
      title: 'Apre la commessa in 30 secondi',
      body: 'Dettatura vocale, briefing iniziale come "verità sacrosanta", lista commesse sempre in ordine.',
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
    <Section tone="glow" texture="grid" id="per-chi">
      <SectionHeading
        eyebrow="Per chi"
        title="Tre ruoli, una sola fonte di verità"
        subtitle="Stesso DB, stessa cartella, viste diverse. Niente sincronizzazioni manuali tra ufficio e cantiere."
      />
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {profili.map(({ icon: Icon, label, title, body, tag }) => (
          <div
            key={label}
            className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-card via-card to-primary/5 p-6 shadow-soft-md transition hover:-translate-y-0.5 hover:shadow-soft-lg"
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Icon className="h-5 w-5" />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {tag}
              </span>
            </div>
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">{label}</p>
            <h3 className="mt-1 text-lg font-semibold tracking-tight">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  KANTIERE TEASER — ponte verso /kantiere                                  */
/* ──────────────────────────────────────────────────────────────────────── */

function KantiereTeaser() {
  const pills = [
    { icon: QrCode, label: 'Presenze col QR' },
    { icon: Clock, label: 'Ore automatiche' },
    { icon: Route, label: 'Viaggi e km' },
    { icon: Receipt, label: 'Note spese AI' },
    { icon: ListChecks, label: 'Pianificazione e personale' },
  ];
  return (
    <Section tone="sand" texture="dotsAccent">
      <div
        className="relative isolate overflow-hidden rounded-3xl border border-accent/30 p-8 shadow-soft-lg sm:p-10"
        style={{ background: 'linear-gradient(135deg, hsl(28 100% 96%), hsl(32 28% 99%) 45%, hsl(220 90% 97%))' }}
      >
        <div
          aria-hidden
          style={{ background: 'radial-gradient(circle at 50% 50%, hsl(24 95% 58% / 0.16), transparent 70%)' }}
          className="absolute -right-16 -top-16 -z-10 h-72 w-72 rounded-full blur-3xl"
        />
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          {/* copy */}
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent-soft px-3 py-1 text-xs font-medium text-accent-soft-foreground">
              <HardHat className="h-3.5 w-3.5" />
              Modulo aggiuntivo · presenze e cantiere
            </span>
            <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Hai anche i cantieri da gestire?{' '}
              <span className="text-brand-grad">Aggiungi Kantiere.</span>
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Presenze col QR sulla porta del cantiere, ore e straordinari
              calcolati da soli, viaggi e km, mezzi, note spese con l&apos;AI,
              pianificazione e personale. Il cantiere digitale, sullo stesso
              account delle commesse.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {pills.map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs font-medium text-foreground shadow-soft backdrop-blur"
                >
                  <Icon className="h-3.5 w-3.5 text-primary" />
                  {label}
                </span>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="/kantiere"
                className="group inline-flex h-12 items-center gap-2 rounded-md bg-primary px-7 text-sm font-medium text-primary-foreground shadow-glow-brand transition hover:opacity-95 active:translate-y-px"
              >
                Scopri il modulo Kantiere
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/contatti"
                className="inline-flex h-12 items-center gap-2 rounded-md border border-border bg-card/80 px-6 text-sm font-medium text-foreground backdrop-blur transition hover:bg-card"
              >
                Richiedi una demo
              </Link>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Una pagina dedicata con presenze live, viaggi, note spese e il badge di cantiere.
            </p>
          </div>

          {/* mini preview presenze (CSS-only) */}
          <div className="relative">
            <div className="overflow-hidden rounded-2xl border border-border bg-card/90 shadow-soft-lg backdrop-blur">
              <div className="flex items-center gap-2 border-b border-border/70 bg-muted/40 px-4 py-2.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Kantiere · presenze
                </span>
                <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-destructive">
                  <span className="relative inline-flex h-1.5 w-1.5">
                    <span className="absolute inset-0 animate-ping rounded-full bg-destructive/60" />
                    <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-destructive" />
                  </span>
                  Live
                </span>
              </div>
              <ul className="divide-y divide-border/60">
                {[
                  { n: 'Marco R.', c: 'Cantiere Belvedere', s: true },
                  { n: 'Luca F.', c: 'Polo Logistico Est', s: true },
                  { n: 'Simone T.', c: 'in viaggio · Scuola Manzoni', s: false },
                ].map((p, i) => (
                  <li key={p.n} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft font-mono text-[10px] font-bold text-primary">
                      {p.n.split(/[\s.]+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('')}
                      {p.s && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-success animate-heartbeat" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{p.n}</span>
                      <span className="block truncate text-xs text-muted-foreground">{p.c}</span>
                    </span>
                    {p.s ? (
                      <span className="flex h-4 items-end gap-0.5" aria-hidden>
                        {[0.5, 0.85, 0.4, 0.7].map((h, j) => (
                          <span
                            key={j}
                            className="w-0.5 rounded-full bg-success/50 animate-wave"
                            style={{ height: `${Math.round(h * 15)}px`, animationDelay: `${(i * 4 + j) * 80}ms` }}
                          />
                        ))}
                      </span>
                    ) : (
                      <Route className="h-4 w-4 text-primary" />
                    )}
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-1.5 border-t border-border/70 bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
                <Radio className="h-3 w-3 text-primary" />
                aggiornamento automatico
              </div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  ARCHITETTURA — strip tech                                                */
/* ──────────────────────────────────────────────────────────────────────── */

function Architettura() {
  const garanzie = [
    'Conforme GDPR: tutti i dati restano in Europa',
    'Dati separati per azienda, accessi tracciati',
    'Sincronizzazione automatica entro un minuto con il cloud che già usate',
    'Storico completo: chi ha caricato cosa, quando, da dove',
    'Backup giornaliero, ripristino disponibile per 30 giorni',
    'Accesso da web e telefono con lo stesso account',
  ];
  return (
    <Section tone="navy" texture="gridDark" id="architettura">
      <SectionHeading
        eyebrow="Garanzie"
        title="Sicurezza, conformità e continuità del dato"
        subtitle="Costruita in Italia, ospitata in Europa. Tutti i dati restano dove devono restare, anche dopo la chiusura della commessa."
        tone="dark"
      />
      <div className="mt-12 grid gap-2.5 sm:grid-cols-2">
        {garanzie.map((g) => (
          <div
            key={g}
            className="flex items-start gap-2.5 rounded-lg border border-white/10 bg-white/[0.05] px-4 py-3 text-sm shadow-soft backdrop-blur"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            <span className="text-foreground/90">{g}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  FINAL CTA                                                                */
/* ──────────────────────────────────────────────────────────────────────── */

function FinalCta() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-20">
      <div className="relative isolate overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-card to-accent/10 px-6 py-14 text-center shadow-soft-lg sm:py-16">
        <div className="absolute inset-0 -z-10 bg-grid-radial opacity-50" aria-hidden />
        <div aria-hidden className="border-brand-line absolute inset-x-0 top-0 h-1" />
        <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Pronto a portare le commesse fuori dal caos?
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-balance text-sm leading-relaxed text-muted-foreground sm:text-base">
          Se hai già un account, apri l&apos;applicativo. Altrimenti scrivici per
          una demo personalizzata su commesse e cantiere.
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
          <Link
            href="/contatti"
            className="inline-flex h-12 items-center gap-2 rounded-md border border-border bg-card/80 px-6 text-sm font-medium text-foreground backdrop-blur transition hover:bg-card"
          >
            Contattaci
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

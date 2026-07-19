import Link from 'next/link';
import {
  ArrowRight,
  QrCode,
  Radio,
  Clock,
  Route,
  Truck,
  Receipt,
  CalendarDays,
  ShieldCheck,
  BadgeCheck,
  FileCheck,
  ScanLine,
  MapPin,
  Wallet,
  PieChart,
  FileSpreadsheet,
  RefreshCw,
  Upload,
  HardHat,
  CheckCircle2,
  Palmtree,
  Building2,
  Sparkles,
  Users,
} from 'lucide-react';
import { MarketingShell, SectionHeading } from '../_components/marketing/chrome';
import { Section, Split, Copy } from '../_components/marketing/sections';
import { PresenzeLive } from './_components/presenze-live';
import { AppTimbrature } from './_components/app-timbrature';
import { QrIngresso } from './_components/qr-ingresso';
import {
  NotaSpeseAI,
  AnalisiCosti,
  PianificazioneSettimanale,
  PercorsiGiornata,
  MezziStrip,
} from './_components/showcase';

export const metadata = {
  title: 'Kantiere · presenze, cantieri e note spese · suite SOLVA',
  description:
    'Il modulo cantiere di Kommessa: il tecnico timbra col QR sulla porta del cantiere, e ore, viaggi, mezzi e note spese si compilano da soli. L’ufficio vede tutto in tempo reale.',
};

/* Ritmo dei fondi (periodo 3): navy → tinta chiara → gradient, ripetuto.
   I render con testo/SVG scuro (presenze, percorsi, analisi) stanno sulle
   sezioni chiare; i render auto-contenuti (QR sulla porta, telefono) e le
   sezioni testo/chip stanno sul navy. Primitive in _components/marketing. */

export default function KantierePage() {
  return (
    <MarketingShell active="cantiere">
      <Hero />
      <ComeFunzionaQr />
      <Presenze />
      <ViaggiMezzi />
      <OreRapportino />
      <Kontabilita />
      <Pianificazione />
      <BadgeCantiere />
      <TuttoIncluso />
      <Bundle />
      <FinalCta />
    </MarketingShell>
  );
}

/* ── HERO ─────────────────────────────────────────────────────────────── */

function Hero() {
  const trust = [
    { icon: QrCode, label: 'Timbratura col QR di cantiere' },
    { icon: Radio, label: 'Presenze in tempo reale' },
    { icon: Clock, label: 'Ore e straordinari automatici' },
    { icon: ShieldCheck, label: 'Dati in Europa, conforme GDPR' },
  ];
  return (
    <section className="mx-auto max-w-4xl px-6 pb-14 pt-16 text-center sm:pt-24">
      <div className="animate-fade-up">
        <span className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent-soft px-3 py-1 text-xs font-medium text-accent-soft-foreground">
          <HardHat className="h-3.5 w-3.5" />
          Modulo aggiuntivo di Kommessa · presenze e cantiere
        </span>
      </div>
      <h1
        className="mt-7 text-balance text-5xl font-semibold tracking-tighter text-foreground sm:text-6xl md:text-[4.7rem] md:leading-[1.02] animate-fade-up"
        style={{ animationDelay: '60ms' }}
      >
        Il cantiere che si <span className="text-brand-grad">racconta da solo.</span>
      </h1>
      <p
        className="mx-auto mt-6 max-w-2xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg animate-fade-up"
        style={{ animationDelay: '120ms' }}
      >
        Il tecnico arriva, inquadra il QR affisso alla porta del cantiere e il
        turno parte. Ore, viaggi e note spese si compilano da soli, e l&apos;ufficio
        vede tutto in tempo reale.
      </p>
      <div
        className="mt-9 flex flex-wrap items-center justify-center gap-3 animate-fade-up"
        style={{ animationDelay: '180ms' }}
      >
        <Link
          href="/contatti"
          className="group inline-flex h-12 items-center gap-2 rounded-md bg-primary px-7 text-sm font-medium text-primary-foreground shadow-glow-brand transition hover:opacity-95 active:translate-y-px"
        >
          Richiedi una demo
          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </Link>
        <a
          href="#come-funziona"
          className="inline-flex h-12 items-center gap-2 rounded-md border border-border bg-card/80 px-6 text-sm font-medium text-foreground backdrop-blur transition hover:bg-card"
        >
          Guarda come funziona
        </a>
      </div>
      <div className="mt-12 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-xs text-muted-foreground">
        {trust.map(({ icon: Icon, label }) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 text-primary/80" aria-hidden />
            {label}
          </span>
        ))}
      </div>
    </section>
  );
}

/* ── 1 · COME FUNZIONA · IL QR (navy) ─────────────────────────────────── */

function ComeFunzionaQr() {
  const steps = [
    { n: '1', t: 'Arrivi in cantiere', d: 'Apri l’app Kantiere sul telefono. Bastano pochi secondi.' },
    { n: '2', t: 'Inquadri il QR sulla porta', d: 'Un adesivo con il codice è affisso all’ingresso del cantiere.' },
    { n: '3', t: 'Ingresso registrato', d: 'Il turno parte e l’ora viene segnata. A fine giornata, lo stesso QR per l’uscita.' },
  ];
  return (
    <Section tone="navy" texture="gridDark" id="come-funziona">
      <SectionHeading
        eyebrow="Come funziona"
        title="Tutto parte da un QR sulla porta del cantiere"
        subtitle="Niente tessere da ricordare, niente carta. Il codice è affisso all’ingresso: si inquadra e si è dentro."
        tone="dark"
      />
      <div className="mt-14">
        <Split media={<QrIngresso />}>
          <ol className="space-y-5">
            {steps.map((s) => (
              <li key={s.n} className="flex gap-4">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent font-mono text-sm font-bold text-accent-foreground shadow-glow-brand">
                  {s.n}
                </span>
                <div>
                  <p className="text-lg font-semibold tracking-tight text-foreground">{s.t}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-7 inline-flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-foreground/90 backdrop-blur">
            <Radio className="h-4 w-4 shrink-0 text-accent" />
            E l&apos;ufficio lo vede all&apos;istante, senza chiamare nessuno.
          </div>
        </Split>
      </div>
    </Section>
  );
}

/* ── 2 · PRESENZE LIVE (mist) ─────────────────────────────────────────── */

function Presenze() {
  return (
    <Section tone="mist" texture="dots">
      <SectionHeading
        eyebrow="In tempo reale"
        title="Chi c’è, dove, da che ora"
        subtitle="Appena un tecnico timbra, compare sul cruscotto dell’ufficio. Presenze, cantieri attivi e ore lavorate si aggiornano da soli."
      />
      <div className="mx-auto mt-12 max-w-3xl">
        <PresenzeLive />
      </div>
    </Section>
  );
}

/* ── 3 · VIAGGI E MEZZI (glow, split reverse) ─────────────────────────── */

function ViaggiMezzi() {
  return (
    <Section tone="glow" texture="grid">
      <Split reverse media={<PercorsiGiornata />}>
        <Copy
          eyebrow="Viaggi e mezzi"
          title="I chilometri della giornata, senza doverli chiedere"
          body="Ogni tratta tra la sede e il cantiere, e tra un cantiere e l’altro, calcola distanza e tempo reali. Con autista e mezzo assegnato."
          bullets={[
            'Distanza e tempo calcolati con il traffico',
            'Trasferimenti tra cantieri sempre tracciati',
            'Un mezzo e un autista per ogni squadra',
          ]}
        />
      </Split>
      <div className="mt-14">
        <p className="mb-4 inline-flex items-center gap-2 text-sm font-semibold tracking-tight">
          <Truck className="h-4 w-4 text-primary" /> Il parco mezzi, sempre aggiornato
        </p>
        <MezziStrip />
      </div>
    </Section>
  );
}

/* ── 4 · ORE E RAPPORTINO (navy, split) ───────────────────────────────── */

function OreRapportino() {
  return (
    <Section tone="navy" texture="gridDark">
      <Split media={<AppTimbrature />}>
        <Copy
          tone="dark"
          eyebrow="Ore e rapportino"
          title="Le ore si calcolano da sole"
          body="Dalle timbrature nasce il rapportino della giornata: ore ordinarie, straordinari e pause, senza fogli da compilare a mano."
          bullets={[
            'Straordinari e pause calcolati in automatico',
            'Le giornate regolari si approvano da sole',
            'Ogni correzione dell’ufficio resta tracciata',
          ]}
        />
      </Split>
    </Section>
  );
}

/* ── 5 · KONTABILITÀ (sand, split) ────────────────────────────────────── */

function Kontabilita() {
  return (
    <Section tone="sand" texture="dotsAccent">
      <Split media={<NotaSpeseAI />}>
        <Copy
          eyebrow="Kontabilità"
          title="Fotografi lo scontrino, il costo del cantiere si aggiorna"
          body="L’AI legge la ricevuta, compila la nota spesa e la aggancia al cantiere del turno. L’ufficio vede subito quanto costa ogni lavoro."
          bullets={[
            'Fornitore, importo e categoria letti in automatico',
            'Spesa agganciata al cantiere giusto',
            'Costo pieno del cantiere, sempre aggiornato',
          ]}
        />
      </Split>
      <div className="mt-12 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
        <AnalisiCosti />
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Wallet, k: 'Costo pieno del cantiere', v: 'Manodopera, materiali e mezzi' },
            { icon: PieChart, k: 'Analisi per voce', v: 'Dove vanno i soldi' },
            { icon: Receipt, k: 'Ricevute in ordine', v: 'Archivio con export ZIP' },
            { icon: FileSpreadsheet, k: 'Export CSV', v: 'Pronto per il gestionale' },
          ].map(({ icon: Icon, k, v }) => (
            <div key={k} className="rounded-xl border border-border bg-card p-4 shadow-soft">
              <Icon className="h-4 w-4 text-primary" />
              <p className="mt-2 text-[13px] font-semibold tracking-tight">{k}</p>
              <p className="text-xs text-muted-foreground">{v}</p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ── 6 · PIANIFICAZIONE & PERSONALE (glow, split reverse) ─────────────── */

function Pianificazione() {
  return (
    <Section tone="glow" texture="grid">
      <Split reverse media={<PianificazioneSettimanale />}>
        <Copy
          eyebrow="Pianificazione e personale"
          title="Chi va dove, questa settimana"
          body="Assegni i tecnici ai cantieri con un colpo d’occhio, e la squadra vede il proprio programma direttamente dall’app."
          bullets={[
            'Pianificazione settimanale per ogni tecnico',
            'Ferie e permessi che bloccano la pianificazione',
            'Anagrafica dei dipendenti a portata di mano',
          ]}
        />
      </Split>
    </Section>
  );
}

/* ── 7 · IL BADGE DI CANTIERE (navy, normativa) ───────────────────────── */

function BadgeCantiere() {
  const cards = [
    {
      icon: BadgeCheck,
      title: 'Tesserino di riconoscimento',
      body: 'Ogni tecnico identificato con foto e dati, sempre a portata di controllo: l’obbligo dell’art. 18 del D.Lgs. 81/2008.',
    },
    {
      icon: ScanLine,
      title: 'Presenze e ore tracciate',
      body: 'Chi entra, quando e su quale cantiere: la base documentale per la congruità della manodopera (DM 143/2021).',
    },
    {
      icon: ShieldCheck,
      title: 'Verso il badge di cantiere',
      body: 'Presenze automatiche e identificazione anticipano la logica del badge di cantiere introdotto dal DL 159/2025, che sta entrando in uso in modo graduale.',
    },
    {
      icon: FileCheck,
      title: 'Pronti per la patente a crediti',
      body: 'Formazione, presenze e dati dei tecnici sempre in ordine: quello che serve quando l’impresa opera con la patente a crediti INL (obbligo dal 1° ottobre 2024).',
    },
  ];
  return (
    <Section tone="navy" texture="gridDark">
      <SectionHeading
        eyebrow="Il badge di cantiere"
        title="La legge vuole sapere chi c’è in cantiere. Kantiere te lo dice."
        subtitle="Identificazione, presenze e ore in formato digitale: sei in regola oggi e pronto alla direzione che la normativa sta prendendo."
        tone="dark"
      />
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="rounded-xl border border-white/10 bg-white/[0.05] p-5 shadow-soft backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/[0.08]"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Icon className="h-5 w-5" />
            </span>
            <h3 className="mt-4 text-sm font-semibold tracking-tight text-foreground">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-8 max-w-3xl text-center text-xs leading-relaxed text-muted-foreground">
        Kantiere è uno strumento gestionale: tiene in ordine i dati (identità,
        presenze, ore, formazione) utili agli adempimenti, ma non rilascia né
        sostituisce il tesserino, la patente a crediti o il DURC di congruità.
      </p>
    </Section>
  );
}

/* ── 8 · TUTTO INCLUSO (mist, chip band) ──────────────────────────────── */

function TuttoIncluso() {
  const chips = [
    { icon: QrCode, label: 'QR di cantiere' },
    { icon: Radio, label: 'Presenze in tempo reale' },
    { icon: Clock, label: 'Rapportino automatico' },
    { icon: Route, label: 'Viaggi con km reali' },
    { icon: Truck, label: 'Mezzi e autisti' },
    { icon: Receipt, label: 'Note spese con AI' },
    { icon: PieChart, label: 'Costo del cantiere' },
    { icon: CalendarDays, label: 'Pianificazione settimanale' },
    { icon: Palmtree, label: 'Ferie e permessi' },
    { icon: MapPin, label: 'Trasferimenti tra cantieri' },
    { icon: Upload, label: 'Import dei cantieri' },
    { icon: RefreshCw, label: 'Sync col tuo gestionale' },
  ];
  return (
    <Section tone="mist" texture="dots" narrow>
      <div className="text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary">Tutto incluso</p>
        <h2 className="mx-auto mt-2 max-w-2xl text-pretty text-3xl font-semibold tracking-tight sm:text-4xl">
          Dodici cose in meno di cui preoccuparsi
        </h2>
      </div>
      <div className="mt-9 flex flex-wrap justify-center gap-2.5">
        {chips.map(({ icon: Icon, label }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-3.5 py-2 text-[13px] font-medium text-foreground shadow-soft backdrop-blur"
          >
            <Icon className="h-3.5 w-3.5 text-primary" />
            {label}
          </span>
        ))}
      </div>
    </Section>
  );
}

/* ── 9 · BUNDLE (glow) ────────────────────────────────────────────────── */

function Bundle() {
  return (
    <Section tone="glow" texture="grid">
      <SectionHeading
        eyebrow="La suite completa"
        title="Commesse e Kantiere, un solo account"
        subtitle="Parti dalla gestione commesse e aggiungi il cantiere quando vuoi. Stessi dati, stesso accesso, nessuna doppia digitazione."
      />
      <div className="mt-12 grid gap-4 md:grid-cols-2">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-7 shadow-soft-md">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Base</span>
          <h3 className="mt-2 flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Building2 className="h-5 w-5 text-primary" /> Commesse
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Sopralluogo dettato a voce, foto e video dal cantiere, cartelle in
            automatico, riunioni con verbale AI, report di chiusura.
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {['Voce che diventa commessa', 'Sync con il cloud aziendale', 'Report PDF con un clic'].map((f) => (
              <li key={f} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" /> {f}
              </li>
            ))}
          </ul>
          <Link href="/" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            Scopri Commesse <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-accent/40 bg-gradient-to-br from-accent-soft/60 via-card to-primary/5 p-7 shadow-soft-lg">
          <span className="absolute -right-3 -top-3 inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-foreground shadow-soft-md">
            <Sparkles className="h-3 w-3" /> Aggiuntivo
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent-soft-foreground">Modulo add-on</span>
          <h3 className="mt-2 flex items-center gap-2 text-xl font-semibold tracking-tight">
            <HardHat className="h-5 w-5 text-accent" /> Kantiere
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Presenze col QR, ore e straordinari, viaggi e km, mezzi, note spese
            con AI, pianificazione e personale. Il cantiere, in digitale.
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {['Presenze in tempo reale', 'Note spese con AI · Kontabilità', 'Sync col tuo gestionale su misura'].map((f) => (
              <li key={f} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" /> {f}
              </li>
            ))}
          </ul>
          <Link href="/contatti" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-accent-soft-foreground hover:underline">
            Attiva Kantiere <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </Section>
  );
}

/* ── FINAL CTA ────────────────────────────────────────────────────────── */

function FinalCta() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-20">
      <div className="relative isolate overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-card to-accent/10 px-6 py-14 text-center shadow-soft-lg sm:py-16">
        <div className="absolute inset-0 -z-10 bg-grid-radial opacity-50" aria-hidden />
        <div aria-hidden className="border-brand-line absolute inset-x-0 top-0 h-1" />
        <div aria-hidden className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-glow-brand">
          <Users className="h-6 w-6" />
        </div>
        <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Vuoi vederlo sul tuo cantiere?
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-balance text-sm leading-relaxed text-muted-foreground sm:text-base">
          Ti mostriamo presenze, ore, viaggi e note spese con i tuoi cantieri e i
          tuoi tecnici. Una demo su misura, senza impegno.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/contatti"
            className="group inline-flex h-12 items-center gap-2 rounded-md bg-primary px-7 text-sm font-medium text-primary-foreground shadow-glow-brand transition hover:opacity-95"
          >
            Richiedi una demo
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Link>
          <a
            href="mailto:info@solva.it"
            className="inline-flex h-12 items-center gap-2 rounded-md border border-border bg-card/80 px-6 text-sm font-medium text-foreground backdrop-blur transition hover:bg-card"
          >
            Scrivici a info@solva.it
          </a>
        </div>
      </div>
    </section>
  );
}

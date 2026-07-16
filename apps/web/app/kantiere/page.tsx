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
  Users,
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
} from 'lucide-react';
import { MarketingShell, SectionHeading } from '../_components/marketing/chrome';
import { PresenzeLive } from './_components/presenze-live';
import { AppTimbrature } from './_components/app-timbrature';
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
    'Il modulo cantiere di Kommessa: timbrature col QR, presenze in tempo reale, rapportino automatico, viaggi e km, mezzi, note spese con AI e sync col tuo gestionale.',
};

export default function KantierePage() {
  return (
    <MarketingShell active="cantiere">
      <Hero />
      <PresenzeSection />
      <TrustStrip />
      <ComeFunziona />
      <BadgeCantiere />
      <Kontabilita />
      <ViaggiMezzi />
      <PianificazionePersonale />
      <Funzionalita />
      <Bundle />
      <FinalCta />
    </MarketingShell>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  HERO                                                                     */
/* ──────────────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="mx-auto max-w-4xl px-6 pb-10 pt-16 text-center sm:pt-24">
      <div className="animate-fade-up">
        <span className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent-soft px-3 py-1 text-xs font-medium text-accent-soft-foreground">
          <HardHat className="h-3.5 w-3.5" />
          Pacchetto aggiuntivo · presenze e cantiere
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
        Chi c&apos;è, dove, da che ora. Timbrature col QR, ore e straordinari
        calcolati da soli, viaggi e km, mezzi e note spese: tutto in tempo reale,
        tutto pronto per l&apos;ufficio.
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
        <Link
          href="/"
          className="inline-flex h-12 items-center gap-2 rounded-md border border-border bg-card/80 px-6 text-sm font-medium text-foreground backdrop-blur transition hover:bg-card"
        >
          Torna a Commesse
        </Link>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  PRESENZE LIVE (showcase)                                                 */
/* ──────────────────────────────────────────────────────────────────────── */

function PresenzeSection() {
  return (
    <section
      className="mx-auto max-w-5xl px-6 pb-16 animate-fade-up"
      style={{ animationDelay: '240ms' }}
      aria-label="Presenze in cantiere in tempo reale"
    >
      <PresenzeLive />
    </section>
  );
}

function TrustStrip() {
  const items = [
    { icon: QrCode, label: 'Timbratura col QR di cantiere' },
    { icon: Radio, label: 'Presenze in tempo reale' },
    { icon: Clock, label: 'Ore e straordinari automatici' },
    { icon: ShieldCheck, label: 'Posizione verificata · GDPR' },
  ];
  return (
    <section className="mx-auto max-w-6xl px-6 pb-8">
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
      icon: QrCode,
      title: 'Timbra col QR (o dall’app)',
      body: 'Il tecnico inquadra il QR del cantiere o avvia il turno dall’app. Ingresso, pausa, uscita: un tap.',
    },
    {
      n: '02',
      icon: Clock,
      title: 'Ore in automatico',
      body: 'Le timbrature diventano il rapportino della giornata: ore ordinarie, straordinari e pause. Se torna, si approva da solo.',
    },
    {
      n: '03',
      icon: Route,
      title: 'Viaggi, km e mezzi',
      body: 'Ogni tratta sede/cantiere e cantiere/cantiere calcola km e tempo reali, con autista e mezzo assegnato.',
    },
    {
      n: '04',
      icon: Receipt,
      title: 'Note spese e report',
      body: 'Foto dello scontrino, l’AI compila la spesa e la aggancia al cantiere. Costi e report pronti per l’ufficio.',
    },
  ];
  return (
    <section id="come-funziona-cantiere" className="mx-auto max-w-6xl px-6 py-20">
      <SectionHeading
        eyebrow="Workflow"
        title="Dal QR di cantiere al costo del lavoro, senza carta"
        subtitle="Il tecnico timbra e fotografa. Tutto il resto (ore, viaggi, spese, report) si compila da solo."
      />
      <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {steps.map(({ n, icon: Icon, title, body }) => (
          <div
            key={n}
            className="group relative overflow-hidden rounded-xl border border-border bg-card/80 p-5 shadow-soft-md backdrop-blur transition hover:-translate-y-0.5 hover:shadow-soft-lg"
          >
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground/60">
              {n}
            </span>
            <div className="mt-3 inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary-soft text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-base font-semibold tracking-tight">{title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
            <span className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-accent/0 transition group-hover:bg-accent/10" />
          </div>
        ))}
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  IL BADGE DI CANTIERE — normativa (copy accurato)                         */
/* ──────────────────────────────────────────────────────────────────────── */

function BadgeCantiere() {
  const cards = [
    {
      icon: BadgeCheck,
      title: 'Tesserino di riconoscimento',
      body: 'Ogni tecnico identificato con foto e dati, sempre a portata di controllo: l’obbligo previsto dall’art. 18 del D.Lgs. 81/2008.',
    },
    {
      icon: ScanLine,
      title: 'Presenze e ore tracciate',
      body: 'Chi entra, quando, su quale cantiere: la base documentale per la congruità della manodopera (DM 143/2021) su lavori pubblici e privati.',
    },
    {
      icon: ShieldCheck,
      title: 'Verso il badge di cantiere',
      body: 'Presenze automatiche e identificazione anticipano la logica del badge di cantiere introdotto dal DL 159/2025, che entra in uso in modo graduale.',
    },
    {
      icon: FileCheck,
      title: 'Pronti per la patente a crediti',
      body: 'Formazione, presenze e dati dei tecnici sempre in ordine: quello che serve quando l’impresa opera con la patente a crediti INL (obbligo dal 1° ottobre 2024).',
    },
  ];
  return (
    <section
      style={{
        background:
          'linear-gradient(160deg, hsl(220 34% 88%), hsl(222 26% 92%) 48%, hsl(26 50% 90%))',
      }}
      className="relative isolate overflow-hidden border-y border-primary/15"
    >
      <div
        aria-hidden
        style={{ background: 'radial-gradient(circle at 50% 50%, hsl(218 92% 60% / 0.2), transparent 70%)' }}
        className="absolute -left-24 -top-16 -z-10 h-80 w-80 rounded-full blur-3xl"
      />
      <div className="mx-auto max-w-6xl px-6 py-20">
        <SectionHeading
          eyebrow="Il badge di cantiere"
          title="La legge chiede di sapere chi c’è in cantiere. Kantiere te lo dà."
          subtitle="Identificazione, presenze e ore digitali: arrivi pronto agli obblighi di oggi e alla direzione che la normativa sta prendendo."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-xl border border-border bg-card p-5 shadow-soft-md transition hover:-translate-y-0.5 hover:shadow-soft-lg"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-sm font-semibold tracking-tight">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-3xl text-center text-xs leading-relaxed text-muted-foreground">
          Kantiere è uno strumento gestionale: tiene in ordine i dati (identità,
          presenze, ore, formazione) utili agli adempimenti, ma non rilascia né
          sostituisce il tesserino, la patente a crediti o il DURC di congruità.
        </p>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  KONTABILITÀ                                                              */
/* ──────────────────────────────────────────────────────────────────────── */

function Kontabilita() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <SectionHeading
        eyebrow="Kontabilità"
        title="Fotografi lo scontrino, il costo del cantiere si aggiorna"
        subtitle="Le note spese si compilano da sole con l’AI e si agganciano al cantiere del turno. L’ufficio vede subito quanto costa ogni lavoro."
      />
      <div className="mt-12 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start">
        <div className="animate-float-soft">
          <NotaSpeseAI />
        </div>
        <div className="space-y-5">
          <AnalisiCosti />
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Wallet, k: 'Manodopera, materiali, mezzi', v: 'Costo pieno del cantiere' },
              { icon: PieChart, k: 'Analisi per voce', v: 'Dove vanno i soldi' },
              { icon: Receipt, k: 'Ricevute organizzate', v: 'Archivio con export ZIP' },
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
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  VIAGGI & MEZZI                                                           */
/* ──────────────────────────────────────────────────────────────────────── */

function ViaggiMezzi() {
  return (
    <section
      className="relative isolate overflow-hidden border-y border-primary/10"
      style={{ background: 'linear-gradient(180deg, hsl(210 40% 96%), hsl(32 28% 98%))' }}
    >
      <div className="mx-auto max-w-6xl px-6 py-20">
        <SectionHeading
          eyebrow="Viaggi e mezzi"
          title="I percorsi della giornata, km e tempi al minuto"
          subtitle="Ogni tratta sede/cantiere e cantiere/cantiere calcola distanza e durata reali (con il traffico). E dall’app il tecnico vede tutto in diretta."
        />
        <div className="mt-12 grid items-center gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <PercorsiGiornata />
          <AppTimbrature />
        </div>

        <div className="mt-10">
          <p className="mb-4 inline-flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Truck className="h-4 w-4 text-primary" /> Il parco mezzi, sempre aggiornato
          </p>
          <MezziStrip />
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  PIANIFICAZIONE & PERSONALE                                               */
/* ──────────────────────────────────────────────────────────────────────── */

function PianificazionePersonale() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <SectionHeading
        eyebrow="Pianificazione e personale"
        title="Chi va dove, questa settimana"
        subtitle="Assegni i tecnici ai cantieri con un colpo d’occhio. Ferie e permessi si vedono subito e bloccano la pianificazione dove serve."
      />
      <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-center">
        <PianificazioneSettimanale />
        <div className="space-y-3">
          {[
            {
              icon: CalendarDays,
              title: 'Pianificazione settimanale',
              body: 'Trascini i tecnici sui cantieri, giorno per giorno. La squadra vede il proprio programma dall’app.',
            },
            {
              icon: Palmtree,
              title: 'Ferie e permessi',
              body: 'Richieste, approvazioni e saldo. Chi è in ferie non è pianificabile: niente doppioni.',
            },
            {
              icon: Users,
              title: 'Anagrafica dipendenti',
              body: 'Mansioni, contatti, mezzo assegnato e accessi. Una scheda per ogni persona.',
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex gap-3 rounded-xl border border-border bg-card p-4 shadow-soft">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                <Icon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold tracking-tight">{title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  FUNZIONALITÀ — grid completa                                            */
/* ──────────────────────────────────────────────────────────────────────── */

function Funzionalita() {
  const items = [
    { icon: QrCode, title: 'QR di cantiere', body: 'Un QR per ogni cantiere. Il tecnico timbra in un secondo, anche senza connessione stabile.' },
    { icon: Radio, title: 'Presenze in tempo reale', body: 'Chi è in cantiere, chi in viaggio, chi in pausa. La board dell’ufficio si aggiorna da sola.' },
    { icon: Clock, title: 'Rapportino automatico', body: 'Ore ordinarie, straordinari e pause dalle timbrature. Le giornate pulite si approvano da sole.' },
    { icon: Route, title: 'Viaggi con km reali', body: 'Distanza e tempo con il traffico, tratte sede/cantiere e cantiere/cantiere, autista e passeggeri.' },
    { icon: Truck, title: 'Mezzi e autisti', body: 'Parco veicoli, km per mezzo e assegnazione giornaliera. Sempre chiaro chi guida cosa.' },
    { icon: Receipt, title: 'Note spese con AI', body: 'Foto dello scontrino, i campi si compilano da soli e la spesa si aggancia al cantiere.' },
    { icon: PieChart, title: 'Costo del cantiere', body: 'Manodopera, materiali, mezzi e spese in un solo numero, per ogni lavoro.' },
    { icon: CalendarDays, title: 'Pianificazione settimanale', body: 'Assegni i tecnici ai cantieri con un colpo d’occhio. La squadra vede il programma.' },
    { icon: Palmtree, title: 'Ferie e permessi', body: 'Richieste e approvazioni, saldo aggiornato, blocco automatico sulla pianificazione.' },
    { icon: MapPin, title: 'Trasferimenti tra cantieri', body: 'Chi cambia cantiere in giornata genera km e tempo tra un lavoro e l’altro.' },
    { icon: Upload, title: 'Import dei cantieri', body: 'Carichi la lista dei cantieri e li ritrovi pronti, con codice, cliente e indirizzo.' },
    { icon: RefreshCw, title: 'Sync col tuo gestionale', body: 'Ore, presenze e costi esportati e sincronizzati con il gestionale che già usi, su misura.' },
  ];
  return (
    <section
      style={{
        background:
          'linear-gradient(160deg, hsl(220 34% 88%), hsl(222 26% 92%) 48%, hsl(26 50% 90%))',
      }}
      className="relative isolate overflow-hidden border-y border-primary/15"
    >
      <div
        aria-hidden
        style={{ background: 'radial-gradient(circle at 50% 50%, hsl(24 95% 58% / 0.16), transparent 70%)' }}
        className="absolute -right-20 -bottom-10 -z-10 h-72 w-72 rounded-full blur-3xl"
      />
      <div className="mx-auto max-w-6xl px-6 py-20">
        <SectionHeading
          eyebrow="Tutto il modulo Kantiere"
          title="Dodici cose in meno di cui preoccuparsi"
          subtitle="Un unico posto per presenze, ore, viaggi, mezzi, spese e pianificazione. Costruito con gli impiantisti, per gli impiantisti."
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
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  BUNDLE — Commesse + Kantiere                                             */
/* ──────────────────────────────────────────────────────────────────────── */

function Bundle() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <SectionHeading
        eyebrow="La suite completa"
        title="Commesse e Kantiere, un solo account"
        subtitle="Parti dalla gestione commesse e aggiungi il cantiere quando vuoi. Stessi dati, stesso login, nessuna doppia digitazione."
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
            {['Voce → commessa pronta', 'Sync con il cloud aziendale', 'Report PDF con un click'].map((f) => (
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
            <Sparkles className="h-3 w-3" /> Add-on
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent-soft-foreground">Aggiuntivo</span>
          <h3 className="mt-2 flex items-center gap-2 text-xl font-semibold tracking-tight">
            <HardHat className="h-5 w-5 text-accent" /> Kantiere
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Presenze col QR, ore e straordinari, viaggi e km, mezzi, note spese
            con AI, pianificazione e personale. Il cantiere, digitale.
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
    </section>
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
          Vuoi vedere Kantiere sul tuo cantiere?
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

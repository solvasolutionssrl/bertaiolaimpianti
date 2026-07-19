import Link from 'next/link';
import {
  Mail,
  ExternalLink,
  Building2,
  HardHat,
  Sparkles,
  Clock,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import { MarketingShell } from '../_components/marketing/chrome';
import { Section } from '../_components/marketing/sections';
import { ContattiForm } from './_components/contatti-form';

export const metadata = {
  title: 'Contatti · Kommessa · suite SOLVA',
  description:
    'Richiedi una demo di Kommessa e del modulo Kantiere. Scrivici a info@solva.it: ti mostriamo la piattaforma sulla tua realtà cantieristica.',
};

export default function ContattiPage() {
  return (
    <MarketingShell active="contatti">
      <section className="mx-auto max-w-4xl px-6 pb-8 pt-16 text-center sm:pt-24">
        <div className="animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            Demo su misura, senza impegno
          </span>
        </div>
        <h1
          className="mt-7 text-balance text-4xl font-semibold tracking-tighter text-foreground sm:text-5xl md:text-6xl animate-fade-up"
          style={{ animationDelay: '60ms' }}
        >
          Parliamone. <span className="text-brand-grad">Ti mostriamo tutto.</span>
        </h1>
        <p
          className="mx-auto mt-6 max-w-2xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg animate-fade-up"
          style={{ animationDelay: '120ms' }}
        >
          Commesse, cantiere, presenze e note spese: ti facciamo vedere la
          piattaforma con i tuoi cantieri e i tuoi tecnici. Scrivici, rispondiamo
          noi di SOLVA.
        </p>
      </section>

      <Section tone="mist" texture="dots">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          {/* colonna info */}
          <div className="space-y-4">
            <a
              href="mailto:info@solva.it"
              className="group flex items-center gap-4 rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-accent/10 p-5 shadow-soft-md transition hover:-translate-y-0.5 hover:shadow-soft-lg"
            >
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-glow-brand">
                <Mail className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Scrivici
                </span>
                <span className="block text-lg font-semibold tracking-tight text-foreground">
                  info@solva.it
                </span>
              </span>
              <ArrowRight className="ml-auto h-4 w-4 text-primary transition group-hover:translate-x-0.5" />
            </a>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-soft-md">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Cosa puoi chiederci
              </p>
              <ul className="mt-3 space-y-3">
                {[
                  { icon: Building2, t: 'Una demo di Commesse', d: 'Dettato vocale, foto, cartelle e report.' },
                  { icon: HardHat, t: 'Una demo di Kantiere', d: 'Presenze col QR, ore, viaggi e note spese.' },
                  { icon: Sparkles, t: 'Un preventivo su misura', d: 'Pacchetto base e modulo cantiere.' },
                  { icon: ShieldCheck, t: 'La migrazione dei tuoi dati', d: 'Cantieri, clienti e anagrafiche esistenti.' },
                ].map(({ icon: Icon, t, d }) => (
                  <li key={t} className="flex gap-3">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-foreground">{t}</span>
                      <span className="block text-xs text-muted-foreground">{d}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5 shadow-soft">
              <Clock className="h-5 w-5 shrink-0 text-success" />
              <p className="text-sm text-muted-foreground">
                Rispondiamo di norma <span className="font-medium text-foreground">entro un giorno lavorativo</span>.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-sm">
              <a
                href="https://solva.it"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-foreground/80 hover:text-foreground"
              >
                solva.it <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <Link href="/kantiere" className="inline-flex items-center gap-1.5 text-foreground/80 hover:text-foreground">
                Modulo Kantiere <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link href="/login" className="text-foreground/80 hover:text-foreground">
                Ho già un account
              </Link>
            </div>
          </div>

          {/* form */}
          <ContattiForm />
        </div>
      </Section>
    </MarketingShell>
  );
}

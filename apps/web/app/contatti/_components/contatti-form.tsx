'use client';

import * as React from 'react';
import { Send, CheckCircle2, Mail } from 'lucide-react';

const INTERESSI = ['Demo completa', 'Solo Commesse', 'Modulo Kantiere', 'Altro'] as const;

/**
 * Form contatti: compone un mailto verso info@solva.it (nessun backend).
 * Robusto e senza infrastruttura: apre il client di posta già precompilato.
 */
export function ContattiForm() {
  const [inviato, setInviato] = React.useState(false);
  const [interesse, setInteresse] = React.useState<(typeof INTERESSI)[number]>('Demo completa');

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const nome = String(f.get('nome') || '').trim();
    const azienda = String(f.get('azienda') || '').trim();
    const email = String(f.get('email') || '').trim();
    const telefono = String(f.get('telefono') || '').trim();
    const messaggio = String(f.get('messaggio') || '').trim();

    const subject = `Kommessa · ${interesse}${azienda ? ` · ${azienda}` : ''}`;
    const body = [
      `Interesse: ${interesse}`,
      nome && `Nome: ${nome}`,
      azienda && `Azienda: ${azienda}`,
      email && `Email: ${email}`,
      telefono && `Telefono: ${telefono}`,
      messaggio && `\n${messaggio}`,
    ]
      .filter(Boolean)
      .join('\n');

    window.location.href = `mailto:info@solva.it?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
    setInviato(true);
  }

  const field =
    'w-full rounded-lg border border-border bg-background/80 px-3.5 py-2.5 text-sm text-foreground shadow-soft outline-none transition placeholder:text-muted-foreground/70 focus:border-primary/60 focus:ring-2 focus:ring-primary/20';
  const label = 'mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground';

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-border bg-card/90 p-6 shadow-soft-lg backdrop-blur sm:p-7"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="nome">Nome e cognome</label>
          <input id="nome" name="nome" required autoComplete="name" className={field} placeholder="Mario Rossi" />
        </div>
        <div>
          <label className={label} htmlFor="azienda">Azienda</label>
          <input id="azienda" name="azienda" autoComplete="organization" className={field} placeholder="Rossi Impianti S.r.l." />
        </div>
        <div>
          <label className={label} htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" className={field} placeholder="mario@rossimpianti.it" />
        </div>
        <div>
          <label className={label} htmlFor="telefono">Telefono <span className="normal-case tracking-normal text-muted-foreground/60">(facoltativo)</span></label>
          <input id="telefono" name="telefono" type="tel" autoComplete="tel" className={field} placeholder="+39 ..." />
        </div>
      </div>

      <div className="mt-4">
        <span className={label}>Cosa ti interessa</span>
        <div className="flex flex-wrap gap-2">
          {INTERESSI.map((o) => (
            <button
              type="button"
              key={o}
              onClick={() => setInteresse(o)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                interesse === o
                  ? 'border-primary bg-primary text-primary-foreground shadow-glow-brand'
                  : 'border-border bg-background/70 text-foreground/80 hover:border-primary/40'
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <label className={label} htmlFor="messaggio">Messaggio</label>
        <textarea
          id="messaggio"
          name="messaggio"
          rows={4}
          className={field}
          placeholder="Raccontaci in due righe la tua realtà: quanti tecnici, quanti cantieri, cosa vorresti semplificare."
        />
      </div>

      <button
        type="submit"
        className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground shadow-glow-brand transition hover:opacity-95 active:translate-y-px sm:w-auto"
      >
        <Send className="h-4 w-4" />
        Invia la richiesta
      </button>

      {inviato && (
        <p className="mt-4 inline-flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
          <CheckCircle2 className="h-4 w-4" />
          Si apre il tuo programma di posta verso info@solva.it. Non parte? Scrivici tu direttamente.
        </p>
      )}

      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Mail className="h-3.5 w-3.5" />
        Il modulo apre la tua email già pronta. In alternativa scrivi a{' '}
        <a href="mailto:info@solva.it" className="font-medium text-primary hover:underline">
          info@solva.it
        </a>
      </p>
    </form>
  );
}

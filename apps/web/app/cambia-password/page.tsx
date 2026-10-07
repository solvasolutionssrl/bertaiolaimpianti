import { redirect } from 'next/navigation';
import { CalendarClock, ShieldCheck } from 'lucide-react';

import { etichettaAccesso } from '@kommessa/api/identita';
import { formattaGiorno, quandoScade } from '@kommessa/api/scadenza-password';

import { getTenantContextCached } from '@/app/_lib/tenant-cache';
import { casaPerRuolo, statoPassword } from '@/app/_lib/cambio-password';
import { CambiaPasswordForm } from './_components/cambia-password-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'La tua password · Kommessa' };

/**
 * La schermata dove si sceglie la propria password.
 *
 * Sta **fuori** dai gusci dell'ufficio e del telefono, di proposito: è la
 * pagina in cui i gusci mandano chi deve ancora cambiarla, e se fosse dentro
 * uno di essi il controllo rimanderebbe a se stesso in cerchio.
 *
 * Fino al 07/10 questa pagina non esisteva, e la conseguenza era più grossa del
 * primo accesso: **nessun utente di nessun cliente poteva cambiarsi la
 * password.** Solo il super admin SOLVA aveva un modulo per farlo. Chi
 * sospettava che la sua password fosse in giro non aveva nessun gesto a
 * disposizione.
 *
 * ⚠️ **Perché il testo cambia in tre modi.** Qui ci si arriva per tre strade
 * diverse: la password te l'ha data l'ufficio, la password è scaduta, oppure
 * hai scelto tu di cambiarla. Dire la frase sbagliata — «quella che ti hanno
 * dato in ufficio la sanno in due» a chi la usa da tre mesi e l'ha scelta da
 * sé — fa sembrare l'applicazione rotta, e chi la legge smette di fidarsi
 * anche delle volte in cui ha ragione.
 */
export default async function CambiaPasswordPage() {
  const ctx = await getTenantContextCached();
  if (!ctx) redirect('/login');

  const { obbligato, motivo, scadenza } = await statoPassword();
  const scaduta = motivo === 'scaduta';

  const titolo = scaduta
    ? 'La tua password è scaduta'
    : obbligato
      ? 'Scegli la tua password'
      : 'Cambia la password';

  const spiegazione = scaduta
    ? 'Ogni tre mesi serve una password nuova. Scegline una e torni subito al lavoro: il nome utente non cambia.'
    : obbligato
      ? 'Quella che ti hanno dato in ufficio la sanno in due. Scegline una che sai solo tu: da adesso userai questa per entrare.'
      : 'Da adesso entrerai con quella nuova. Il nome utente non cambia.';

  // Chi è arrivato qui da sé dentro la finestra di avviso merita di sapere che
  // facendolo ora si è a posto per il trimestre: altrimenti torna domani.
  const avviso = !obbligato && scadenza.stato === 'in_scadenza';

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <span
            className={`mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full ${
              scaduta ? 'bg-amber-500/10 text-amber-600' : 'bg-primary/10 text-primary'
            }`}
          >
            {scaduta ? (
              <CalendarClock aria-hidden="true" className="h-5 w-5" />
            ) : (
              <ShieldCheck aria-hidden="true" className="h-5 w-5" />
            )}
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{titolo}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{spiegazione}</p>
          {avviso ? (
            <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              Scade {quandoScade(scadenza.giorniRimasti)}, il {formattaGiorno(scadenza.scadenza)}.
              Cambiandola adesso sei a posto per il trimestre.
            </p>
          ) : null}
        </div>

        <CambiaPasswordForm
          nomeAccesso={etichettaAccesso(ctx.email)}
          obbligato={obbligato}
          casa={casaPerRuolo(ctx.role)}
        />
      </div>
    </div>
  );
}

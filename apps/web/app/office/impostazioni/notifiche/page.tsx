import { Bell, BellOff, Smartphone } from 'lucide-react';

import { AVVISI, type MetaAvviso } from '@kommessa/api/avvisi';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';

import { getAppModeCached } from '@/app/_lib/app-mode';

import { SectionHeader } from '../_components/section-header';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Notifiche · Impostazioni' };

/**
 * **Cosa manda l'applicazione, a chi, e quando.**
 *
 * Il catalogo esisteva (`@kommessa/api/avvisi`) ma lo vedeva solo la persona
 * che riceve, nel suo profilo sul telefono, e solo per le voci che riguardano
 * lei. Chi amministra l'azienda non aveva **nessun posto** dove leggere
 * l'elenco completo: per sapere se l'applicazione avvisa un tecnico quando gli
 * affidi un lavoro bisognava chiederlo a noi.
 *
 * ⭐ **Non è un pannello di comandi, ed è voluto.** Qui non si accende e non
 * si spegne niente: la scelta è della persona che riceve l'interruzione, non
 * dell'azienda. Un amministratore che potesse spegnere gli avvisi di un altro
 * creerebbe una terza verità — oltre al mestiere e alla preferenza — su «questa
 * persona riceve?», e chi non riceve più non saprebbe perché.
 *
 * ⚠️ L'elenco si legge dal **registro**, non è scritto qui: una voce nuova
 * compare da sé, e una voce che non esiste più sparisce. La regola del registro
 * resta quella di sempre — prima il mittente vivo, poi la voce.
 */

const ETICHETTA_RUOLO: Record<string, string> = {
  admin: 'Amministratori',
  office: 'Ufficio',
  tecnico: 'Tecnici',
};

export default async function NotifichePage() {
  // ⚠️ **Nessun gate ad amministratore, ed è una scelta.** Le altre sezioni lo
  // hanno perché si scrive qualcosa; qui non si cambia niente — è l'elenco di
  // cosa manda l'applicazione. E la domanda «perché Mario non ha ricevuto
  // l'avviso?» la fa l'ufficio, che è chi risponde al telefono: chiudergliela
  // fuori vorrebbe dire che per saperlo deve chiedere a noi, cioè esattamente
  // il motivo per cui questa pagina esiste.
  const ctx = await requireTenantContext();

  const kommessaWorld = (await getAppModeCached()) !== 'kantiere';
  const mondo = kommessaWorld ? 'commesse' : 'presenze';
  const visibili = AVVISI.filter((a) => a.mondo === 'entrambi' || a.mondo === mondo);

  // ⭐ Quante ne sono partite davvero: una pagina di documentazione che non
  // guarda i dati finisce per descrivere un'applicazione che non esiste più.
  const supabase = createServerSupabase();
  const da30g = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: righe } = await supabase
    .from('notifiche')
    .select('type, created_at')
    .eq('tenant_id', ctx.tenantId)
    .gte('created_at', da30g);
  const conteggio = new Map<string, { quante: number; ultima: string }>();
  for (const r of ((righe ?? []) as { type: string; created_at: string }[])) {
    const p = conteggio.get(r.type);
    if (!p) conteggio.set(r.type, { quante: 1, ultima: r.created_at });
    else {
      p.quante += 1;
      if (r.created_at > p.ultima) p.ultima = r.created_at;
    }
  }
  const fmtGiorno = (iso: string) =>
    new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'short' }).format(
      new Date(iso),
    );

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Notifiche"
        description={
          <>
            Cosa manda l’applicazione, a chi arriva e da cosa parte. L’avviso nell’app si scrive{' '}
            <strong className="font-medium text-foreground">sempre</strong> ed è il registro di cosa è
            successo; la notifica sul telefono è quella che interrompe, e la accende o la spegne la persona
            che la riceve, dal suo profilo. Qui non si cambia niente: è l’elenco di ciò che esiste.
          </>
        }
      />

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead className="border-b border-border bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Avviso</th>
              <th className="px-3 py-2 font-medium">Cosa lo fa partire</th>
              <th className="px-3 py-2 font-medium">A chi</th>
              <th className="px-3 py-2 font-medium">Telefono</th>
              <th className="px-3 py-2 text-right font-medium">Ultimi 30 giorni</th>
            </tr>
          </thead>
          <tbody>
            {visibili.map((a: MetaAvviso) => {
              const uso = conteggio.get(a.codice);
              return (
                <tr key={a.codice} className="border-b border-border/60 last:border-0 align-top">
                  <td className="px-3 py-2">
                    <div className="text-[13px] font-medium text-foreground">{a.etichetta}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{a.codice}</div>
                  </td>
                  {/* ⚠️ Una colonna sola per il «quando»: il registro ne ha due
                      — `quando`, scritto a chi lo riceve («quando l'ufficio TI
                      mette su un lavoro»), e `mittente`, il fatto oggettivo.
                      Qui serve il secondo; metterli entrambi faceva due
                      colonne che dicono la stessa cosa in due modi. */}
                  <td className="max-w-[420px] px-3 py-2 leading-relaxed text-muted-foreground">{a.mittente}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {a.ruoli.map((r) => (
                        <span
                          key={r}
                          className="rounded-full border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-foreground"
                        >
                          {ETICHETTA_RUOLO[r] ?? r}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {a.pushPredefinita ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                        <Smartphone className="h-3 w-3" aria-hidden="true" /> acceso di default
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <BellOff className="h-3 w-3" aria-hidden="true" /> spento di default
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {uso ? (
                      <>
                        <span className="tabular-nums text-[13px] font-semibold text-foreground">{uso.quante}</span>
                        <div className="text-[10px] text-muted-foreground">ultima {fmtGiorno(uso.ultima)}</div>
                      </>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">nessuna</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
        <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <div className="space-y-1">
          <p>
            <strong className="font-medium text-foreground">Perché una persona può non ricevere niente sul
            telefono.</strong>{' '}
            Il telefono va registrato una volta, dall’app installata: alla prima apertura compare la richiesta,
            e chi risponde «non ora» la rivede alla successiva. Senza quel passaggio l’avviso resta nella
            campanella dentro l’app, ma non compare a schermo bloccato. Su iPhone serve la versione installata
            sulla Home: dal browser le notifiche non arrivano.
          </p>
          <p>
            <strong className="font-medium text-foreground">Il mestiere decide prima della preferenza.</strong>{' '}
            Un avviso non previsto per un ruolo non viene mandato affatto, nemmeno in app: a un tecnico non
            arrivano le richieste di permesso da approvare, perché non può approvarle.
          </p>
        </div>
      </div>
    </div>
  );
}

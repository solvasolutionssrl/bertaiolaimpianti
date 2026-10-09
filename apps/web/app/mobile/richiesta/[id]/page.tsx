import { notFound, redirect } from 'next/navigation';
import { Calendar, MapPin, Phone, User, Users } from 'lucide-react';

import { createServerSupabase } from '@kommessa/api/server';
import { normalizzaPriorita, type Priorita } from '@kommessa/api/priorita';
import {
  ETICHETTA_CREATO_DA,
  ETICHETTA_RESPONSABILE,
  descriviAssegnazione,
  type RigaAssegnazione,
} from '@kommessa/api/assegnazione';

import { guardMobile } from '../../_lib/guard';
import { Hero, HeroMeta, MetaLine } from '../../_components/blueprint';
import { ScrimStatusBar } from '../../_components/scrim-status-bar';
import { MobileBackButton } from '../../_components/mobile-back-button';
import { PrioritaChip } from '@/app/_components/priorita-ui';
import { titoloCase } from '../../_lib/display-case';
import { NoteRichiesta } from './_components/note-richiesta';
import { ChiudiRichiesta } from './_components/chiudi-richiesta';

/**
 * **La scheda di una richiesta arrivata al telefono.**
 *
 * ## Perché non c'era
 *
 * Una richiesta è una cosa da fare **senza commessa**: non avendo una commessa
 * non aveva una pagina dove aprirla, e nell'elenco del telefono era l'unica
 * scheda che non fosse un collegamento. Il tecnico a cui la si affidava vedeva
 * un titolo, una pastiglia di priorità e un tasto per chiamare. Non il
 * cliente per esteso, non l'indirizzo, non quello che era stato detto al
 * telefono, non chi gliel'aveva data.
 *
 * ## L'arancione
 *
 * ⭐ Non è un vezzo: è **lo stesso segnale** che le richieste hanno già nei due
 * elenchi dove compaiono — il bordo sinistro ambra sulla scheda del telefono e
 * il badge «Richiesta» nella board dell'ufficio. Aprendo la scheda il colore
 * continua invece di ricominciare da capo, e si sa di non essere dentro una
 * commessa prima ancora di leggere.
 *
 * ⚠️ E porta con sé la striscia dietro la Dynamic Island: quella del guscio è
 * blu fissa, e su una pagina arancione diventerebbe un gradino.
 *
 * ## Chi può aprirla
 *
 * ⚠️ **La RLS qui non basta.** `commessa_todo_read` è tenant-wide: chiunque
 * dello spazio di lavoro può leggere qualunque riga, e il filtro «le mie» vive
 * nelle pagine. Quindi il controllo sta qui, scritto **identico** a quello
 * della home: assegnata a me, oppure mi ci hanno mandato. L'ufficio vede
 * tutto, perché è l'ufficio che le smista.
 *
 * ⚠️ Chi non ha titolo torna alla home, non riceve un 404: è la stessa scelta
 * della scheda commessa — chi apre un collegamento vecchio non ha sbagliato
 * niente, ha solo una cosa che non è più sua.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }) {
  return { title: `Richiesta ${params.id.slice(0, 8)}` };
}

type RigaRichiesta = {
  id: string;
  titolo: string;
  descrizione: string | null;
  stato: string;
  priorita: Priorita;
  assegnato_a: string | null;
  scadenza_at: string | null;
  created_at: string;
  created_by: string | null;
  completato_at: string | null;
  completato_da: string | null;
  contatto: string | null;
  indirizzo: string | null;
  cliente_testo: string | null;
  commessa_id: string | null;
  cliente: {
    ragione_sociale: string | null;
    indirizzo: string | null;
    citta: string | null;
    cap: string | null;
    provincia: string | null;
  } | null;
};

const unoSolo = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

export default async function RichiestaMobilePage({
  params,
}: {
  params: { id: string };
}) {
  const ctx = await guardMobile();
  const supabase = createServerSupabase();

  const { data: raw, error } = await supabase
    .from('commessa_todo' as never)
    .select(
      `id, titolo, descrizione, stato, priorita, assegnato_a, scadenza_at, created_at,
       created_by, completato_at, completato_da, contatto, indirizzo, cliente_testo, commessa_id,
       cliente:clienti!commessa_todo_cliente_id_fkey ( ragione_sociale, indirizzo, citta, cap, provincia )`,
    )
    .eq('id', params.id)
    .maybeSingle();

  if (error || !raw) notFound();
  const r = raw as unknown as RigaRichiesta;

  // Una cosa da fare dentro una commessa ha già la sua pagina: si va lì invece
  // di mostrarla qui senza il lavoro attorno.
  if (r.commessa_id) {
    redirect(`/mobile/commessa/${r.commessa_id}?evidenzia=${r.id}`);
  }

  // ─── chi ci va, e chi la segue ────────────────────────────────────────────
  const { data: squadraRaw } = await supabase
    .from('commessa_todo_squadra' as never)
    .select('user_id')
    .eq('todo_id', params.id);
  const squadraIds = ((squadraRaw ?? []) as Array<{ user_id: string }>).map((s) => s.user_id);

  const eUfficio = ctx.role === 'admin' || ctx.role === 'office';
  const miRiguarda =
    r.assegnato_a === ctx.userId ||
    squadraIds.includes(ctx.userId) ||
    r.created_by === ctx.userId;
  if (!eUfficio && !miRiguarda) redirect('/mobile');

  // ─── i nomi delle persone, in una lettura sola ────────────────────────────
  const idsPersone = [
    ...new Set([r.assegnato_a, r.created_by, r.completato_da, ...squadraIds].filter(Boolean)),
  ] as string[];
  const nomi = new Map<string, string>();
  if (idsPersone.length > 0) {
    const { data: us } = await supabase
      .from('users')
      .select('id, display_name')
      .in('id', idsPersone);
    for (const u of (us ?? []) as Array<{ id: string; display_name: string | null }>) {
      nomi.set(u.id, u.display_name ?? '—');
    }
  }

  // ─── le note ──────────────────────────────────────────────────────────────
  const { data: noteRaw } = await supabase
    .from('commessa_todo_nota' as never)
    .select('id, body, created_at, author_id')
    .eq('todo_id', params.id)
    .order('created_at', { ascending: true })
    .limit(50);
  const noteIds = [
    ...new Set(((noteRaw ?? []) as Array<{ author_id: string | null }>).map((n) => n.author_id)),
  ].filter(Boolean) as string[];
  const mancanti = noteIds.filter((i) => !nomi.has(i));
  if (mancanti.length > 0) {
    const { data: us2 } = await supabase
      .from('users')
      .select('id, display_name')
      .in('id', mancanti);
    for (const u of (us2 ?? []) as Array<{ id: string; display_name: string | null }>) {
      nomi.set(u.id, u.display_name ?? '—');
    }
  }
  const note = ((noteRaw ?? []) as Array<{
    id: string;
    body: string;
    created_at: string;
    author_id: string | null;
  }>).map((n) => ({
    id: n.id,
    body: n.body,
    created_at: n.created_at,
    autore: n.author_id ? (nomi.get(n.author_id) ?? '—') : '—',
  }));

  // ─── cliente, contatto, posto ─────────────────────────────────────────────
  const cli = unoSolo(r.cliente);
  const cliente = (cli?.ragione_sociale ?? r.cliente_testo ?? '').trim() || null;
  const inAnagrafica = Boolean(cli?.ragione_sociale);

  /**
   * ⭐ **`indirizzo` è un override, non una copia.** Vuoto vuol dire «quello
   * del cliente»: si ripiega lì, invece di lasciare il tecnico senza un posto
   * dove andare. È la stessa regola scritta nella migration che ha creato la
   * colonna, e qui è dove si applica.
   */
  const dovePezzi = r.indirizzo?.trim()
    ? [r.indirizzo.trim()]
    : [cli?.indirizzo, cli?.citta, cli?.cap, cli?.provincia];
  const dove = dovePezzi.map((p) => (p ?? '').trim()).filter(Boolean).join(', ') || null;
  const doveSuoDelCliente = !r.indirizzo?.trim() && Boolean(dove);
  const mapsUrl = dove
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dove)}`
    : null;

  // Un contatto senza chiocciola e con abbastanza cifre è un numero: si può
  // chiamare. Altrimenti è una email e resta scritta. (Stessa regola
  // dell'elenco: una sola idea di «chiamabile» in tutta l'app.)
  const grezzo = (r.contatto ?? '').trim() || null;
  const soloCifre = grezzo && !grezzo.includes('@') ? grezzo.replace(/[^+\d]/g, '') : null;
  const chiamabile =
    soloCifre && soloCifre.replace(/\D/g, '').length >= 6 ? soloCifre : null;

  const chiusa = r.stato === 'completato' || r.stato === 'annullato';
  const priorita = normalizzaPriorita(r.priorita);
  const scaduta = r.scadenza_at ? new Date(r.scadenza_at).getTime() < Date.now() : false;

  // ⭐ Chi se ne occupa: due fatti diversi, e le parole stanno in un posto solo
  // (`@kommessa/api/assegnazione`). Qui si leggeva «In mano a: Nessuno» con
  // «Ci va: Mario» una riga sotto — due modi di dire casalinghi che sembravano
  // contraddirsi su una richiesta semplicemente girata a Mario.
  const nomeDi = (id: string) => (id === ctx.userId ? 'Te' : (nomi.get(id) ?? '—'));
  const righeAssegnazione = descriviAssegnazione(
    {
      responsabile: r.assegnato_a ? nomeDi(r.assegnato_a) : null,
      tecnici: squadraIds.map(nomeDi),
    },
    'richiesta',
  );

  return (
    <div className="animate-content-in flex min-h-[100dvh] flex-col pb-28">
      <ScrimStatusBar tono="richiesta" />

      <Hero tono="richiesta" className="pb-5" paddingTop="1.15rem">
        <div className="flex items-center justify-between gap-2">
          <MobileBackButton href="/mobile" tone="dark" />
          <div className="inline-flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-2.5 py-1 text-[11px] font-semibold">
              <Phone className="h-3 w-3" aria-hidden="true" />
              Richiesta
            </span>
            {chiusa ? (
              <span className="rounded-full border border-white/25 bg-white/15 px-2.5 py-1 text-[11px] font-semibold">
                {r.stato === 'annullato' ? 'Annullata' : 'Fatta'}
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-4">
          <HeroMeta>Arrivata in ufficio</HeroMeta>
          <h1 className="mt-1 text-[22px] font-bold leading-tight">{r.titolo}</h1>

          {cliente ? (
            <p className="mt-2.5 flex items-center gap-2 text-sm">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10">
                <User className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 font-semibold">{cliente}</span>
              {!inAnagrafica ? (
                <span className="shrink-0 rounded border border-white/25 px-1.5 py-0.5 text-[10px] font-medium opacity-90">
                  non in anagrafica
                </span>
              ) : null}
            </p>
          ) : null}

          {dove ? (
            <p className="mt-1.5 flex items-start gap-2 text-sm opacity-90">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/5">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 leading-snug">
                {titoloCase(dove)}
                {/* ⚠️ Si dice da dove viene l'indirizzo quando non è stato
                    scritto sulla richiesta: chi ci va deve sapere se è il posto
                    dell'intervento o la residenza di chi ha chiamato. */}
                {doveSuoDelCliente ? (
                  <span className="block text-[11px] opacity-75">
                    indirizzo del cliente
                  </span>
                ) : null}
              </span>
            </p>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-2">
            {chiamabile ? (
              <a
                href={`tel:${chiamabile}`}
                className="flex items-center gap-2.5 rounded-xl border border-white/15 bg-white/10 p-3 transition-colors active:bg-white/20"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-400 text-emerald-950">
                  <Phone className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block font-mono text-[10px] uppercase tracking-[0.16em] opacity-70">
                    Chiama
                  </span>
                  <span className="block truncate text-sm font-semibold">{grezzo}</span>
                </span>
              </a>
            ) : grezzo ? (
              <span className="flex items-center gap-2.5 rounded-xl border border-white/15 bg-white/10 p-3">
                <span className="min-w-0">
                  <span className="block font-mono text-[10px] uppercase tracking-[0.16em] opacity-70">
                    Contatto
                  </span>
                  <span className="block truncate text-sm font-semibold">{grezzo}</span>
                </span>
              </span>
            ) : null}

            {mapsUrl ? (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 rounded-xl border border-white/15 bg-white/10 p-3 transition-colors active:bg-white/20"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/90 text-accent">
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block font-mono text-[10px] uppercase tracking-[0.16em] opacity-70">
                    Mappa
                  </span>
                  <span className="block truncate text-sm font-semibold">Come arrivare</span>
                </span>
              </a>
            ) : null}
          </div>
        </div>
      </Hero>

      <div className="flex flex-col gap-4 px-4 pt-4">
        {/* ─── cosa è stato detto al telefono ─── */}
        {r.descrizione?.trim() ? (
          <section className="animate-fade-up rounded-xl border border-border bg-card p-4 shadow-soft">
            <MetaLine>Cosa è stato detto</MetaLine>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
              {r.descrizione}
            </p>
          </section>
        ) : null}

        {/* ─── in breve ─── */}
        <section className="animate-fade-up rounded-xl border border-border bg-card p-4 shadow-soft [animation-delay:60ms]">
          <MetaLine>In breve</MetaLine>
          <dl className="mt-2 flex flex-col gap-2.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Priorità</dt>
              <dd>
                <PrioritaChip priorita={priorita} />
              </dd>
            </div>
            {r.scadenza_at ? (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Entro il</dt>
                <dd
                  className={
                    'inline-flex items-center gap-1.5 font-medium ' +
                    (scaduta && !chiusa ? 'text-destructive' : '')
                  }
                >
                  <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                  {fmtData(r.scadenza_at)}
                </dd>
              </div>
            ) : null}
            {righeAssegnazione.map((riga: RigaAssegnazione) => (
              <div key={riga.etichetta} className="flex items-start justify-between gap-3">
                <dt className="shrink-0 text-muted-foreground">{riga.etichetta}</dt>
                <dd
                  className={
                    riga.vuoto
                      ? 'italic text-muted-foreground'
                      : 'inline-flex min-w-0 items-start gap-1.5 text-right font-medium'
                  }
                >
                  {riga.vuoto ? (
                    riga.valore
                  ) : (
                    <>
                      {riga.etichetta === ETICHETTA_RESPONSABILE ? (
                        <User className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      ) : (
                        <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      )}
                      <span className="min-w-0">{riga.valore}</span>
                    </>
                  )}
                </dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3">
              {/* Chi ha preso la telefonata. Il nome c'era gia' qui, ma
                  appiccicato alla data senza dire che cosa fosse. */}
              <dt className="text-muted-foreground">
                {r.created_by ? ETICHETTA_CREATO_DA : 'Creato il'}
              </dt>
              <dd className="min-w-0 truncate text-muted-foreground">
                {r.created_by ? `${nomeDi(r.created_by)} · ` : ''}
                {fmtData(r.created_at)}
              </dd>
            </div>
            {chiusa && r.completato_at ? (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Chiusa</dt>
                <dd className="min-w-0 truncate text-muted-foreground">
                  {fmtData(r.completato_at)}
                  {r.completato_da ? ` · ${nomi.get(r.completato_da) ?? '—'}` : ''}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>

        {/* ─── note: quello che si scopre andandoci ─── */}
        <NoteRichiesta todoId={r.id} note={note} />

        {/* ─── il gesto che chiude il giro ─── */}
        {!chiusa ? <ChiudiRichiesta id={r.id} titolo={r.titolo} /> : null}
      </div>
    </div>
  );
}

/** Data breve in italiano, fuso di Roma (l'app vive in un fuso solo). */
function fmtData(iso: string): string {
  const d = new Date(iso);
  const oggi = new Date();
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: 'short',
    ...(d.getFullYear() === oggi.getFullYear() ? {} : { year: 'numeric' }),
  }).format(d);
}

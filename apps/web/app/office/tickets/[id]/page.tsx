import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createServerSupabase } from '@impiantixplus/api/server';
import { Card, CardContent } from '@impiantixplus/ui';
import { fmtDataOra } from '../../_lib/format';
import { RispostaForm } from './_components/risposta-form';
import { ConvertiButton } from './_components/converti-button';
import { AssegnaButton } from './_components/assegna-button';
import { SlaBadge, type SlaStatus } from '../_components/sla-badge';

export const dynamic = 'force-dynamic';

export default async function TicketDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createServerSupabase();
  // Le query non hanno dipendenze tra loro: parallelizziamole.
  // Per il ticket usiamo la view tickets_with_sla per leggere sla_status server-side.
  const [ticketRes, messaggiRes, commessaRes] = await Promise.all([
    supabase
      .from('tickets_with_sla')
      .select(
        `
          id, codice, oggetto, descrizione, stato, priorita, source,
          created_at, updated_at, closed_at,
          target_response_at, target_close_at, first_response_at, sla_status,
          assegnato:assegnato_a ( id, display_name ),
          cliente:cliente_id ( id, ragione_sociale, email, telefoni )
        `,
      )
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('ticket_messages')
      .select(
        `
          id, body, attachments, is_internal_note, created_at,
          sender:sender_user_id ( id, display_name )
        `,
      )
      .eq('ticket_id', params.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('commesse')
      .select('id, codice_interno')
      .eq('ticket_id', params.id)
      .maybeSingle(),
  ]);

  const t = ticketRes.data;
  if (ticketRes.error || !t) notFound();

  const cliente = Array.isArray(t.cliente) ? t.cliente[0] : t.cliente;
  const assegnato = Array.isArray(t.assegnato) ? t.assegnato[0] : t.assegnato;
  const messaggi = messaggiRes.data;
  const commessa = commessaRes.data;
  const slaStatus = (t.sla_status ?? 'ok') as SlaStatus;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <Link
        href="/office/tickets"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        Torna ai tickets
      </Link>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-xl font-semibold">{t.codice}</h1>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {t.stato}
          </span>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            · {t.priorita}
          </span>
          <SlaBadge status={slaStatus} />
        </div>

        <h2 className="text-lg">{t.oggetto}</h2>

        <p className="text-sm text-muted-foreground">
          Cliente: {cliente?.ragione_sociale ?? '—'}
          {' · '}aperto il {fmtDataOra(t.created_at)}
          {assegnato ? ` · assegnato a ${assegnato.display_name ?? '—'}` : ' · non assegnato'}
        </p>

        {/* Chip SLA con date formattate IT */}
        <div className="flex flex-wrap items-center gap-2">
          <SlaChip
            kind="risposta"
            target={t.target_response_at}
            done={t.first_response_at}
          />
          <SlaChip
            kind="chiusura"
            target={t.target_close_at}
            done={t.closed_at}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <AssegnaButton ticketId={t.id} />
          {commessa ? (
            <p className="text-sm">
              Collegato alla commessa{' '}
              <Link
                href={`/office/commesse/${commessa.id}`}
                className="font-mono text-secondary hover:underline"
              >
                {commessa.codice_interno}
              </Link>
            </p>
          ) : (
            <ConvertiButton ticketId={t.id} />
          )}
        </div>
      </header>

      <section className="space-y-3">
        {(messaggi ?? []).map((m: any) => {
          const sender = Array.isArray(m.sender) ? m.sender[0] : m.sender;
          return (
            <Card
              key={m.id}
              className={m.is_internal_note ? 'border-l-4 border-l-stato-collaudo' : ''}
            >
              <CardContent className="space-y-1 p-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {sender?.display_name ?? 'Cliente'}{' '}
                    {m.is_internal_note ? '· nota interna' : ''}
                  </span>
                  <span>{fmtDataOra(m.created_at)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{m.body}</p>
              </CardContent>
            </Card>
          );
        })}
        {(messaggi ?? []).length === 0 && (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              Nessun messaggio ancora.
            </CardContent>
          </Card>
        )}
      </section>

      <RispostaForm ticketId={t.id} />
    </div>
  );
}

/**
 * Chip "Risposta entro / Chiusura entro" — mostra la deadline SLA in IT.
 * - se done != null -> mostra "✓ avvenuta il …" (muted)
 * - se target == null -> non renderizza (no policy SLA per il tenant)
 * - se in ritardo rispetto a now() -> usa colore destructive
 */
function SlaChip({
  kind,
  target,
  done,
}: {
  kind: 'risposta' | 'chiusura';
  target: string | null | undefined;
  done: string | null | undefined;
}) {
  if (!target) return null;
  const labelPrefix = kind === 'risposta' ? 'Risposta' : 'Chiusura';
  const fmt = fmtDataOra(target);

  if (done) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground">
        {labelPrefix} avvenuta il {fmtDataOra(done)}
      </span>
    );
  }

  const inBreach = new Date(target).getTime() < Date.now();
  return (
    <span
      className={
        inBreach
          ? 'inline-flex items-center gap-1 rounded-full border border-destructive bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive'
          : 'inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground'
      }
    >
      {labelPrefix} entro {fmt}
    </span>
  );
}

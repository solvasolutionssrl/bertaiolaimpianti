import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, KeyRound, UserRound } from 'lucide-react';
import { Badge, Card, CardContent } from '@kommessa/ui';

import { createServerSupabase } from '@kommessa/api/server';
import { haCapacita } from '@kommessa/api/capacita';

import { AttivitaPersona } from '../../_components/attivita-persona';
import { etichettaRuolo } from '@kommessa/api/identita';

/**
 * La scheda di una persona per un cliente che **non timbra**.
 *
 * La scheda del mondo presenze (timbrature, rapportini, chilometri, calendario
 * ore) e' quattrocento righe di cose che su un tenant senza il modulo Kantiere
 * sarebbero tutte vuote. Invece di renderla condizionale in venti punti —
 * dove il primo che aggiunge una query dimentica il condizionale — qui c'e'
 * una scheda sua: chi e', con cosa entra, e cosa ha fatto.
 */
export async function SchedaPersonaCommesse({
  tenantId,
  dipendenteId,
}: {
  tenantId: string;
  dipendenteId: string;
}) {
  const supabase = createServerSupabase();

  const { data: dipRaw } = await supabase
    .from('dipendenti' as never)
    .select('id, nome, cognome, mansione, codice_interno, user_id, stato_attivo, note')
    .eq('id', dipendenteId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!dipRaw) notFound();
  const dip = dipRaw as unknown as {
    id: string;
    nome: string;
    cognome: string;
    mansione: string | null;
    codice_interno: string | null;
    user_id: string | null;
    stato_attivo: boolean;
    note: string | null;
  };

  // L'account collegato: ruolo, poteri, e con cosa entra. L'indirizzo lo sa
  // solo Auth, quindi serve il service role — ma qui basta il ruolo, che sta
  // in `users`: l'etichetta d'accesso la costruiamo da li' quando c'e'.
  interface Account {
    role: string;
    display_name: string | null;
    permissions: unknown;
  }
  let account: Account | null = null;
  if (dip.user_id) {
    const { data } = await supabase
      .from('users')
      .select('role, display_name, permissions')
      .eq('id', dip.user_id)
      .maybeSingle();
    account = (data as unknown as Account | null) ?? null;
  }

  const nome = `${dip.nome} ${dip.cognome}`.trim();

  return (
    <div className="w-full space-y-4">
      <Link
        href="/office/personale/dipendenti"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden="true" />
        Torna all&apos;elenco
      </Link>

      <Card>
        <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold">{nome}</h1>
            <p className="text-sm text-muted-foreground">
              {dip.mansione ?? 'Mansione non indicata'}
              {dip.codice_interno ? ` · ${dip.codice_interno}` : ''}
            </p>
            {dip.note ? (
              <p className="mt-2 max-w-prose whitespace-pre-wrap text-sm">{dip.note}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {dip.stato_attivo ? (
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
                In forza
              </Badge>
            ) : (
              <Badge variant="outline">Non più in forza</Badge>
            )}
            {account ? (
              <>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <UserRound className="h-3 w-3" aria-hidden="true" />
                  {etichettaRuolo(account.role)}
                </span>
                {haCapacita({ role: account.role, permissions: account.permissions }, 'capo_squadra')
                  && account.role === 'tecnico' ? (
                  <Badge variant="outline" className="border-primary/40 text-primary">
                    Capo squadra
                  </Badge>
                ) : null}
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                <KeyRound className="h-3 w-3" aria-hidden="true" />
                Nessun accesso all&apos;app
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <AttivitaPersona tenantId={tenantId} userId={dip.user_id} nome={nome} />
    </div>
  );
}


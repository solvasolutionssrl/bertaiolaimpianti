/**
 * /t/[token] — Landing page per la scansione del QR Kantiere.
 *
 * Risolve il token con service client (cross-tenant, bypass RLS).
 * Se l'utente e autenticato e appartiene al tenant giusto, mostra
 * la schermata di timbratura reale (self + capo squadra).
 *
 * Rami:
 *  - token non valido / revocato: messaggio di errore
 *  - token valido, utente non loggato: invito al login
 *  - token valido, utente di tenant diverso: avviso cambio account
 *  - token valido, utente loggato, stesso tenant: TimbraClient
 */

import Link from 'next/link';
import { createServiceSupabase } from '@kommessa/api/service';
import { createServerSupabase } from '@kommessa/api/server';
import { getTenantContext } from '@kommessa/api/tenant';
import { prossimoTipoTimbratura } from '@kommessa/api/kantiere-ore';
import { risolviTitoloCommessa } from '@/app/_lib/commessa-display';
import { titoloCase } from '@/app/mobile/_lib/display-case';
import { Button } from '@kommessa/ui';
import { TimbraClient } from './_components/timbra-client';

export const dynamic = 'force-dynamic';

// ─── tipi locali ────────────────────────────────────────────────────────────

type QrRow = {
  commessa_id: string;
  tenant_id: string;
  attivo: boolean;
};

type CommessaRow = {
  descrizione_ai_finale: string | null;
  descrizione_ai_proposta: string | null;
  note_iniziali: string | null;
  nome_cartella: string | null;
  codice_interno: string | null;
};

type SquadraRow = {
  dipendente_id: string;
  ruolo_commessa: 'capo' | 'membro';
};

type DipRow = {
  id: string;
  nome: string;
  cognome: string;
};

// ─── componenti di layout ───────────────────────────────────────────────────

function Schermo({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-8 shadow-md">
        {children}
      </div>
    </div>
  );
}

function IconaQr() {
  return (
    <div className="mb-5 flex justify-center">
      {/* QR icon — SVG inline, no Lucide import (server component) */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-muted-foreground"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <path d="M14 14h.01M14 18h3M17 14v4M21 14h.01M21 18h.01" />
      </svg>
    </div>
  );
}

// ─── helper: timbrature di oggi per un dipendente su una commessa ────────────

async function prossimoTipoFor(
  supabase: ReturnType<typeof createServerSupabase>,
  dipendenteId: string,
  commessaId: string,
): Promise<'ingresso' | 'uscita'> {
  const inizioGiorno = new Date();
  inizioGiorno.setHours(0, 0, 0, 0);
  const { data } = await supabase
    .from('timbrature' as never)
    .select('tipo, ts')
    .eq('dipendente_id', dipendenteId)
    .eq('commessa_id', commessaId)
    .gte('ts', inizioGiorno.toISOString())
    .order('ts', { ascending: true });
  return prossimoTipoTimbratura(
    (data as { tipo: 'ingresso' | 'uscita' }[] | null) ?? [],
  );
}

// ─── page ───────────────────────────────────────────────────────────────────

export default async function TokenPage({
  params,
}: {
  params: { token: string };
}) {
  const token = params.token;
  const svc = createServiceSupabase();

  // 1. Lookup QR (service client — pubblico, cross-tenant)
  const { data: qr } = await svc
    .from('cantiere_qr' as never)
    .select('commessa_id, tenant_id, attivo')
    .eq('token', token)
    .maybeSingle<QrRow>();

  // 2. Token non trovato o revocato
  if (!qr || qr.attivo === false) {
    return (
      <Schermo>
        <IconaQr />
        <h1 className="text-center text-lg font-semibold tracking-tight text-foreground">
          QR non valido o revocato
        </h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Chiedi all&apos;ufficio un QR aggiornato del cantiere.
        </p>
      </Schermo>
    );
  }

  // 3. Carica titolo commessa (service client: senza sessione utente)
  const { data: commessa } = await svc
    .from('commesse' as never)
    .select(
      'descrizione_ai_finale, descrizione_ai_proposta, note_iniziali, nome_cartella, codice_interno',
    )
    .eq('id', qr.commessa_id)
    .maybeSingle<CommessaRow>();

  const titolo = commessa ? risolviTitoloCommessa(commessa) || 'Cantiere' : 'Cantiere';

  // 4. Contesto sessione utente
  const ctx = await getTenantContext();

  // 4a. Non autenticato: invito al login
  if (!ctx) {
    return (
      <Schermo>
        <IconaQr />
        <p className="mb-1 text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Kantiere
        </p>
        <h1 className="text-center text-xl font-bold tracking-tight text-foreground">
          {titolo}
        </h1>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Accedi con il tuo account per timbrare.
        </p>
        <div className="mt-6">
          <Link href={`/login?next=/t/${token}`} className="block w-full">
            <Button className="w-full" size="lg">
              Accedi per timbrare
            </Button>
          </Link>
        </div>
      </Schermo>
    );
  }

  // 4b. Tenant diverso
  if (ctx.tenantId !== qr.tenant_id) {
    return (
      <Schermo>
        <IconaQr />
        <h1 className="text-center text-lg font-semibold tracking-tight text-foreground">
          Account non valido
        </h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Questo QR appartiene a un altro spazio. Esci e accedi con l&apos;account giusto.
        </p>
      </Schermo>
    );
  }

  // 5. Utente autenticato dello stesso tenant: carica dati con RLS
  const supabase = createServerSupabase();

  // Dipendente corrente (null se ufficio/admin senza scheda dipendente)
  const { data: meRow } = await supabase
    .from('dipendenti' as never)
    .select('id, nome, cognome')
    .eq('tenant_id', ctx.tenantId)
    .eq('user_id', ctx.userId)
    .maybeSingle<DipRow>();

  const me = meRow ?? null;

  // Squadra della commessa
  const { data: squadraRows } = await supabase
    .from('commessa_squadra' as never)
    .select('dipendente_id, ruolo_commessa')
    .eq('commessa_id', qr.commessa_id)
    .eq('tenant_id', ctx.tenantId);

  const righeSquadra = (squadraRows as SquadraRow[] | null) ?? [];

  // Sono capo su questa commessa?
  const capo = me !== null && righeSquadra.some(
    (r) => r.dipendente_id === me.id && r.ruolo_commessa === 'capo',
  );

  // Prossimo tipo di timbratura per me
  const prossimoTipoSelf =
    me !== null ? await prossimoTipoFor(supabase, me.id, qr.commessa_id) : null;

  // Membri della squadra (escludo me stesso per non duplicare)
  let membriConTipo: { id: string; nome: string; prossimoTipo: 'ingresso' | 'uscita' }[] = [];

  if (capo) {
    const idsMembri = righeSquadra
      .map((r) => r.dipendente_id)
      .filter((id) => id !== (me?.id ?? null));

    if (idsMembri.length > 0) {
      const { data: dipRows } = await supabase
        .from('dipendenti' as never)
        .select('id, nome, cognome')
        .in('id', idsMembri);

      const dips = (dipRows as DipRow[] | null) ?? [];

      membriConTipo = await Promise.all(
        dips.map(async (d) => ({
          id: d.id,
          nome: titoloCase(`${d.nome} ${d.cognome}`),
          prossimoTipo: await prossimoTipoFor(supabase, d.id, qr.commessa_id),
        })),
      );
    }
  }

  // 5a. Nessun profilo dipendente (office/admin senza scheda)
  if (!me && !capo) {
    return (
      <Schermo>
        <IconaQr />
        <p className="mb-1 text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Kantiere
        </p>
        <h1 className="text-center text-xl font-bold tracking-tight text-foreground">
          {titolo}
        </h1>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Nessun profilo dipendente collegato a questo account.
        </p>
      </Schermo>
    );
  }

  // 6. Render schermata timbratura
  return (
    <Schermo>
      <IconaQr />
      <TimbraClient
        token={token}
        commessaTitolo={titolo}
        me={
          me
            ? { id: me.id, nome: titoloCase(`${me.nome} ${me.cognome}`) }
            : null
        }
        prossimoTipoSelf={prossimoTipoSelf}
        capo={capo}
        membri={membriConTipo}
      />
    </Schermo>
  );
}

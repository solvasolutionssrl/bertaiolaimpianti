import { Badge, Card, CardContent, CardHeader, CardTitle } from '@kommessa/ui';
import {
  HardHat,
  Mail,
  Phone,
  Star,
  Tag as TagIcon,
  User2,
  Users,
} from 'lucide-react';
import Link from 'next/link';

import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';

import { loadCommessa } from './_lib/get-commessa';
import { elencaTagTenant } from '../../../_actions/commessa-tag';
import { TagEditor } from '../../../_components/tag-editor';
import { ClienteEditDialog } from './_components/cliente-edit-dialog';
import { CommessaEditDialog } from './_components/commessa-edit-dialog';
import {
  ContattiEditor,
  type ContattoRow,
} from '../../clienti/_components/contatti-editor';

export const dynamic = 'force-dynamic';

const FMT_DATA = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'Europe/Rome',
});

function fmtData(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return FMT_DATA.format(new Date(iso));
  } catch {
    return '—';
  }
}

export default async function AnagraficaTab({
  params,
}: {
  params: { id: string };
}) {
  const ctx = await requireTenantContext();
  const c = await loadCommessa(params.id);
  const cliente = Array.isArray(c.cliente) ? c.cliente[0] : c.cliente;
  const resp = Array.isArray(c.responsabile) ? c.responsabile[0] : c.responsabile;
  const ticket = Array.isArray(c.ticket) ? c.ticket[0] : c.ticket;

  // Carica i tag della commessa + la rosa di tag esistenti nel tenant +
  // contatti del cliente (scope NULL) e contatti specifici della commessa.
  const supabase = createServerSupabase();
  const clienteIdParam = (cliente?.id as string | undefined) ?? null;
  const [tagsRes, tenantTags, contattiClienteRes, contattiCommessaRes] =
    await Promise.all([
      supabase.from('commessa_tags').select('tag').eq('commessa_id', params.id),
      elencaTagTenant(),
      clienteIdParam
        ? supabase
            .from('contatto_cliente' as never)
            .select(
              'id, nome, ruolo, telefono, email, note, is_primary, ordine',
            )
            .eq('cliente_id', clienteIdParam)
            .is('commessa_id', null)
        : Promise.resolve({ data: [] as ContattoRow[], error: null }),
      supabase
        .from('contatto_cliente' as never)
        .select('id, nome, ruolo, telefono, email, note, is_primary, ordine')
        .eq('commessa_id', params.id),
    ]);
  const contattiCliente = (contattiClienteRes.data ?? []) as unknown as ContattoRow[];
  const contattiCommessa = (contattiCommessaRes.data ?? []) as unknown as ContattoRow[];
  const tags = ((tagsRes.data ?? []) as Array<{ tag: string }>)
    .map((t) => t.tag)
    .sort();
  const canEditTags = ctx.role === 'admin' || ctx.role === 'office';
  const canEditCliente = ctx.role === 'admin' || ctx.role === 'office';

  // Titolo umano (con spazi): preferisce la descrizione AI finale, poi la
  // proposta. È il "cosa è davvero" della commessa, da mostrare leggibile
  // sopra il nome_cartella tecnico (che è ScritroCosìPerNextcloud).
  const titoloUmano =
    (c.descrizione_ai_finale ?? c.descrizione_ai_proposta ?? '').trim() || null;

  const telefoni = (cliente?.telefoni as string[] | null | undefined) ?? [];
  const email = (cliente?.email as string[] | null | undefined) ?? [];

  // Contatti del cliente (scope NULL): rappresentano la rubrica del cliente,
  // riusabile su tutte le sue commesse. I telefoni[]/email[] restano come
  // fallback legacy quando la rubrica è vuota.
  const contatti: ContattoRow[] = [...contattiCliente].sort(
    (a, b) =>
      (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) ||
      a.ordine - b.ordine ||
      a.nome.localeCompare(b.nome),
  );

  return (
    <div className="space-y-4">
      {/* HERO — Titolo umano della commessa (leggibile, con spazi).
          Sotto, il nome cartella tecnico in mono come metadata. */}
      {titoloUmano ? (
        <Card className="border-primary/15 bg-gradient-to-br from-primary/[0.04] via-transparent to-transparent">
          <CardContent className="space-y-1 px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary/80">
              Descrizione cantiere
            </p>
            <h2 className="break-words text-lg font-semibold leading-snug text-foreground">
              {titoloUmano}
            </h2>
            {c.nome_cartella ? (
              <p className="break-all pt-0.5 font-mono text-[11px] text-muted-foreground">
                {c.nome_cartella}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* CLIENTE — leggero tinto warm + bottone EDIT */}
        <Card className="border-amber-500/20 bg-amber-50/30 dark:bg-amber-950/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 pb-2 pt-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <User2 className="h-3.5 w-3.5" aria-hidden="true" />
              Cliente
            </CardTitle>
            {canEditCliente && cliente?.id ? (
              <ClienteEditDialog
                cliente={{
                  id: cliente.id as string,
                  ragione_sociale: (cliente.ragione_sociale as string) ?? null,
                  tipo:
                    (cliente as { tipo?: 'persona_fisica' | 'azienda' | null })
                      .tipo ?? null,
                  indirizzo: (cliente.indirizzo as string | null) ?? null,
                  citta: (cliente.citta as string | null) ?? null,
                  cap:
                    (cliente as { cap?: string | null }).cap ?? null,
                  provincia:
                    (cliente as { provincia?: string | null }).provincia ??
                    null,
                  partita_iva:
                    (cliente as { partita_iva?: string | null }).partita_iva ??
                    null,
                  codice_fiscale:
                    (cliente as { codice_fiscale?: string | null })
                      .codice_fiscale ?? null,
                  telefoni,
                  email,
                  note:
                    (cliente as { note?: string | null }).note ?? null,
                }}
              />
            ) : null}
          </CardHeader>
          <CardContent className="space-y-2 px-4 pb-3 text-sm">
            <Field
              label="Ragione sociale"
              value={cliente?.ragione_sociale}
              bold
            />
            <Field label="Indirizzo" value={cliente?.indirizzo} />
            <Field
              label="Città"
              value={[
                (cliente as { cap?: string | null })?.cap,
                cliente?.citta,
                (cliente as { provincia?: string | null })?.provincia
                  ? `(${(cliente as { provincia?: string | null }).provincia})`
                  : null,
              ]
                .filter(Boolean)
                .join(' ')}
            />
            {contatti.length > 0 ? (
              <ContattiList
                contatti={contatti}
                contattiCommessa={contattiCommessa}
                clienteId={cliente?.id as string}
                commessaId={params.id}
                canEdit={canEditCliente}
              />
            ) : (
              <>
                <Field
                  label="Telefono"
                  value={telefoni.length > 0 ? telefoni.join(' · ') : null}
                />
                <Field
                  label="Email"
                  value={email.length > 0 ? email.join(' · ') : null}
                />
                {/* Editor scope commessa anche quando i contatti cliente sono
                    vuoti: l'utente potrebbe voler aggiungere subito un
                    referente di cantiere. */}
                {cliente?.id && canEditCliente ? (
                  <ContattiCommessaSection
                    clienteId={cliente.id as string}
                    commessaId={params.id}
                    initial={contattiCommessa}
                  />
                ) : null}
              </>
            )}
            {(cliente as { note?: string | null })?.note?.trim() ? (
              <FieldNote
                label="Note"
                value={(cliente as { note?: string | null }).note as string}
              />
            ) : null}
          </CardContent>
        </Card>

        {/* COMMESSA — dettagli tecnici, no truncate, grassetti su valori chiave */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 pb-2 pt-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Commessa
            </CardTitle>
            {canEditCliente ? (
              <CommessaEditDialog
                commessaId={params.id}
                nomeCartella={c.nome_cartella as string | null}
                descrizione={titoloUmano}
                indirizzoCantiere={
                  (c.cliente_indirizzo_cantiere as string | null) ?? null
                }
              />
            ) : null}
          </CardHeader>
          <CardContent className="space-y-2 px-4 pb-3 text-sm">
            <Field label="Codice interno" value={c.codice_interno} mono bold />
            <Field
              label="Indirizzo cantiere"
              value={c.cliente_indirizzo_cantiere}
              bold
            />
            <Field label="Responsabile" value={resp?.display_name} bold />
            <Field
              label="Origine"
              value={ticket?.codice ? `Ticket ${ticket.codice}` : 'Manuale'}
            />
            <hr className="my-1.5 border-border/60" />
            <Field label="Nome cartella" value={c.nome_cartella} mono small />
            <Field
              label="Cartella cloud"
              value={c.cloud_folder_path}
              mono
              small
            />
            <hr className="my-1.5 border-border/60" />
            <Field
              label="Creata il"
              value={fmtData(c.created_at as string | null | undefined)}
              small
            />
            <Field
              label="Apertura cantiere"
              value={fmtData(c.data_apertura as string | null | undefined)}
              small
            />
          </CardContent>
        </Card>
      </div>

      {/* Tag liberi — categorizzazione trasversale */}
      <Card>
        <CardHeader className="px-4 pb-2 pt-3">
          <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-wide text-muted-foreground">
            <TagIcon className="h-3.5 w-3.5" aria-hidden="true" />
            Tag
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <TagEditor
            commessaId={params.id}
            initialTags={tags}
            tenantTags={tenantTags}
            canEdit={canEditTags}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/** Lista contatti del cliente (passive view) + sezione "Referenti per
 *  questa commessa" (CRUD inline via ContattiCommessaSection).
 *  Visivamente integrata nella stessa "riga" della card cliente. */
function ContattiList({
  contatti,
  contattiCommessa,
  clienteId,
  commessaId,
  canEdit,
}: {
  contatti: ContattoRow[];
  contattiCommessa: ContattoRow[];
  clienteId: string;
  commessaId: string;
  canEdit: boolean;
}) {
  return (
    <div className="grid grid-cols-3 items-start gap-2">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Users className="h-3 w-3" aria-hidden="true" />
          Contatti
        </span>
      </dt>
      <dd className="col-span-2 min-w-0 space-y-2">
        {/* Contatti del cliente (riusabili su tutte le sue commesse) */}
        <ul className="space-y-1">
          {contatti.map((c) => (
            <ContattoLine key={c.id} c={c} />
          ))}
        </ul>
        <Link
          href={`/office/clienti/${clienteId}`}
          className="inline-block text-[10px] uppercase tracking-wider text-muted-foreground hover:text-primary"
        >
          Gestisci contatti cliente →
        </Link>

        {/* Sezione scope-commessa visivamente staccata. Stesso "spazio"
            della card cliente — non un'altra card. Il colore amber soft
            la distingue come "specifica di questo cantiere". */}
        <ContattiCommessaSection
          clienteId={clienteId}
          commessaId={commessaId}
          initial={contattiCommessa}
          canEdit={canEdit}
        />
      </dd>
    </div>
  );
}

function ContattoLine({ c }: { c: ContattoRow }) {
  return (
    <li className="text-xs">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <span className="font-medium text-foreground">{c.nome}</span>
        {c.ruolo ? (
          <span className="text-muted-foreground">· {c.ruolo}</span>
        ) : null}
        {c.is_primary ? (
          <Badge
            variant="outline"
            className="border-primary/40 bg-primary/10 px-1 py-0 text-[9px] font-semibold uppercase tracking-wider text-primary"
          >
            <Star className="mr-0.5 h-2 w-2" />
            Primario
          </Badge>
        ) : null}
      </div>
      <div className="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5">
        {c.telefono ? (
          <a
            href={`tel:${c.telefono}`}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <Phone className="h-3 w-3" aria-hidden="true" />
            {c.telefono}
          </a>
        ) : null}
        {c.email ? (
          <a
            href={`mailto:${c.email}`}
            className="inline-flex items-center gap-1 break-all text-foreground/80 hover:text-primary"
          >
            <Mail className="h-3 w-3" aria-hidden="true" />
            {c.email}
          </a>
        ) : null}
      </div>
    </li>
  );
}

/** Sezione "Referenti per questa commessa" — visivamente staccata dalla
 *  rubrica cliente con accent amber, ma DENTRO la stessa card cliente.
 *  Usa il ContattiEditor in modalità scope=commessa. */
function ContattiCommessaSection({
  clienteId,
  commessaId,
  initial,
  canEdit = true,
}: {
  clienteId: string;
  commessaId: string;
  initial: ContattoRow[];
  canEdit?: boolean;
}) {
  if (!canEdit && initial.length === 0) return null;
  return (
    <div className="mt-2 rounded-md border-l-2 border-amber-500/40 bg-amber-50/40 px-2.5 py-2 dark:bg-amber-950/15">
      <p className="mb-1.5 flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.16em] text-amber-700 dark:text-amber-400">
        <HardHat className="h-2.5 w-2.5" aria-hidden="true" />
        Referenti di questa commessa
      </p>
      <ContattiEditor
        clienteId={clienteId}
        commessaId={commessaId}
        initial={initial}
        canEdit={canEdit}
      />
    </div>
  );
}

/** Variante di Field per testi multi-riga (note): label sopra, body
 *  in whitespace-pre-wrap per preservare a-capo e spazi del cliente. */
function FieldNote({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5 pt-1">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="whitespace-pre-wrap break-words rounded-md border border-amber-500/20 bg-amber-50/50 px-2.5 py-1.5 text-xs leading-relaxed text-foreground/90 dark:bg-amber-950/20">
        {value}
      </dd>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  bold,
  small,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  bold?: boolean;
  small?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 items-start gap-2">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={[
          'col-span-2 min-w-0 break-words',
          mono ? 'font-mono' : '',
          mono && small ? 'text-xs' : '',
          mono && !small ? 'text-xs' : '',
          !mono && small ? 'text-xs' : '',
          bold ? 'font-medium text-foreground' : 'text-foreground/90',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {value || <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}

import { Badge, Card, CardContent, CardHeader, CardTitle } from '@kommessa/ui';
import { HardHat, Mail, Phone, Star, Tag as TagIcon, User2, Users } from 'lucide-react';
import Link from 'next/link';

import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';

import { loadCommessa } from '../_lib/get-commessa';
import { elencaTagTenant } from '../../../../_actions/commessa-tag';
import { TagEditor } from '../../../../_components/tag-editor';
import { ClienteEditDialog } from '../_components/cliente-edit-dialog';
import {
  ContattiEditor,
  type ContattoRow,
} from '../../../clienti/_components/contatti-editor';

export const dynamic = 'force-dynamic';

/**
 * Tab Anagrafica — il "fascicolo cliente": solo dati realmente anagrafici
 * (cliente, contatti/referenti, tag). Descrizione cantiere, dettagli lavoro e
 * dati tecnici di commessa vivono nella tab Commessa / sidebar.
 */
export default async function AnagraficaTab({
  params,
}: {
  params: { id: string };
}) {
  const ctx = await requireTenantContext();
  const c = await loadCommessa(params.id);
  const cliente = Array.isArray(c.cliente) ? c.cliente[0] : c.cliente;

  const supabase = createServerSupabase();
  const clienteIdParam = (cliente?.id as string | undefined) ?? null;
  const [tagsRes, tenantTags, contattiClienteRes, contattiCommessaRes] =
    await Promise.all([
      supabase.from('commessa_tags').select('tag').eq('commessa_id', params.id),
      elencaTagTenant(),
      clienteIdParam
        ? supabase
            .from('contatto_cliente' as never)
            .select('id, nome, ruolo, telefono, email, note, is_primary, ordine')
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

  const telefoni = (cliente?.telefoni as string[] | null | undefined) ?? [];
  const email = (cliente?.email as string[] | null | undefined) ?? [];

  const contatti: ContattoRow[] = [...contattiCliente].sort(
    (a, b) =>
      (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) ||
      a.ordine - b.ordine ||
      a.nome.localeCompare(b.nome),
  );

  return (
    <div className="space-y-4">
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
                  (cliente as { tipo?: 'persona_fisica' | 'azienda' | null }).tipo ??
                  null,
                indirizzo: (cliente.indirizzo as string | null) ?? null,
                citta: (cliente.citta as string | null) ?? null,
                cap: (cliente as { cap?: string | null }).cap ?? null,
                provincia: (cliente as { provincia?: string | null }).provincia ?? null,
                partita_iva:
                  (cliente as { partita_iva?: string | null }).partita_iva ?? null,
                codice_fiscale:
                  (cliente as { codice_fiscale?: string | null }).codice_fiscale ?? null,
                telefoni,
                email,
                note: (cliente as { note?: string | null }).note ?? null,
              }}
            />
          ) : null}
        </CardHeader>
        <CardContent className="space-y-2 px-4 pb-3 text-sm">
          <Field label="Ragione sociale" value={cliente?.ragione_sociale} bold />
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
          {(cliente as { partita_iva?: string | null })?.partita_iva ? (
            <Field
              label="P.IVA"
              value={(cliente as { partita_iva?: string | null }).partita_iva}
              mono
            />
          ) : null}
          {(cliente as { codice_fiscale?: string | null })?.codice_fiscale ? (
            <Field
              label="Cod. fiscale"
              value={(cliente as { codice_fiscale?: string | null }).codice_fiscale}
              mono
            />
          ) : null}
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
        {c.ruolo ? <span className="text-muted-foreground">· {c.ruolo}</span> : null}
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

function FieldNote({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5 pt-1">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
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
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd
        className={[
          'col-span-2 min-w-0 break-words',
          mono ? 'font-mono text-xs' : '',
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

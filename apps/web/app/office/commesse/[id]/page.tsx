import { Card, CardContent, CardHeader, CardTitle } from '@kommessa/ui';
import { Tag as TagIcon } from 'lucide-react';

import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';

import { loadCommessa } from './_lib/get-commessa';
import { elencaTagTenant } from '../../../_actions/commessa-tag';
import { TagEditor } from '../../../_components/tag-editor';

export const dynamic = 'force-dynamic';

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

  // Carica i tag della commessa + la rosa di tag esistenti nel tenant
  const supabase = createServerSupabase();
  const [tagsRes, tenantTags] = await Promise.all([
    supabase.from('commessa_tags').select('tag').eq('commessa_id', params.id),
    elencaTagTenant(),
  ]);
  const tags = ((tagsRes.data ?? []) as Array<{ tag: string }>)
    .map((t) => t.tag)
    .sort();
  const canEditTags = ctx.role === 'admin' || ctx.role === 'office';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Field label="Ragione sociale" value={cliente?.ragione_sociale} />
            <Field label="Indirizzo" value={cliente?.indirizzo} />
            <Field label="Città" value={cliente?.citta} />
            <Field
              label="Telefono"
              value={(cliente?.telefoni ?? []).join(', ') || '—'}
            />
            <Field
              label="Email"
              value={(cliente?.email ?? []).join(', ') || '—'}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Commessa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Field label="Codice interno" value={c.codice_interno} mono />
            <Field label="Nome cartella" value={c.nome_cartella} mono />
            <Field
              label="Indirizzo cantiere"
              value={c.cliente_indirizzo_cantiere}
            />
            <Field label="Responsabile" value={resp?.display_name} />
            <Field
              label="Origine"
              value={ticket?.codice ? `Ticket ${ticket.codice}` : 'Manuale'}
            />
            <Field
              label="Descrizione"
              value={c.descrizione_ai_finale ?? c.descrizione_ai_proposta}
            />
            <Field
              label="Cartella cloud"
              value={c.cloud_folder_path}
              mono
            />
          </CardContent>
        </Card>
      </div>

      {/* Tag liberi — categorizzazione trasversale */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-wide text-muted-foreground">
            <TagIcon className="h-3.5 w-3.5" aria-hidden="true" />
            Tag
          </CardTitle>
        </CardHeader>
        <CardContent>
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

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`col-span-2 min-w-0 truncate ${mono ? 'font-mono text-xs' : ''}`}
        title={value ?? undefined}
      >
        {value || '—'}
      </dd>
    </div>
  );
}

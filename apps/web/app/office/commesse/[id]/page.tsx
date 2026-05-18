import { Card, CardContent, CardHeader, CardTitle } from '@impiantixplus/ui';
import { loadCommessa } from './_lib/get-commessa';

export const dynamic = 'force-dynamic';

export default async function AnagraficaTab({
  params,
}: {
  params: { id: string };
}) {
  const c = await loadCommessa(params.id);
  const cliente = Array.isArray(c.cliente) ? c.cliente[0] : c.cliente;
  const resp = Array.isArray(c.responsabile) ? c.responsabile[0] : c.responsabile;
  const ticket = Array.isArray(c.ticket) ? c.ticket[0] : c.ticket;

  return (
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
      <dd className={`col-span-2 ${mono ? 'font-mono text-xs' : ''}`}>
        {value || '—'}
      </dd>
    </div>
  );
}

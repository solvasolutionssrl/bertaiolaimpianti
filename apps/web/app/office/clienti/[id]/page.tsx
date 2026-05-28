import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import {
  ArrowLeft,
  Briefcase,
  Building2,
  CircleDot,
  User,
  Users,
} from 'lucide-react';
import { Card, CardContent, StatoBadge } from '@kommessa/ui';

import { EmptyState } from '../../../_components/empty-state';
import { ClienteForm } from '../_components/form';
import {
  ContattiEditor,
  type ContattoRow,
} from '../_components/contatti-editor';
import { fmtData } from '../../_lib/format';

export const dynamic = 'force-dynamic';

export default async function ClienteDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();
  const [clRes, comRes, ctRes] = await Promise.all([
    supabase
      .from('clienti')
      .select(
        'id, ragione_sociale, tipo, indirizzo, citta, cap, provincia, partita_iva, codice_fiscale, telefoni, email, note',
      )
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('commesse')
      .select('id, codice_interno, stato, data_apertura, nome_cartella')
      .eq('cliente_id', params.id)
      .order('data_apertura', { ascending: false })
      .limit(50),
    supabase
      .from('contatto_cliente' as never)
      .select('id, nome, ruolo, telefono, email, note, is_primary, ordine')
      .eq('cliente_id', params.id),
  ]);
  if (clRes.error || !clRes.data) notFound();
  const canEditContatti = ctx.role === 'admin' || ctx.role === 'office';
  const contatti = ((ctRes.data ?? []) as unknown as ContattoRow[]) ?? [];

  const cliente = clRes.data;
  const commesse = comRes.data ?? [];
  const apertCount = commesse.filter((c) =>
    ['bozza', 'aperta', 'in_corso', 'collaudo'].includes(c.stato as string),
  ).length;
  const chiuseCount = commesse.length - apertCount;
  const isAzienda = cliente.tipo === 'azienda';

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-6">
      <Link
        href="/office/clienti"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        Torna ai clienti
      </Link>

      {/* Header compatto con KPI inline */}
      <header className="flex flex-wrap items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-primary/10 text-primary"
          aria-hidden="true"
        >
          {isAzienda ? <Building2 className="h-5 w-5" /> : <User className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {cliente.ragione_sociale}
          </h1>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {isAzienda ? 'Azienda' : 'Persona fisica'}
            {cliente.citta ? ` · ${cliente.citta}` : ''}
            {cliente.partita_iva ? ` · ${cliente.partita_iva}` : ''}
          </p>
        </div>
        {/* Mini KPI commesse */}
        <div className="flex gap-2">
          <KpiPill label="Aperte" value={apertCount} tone="primary" />
          <KpiPill label="Chiuse" value={chiuseCount} tone="muted" />
        </div>
      </header>

      {/* Layout 2 colonne su lg+: form + lista commesse affianco */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <div>
            <h2 className="px-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Anagrafica
            </h2>
            <div className="mt-2">
              <ClienteForm initial={cliente as any} />
            </div>
          </div>

          {/* Contatti referente (Ondata 4): 1-N rubrica per cliente. */}
          <div>
            <h2 className="flex items-center justify-between px-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3 w-3" aria-hidden="true" />
                Contatti referente
              </span>
              <span className="tabular-nums">{contatti.length}</span>
            </h2>
            <div className="mt-2">
              <ContattiEditor
                clienteId={cliente.id as string}
                initial={contatti}
                canEdit={canEditContatti}
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="flex items-center justify-between px-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <span>Commesse del cliente</span>
            <span className="tabular-nums">{commesse.length}</span>
          </h2>
          {commesse.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title="Nessuna commessa"
              description="Apri una nuova commessa per cominciare a tracciare i lavori."
            />
          ) : (
            <Card>
              <CardContent className="divide-y divide-border p-0">
                {commesse.map((c) => (
                  <Link
                    key={c.id}
                    href={`/office/commesse/${c.id}`}
                    className="block px-3 py-2.5 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <CircleDot
                        className="h-3 w-3 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span className="font-mono text-xs font-semibold text-primary">
                        {c.codice_interno}
                      </span>
                      <StatoBadge stato={c.stato as any} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {c.nome_cartella}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
                      {fmtData(c.data_apertura)}
                    </p>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'primary' | 'muted';
}) {
  const cls =
    tone === 'primary'
      ? 'border-primary/40 bg-primary/10 text-primary'
      : 'border-border bg-muted text-muted-foreground';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${cls}`}
    >
      <span className="font-mono text-[10px] uppercase tracking-wider opacity-80">
        {label}
      </span>
      <span className="font-mono font-semibold tabular-nums">
        {String(value).padStart(2, '0')}
      </span>
    </span>
  );
}

import { Card, CardContent } from '@kommessa/ui';
import { History, GitCommitVertical } from 'lucide-react';
import { createServerSupabase } from '@kommessa/api/server';
import { EmptyState } from '../../../../_components/empty-state';
import { descriviAuditEvent, fmtDataOra } from '../../../_lib/format';
import { isSuperadminActor } from '../../../../admin/_lib/guard';
import { RipristinaButton } from './_components/ripristina-button';

export const dynamic = 'force-dynamic';

interface DiffEntry {
  campo: string;
  da: unknown;
  a: unknown;
}

interface VersioneRow {
  id: string;
  versione: number;
  azione: string;
  diff: DiffEntry[] | null;
  modificato_da_nome: string | null;
  created_at: string;
}

const AZIONE_LABEL: Record<string, string> = {
  creazione: 'Creazione',
  modifica: 'Modifica',
  aggiunta_tipologie: 'Tipologie aggiunte',
  ripristino: 'Ripristino',
};

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.length === 0 ? '—' : `${v.length} voci`;
  if (typeof v === 'boolean') return v ? 'Sì' : 'No';
  const s = String(v);
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}

export default async function CronologiaTab({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createServerSupabase();

  const [versioniRes, auditRes, superattore] = await Promise.all([
    supabase
      .from('commessa_versioni' as never)
      .select('id, versione, azione, diff, modificato_da_nome, created_at')
      .eq('commessa_id', params.id)
      .order('versione', { ascending: false })
      .limit(100),
    supabase
      .from('audit_events')
      .select('id, entity_type, entity_id, action, metadata, created_at, actor_role')
      .or(
        `and(entity_type.eq.commessa,entity_id.eq.${params.id}),and(entity_type.eq.commessa_voce,entity_id.like.${params.id}%)`,
      )
      .order('created_at', { ascending: false })
      .limit(100),
    isSuperadminActor(),
  ]);

  const versioni = ((versioniRes.data ?? []) as unknown as VersioneRow[]) ?? [];
  const auditRows = auditRes.error ? [] : auditRes.data ?? [];
  const canRipristina = superattore.ok;

  if (versioni.length === 0 && auditRows.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Nessun evento registrato"
        description="Versioni, cambi di stato, upload e modifiche compariranno qui in ordine cronologico."
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Storico versioni */}
      {versioni.length > 0 ? (
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <GitCommitVertical className="h-3.5 w-3.5" aria-hidden="true" />
            Storico versioni
          </h2>
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {versioni.map((v) => (
                <div key={v.id} className="space-y-1.5 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex h-6 min-w-[2.5rem] items-center justify-center rounded-full bg-primary/10 px-2 font-mono text-[11px] font-semibold text-primary">
                      v{v.versione}
                    </span>
                    <span className="text-sm font-medium">
                      {AZIONE_LABEL[v.azione] ?? v.azione}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {fmtDataOra(v.created_at)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      · {v.modificato_da_nome ?? 'sistema'}
                    </span>
                    {canRipristina && v.azione !== 'ripristino' ? (
                      <span className="ml-auto">
                        <RipristinaButton
                          commessaId={params.id}
                          versioneId={v.id}
                          versione={v.versione}
                        />
                      </span>
                    ) : null}
                  </div>
                  {v.diff && v.diff.length > 0 ? (
                    <ul className="space-y-0.5 pl-1 text-xs text-muted-foreground">
                      {v.diff.map((d, i) => (
                        <li key={i} className="flex flex-wrap items-center gap-1">
                          <span className="font-medium text-foreground/80">
                            {d.campo}:
                          </span>
                          <span className="line-through opacity-70">
                            {fmtVal(d.da)}
                          </span>
                          <span aria-hidden="true">→</span>
                          <span className="font-medium text-foreground">
                            {fmtVal(d.a)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : v.azione === 'creazione' ? (
                    <p className="pl-1 text-xs text-muted-foreground">
                      Stato iniziale della commessa.
                    </p>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      ) : null}

      {/* Log eventi (audit) */}
      {auditRows.length > 0 ? (
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <History className="h-3.5 w-3.5" aria-hidden="true" />
            Eventi
          </h2>
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {auditRows.map((e: any) => (
                <div key={e.id} className="flex items-start gap-3 p-3 text-sm">
                  <span className="w-36 shrink-0 font-mono text-xs text-muted-foreground">
                    {fmtDataOra(e.created_at)}
                  </span>
                  <span className="flex-1">{descriviAuditEvent(e)}</span>
                  <span className="text-xs uppercase text-muted-foreground">
                    {e.actor_role ?? '—'}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}

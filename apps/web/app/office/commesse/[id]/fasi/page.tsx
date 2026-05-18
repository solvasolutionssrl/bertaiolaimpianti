import { createServerSupabase } from '@impiantixplus/api/server';
import { Card, CardContent } from '@impiantixplus/ui';
import { AlertTriangle, CheckCircle2, Circle, ListChecks, Loader2 } from 'lucide-react';
import { EmptyState } from '../../../../_components/empty-state';
import { AggiungiFaseButton } from './_components/aggiungi-fase';
import { CambiaStatoForm } from './_components/cambia-stato';

export const dynamic = 'force-dynamic';

const STATO_ICON: Record<string, React.ReactNode> = {
  da_iniziare: <Circle className="h-4 w-4 text-muted-foreground" />,
  in_corso: <Loader2 className="h-4 w-4 text-stato-collaudo" />,
  completata: <CheckCircle2 className="h-4 w-4 text-stato-aperta" />,
  bloccata: <AlertTriangle className="h-4 w-4 text-stato-critica" />,
};

const STATO_LABEL: Record<string, string> = {
  da_iniziare: 'Da iniziare',
  in_corso: 'In corso',
  completata: 'Completata',
  bloccata: 'Bloccata',
};

export default async function FasiTab({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createServerSupabase();

  const [attiveRes, catalogoRes] = await Promise.all([
    supabase
      .from('commessa_voci')
      .select(
        `
          voce_id,
          stato,
          min_foto_richieste,
          foto_caricate_count,
          note,
          updated_at,
          voce:voce_id ( id, nome, categoria, cartella_template, "default", ordine_visualizzazione )
        `,
      )
      .eq('commessa_id', params.id),
    supabase
      .from('voci_catalogo')
      .select('id, nome, categoria, "default", ordine_visualizzazione')
      .order('ordine_visualizzazione'),
  ]);

  const attive = (attiveRes.data ?? []).sort((a: any, b: any) => {
    const va = Array.isArray(a.voce) ? a.voce[0] : a.voce;
    const vb = Array.isArray(b.voce) ? b.voce[0] : b.voce;
    return (va?.ordine_visualizzazione ?? 0) - (vb?.ordine_visualizzazione ?? 0);
  });
  const attiveIds = new Set(attive.map((r: any) => r.voce_id));
  const disponibili = (catalogoRes.data ?? []).filter(
    (v: any) => !attiveIds.has(v.id),
  );

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Fasi attive per questa commessa
        </h2>
        {attive.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="Nessuna fase attiva"
            description={'Aggiungi la prima fase di lavoro per iniziare a tracciare avanzamento, foto e note.'}
          />
        ) : (
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {attive.map((f: any) => {
                const v = Array.isArray(f.voce) ? f.voce[0] : f.voce;
                const sottoTarget =
                  f.min_foto_richieste > 0 &&
                  f.foto_caricate_count < f.min_foto_richieste;
                return (
                  <div
                    key={f.voce_id}
                    id={`voce-${f.voce_id}`}
                    className="flex items-center gap-3 p-4 text-sm scroll-mt-24 target:bg-accent-soft/40"
                  >
                    <span aria-hidden>{STATO_ICON[f.stato]}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{v?.nome ?? `Voce ${f.voce_id}`}</p>
                      <p className="text-xs text-muted-foreground">
                        {STATO_LABEL[f.stato]}
                        {f.min_foto_richieste > 0 && (
                          <>
                            {' '}· Foto: {f.foto_caricate_count}/{f.min_foto_richieste}
                            {sottoTarget && (
                              <span className="ml-1 text-stato-collaudo">⚠</span>
                            )}
                          </>
                        )}
                      </p>
                    </div>
                    <CambiaStatoForm
                      commessaId={params.id}
                      voceId={f.voce_id}
                      stato={f.stato}
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Fasi non selezionate
          </h2>
          <AggiungiFaseButton
            commessaId={params.id}
            disponibili={disponibili as any}
          />
        </div>
        {disponibili.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Tutte le voci sono già attive.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {disponibili
              .slice(0, 6)
              .map((v: any) => v.nome)
              .join(' · ')}
            {disponibili.length > 6 && ` … +${disponibili.length - 6}`}
          </p>
        )}
      </section>
    </div>
  );
}

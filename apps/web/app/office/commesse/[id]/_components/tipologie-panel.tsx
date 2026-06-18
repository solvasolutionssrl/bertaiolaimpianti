import { Card, CardContent } from '@kommessa/ui';
import { Lock, Wrench } from 'lucide-react';

import {
  AggiungiTipologieDialog,
  type TipologiaVoce,
  type TipologiaPreset,
} from '../../../../_components/aggiungi-tipologie-dialog';

/**
 * Elemento master della commessa: selezione tipologie impianto ("cosa si fa").
 * Vive nella sidebar, separato dalla tab Fasi (che monitora l'avanzamento).
 * Append-only: si aggiungono solo, ogni aggiunta crea le cartelle collegate.
 */
export function TipologiePanel({
  commessaId,
  vociPresenti,
  voci,
  presets,
  canEdit,
}: {
  commessaId: string;
  vociPresenti: number[];
  voci: TipologiaVoce[];
  presets: TipologiaPreset[];
  canEdit: boolean;
}) {
  const byId = new Map(voci.map((v) => [v.id, v]));
  return (
    <Card>
      <CardContent className="space-y-2.5 py-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <Wrench className="h-3 w-3" aria-hidden="true" />
            Tipologie impianto
          </p>
          {canEdit ? (
            <AggiungiTipologieDialog
              commessaId={commessaId}
              vociPresenti={vociPresenti}
              voci={voci}
              presets={presets}
              variant="dialog"
              triggerLabel="Aggiungi"
            />
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          {vociPresenti.length === 0 ? (
            <span className="italic text-muted-foreground">
              Nessuna tipologia selezionata.
            </span>
          ) : (
            vociPresenti.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-muted-foreground"
              >
                <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                {byId.get(id)?.nome ?? `Voce ${id}`}
              </span>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

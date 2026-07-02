'use client';

import * as React from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { Button } from '@kommessa/ui';

import {
  CommessaTodoMobile,
  type TodoMobileRow,
} from './commessa-todo-mobile';
import {
  CommessaRiunioniMobile,
  type RiunioneMobileRow,
} from './commessa-riunioni-mobile';
import { CreaTodoDialog } from '../../../../office/commesse/[id]/lavori/_components/crea-todo-dialog';
import { CreaRiunioneDialog } from '../../../../office/commesse/[id]/lavori/_components/crea-riunione-dialog';

interface Props {
  commessaId: string;
  contestoCommessa: string;
  currentUserId: string;
  canWrite: boolean;
  todos: TodoMobileRow[];
  riunioni: RiunioneMobileRow[];
  tecniciTenant: Array<{ id: string; display_name: string | null }>;
}

/**
 * Container "Lavori" della pagina commessa mobile.
 *
 * Per admin/office: aggiunge i bottoni "Nuovo TODO" + "Nuova riunione"
 * e una barra filtri chip. Per tecnici: solo i filtri (read+complete).
 *
 * I dialog di creazione sono riusati direttamente da quelli office
 * (Radix Dialog responsive su mobile — funziona).
 */
export function CommessaLavoriMobile({
  commessaId,
  contestoCommessa,
  currentUserId,
  canWrite,
  todos,
  riunioni,
  tecniciTenant,
}: Props) {
  const [todoOpen, setTodoOpen] = React.useState(false);
  const [riunOpen, setRiunOpen] = React.useState(false);

  // Elenco completo: TODO (aperti/completati/annullati) + Riunioni. Il filtro
  // è stato rimosso (vedi nota in memoria): si mostra tutto in ordine.
  const todosShown = todos;
  const mostraRiunioni = true;

  return (
    <div className="space-y-0">
      {/* Action bar — solo per admin/office */}
      {canWrite ? (
        <div className="mb-5 grid grid-cols-2 gap-2.5">
          <Button
            onClick={() => setTodoOpen(true)}
            className="h-11 justify-center gap-1.5 rounded-xl text-[14px] font-semibold"
          >
            <Plus className="h-4 w-4" />
            Nuovo Da Fare
          </Button>
          <Button
            variant="outline"
            onClick={() => setRiunOpen(true)}
            className="h-11 justify-center gap-1.5 rounded-xl border-primary/40 text-[14px] font-semibold text-primary"
          >
            <Sparkles className="h-4 w-4" />
            Riunione AI
          </Button>
        </div>
      ) : null}

      {/* Elenco (il filtro è stato rimosso — vedi nota) */}
      <h3 className="mb-3 px-1 text-sm font-semibold text-foreground">Elenco</h3>

      {/* Lista contenuti */}
      <div className="space-y-3">
        {/* Da Fare list */}
        {todosShown.length > 0 ? (
          <CommessaTodoMobile
            todos={todosShown}
            currentUserId={currentUserId}
          />
        ) : riunioni.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 bg-background/50 p-5 text-center text-sm text-muted-foreground">
            <p>
              Nessun lavoro tracciato.
              {canWrite ? ' Crea il primo dai bottoni sopra.' : ''}
            </p>
          </div>
        ) : null}

        {/* Riunioni list */}
        {mostraRiunioni && riunioni.length > 0 ? (
          <section className="space-y-2 rounded-xl border border-primary/10 bg-primary/[0.04] p-3">
            <h3 className="flex items-center gap-1.5 px-0.5 text-xs font-semibold text-primary">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-primary"
                aria-hidden="true"
              />
              Riunioni ({riunioni.length})
            </h3>
            <CommessaRiunioniMobile
              riunioni={riunioni}
              commessaId={commessaId}
              canUpload={canWrite}
            />
          </section>
        ) : null}
      </div>

      {/* Dialogs */}
      {todoOpen ? (
        <CreaTodoDialog
          commessaId={commessaId}
          tecniciTenant={tecniciTenant}
          onClose={() => setTodoOpen(false)}
        />
      ) : null}
      {riunOpen ? (
        <CreaRiunioneDialog
          commessaId={commessaId}
          contestoCommessa={contestoCommessa}
          tecniciTenant={tecniciTenant}
          onClose={() => setRiunOpen(false)}
        />
      ) : null}
    </div>
  );
}


'use client';

import * as React from 'react';
import {
  ChevronDown,
  Plus,
  Sparkles,
} from 'lucide-react';
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

type Filtro =
  | 'tutto'
  | 'todo_aperti'
  | 'todo_completati'
  | 'riunioni';

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
  const [filtro, setFiltro] = React.useState<Filtro>('tutto');
  const [todoOpen, setTodoOpen] = React.useState(false);
  const [riunOpen, setRiunOpen] = React.useState(false);

  // ─── Conteggi (sempre calcolati su lista completa) ─────────────────
  const todosAperti = todos.filter(
    (t) => t.stato === 'aperto' || t.stato === 'in_corso',
  );
  const todosCompletati = todos.filter((t) => t.stato === 'completato');

  // ─── Filtraggio per la vista ───────────────────────────────────────
  let todosShown: TodoMobileRow[] = [];
  let mostraRiunioni = true;
  switch (filtro) {
    case 'tutto':
      todosShown = todos; // tutti: aperti + completati + annullati
      mostraRiunioni = true;
      break;
    case 'todo_aperti':
      todosShown = todosAperti;
      mostraRiunioni = false;
      break;
    case 'todo_completati':
      todosShown = todosCompletati;
      mostraRiunioni = false;
      break;
    case 'riunioni':
      todosShown = [];
      mostraRiunioni = true;
      break;
  }

  const totale = todosAperti.length + riunioni.length;

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

      {/* Filtro compatto (dropdown) — leggero, non occupa tutta la riga */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Mostra</span>
        <div className="relative">
          <select
            aria-label="Filtra lavori"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value as Filtro)}
            className="h-9 appearance-none rounded-full border border-border bg-card pl-3.5 pr-9 text-[13px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="tutto">Tutto ({totale})</option>
            <option value="todo_aperti">Da fare ({todosAperti.length})</option>
            <option value="riunioni">Riunioni ({riunioni.length})</option>
            <option value="todo_completati">Fatti ({todosCompletati.length})</option>
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Lista contenuti */}
      <div className="space-y-3">
        {/* Da Fare list */}
        {todosShown.length > 0 ? (
          <CommessaTodoMobile
            todos={todosShown}
            currentUserId={currentUserId}
          />
        ) : filtro !== 'riunioni' ? (
          <div className="rounded-lg border border-dashed border-border/60 bg-background/50 p-5 text-center text-sm text-muted-foreground">
            {filtro === 'todo_completati' ? (
              <p>Nessun da fare completato di recente.</p>
            ) : filtro === 'tutto' && riunioni.length === 0 ? (
              <p>
                Nessun lavoro tracciato.
                {canWrite ? ' Crea il primo dai bottoni sopra.' : ''}
              </p>
            ) : (
              <p>Nessun da fare aperto.</p>
            )}
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


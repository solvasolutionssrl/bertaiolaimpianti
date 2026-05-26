'use client';

import * as React from 'react';
import {
  CheckCircle2,
  CircleDot,
  Plus,
  Sparkles,
} from 'lucide-react';
import { Button, cn } from '@kommessa/ui';

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
      {/* Container visivo — raggruppa azioni + filtri + lista */}
      <div className="overflow-hidden rounded-2xl border border-border/50 bg-muted/20">

        {/* Action bar — solo per admin/office */}
        {canWrite ? (
          <div className="grid grid-cols-2 gap-2 border-b border-border/40 bg-muted/10 p-3">
            <Button
              onClick={() => setTodoOpen(true)}
              size="sm"
              className="h-9 justify-center gap-1.5 text-[13px] font-semibold"
            >
              <Plus className="h-4 w-4" />
              Nuovo TODO
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRiunOpen(true)}
              className="h-9 justify-center gap-1.5 border-primary/40 text-[13px] font-semibold text-primary"
            >
              <Sparkles className="h-4 w-4" />
              Riunione AI
            </Button>
          </div>
        ) : null}

        {/* Filtri a griglia fissa — 4 opzioni, no scroll */}
        <div className="grid grid-cols-4 gap-0.5 border-b border-border/40 bg-muted/30 p-1.5">
          <FiltroChip
            label="Tutto"
            count={totale}
            active={filtro === 'tutto'}
            onClick={() => setFiltro('tutto')}
          />
          <FiltroChip
            label="TODO"
            count={todosAperti.length}
            active={filtro === 'todo_aperti'}
            onClick={() => setFiltro('todo_aperti')}
            Icon={CircleDot}
          />
          <FiltroChip
            label="Riunioni"
            count={riunioni.length}
            active={filtro === 'riunioni'}
            onClick={() => setFiltro('riunioni')}
            Icon={Sparkles}
          />
          <FiltroChip
            label="Fatti"
            count={todosCompletati.length}
            active={filtro === 'todo_completati'}
            onClick={() => setFiltro('todo_completati')}
            Icon={CheckCircle2}
            muted
          />
        </div>

        {/* Lista contenuti */}
        <div className="space-y-2 p-3">
          {/* TODO list */}
          {todosShown.length > 0 ? (
            <CommessaTodoMobile
              todos={todosShown}
              currentUserId={currentUserId}
            />
          ) : filtro !== 'riunioni' ? (
            <div className="rounded-lg border border-dashed border-border/60 bg-background/50 p-5 text-center text-sm text-muted-foreground">
              {filtro === 'todo_completati' ? (
                <p>Nessun TODO completato di recente.</p>
              ) : filtro === 'tutto' && riunioni.length === 0 ? (
                <p>
                  Nessun lavoro tracciato.
                  {canWrite ? ' Crea il primo dai bottoni sopra.' : ''}
                </p>
              ) : (
                <p>Nessun TODO aperto.</p>
              )}
            </div>
          ) : null}

          {/* Riunioni list */}
          {mostraRiunioni && riunioni.length > 0 ? (
            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 px-1 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
                <span
                  className="inline-block h-1 w-1 rounded-full bg-primary"
                  aria-hidden="true"
                />
                Riunioni ({riunioni.length})
              </h3>
              <CommessaRiunioniMobile riunioni={riunioni} />
            </section>
          ) : null}
        </div>
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

function FiltroChip({
  label,
  count,
  active,
  onClick,
  Icon,
  muted,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  Icon?: React.ComponentType<{ className?: string }>;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-medium transition-colors',
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : muted
            ? 'text-muted-foreground hover:bg-muted/60'
            : 'text-foreground hover:bg-muted/60',
      )}
    >
      <span className="flex items-center gap-1">
        {Icon ? <Icon className="h-3 w-3 shrink-0" /> : null}
        <span className="truncate">{label}</span>
      </span>
      <span
        className={cn(
          'rounded-full px-1.5 font-mono text-[9px] tabular-nums',
          active ? 'bg-primary-foreground/25 text-primary-foreground' : 'bg-muted text-muted-foreground',
        )}
      >
        {count}
      </span>
    </button>
  );
}

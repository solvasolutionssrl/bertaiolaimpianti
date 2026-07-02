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

      {/* Filtri — pill comode e tappabili, riga scrollabile */}
      <p className="mb-2.5 px-1 text-xs font-medium text-muted-foreground">Filtra</p>
      <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
        <FiltroChip
          label="Tutto"
          count={totale}
          active={filtro === 'tutto'}
          onClick={() => setFiltro('tutto')}
        />
        <FiltroChip
          label="Da fare"
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
        'flex h-10 flex-none items-center gap-2 rounded-full border px-4 text-[13px] font-semibold transition-colors active:scale-[0.98]',
        active
          ? 'border-primary bg-primary text-primary-foreground shadow-soft'
          : muted
            ? 'border-border bg-card text-muted-foreground hover:bg-muted/50'
            : 'border-border bg-card text-foreground/80 hover:bg-muted/50',
      )}
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
      <span>{label}</span>
      <span
        className={cn(
          'rounded-full px-1.5 py-px text-[11px] font-bold tabular-nums',
          active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground',
        )}
      >
        {count}
      </span>
    </button>
  );
}

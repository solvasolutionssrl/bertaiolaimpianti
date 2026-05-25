'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Archive,
  Loader2,
  Hammer,
  ClipboardCheck,
} from 'lucide-react';
import { Button, StatoLed } from '@impiantixplus/ui';
import type { StatoCommessa } from '@impiantixplus/api/types';

import {
  spostaCommessaInStato,
  toggleCommessaCritica,
} from '../../../../_actions/sposta-commessa-stato';
import { ConfirmDialog } from '../../../../_components/confirm-dialog';

interface Props {
  commessaId: string;
  currentStato: StatoCommessa;
  isCritica: boolean;
}

interface Transition {
  to: StatoCommessa;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  tone: 'primary' | 'success' | 'archive';
  warn?: string;
}

/**
 * UI office per cambiare stato della commessa e fare toggle del flag
 * critica. Mostra solo le transizioni "in avanti" sensate; per riaprire
 * archiviate l'admin agisce direttamente su DB (caso raro).
 *
 * Flusso:
 *   bozza/aperta  → in_corso     (Promuovi a in lavorazione)
 *   in_corso      → collaudo     (Pronta per collaudo)
 *   collaudo      → completata   (Conferma completata)
 *   completata    → archiviata   (Archivia)
 *
 * "Critica" è un toggle indipendente — non sposta cartelle, è badge.
 */
function getNextTransitions(stato: StatoCommessa): Transition[] {
  switch (stato) {
    case 'bozza':
    case 'aperta':
      return [
        {
          to: 'in_corso',
          label: 'Promuovi a in lavorazione',
          Icon: Hammer,
          tone: 'primary',
          warn: 'La cartella verrà spostata da 01_Richieste a 02_In_Lavorazione su Nextcloud.',
        },
      ];
    case 'in_corso':
      return [
        {
          to: 'collaudo',
          label: 'Pronta per collaudo',
          Icon: ClipboardCheck,
          tone: 'primary',
        },
      ];
    case 'collaudo':
      return [
        {
          to: 'completata',
          label: 'Conferma completata',
          Icon: CheckCircle2,
          tone: 'success',
          warn: 'La cartella verrà spostata da 02_In_Lavorazione a 03_Completate su Nextcloud.',
        },
      ];
    case 'completata':
      return [
        {
          to: 'archiviata',
          label: 'Archivia',
          Icon: Archive,
          tone: 'archive',
          warn: 'La cartella verrà spostata da 03_Completate a 04_Archivio su Nextcloud.',
        },
      ];
    default:
      return [];
  }
}

export function StatoControls({ commessaId, currentStato, isCritica }: Props) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [pendingCritica, setPendingCritica] = React.useState(false);
  const [confirm, setConfirm] = React.useState<{ open: boolean; t?: Transition }>({ open: false });
  const [error, setError] = React.useState<string | null>(null);

  const transitions = getNextTransitions(currentStato);

  const onTransitionClick = (t: Transition) => {
    setError(null);
    if (t.warn) {
      setConfirm({ open: true, t });
      return;
    }
    void doTransition(t);
  };

  const doTransition = async (t: Transition) => {
    setPending(true);
    setError(null);
    setConfirm({ open: false });
    const res = await spostaCommessaInStato({ commessaId, newStato: t.to });
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  };

  const onToggleCritica = async () => {
    setPendingCritica(true);
    setError(null);
    const res = await toggleCommessaCritica({
      commessaId,
      isCritica: !isCritica,
    });
    setPendingCritica(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {transitions.map((t) => (
        <Button
          key={t.to}
          type="button"
          size="sm"
          variant={t.tone === 'archive' ? 'outline' : 'default'}
          onClick={() => onTransitionClick(t)}
          disabled={pending}
          className={
            t.tone === 'success'
              ? 'bg-success text-success-foreground hover:bg-success/90'
              : t.tone === 'archive'
                ? ''
                : ''
          }
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <t.Icon className="h-3.5 w-3.5" />
          )}
          {t.label}
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      ))}

      <Button
        type="button"
        size="sm"
        variant={isCritica ? 'default' : 'outline'}
        onClick={onToggleCritica}
        disabled={pendingCritica}
        className={
          isCritica
            ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
            : 'text-destructive hover:text-destructive'
        }
        aria-pressed={isCritica}
        title={isCritica ? 'Rimuovi flag critica' : 'Segna come critica'}
      >
        {pendingCritica ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5" />
        )}
        {isCritica ? 'Critica' : 'Segna critica'}
      </Button>

      {error && (
        <span className="ml-2 text-xs text-destructive" role="alert">
          {error}
        </span>
      )}

      <ConfirmDialog
        open={confirm.open}
        title="Confermi il cambio di stato?"
        description={confirm.t?.warn ?? ''}
        confirmLabel={confirm.t?.label ?? 'Conferma'}
        cancelLabel="Annulla"
        onConfirm={() => confirm.t && doTransition(confirm.t)}
        onCancel={() => setConfirm({ open: false })}
      />
    </div>
  );
}

/** Mini chip che mostra lo stato attuale con LED — usato in header. */
export function StatoChip({ stato, isCritica }: { stato: StatoCommessa; isCritica: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs">
      <StatoLed stato={stato} />
      <span className="font-medium capitalize">{stato.replace('_', ' ')}</span>
      {isCritica && (
        <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-destructive/15 px-1.5 py-px font-mono text-[10px] font-bold uppercase text-destructive">
          <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
          Critica
        </span>
      )}
    </span>
  );
}

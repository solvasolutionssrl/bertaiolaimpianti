'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Archive,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  CircleDot,
  Edit3,
  Hammer,
  Loader2,
} from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  StatoLed,
  cn,
} from '@kommessa/ui';
import type { StatoCommessa } from '@kommessa/api/types';

import {
  spostaCommessaInStato,
  toggleCommessaCritica,
} from '../../../../_actions/sposta-commessa-stato';
import { useAlert, useConfirm } from '@/app/_components/confirm-provider';

interface Props {
  commessaId: string;
  currentStato: StatoCommessa;
  isCritica: boolean;
  assegnata: boolean;
}

/**
 * Lista stati con icona + label umana + scaffold target.
 * "Non preso" non è un valore DB — è una label UI che usiamo quando lo
 * stato è bozza/aperta e nessun tecnico è assegnato. Quindi qui solo
 * stati reali.
 */
interface StatoInfo {
  value: StatoCommessa;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  scaffold: '01_Richieste' | '02_In_Lavorazione' | '03_Completate' | '04_Archivio';
  /** Ordine logico del workflow (per separare "indietro" da "avanti"). */
  order: number;
}

const STATI: StatoInfo[] = [
  { value: 'bozza', label: 'Bozza', Icon: Edit3, scaffold: '01_Richieste', order: 0 },
  { value: 'aperta', label: 'Aperta', Icon: CircleDot, scaffold: '01_Richieste', order: 1 },
  { value: 'in_corso', label: 'In corso', Icon: Hammer, scaffold: '02_In_Lavorazione', order: 2 },
  { value: 'collaudo', label: 'In collaudo', Icon: ClipboardCheck, scaffold: '02_In_Lavorazione', order: 3 },
  { value: 'completata', label: 'Completata', Icon: CheckCircle2, scaffold: '03_Completate', order: 4 },
  { value: 'archiviata', label: 'Archiviata', Icon: Archive, scaffold: '04_Archivio', order: 5 },
];

const BY_VALUE: Record<StatoCommessa, StatoInfo> = Object.fromEntries(
  STATI.map((s) => [s.value, s]),
) as Record<StatoCommessa, StatoInfo>;

/**
 * Picker stato sidebar — etichetta corrente + dropdown con tutti gli
 * stati. Selezione di uno stato diverso da quello corrente:
 *  - se cambia di scaffold → confirm dialog (avviso che la cartella
 *    verrà spostata su Nextcloud, con MOVE atomico)
 *  - se stesso scaffold (es. bozza → aperta) → cambio immediato, niente
 *    confirm
 *
 * Bottone "Critica" toggle ortogonale: badge UI, non sposta cartelle.
 *
 * UX rispetto al pattern "linear next-transition" precedente:
 *  + flessibilità di tornare indietro (es. completata → in_corso) per
 *    correggere errori
 *  + label umane più chiare
 *  + un solo widget invece di tre bottoni separati
 */
export function StatoPicker({
  commessaId,
  currentStato,
  isCritica,
  assegnata,
}: Props) {
  const router = useRouter();
  const askConfirm = useConfirm();
  const showAlert = useAlert();
  const [pending, setPending] = React.useState(false);
  const [pendingCritica, setPendingCritica] = React.useState(false);

  const current = BY_VALUE[currentStato];
  const CurrentIcon = current.Icon;
  // "Non preso" come label decorativa quando aperta/bozza senza assegnati
  const headLabel =
    (currentStato === 'aperta' || currentStato === 'bozza') && !assegnata
      ? 'Non preso'
      : current.label;

  const onPick = async (target: StatoInfo) => {
    if (target.value === currentStato) return;
    if (target.scaffold !== current.scaffold) {
      const ok = await askConfirm({
        title: `Spostare in "${target.label}"?`,
        description: `La cartella della commessa verrà spostata da ${current.scaffold} a ${target.scaffold} su Nextcloud. Il MOVE è atomico — file dentro restano dove sono.`,
        confirmLabel: 'Sposta e cambia stato',
      });
      if (!ok) return;
    }
    setPending(true);
    const res = await spostaCommessaInStato({
      commessaId,
      newStato: target.value,
    });
    setPending(false);
    if (!res.ok) {
      await showAlert({ title: 'Errore', body: res.error });
      return;
    }
    router.refresh();
  };

  const onToggleCritica = async () => {
    setPendingCritica(true);
    const res = await toggleCommessaCritica({
      commessaId,
      isCritica: !isCritica,
    });
    setPendingCritica(false);
    if (!res.ok) {
      await showAlert({ title: 'Errore', body: res.error });
      return;
    }
    router.refresh();
  };

  const avanti = STATI.filter((s) => s.order > current.order);
  const indietro = STATI.filter(
    (s) => s.order < current.order && s.value !== currentStato,
  );

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Stato commessa
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={pending}
              className={cn(
                'group flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 disabled:opacity-50',
              )}
            >
              <span className="flex items-center gap-2">
                <StatoLed stato={currentStato} />
                <CurrentIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">{headLabel}</span>
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[260px]">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Cambia stato
            </DropdownMenuLabel>
            <DropdownMenuItem disabled className="opacity-100">
              <StatoLed stato={currentStato} />
              <span className="font-medium">{current.label}</span>
              <Check className="ml-auto h-3.5 w-3.5 text-emerald-600" />
            </DropdownMenuItem>
            {avanti.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Avanti nel workflow
                </DropdownMenuLabel>
                {avanti.map((s) => {
                  const Icon = s.Icon;
                  const sameScaffold = s.scaffold === current.scaffold;
                  return (
                    <DropdownMenuItem
                      key={s.value}
                      onSelect={() => void onPick(s)}
                      disabled={pending}
                    >
                      <StatoLed stato={s.value} />
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{s.label}</span>
                      {!sameScaffold ? (
                        <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                          → {s.scaffold.split('_')[1] ?? s.scaffold}
                        </span>
                      ) : null}
                    </DropdownMenuItem>
                  );
                })}
              </>
            ) : null}
            {indietro.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Torna indietro
                </DropdownMenuLabel>
                {indietro.map((s) => {
                  const Icon = s.Icon;
                  return (
                    <DropdownMenuItem
                      key={s.value}
                      onSelect={() => void onPick(s)}
                      disabled={pending}
                    >
                      <StatoLed stato={s.value} />
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{s.label}</span>
                    </DropdownMenuItem>
                  );
                })}
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Critica toggle */}
      <button
        type="button"
        onClick={onToggleCritica}
        disabled={pendingCritica}
        aria-pressed={isCritica}
        className={cn(
          'flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50',
          isCritica
            ? 'border-destructive bg-destructive/10 text-destructive hover:bg-destructive/15'
            : 'border-border bg-card text-muted-foreground hover:text-destructive',
        )}
      >
        {pendingCritica ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5" />
        )}
        {isCritica ? 'Critica · attiva' : 'Segna come critica'}
      </button>

      {pending ? (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Sposto la cartella…
        </p>
      ) : null}
    </div>
  );
}

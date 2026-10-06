import Link from 'next/link';
import { Card, CardContent, Skeleton } from '@kommessa/ui';
import {
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Clock,
  ListChecks,
} from 'lucide-react';
import { getTodoDaGestire, type TodoDaGestireRow } from '../_lib/queries';
import { fmtData } from '../_lib/format';
import { PRIORITA, metaPriorita, type Priorita } from '@kommessa/api/priorita';
import { PrioritaChip } from '@/app/_components/priorita-ui';

/**
 * Macro-card "Cose da gestire · Da fare (to-do)" della dashboard.
 * Mostra TUTTI i TODO ancora aperti del tenant, divisi in colonne per
 * priorità (Urgente / Alta / Media / Bassa). Card compatte cliccabili →
 * portano al tab Lavori della commessa.
 */


// Tre colonne invece di quattro: dall'urgente al normale. La tavolozza
// locale (che usava opacita' `/12` e `/30` mentre tutto il resto dell'app
// usava `/15` e `/40`, e l'icona Clock invece di Circle) e' sparita.
const ORDINE: Priorita[] = [...PRIORITA];

export async function TodoDaGestireSection() {
  const rows = await getTodoDaGestire();
  const totale = rows.length;
  const perPriorita = new Map<Priorita, TodoDaGestireRow[]>();
  for (const p of ORDINE) perPriorita.set(p, []);
  for (const r of rows) perPriorita.get(r.priorita)?.push(r);

  return (
    <Card className="overflow-hidden">
      <BoardHeader totale={totale} />
      <CardContent className="p-3 sm:p-4">
        {totale === 0 ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-10 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium">Niente da gestire</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Nessun TODO aperto sulle commesse. Tutto sotto controllo.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {ORDINE.map((p) => (
              <PriorityColumn key={p} priorita={p} items={perPriorita.get(p) ?? []} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BoardHeader({ totale }: { totale: number }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary [&_svg]:size-4"
        >
          <ListChecks />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            Da fare · to-do
          </p>
          <h2 className="text-lg font-semibold leading-tight tracking-tight">
            Elementi da gestire
          </h2>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {totale} apert{totale === 1 ? 'o' : 'i'}
        </span>
        <Link
          href="/office/todo"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Tutti
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

function PriorityColumn({
  priorita,
  items,
}: {
  priorita: Priorita;
  items: TodoDaGestireRow[];
}) {
  const m = metaPriorita(priorita);
  return (
    <div className="flex min-w-0 flex-col rounded-lg border border-border bg-muted/25">
      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
        <PrioritaChip priorita={priorita} className="rounded-full font-semibold" />
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {items.length}
        </span>
      </div>
      <div className="max-h-[26rem] space-y-1.5 overflow-y-auto px-1.5 pb-2">
        {items.length === 0 ? (
          <p className="px-1.5 py-3 text-center text-[11px] text-muted-foreground/70">
            Nessuno
          </p>
        ) : (
          items.map((t) => <TodoMiniCard key={t.id} t={t} accent={m.punto} />)
        )}
      </div>
    </div>
  );
}

function TodoMiniCard({ t, accent }: { t: TodoDaGestireRow; accent: string }) {
  return (
    <Link
      href={
        // Una richiesta non ha una commessa dove atterrare: si va alla lista.
        t.commessa_id
          ? `/office/commesse/${t.commessa_id}/lavori`
          : '/office/todo?tipo=richieste'
      }
      className="group relative block overflow-hidden rounded-md border border-border bg-card p-2 shadow-soft transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-soft-md"
    >
      <span aria-hidden className={`absolute inset-y-1.5 left-0 w-[2px] rounded-full ${accent}`} />
      <p className="line-clamp-2 pl-1.5 text-[12.5px] font-medium leading-snug">
        {t.titolo}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 pl-1.5 text-[10.5px] text-muted-foreground">
        {t.codice_interno ? (
          <span className="font-mono tabular-nums">{t.codice_interno}</span>
        ) : null}
        {t.cliente_nome ? <span className="truncate">· {t.cliente_nome}</span> : null}
      </div>
      {t.scadenza_at ? (
        <div
          className={`mt-1 inline-flex items-center gap-1 pl-1.5 text-[10.5px] ${
            t.isScaduto ? 'font-semibold text-destructive' : 'text-muted-foreground'
          }`}
        >
          <Calendar className="h-3 w-3" />
          {fmtData(t.scadenza_at)}
          {t.isScaduto ? ' · scaduto' : ''}
        </div>
      ) : null}
    </Link>
  );
}

export function TodoDaGestireSkeleton() {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-md" />
          <div className="space-y-1.5">
            <Skeleton className="h-2.5 w-20 rounded-full" />
            <Skeleton className="h-4 w-32 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <CardContent className="p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-border bg-muted/25 p-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

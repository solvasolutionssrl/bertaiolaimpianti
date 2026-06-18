import { Button, Card, CardContent } from '@kommessa/ui';
import { HardHat, MapPin, Pencil, User2, Calendar, FileText } from 'lucide-react';
import Link from 'next/link';

import { requireTenantContext } from '@kommessa/api/tenant';

import { loadCommessa } from './_lib/get-commessa';
import { fmtData } from '../../_lib/format';
import { DettagliEdit } from '../../../_components/dettagli-edit';
import { DescrizioneCantiereEdit } from '../../../_components/descrizione-cantiere-edit';
import { LavoriSection } from './_components/lavori-section';

export const dynamic = 'force-dynamic';

const STATO_LABEL: Record<string, string> = {
  bozza: 'Bozza',
  aperta: 'Aperta',
  in_corso: 'In corso',
  collaudo: 'Collaudo',
  completata: 'Completata',
  archiviata: 'Archiviata',
};

/**
 * Tab Commessa (landing) — hub operativo.
 *  1) Riepilogo: nome (descrizione editabile), stato, cliente, responsabile,
 *     cantiere, data + "Modifica completa" verso /modifica.
 *  2) Descrizione cantiere: titolo/descrizione editabile inline (matita).
 *  3) Dettagli del lavoro / cose da fare: nota del capo + TODO/Riunioni (ex tab Lavori).
 */
export default async function CommessaTab({
  params,
}: {
  params: { id: string };
}) {
  const ctx = await requireTenantContext();
  const c = await loadCommessa(params.id);
  const cliente = Array.isArray(c.cliente) ? c.cliente[0] : c.cliente;
  const resp = Array.isArray(c.responsabile) ? c.responsabile[0] : c.responsabile;

  const canEdit = ctx.role === 'admin' || ctx.role === 'office';
  const titolo =
    (c.descrizione_ai_finale ?? c.descrizione_ai_proposta ?? '').trim() || null;
  const stato = (c.stato as string) ?? 'aperta';

  return (
    <div className="space-y-4">
      {/* 1) Riepilogo */}
      <Card className="border-primary/15 bg-gradient-to-br from-primary/[0.04] via-transparent to-transparent">
        <CardContent className="space-y-3 px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary/80">
                  {c.codice_interno}
                </span>
                <StatoChip stato={stato} />
              </div>
              <h2 className="mt-1 break-words text-xl font-semibold leading-snug text-foreground">
                {titolo ?? (
                  <span className="italic text-muted-foreground">Senza descrizione</span>
                )}
              </h2>
            </div>
            {canEdit ? (
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href={`/office/commesse/${params.id}/modifica`}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  Modifica
                </Link>
              </Button>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
            <MetaRow icon={<User2 />} label="Cliente">
              {cliente?.id ? (
                <Link
                  href={`/office/clienti/${cliente.id}`}
                  className="font-medium text-foreground hover:text-primary hover:underline"
                >
                  {cliente.ragione_sociale ?? '—'}
                </Link>
              ) : (
                <span className="font-medium">{cliente?.ragione_sociale ?? '—'}</span>
              )}
            </MetaRow>
            <MetaRow icon={<HardHat />} label="Responsabile">
              {resp?.display_name ?? '—'}
            </MetaRow>
            <MetaRow icon={<MapPin />} label="Cantiere">
              {c.cliente_indirizzo_cantiere || '—'}
            </MetaRow>
            <MetaRow icon={<Calendar />} label="Apertura">
              {fmtData(c.data_apertura as string | null | undefined)}
            </MetaRow>
          </div>
        </CardContent>
      </Card>

      {/* 2) Descrizione cantiere */}
      <Card className="relative">
        <CardContent className="px-4 py-3">
          <div className="mb-1 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              Descrizione cantiere
            </p>
            <DescrizioneCantiereEdit
              commessaId={params.id}
              initial={titolo}
              canEdit={canEdit}
            />
          </div>
          {titolo ? (
            <p className="text-sm leading-relaxed text-foreground/90">{titolo}</p>
          ) : (
            <p className="text-sm italic text-muted-foreground">
              Nessuna descrizione. Usa la matita per aggiungere il nome/descrizione
              della commessa (non rinomina la cartella).
            </p>
          )}
        </CardContent>
      </Card>

      {/* 3) Dettagli del lavoro / cose da fare */}
      <Card className="relative border-amber-500/20 bg-amber-50/30 dark:bg-amber-950/10">
        <CardContent className="px-4 py-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <HardHat className="h-3.5 w-3.5" aria-hidden="true" />
            Dettagli del lavoro
          </p>
          {c.note_iniziali ? (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
              {c.note_iniziali}
            </p>
          ) : (
            <p className="text-sm italic text-muted-foreground">
              Nessuna nota. Usa la matita per aggiungere il contesto del lavoro,
              visibile ai tecnici in cantiere.
            </p>
          )}
          <DettagliEdit
            commessaId={params.id}
            initial={(c.note_iniziali as string | null) ?? null}
            canEdit={canEdit}
          />
        </CardContent>
      </Card>

      {/* Cose da fare: TODO + Riunioni (ex tab Lavori) */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Cose da fare
        </p>
        <LavoriSection id={params.id} />
      </div>
    </div>
  );
}

function StatoChip({ stato }: { stato: string }) {
  const tone: Record<string, string> = {
    bozza: 'bg-muted text-muted-foreground',
    aperta: 'bg-primary/10 text-primary',
    in_corso: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    collaudo: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    completata: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    archiviata: 'bg-muted text-muted-foreground',
  };
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        tone[stato] ?? 'bg-muted text-muted-foreground',
      ].join(' ')}
    >
      {STATO_LABEL[stato] ?? stato}
    </span>
  );
}

function MetaRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="flex w-24 shrink-0 items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground [&_svg]:h-3 [&_svg]:w-3">
        {icon}
        {label}
      </span>
      <span className="min-w-0 break-words text-foreground/90">{children}</span>
    </div>
  );
}

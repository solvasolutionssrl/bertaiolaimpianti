import Link from 'next/link';
import { ArrowLeft, FileText } from 'lucide-react';
import { Button } from '@impiantixplus/ui';
import type { StatoCommessa } from '@impiantixplus/api/types';

import { loadCommessa } from './_lib/get-commessa';
import { fmtData } from '../../_lib/format';
import { CommessaTabs } from './_components/commessa-tabs';
import { StatoChip, StatoControls } from './_components/stato-controls';

export default async function CommessaLayout({
  params,
  children,
}: {
  params: { id: string };
  children: React.ReactNode;
}) {
  const c = await loadCommessa(params.id);
  const cliente = Array.isArray(c.cliente) ? c.cliente[0] : c.cliente;
  const resp = Array.isArray(c.responsabile) ? c.responsabile[0] : c.responsabile;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-6">
      <Link
        href="/office/commesse"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        Torna alla lista
      </Link>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-xl font-semibold">{c.codice_interno}</h1>
          <span className="text-xl">·</span>
          <span className="text-xl font-medium">
            {cliente?.ragione_sociale ?? '—'}
          </span>
          <StatoChip
            stato={c.stato as StatoCommessa}
            isCritica={Boolean(c.is_critica)}
          />
          <div className="ml-auto">
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link
                href={`/office/commesse/${params.id}/report`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FileText className="h-4 w-4" />
                Genera report di chiusura
              </Link>
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {c.cliente_indirizzo_cantiere ? `${c.cliente_indirizzo_cantiere} · ` : ''}
          Resp: {resp?.display_name ?? '—'} · Aperta il {fmtData(c.data_apertura)}
        </p>
        <p className="text-sm">
          <span className="text-muted-foreground">Cartella: </span>
          <span className="font-mono">{c.nome_cartella}</span>
        </p>

        {/* Controlli stato + critica */}
        <StatoControls
          commessaId={params.id}
          currentStato={c.stato as StatoCommessa}
          isCritica={Boolean(c.is_critica)}
        />
      </header>

      <CommessaTabs id={params.id} />

      <div>{children}</div>
    </div>
  );
}

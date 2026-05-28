import Link from 'next/link';
import { ArrowLeft, FileText } from 'lucide-react';
import { Button } from '@kommessa/ui';
import type { StatoCommessa } from '@kommessa/api/types';

import { loadCommessa } from './_lib/get-commessa';
import { CommessaTabs } from './_components/commessa-tabs';
import { CommessaSidebar } from './_components/commessa-sidebar';
import {
  elencaTecniciAssegnati,
  elencaTecniciTenant,
} from '../../../_actions/commessa-tecnici';
import { requireTenantContext } from '@kommessa/api/tenant';

export default async function CommessaLayout({
  params,
  children,
}: {
  params: { id: string };
  children: React.ReactNode;
}) {
  const c = await loadCommessa(params.id);
  const ctx = await requireTenantContext();
  const cliente = Array.isArray(c.cliente) ? c.cliente[0] : c.cliente;
  const resp = Array.isArray(c.responsabile) ? c.responsabile[0] : c.responsabile;
  const canManageTecnici = ctx.role === 'admin' || ctx.role === 'office';

  // Carica in parallelo tecnici assegnati + rosa disponibile (per il picker)
  const [tecniciAssegnati, tecniciTenant] = await Promise.all([
    elencaTecniciAssegnati(params.id),
    canManageTecnici ? elencaTecniciTenant() : Promise.resolve([]),
  ]);

  return (
    <div className="w-full space-y-3 px-4 pb-6 pt-3 md:px-6 md:pb-8 md:pt-4">
      <Link
        href="/office/commesse"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        Torna alla lista
      </Link>

      {/* Header compatto: codice + cliente + report button, niente più
          controlli stato inline (vivono nella sidebar) */}
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-xl font-semibold">{c.codice_interno}</h1>
        <span className="text-xl text-muted-foreground">·</span>
        <span className="break-words text-xl font-medium">
          {cliente?.ragione_sociale ?? '—'}
        </span>
        <div className="ml-auto">
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link
              href={`/office/commesse/${params.id}/report`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <FileText className="h-4 w-4" />
              Report di chiusura
            </Link>
          </Button>
        </div>
      </header>

      {/* Layout 2 colonne su desktop: main (tab + content) + sidebar
          (stato, tecnici, meta). Su mobile la sidebar cade sopra (order).
          Sidebar 340px su xl, 300px su lg per dare più respiro al main. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4 lg:order-1">
          <CommessaTabs id={params.id} />
          <div>{children}</div>
        </div>
        <div className="lg:order-2">
          <CommessaSidebar
            commessaId={params.id}
            stato={c.stato as StatoCommessa}
            isCritica={Boolean(c.is_critica)}
            nomeCartella={c.nome_cartella ?? ''}
            cloudFolderPath={c.cloud_folder_path ?? null}
            indirizzoCantiere={c.cliente_indirizzo_cantiere ?? null}
            responsabileNome={resp?.display_name ?? null}
            dataApertura={c.data_apertura ?? null}
            tecniciAssegnati={tecniciAssegnati}
            tecniciTenant={tecniciTenant}
            canManageTecnici={canManageTecnici}
          />
        </div>
      </div>
    </div>
  );
}

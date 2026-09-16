import { requireTenantContext } from '@kommessa/api/tenant';
import { CAUSALI_ESSEPAGHE } from '@kommessa/api/paghe-causali';
import { PERMESSO_TIPI } from '@kommessa/api/permessi-tipi';

import { caricaMese } from './_lib/dati-mese';
import { PagheClient } from './_components/paghe-client';

/**
 * Export mensile delle presenze verso il programma paghe del consulente.
 *
 * Il mese si ricostruisce a ogni apertura: niente si congela, quindi una
 * correzione su una giornata si vede subito qui e nel file.
 */

export const dynamic = 'force-dynamic';

const MESE_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/;

function meseCorrente(): string {
  // Il mese di riferimento e' quello di Roma, non quello del server.
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
  })
    .format(new Date())
    .slice(0, 7);
}

export default async function ExportPaghePage({
  searchParams,
}: {
  searchParams?: { mese?: string };
}) {
  const ctx = await requireTenantContext();
  const richiesto = searchParams?.mese ?? '';
  const periodo = MESE_VALIDO.test(richiesto) ? richiesto : meseCorrente();

  const mese = await caricaMese(ctx.tenantId, periodo);

  // Il dizionario completo va al browser una volta sola: serve al selettore
  // delle causali e alla spiegazione delle sigle, che senza descrizione sono
  // illeggibili.
  const catalogo = [...mese.config.causaliExtra, ...CAUSALI_ESSEPAGHE];

  return (
    <PagheClient
      mese={mese}
      catalogo={catalogo}
      codiciPersonalizzati={mese.config.causaliExtra.map((c) => c.codice)}
      tipiAssenza={PERMESSO_TIPI.map((t) => ({ codice: t.codice, label: t.label }))}
    />
  );
}

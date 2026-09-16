import { type NextRequest } from 'next/server';

import { requireTenantContext } from '@kommessa/api/tenant';
import { NOME_FILE, validaTracciato } from '@kommessa/api/paghe-essepaghe';

import { tenantHasModule } from '@/app/_lib/modules';
import { caricaMese } from '@/app/office/personalizzazioni/paghe/_lib/dati-mese';

/**
 * Scarica il file delle presenze del mese.
 *
 * Il file si costruisce al momento, dagli stessi dati che si vedono a schermo:
 * quello che l'ufficio ha approvato e' quello che scende. L'ultimo controllo
 * sulle lunghezze si rifa' qui, perche' e' questo il byte che arriva allo
 * Studio, non quello dell'anteprima.
 */

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ctx = await requireTenantContext();
  if (!['owner', 'admin', 'office'].includes(ctx.role)) {
    return Response.json({ ok: false, error: 'Non autorizzato.' }, { status: 403 });
  }
  if (!(await tenantHasModule('paghe'))) {
    return Response.json({ ok: false, error: 'Funzione non attiva.' }, { status: 404 });
  }

  const periodo = req.nextUrl.searchParams.get('periodo') ?? '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) {
    return Response.json({ ok: false, error: 'Mese non valido.' }, { status: 400 });
  }

  const mese = await caricaMese(ctx.tenantId, periodo);
  if (!mese.esito.testo) {
    const motivo = mese.config.codiceDitta
      ? 'Non ci sono variazioni da comunicare per questo mese.'
      : 'Manca il codice ditta dello Studio: impostalo prima di scaricare il file.';
    return Response.json({ ok: false, error: motivo }, { status: 409 });
  }

  const problemi = validaTracciato(mese.esito.testo);
  if (problemi.length > 0) {
    return Response.json(
      { ok: false, error: problemi[0]?.messaggio ?? 'Il file non rispetta il tracciato.' },
      { status: 500 },
    );
  }

  // Il tracciato e' ASCII: si scrive byte per byte, senza lasciare che la
  // codifica del server ci metta del suo.
  const corpo = Buffer.from(mese.esito.testo, 'ascii');
  return new Response(corpo, {
    headers: {
      'Content-Type': 'text/plain; charset=us-ascii',
      'Content-Disposition': `attachment; filename="${NOME_FILE}"`,
      'Content-Length': String(corpo.length),
      'Cache-Control': 'no-store',
    },
  });
}

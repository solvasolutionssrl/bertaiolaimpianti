import { type NextRequest } from 'next/server';

import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import {
  getR2ProviderFromEnv,
  getR2ProviderFromTenantConfig,
} from '@kommessa/integrations/storage';

import { tenantHasModule } from '@/app/_lib/modules';
import { leggiConfigDipendenti } from '@/app/_lib/dipendenti-config';

/**
 * Riapre il documento allegato a un'assenza (il certificato del medico).
 *
 * Prima di questa route il file finiva su R2 e non lo rivedeva piu' nessuno:
 * l'interfaccia diceva «in archivio» e si fermava li'. Un archivio da cui non
 * si estrae niente non e' un archivio, e' un buco con dentro dei documenti.
 *
 * Risponde con un 302 verso un indirizzo firmato che scade in 5 minuti, come
 * le ricevute delle spese: il contenuto non passa mai da un indirizzo pubblico.
 *
 * ⚠️ **Due lucchetti, non uno.** La query passa dal client dell'utente, quindi
 * la RLS tiene fuori i tecnici: su `paghe_certificati` la lettura e' riservata
 * a owner/admin/office. Ma sulla stessa tabella c'e' anche una policy per il
 * super admin di piattaforma, che vede tutti i clienti — e il magazzino dei
 * documenti, quando il cliente non ne ha uno suo, e' lo stesso per tutti.
 * Senza il filtro sul tenant scritto qui sotto, questa route servirebbe il
 * certificato medico di un cliente qualunque, per giunta da un indirizzo che
 * nessuna interfaccia espone. Il filtro **non e' ridondante**.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return Response.json({ error: 'Non autenticato' }, { status: 401 });
  }

  if (!(await tenantHasModule('dipendenti'))) {
    return Response.json({ error: 'Modulo non attivo' }, { status: 404 });
  }
  const supabase = createServerSupabase();
  if (!(await leggiConfigDipendenti(supabase, ctx.tenantId)).ferieAttiva) {
    return Response.json({ error: 'Ferie e permessi non attivi' }, { status: 404 });
  }

  const { data: row } = await supabase
    .from('paghe_certificati' as never)
    .select('id, r2_key, nome_file')
    .eq('id', params.id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  const certificato = row as { r2_key: string | null; nome_file: string | null } | null;
  if (!certificato?.r2_key) {
    return Response.json({ error: 'Nessun documento archiviato' }, { status: 404 });
  }

  const service = createServiceSupabase();
  const { data: tenantRow } = await service
    .from('tenants')
    .select('r2_config')
    .eq('id', ctx.tenantId)
    .maybeSingle();
  const r2 =
    getR2ProviderFromTenantConfig(
      (tenantRow?.r2_config as Record<string, unknown> | null) ?? null,
    ) ?? getR2ProviderFromEnv();
  if (!r2) return Response.json({ error: 'Archivio non configurato' }, { status: 503 });

  // Scaricare e' la norma per un certificato: si allega a una pratica, si
  // stampa, si gira al consulente. Con `?vista=1` si apre nel browser invece.
  const soloVista = request.nextUrl.searchParams.get('vista') === '1';
  const signed = await r2.createPresignedGetUrl(certificato.r2_key, {
    ttlSec: 300,
    ...(soloVista ? {} : { downloadAs: nomeScaricabile(certificato.nome_file, certificato.r2_key) }),
  });
  return Response.redirect(signed.url, 302);
}

/**
 * Un nome leggibile per il file scaricato. Accenti e spazi vanno tolti: il
 * nome finisce dentro un'intestazione HTTP, dove un carattere fuori posto
 * rompe la risposta invece di sporcare il nome.
 */
function nomeScaricabile(nome: string | null, key: string): string {
  const base = (nome || key.split('/').pop() || 'giustificativo')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(-80);
  return base || 'giustificativo';
}

import { redirect } from 'next/navigation';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';
import { nuoviDalGestionale } from '@/app/_lib/integrazione/nuovi';
import { DipendentiClient } from './_components/dipendenti-client';
import { NuoviDalGestionale } from './_components/nuovi-dal-gestionale';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Kantiere · Dipendenti' };

export interface DipendenteRow {
  id: string;
  nome: string;
  cognome: string;
  mansione: string | null;
  codice_interno: string | null;
  user_id: string | null;
  stato_attivo: boolean;
  a_turni: boolean;
  note: string | null;
}

export interface UtenteRow {
  id: string;
  display_name: string | null;
  role: string | null;
}

export default async function DipendentiPage() {
  if (!(await tenantHasModule('kantiere'))) redirect('/office');

  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();
  const { data: dipendenti } = await supabase
    .from('dipendenti' as never)
    .select('id, nome, cognome, mansione, codice_interno, user_id, stato_attivo, a_turni, note')
    .order('cognome');
  const { data: utenti } = await supabase
    .from('users')
    .select('id, display_name, role')
    .order('display_name');

  // Chi c'è sul gestionale e da noi no. Solo admin/office decidono: un tecnico
  // che apre l'anagrafica non deve trovarsi davanti una scelta che non è sua.
  const puoDecidere = ['owner', 'admin', 'office'].includes(ctx.role);
  const elenco = (dipendenti ?? []) as DipendenteRow[];
  const { sistema, nuovi, ignorati } = puoDecidere
    ? await nuoviDalGestionale(supabase, ctx.tenantId, 'dipendente')
    : { sistema: null, nuovi: [], ignorati: [] };

  // Chi è già collegato non si può scegliere di nuovo: lo stesso record del
  // gestionale su due persone imputerebbe le ore due volte.
  const externalPerDipendente = await (async () => {
    if (!sistema) return {} as Record<string, string>;
    const { data } = await supabase
      .from('integrazione_mappature' as never)
      .select('entita_id, external_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('sistema', sistema)
      .eq('entita', 'dipendente');
    return Object.fromEntries(
      ((data ?? []) as unknown as { entita_id: string; external_id: string }[]).map((r) => [
        r.entita_id,
        r.external_id,
      ]),
    );
  })();
  const collegatiIds = new Set(Object.keys(externalPerDipendente));

  return (
    <div className="w-full space-y-5">
      <header>
        <h1 className="text-lg font-semibold">Dipendenti</h1>
        <p className="text-sm text-muted-foreground">Anagrafica del personale di cantiere.</p>
      </header>
      <NuoviDalGestionale
        nuovi={nuovi}
        ignorati={ignorati}
        sistema={sistema}
        dipendenti={elenco.map((d) => ({
          id: d.id,
          etichetta: `${d.cognome} ${d.nome}${d.codice_interno ? ` · ${d.codice_interno}` : ''}`,
          collegato: collegatiIds.has(d.id),
        }))}
      />

      <DipendentiClient
        sistemaGestionale={sistema}
        externalPerDipendente={externalPerDipendente}
        dipendenti={elenco}
        utenti={(utenti ?? []) as UtenteRow[]}
        tenantSlug={ctx.tenantSlug}
      />
    </div>
  );
}

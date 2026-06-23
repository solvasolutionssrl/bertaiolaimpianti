import { redirect } from 'next/navigation';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';
import { DipendentiClient } from './_components/dipendenti-client';

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
  return (
    <div className="w-full space-y-5">
      <header>
        <h1 className="text-lg font-semibold">Dipendenti</h1>
        <p className="text-sm text-muted-foreground">Anagrafica del personale di cantiere.</p>
      </header>
      <DipendentiClient
        dipendenti={(dipendenti ?? []) as DipendenteRow[]}
        utenti={(utenti ?? []) as UtenteRow[]}
        tenantSlug={ctx.tenantSlug}
      />
    </div>
  );
}

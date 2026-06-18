import { createServerSupabase } from '@kommessa/api/server';
import { DipendentiClient } from './_components/dipendenti-client';

export const dynamic = 'force-dynamic';

export interface DipendenteRow {
  id: string;
  nome: string;
  cognome: string;
  mansione: string | null;
  codice_interno: string | null;
  user_id: string | null;
  stato_attivo: boolean;
  note: string | null;
}

export interface UtenteRow {
  id: string;
  display_name: string | null;
  role: string | null;
}

export default async function DipendentiPage() {
  const supabase = createServerSupabase();
  const { data: dipendenti } = await supabase
    .from('dipendenti' as never)
    .select('id, nome, cognome, mansione, codice_interno, user_id, stato_attivo, note')
    .order('cognome');
  const { data: utenti } = await supabase
    .from('users')
    .select('id, display_name, role')
    .order('display_name');
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">Dipendenti</h1>
        <p className="text-sm text-muted-foreground">Anagrafica del personale di cantiere.</p>
      </header>
      <DipendentiClient
        dipendenti={(dipendenti ?? []) as DipendenteRow[]}
        utenti={(utenti ?? []) as UtenteRow[]}
      />
    </div>
  );
}

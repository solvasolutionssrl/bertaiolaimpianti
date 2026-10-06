import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';
import { nuoviDalGestionale } from '@/app/_lib/integrazione/nuovi';
import { leggiModalitaLavoro } from '@/app/_lib/dipendenti-modalita';
import {
  MODALITA_PREDEFINITA,
  type ModalitaLavoro,
} from '@/app/_lib/dipendenti-modalita-registry';
import { DipendentiClient } from './_components/dipendenti-client';
import { NuoviDalGestionale } from './_components/nuovi-dal-gestionale';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dipendenti · Personale' };

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
  /** Come lavora: cambia cosa chiede l'app, non i permessi. */
  modalitaLavoro: ModalitaLavoro;
}

export interface UtenteRow {
  id: string;
  display_name: string | null;
  role: string | null;
}

/**
 * L'anagrafica del personale.
 *
 * ## Perche' non sta piu' sotto Kantiere
 *
 * Perche' il personale non e' una cosa del mondo presenze: e' una cosa di
 * **tutte** le aziende. Nome, mansione, chi e' l'utente dell'app, se e' in
 * forza, cosa ha fatto: serve anche a chi non timbra. La pagina pero' viveva
 * sotto `/office/kantiere/`, il cui guscio rimbalza chi non ha quel modulo —
 * cosi' un cliente del mondo commesse vedeva la voce «Dipendenti» nel menu e
 * cliccandola tornava alla pagina iniziale. Una voce di menu che non apre
 * niente.
 *
 * Ora il gate e' **il modulo Dipendenti** (quello del guscio `personale/`), e
 * cio' che riguarda i turni compare solo dove si timbra (`mondoPresenze`).
 */
export default async function DipendentiPage() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();
  // Chi timbra vede anche turni, modalita' dell'app e tesserino; chi non
  // timbra no, perche' sarebbero scelte senza effetto.
  const mondoPresenze = await tenantHasModule('kantiere');
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

  // ⚠️ La modalità di lavoro si legge **a parte** e in modo tollerante: la
  // colonna arriva con una migration applicata a mano, e infilarla nella select
  // qui sopra farebbe cadere l'intero elenco finché non è stata applicata.
  const modalita = await leggiModalitaLavoro(supabase, ctx.tenantId);
  const elenco: DipendenteRow[] = (
    (dipendenti ?? []) as Omit<DipendenteRow, 'modalitaLavoro'>[]
  ).map((d) => ({ ...d, modalitaLavoro: modalita.get(d.id) ?? MODALITA_PREDEFINITA }));
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
        <p className="text-sm text-muted-foreground">
          {mondoPresenze
            ? 'Anagrafica del personale, accessi all’app e turni.'
            : 'Chi lavora in azienda, con che accesso entra nell’app, e cosa ha fatto.'}
        </p>
      </header>
      {/* Il raffronto col gestionale compare solo a chi ha l'integrazione. */}
      <NuoviDalGestionale
        nuovi={nuovi}
        ignorati={ignorati}
        attivo={!!sistema}
        dipendenti={elenco.map((d) => ({
          id: d.id,
          etichetta: `${d.cognome} ${d.nome}${d.codice_interno ? ` · ${d.codice_interno}` : ''}`,
          collegato: collegatiIds.has(d.id),
        }))}
      />

      <DipendentiClient
        gestionaleAttivo={!!sistema}
        externalPerDipendente={externalPerDipendente}
        dipendenti={elenco}
        utenti={(utenti ?? []) as UtenteRow[]}
        tenantSlug={ctx.tenantSlug}
        mondoPresenze={mondoPresenze}
        basePath="/office/personale/dipendenti"
      />
    </div>
  );
}

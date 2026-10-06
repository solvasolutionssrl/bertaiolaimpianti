import Link from 'next/link';
import { Camera, CheckCircle2, Clock, Briefcase } from 'lucide-react';
import { Card, CardContent } from '@kommessa/ui';

import { createServerSupabase } from '@kommessa/api/server';
import { fmtDataOra } from '@/app/office/_lib/format';
import { descriviAuditEvent } from '@/app/office/_lib/format';

/**
 * Cosa ha fatto questa persona.
 *
 * ## Perché non c'era, e perché è la domanda giusta
 *
 * I dati c'erano tutti: `commessa_todo.completato_da` e `completato_at` (messi
 * da un trigger), `file_refs.uploaded_by`, e `audit_events.actor_user_id` su
 * ogni mutazione. **Nessuna pagina li interrogava per persona.** C'era un
 * registro per periodo, uno per commessa, uno per giornata — nessuno per chi.
 * E «cosa ha fatto Mario questa settimana» è esattamente la domanda che
 * l'ufficio si fa.
 *
 * ⚠️ `audit_events` non aveva un indice sull'autore: questa pagina sarebbe
 * stata una scansione. Aggiunto `audit_events_actor_idx` con la migration
 * `20261007090000`.
 *
 * Il collegamento è con l'**account** (`users.id`), non con la scheda del
 * personale: chi non ha un account non ha lasciato tracce nell'app, e la
 * sezione lo dice invece di mostrare tre zeri.
 */
export async function AttivitaPersona({
  tenantId,
  userId,
  nome,
}: {
  tenantId: string;
  /** L'account collegato alla scheda. `null` = nessun accesso all'app. */
  userId: string | null;
  nome: string;
}) {
  if (!userId) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {nome} non ha un accesso all&apos;app: non c&apos;è niente da
          raccontare. Collegandogli un utente, da quel momento in poi quello che
          fa compare qui.
        </CardContent>
      </Card>
    );
  }

  const supabase = createServerSupabase();

  const [spunteRes, fotoRes, squadraRes, registroRes] = await Promise.all([
    // Le cose spuntate. ⚠️ `completato_da` viene azzerato se la cosa da fare
    // viene riaperta: quello che si vede qui è chi l'ha chiusa per ultimo.
    supabase
      .from('commessa_todo' as never)
      .select(
        'id, titolo, completato_at, commessa_id, commessa:commesse!commessa_todo_commessa_id_fkey ( codice_interno )',
      )
      .eq('tenant_id', tenantId)
      .eq('completato_da', userId)
      .order('completato_at', { ascending: false })
      .limit(20),
    supabase
      .from('file_refs')
      .select('id, filename, uploaded_at, commessa_id, mime')
      .eq('tenant_id', tenantId)
      .eq('uploaded_by', userId)
      .is('deleted_at', null)
      .order('uploaded_at', { ascending: false })
      .limit(8),
    supabase
      .from('commessa_tecnici')
      .select('commessa_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('user_id', userId),
    supabase
      .from('audit_events')
      .select('id, created_at, entity_type, entity_id, action, metadata')
      .eq('tenant_id', tenantId)
      .eq('actor_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(40),
  ]);

  const spunte = (spunteRes.data ?? []) as unknown as Array<{
    id: string;
    titolo: string;
    completato_at: string | null;
    commessa_id: string | null;
    commessa: { codice_interno: string } | { codice_interno: string }[] | null;
  }>;
  const foto = (fotoRes.data ?? []) as unknown as Array<{
    id: string;
    filename: string;
    uploaded_at: string | null;
    commessa_id: string | null;
    mime: string | null;
  }>;
  const registro = (registroRes.data ?? []) as unknown as Array<{
    id: string;
    created_at: string;
    entity_type: string;
    entity_id: string;
    action: string;
    metadata: Record<string, unknown> | null;
  }>;

  // Il conteggio totale, non quello della pagina: «20» con il limite a 20
  // significa «almeno 20», e non è la stessa cosa.
  const [{ count: spunteTot }, { count: fotoTot }] = await Promise.all([
    supabase
      .from('commessa_todo' as never)
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('completato_da', userId),
    supabase
      .from('file_refs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('uploaded_by', userId)
      .is('deleted_at', null),
  ]);

  const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Numero
          icona={<CheckCircle2 className="h-4 w-4" />}
          valore={spunteTot ?? 0}
          etichetta="cose spuntate"
        />
        <Numero
          icona={<Camera className="h-4 w-4" />}
          valore={fotoTot ?? 0}
          etichetta="foto e video"
        />
        <Numero
          icona={<Briefcase className="h-4 w-4" />}
          valore={squadraRes.count ?? 0}
          etichetta="lavori in carico"
        />
      </div>

      <Sezione titolo="Cose spuntate" vuoto="Non ha ancora spuntato niente.">
        {spunte.length > 0
          ? spunte.map((t) => (
              <Riga
                key={t.id}
                quando={t.completato_at}
                href={t.commessa_id ? `/office/commesse/${t.commessa_id}/lavori` : null}
                testo={t.titolo}
                dove={uno(t.commessa)?.codice_interno ?? 'Richiesta al telefono'}
              />
            ))
          : null}
      </Sezione>

      <Sezione titolo="Foto e video caricati" vuoto="Non ha ancora caricato niente.">
        {foto.length > 0
          ? foto.map((f) => (
              <Riga
                key={f.id}
                quando={f.uploaded_at}
                href={f.commessa_id ? `/office/commesse/${f.commessa_id}/foto` : null}
                testo={f.filename}
                dove={f.mime?.startsWith('video/') ? 'Video' : 'Foto'}
              />
            ))
          : null}
      </Sezione>

      <Sezione
        titolo="Registro"
        vuoto="Nessuna traccia: o non ha ancora fatto niente, o lo ha fatto prima che registrassimo."
      >
        {registro.length > 0
          ? registro.map((e) => (
              <Riga
                key={e.id}
                quando={e.created_at}
                href={
                  e.entity_type === 'commessa' && /^[0-9a-f-]{36}$/i.test(e.entity_id)
                    ? `/office/commesse/${e.entity_id}`
                    : null
                }
                testo={descriviAuditEvent(e)}
                dove={null}
              />
            ))
          : null}
      </Sezione>
    </div>
  );
}

function Numero({
  icona,
  valore,
  etichetta,
}: {
  icona: React.ReactNode;
  valore: number;
  etichetta: string;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <span className="flex items-center gap-1.5 text-muted-foreground">{icona}</span>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{valore}</p>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{etichetta}</p>
      </CardContent>
    </Card>
  );
}

function Sezione({
  titolo,
  vuoto,
  children,
}: {
  titolo: string;
  vuoto: string;
  children: React.ReactNode;
}) {
  const haContenuto = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <Card>
      <CardContent className="p-0">
        <p className="border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {titolo}
        </p>
        {haContenuto ? (
          <ul className="divide-y divide-border">{children}</ul>
        ) : (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">{vuoto}</p>
        )}
      </CardContent>
    </Card>
  );
}

function Riga({
  quando,
  testo,
  dove,
  href,
}: {
  quando: string | null;
  testo: string;
  dove: string | null;
  href: string | null;
}) {
  const corpo = (
    <>
      <span className="min-w-0 flex-1 truncate">{testo}</span>
      {dove ? (
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{dove}</span>
      ) : null}
      <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
        <Clock className="h-3 w-3" aria-hidden="true" />
        {fmtDataOra(quando)}
      </span>
    </>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/40">
          {corpo}
        </Link>
      ) : (
        <div className="flex items-center gap-3 px-4 py-2.5 text-sm">{corpo}</div>
      )}
    </li>
  );
}

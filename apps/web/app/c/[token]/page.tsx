import type { Metadata } from 'next';
import { waitUntil } from '@vercel/functions';

import { createServiceSupabase } from '@kommessa/api/service';
import { mediaVisibilePubblicamente } from '@kommessa/api/link-pubblico';

import { risolviToken, segnaApertura } from '@/app/_lib/link-pubblico-server';
import { GalleriaPubblica } from './_components/galleria-pubblica';

/**
 * La pagina pubblica di una commessa: **titolo, eventualmente i dettagli, foto
 * e video**. Nient'altro.
 *
 * Si apre **senza account**: chi ha l'indirizzo entra. È il punto della cosa —
 * serve a mandare le foto di un lavoro su WhatsApp senza scaricarle e
 * rimandarle a mano. L'indirizzo è il segreto, e per questo scade da solo a 30
 * giorni, si spegne in un istante e conta le aperture.
 *
 * ⚠️ **Cosa non passa di qui, e perché non può passarci per sbaglio.**
 * Telefono, indirizzo, mappa, cliente, stato, codice interno, documenti e
 * preventivi non sono nascosti dal componente: la query qui sotto quei campi
 * **non li legge affatto**. Nessuno può farli comparire aggiungendo una riga a
 * un componente, perché il dato non arriva fin qui.
 *
 * I media sono filtrati a **foto e video**: un link mandato a un cliente non
 * deve diventare una finestra sull'archivio dei documenti.
 */

export const dynamic = 'force-dynamic';

/**
 * Fuori dagli indici dei motori di ricerca. Non è la difesa (quella è
 * l'entropia del token), ma un link finito in una chat non deve nemmeno poter
 * essere trovato per caso.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

interface MediaPubblico {
  id: string;
  filename: string;
  mime: string;
}

export default async function PaginaPubblica({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const link = await risolviToken(token);

  if (!link) return <LinkNonValido />;

  const service = createServiceSupabase();
  const [commessaRes, tenantRes, mediaRes] = await Promise.all([
    service
      .from('commesse')
      // Solo questi campi. Vedi la nota in testa: l'elenco È il presidio.
      .select('id, descrizione_ai_finale, descrizione_ai_proposta, note_iniziali')
      .eq('id', link.commessaId)
      .maybeSingle(),
    service
      .from('tenants')
      .select('nome, logo_url')
      .eq('id', link.tenantId)
      .maybeSingle(),
    service
      .from('file_refs')
      .select('id, filename, mime')
      .eq('commessa_id', link.commessaId)
      // Il filtro sullo stato è anche ciò che tiene fuori il cestino: chi
      // cancella un media gli mette `status='deleted'` (oltre a `deleted_at`),
      // quindi una foto buttata via smette di essere pubblica da sola. Non
      // serve un secondo filtro, serve saperlo.
      .in('status', ['uploaded', 'syncing', 'synced'])
      // ⚠️ `uploaded_at`, non `created_at`: su `file_refs` quella colonna
      // **non esiste**, e PostgREST risponde con un errore invece di una
      // lista. Per due giorni la galleria pubblica non ha mostrato un file a
      // nessuno — vedi la nota qui sotto sul perché non si era visto.
      // `.order('id')` in coda perché due file caricati nello stesso istante
      // non si scambino di posto a ogni apertura.
      .order('uploaded_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(300),
  ]);

  const commessa = commessaRes.data as {
    id: string;
    descrizione_ai_finale: string | null;
    descrizione_ai_proposta: string | null;
    note_iniziali: string | null;
  } | null;
  if (!commessa) return <LinkNonValido />;

  const tenant = tenantRes.data as { nome: string; logo_url: string | null } | null;

  /**
   * ⚠️ **«Non ci sono foto» e «non sono riuscito a leggerle» non sono la
   * stessa cosa, e questa pagina le confondeva.**
   *
   * `mediaRes.data ?? []` trasformava un errore in un elenco vuoto, e la
   * pagina diceva al cliente «non ci sono ancora foto da mostrare» su una
   * commessa che ne ha sei. Il difetto vero era un nome di colonna sbagliato
   * nell'ordinamento, ma è **rimasto invisibile due giorni** perché il ripiego
   * lo raccontava come una cosa normale: nessun errore nei log, nessun segno a
   * schermo, solo una galleria vuota che sembrava giusta.
   *
   * Un ripiego su un dato assente va bene; un ripiego su un dato **non letto**
   * nasconde il guasto. Ora l'errore si distingue, si scrive nei log del
   * server e a schermo diventa un messaggio diverso.
   */
  const letturaFallita = Boolean(mediaRes.error);
  if (mediaRes.error) {
    console.error(
      `[link pubblico] media della commessa ${link.commessaId} non letti: ${mediaRes.error.message}`,
    );
  }

  const media: MediaPubblico[] = ((mediaRes.data ?? []) as MediaPubblico[]).filter(
    (m) => mediaVisibilePubblicamente(m.mime),
  );

  // Il conteggio non deve ritardare la pagina, e senza `waitUntil` la funzione
  // verrebbe congelata appena parte la risposta.
  waitUntil(segnaApertura(link.linkId));

  /**
   * ⚠️ Il titolo si compone QUI, a mano, e non con `risolviTitoloCommessa`.
   *
   * Quell'helper è giusto dentro l'app e sbagliato qui, per due ripieghi che
   * dentro non fanno danno e fuori sì:
   *
   *  1. se mancano le descrizioni AI ripiega su `note_iniziali`, cioè la
   *     dettatura del capo — che finirebbe in pagina **anche con i dettagli
   *     disattivati**, vanificando la scelta di chi ha creato il link;
   *  2. poi ripiega su `nome_cartella`, che ha il formato
   *     `{codice}_{cliente}_{lavoro}`: l'estrattore toglie codice e cliente
   *     solo se glieli si passa, e qui non li leggiamo nemmeno. Sarebbe uscito
   *     il nome del cliente, cioè esattamente ciò che questa pagina non deve
   *     mostrare.
   *
   * Un ripiego comodo diventa una fuga di dati appena cambia il pubblico.
   */
  const primaRiga = (t: string | null | undefined): string | null => {
    const v = t?.trim();
    if (!v) return null;
    return v.split(/\r?\n/)[0]!.trim() || null;
  };

  const titolo =
    primaRiga(commessa.descrizione_ai_finale) ??
    primaRiga(commessa.descrizione_ai_proposta) ??
    (link.mostraDettagli ? primaRiga(commessa.note_iniziali) : null) ??
    'Lavoro';

  const dettagli =
    link.mostraDettagli && commessa.note_iniziali?.trim()
      ? commessa.note_iniziali.trim()
      : null;

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col gap-6 px-4 py-6">
      <header className="flex items-center gap-3 border-b border-border pb-4">
        {tenant?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tenant.logo_url}
            alt={tenant.nome}
            className="h-10 w-10 shrink-0 rounded-md object-contain"
          />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-foreground text-sm font-bold text-background">
            {(tenant?.nome ?? '?').slice(0, 2).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{tenant?.nome ?? 'Kommessa'}</p>
          <p className="text-xs text-muted-foreground">Foto del lavoro</p>
        </div>
      </header>

      <div>
        <h1 className="text-xl font-semibold leading-tight tracking-tight">{titolo}</h1>
        {dettagli ? (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {dettagli}
          </p>
        ) : null}
      </div>

      {letturaFallita ? (
        /* Messaggio neutro: su una pagina pubblica non si scrive cosa non ha
           funzionato. Il dettaglio sta nei log del server, dove serve. */
        <p className="rounded-lg border border-dashed border-destructive/40 px-4 py-8 text-center text-sm text-muted-foreground">
          Le foto non si caricano in questo momento. Riprovate più tardi, oppure
          chiedete un collegamento nuovo.
        </p>
      ) : media.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Non ci sono ancora foto da mostrare.
        </p>
      ) : (
        <GalleriaPubblica token={token} media={media} />
      )}

      <footer className="mt-auto border-t border-border pt-4 text-center">
        <p className="text-xs text-muted-foreground">
          Questo collegamento è temporaneo e può essere disattivato in qualsiasi
          momento.
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground/70">
          Powered by <span className="font-semibold">Kommessa</span>
        </p>
      </footer>
    </main>
  );
}

/**
 * Una pagina sola per ogni motivo di fallimento: inesistente, scaduto, spento.
 * A chi prova indirizzi a caso non si dice quale dei casi ha incontrato.
 */
function LinkNonValido() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-lg font-semibold">Collegamento non più valido</h1>
      <p className="text-sm text-muted-foreground">
        Questo collegamento è scaduto o è stato disattivato. Chiedete di
        rigenerarlo a chi ve l&apos;ha mandato.
      </p>
      <p className="mt-4 text-[11px] text-muted-foreground/70">
        Powered by <span className="font-semibold">Kommessa</span>
      </p>
    </main>
  );
}

import { cookies } from 'next/headers';
import { AlertTriangle, CircleCheck } from 'lucide-react';

import { createServiceSupabase } from '@kommessa/api/service';
import {
  componiBacheca,
  coseOrfane,
  totaleBacheca,
  type CosaDaFare,
  type Persona,
} from '@kommessa/api/bacheca';
import { etichettaPriorita, normalizzaPriorita } from '@kommessa/api/priorita';

import {
  BACHECA_COOKIE,
  leggiBachecaDaToken,
  leggiSessione,
  segnaAperturaBacheca,
} from '@/app/_lib/bacheca-server';
import { PortaBacheca } from './_components/porta-bacheca';
import { AggiornaDaSola } from './_components/aggiorna-da-sola';

export const dynamic = 'force-dynamic';

/** Un impegno di oggi preso dalla pianificazione: dove e da che ora. */
interface ImpegnoOggi {
  id: string;
  dove: string;
  dalle: string;
}

/**
 * La bacheca da televisione.
 *
 * Una pagina per cliente, una casella per persona, e dentro le cose che le
 * restano da fare. Si batte l'indirizzo una volta sul televisore dell'ufficio
 * e resta lì.
 *
 * ## Cosa NON c'è, e non è una dimenticanza
 *
 * Niente nomi di clienti, niente telefoni, niente indirizzi, niente foto.
 * Questa pagina sta su uno schermo in una stanza dove passa gente — clienti
 * compresi. Ci sta il lavoro, non l'anagrafica. ⚠️ **I campi vietati non sono
 * nascosti: la query non li legge**, così nessuno li fa comparire aggiungendo
 * una riga a un componente (è la stessa regola della pagina pubblica di una
 * commessa, e nasce dallo stesso errore evitato per un pelo).
 *
 * ## Fondo scuro, e non è gusto
 *
 * Un televisore acceso tutto il giorno in un ufficio con un fondo bianco è una
 * lampada. E i pannelli grandi tengono accesi i pixel chiari: scuro consuma
 * meno e non stanca chi ci lavora accanto.
 */
export const metadata = {
  title: 'Bacheca',
  robots: { index: false, follow: false, nocache: true },
};

export default async function BachecaPage({ params }: { params: { token: string } }) {
  const bacheca = await leggiBachecaDaToken(params.token);
  if (!bacheca) return <Rifiuto />;

  const sessione = leggiSessione(
    cookies().get(`${BACHECA_COOKIE}_${params.token.slice(0, 8)}`)?.value,
    params.token,
    bacheca.tenantId,
  );
  if (!sessione) return <PortaBacheca token={params.token} />;

  // ⚠️ Da qui in poi si usa SEMPRE `bacheca.tenantId`, cioe' il cliente della
  // riga trovata dall'indirizzo — mai quello scritto nel cookie. Il cookie
  // dice chi afferma di essere; la riga dice chi e'.
  const tenantId = bacheca.tenantId;

  const service = createServiceSupabase();

  // ⚠️ Di `tenants` si leggono SOLO nome, logo e colore: `storage_config` e
  // `r2_config` sono segreti, e questa pagina non ha nessuna sessione.
  const [tenantRes, personeRes, coseRes] = await Promise.all([
    service
      .from('tenants')
      .select('nome, logo_url, brand_color')
      .eq('id', tenantId)
      .maybeSingle(),
    service
      .from('users')
      .select('id, display_name, role')
      .eq('tenant_id', tenantId)
      .eq('attivo', true)
      .neq('role', 'cliente')
      .order('display_name'),
    // Niente cliente, niente contatto, niente note: solo cosa c'è da fare,
    // quanto è urgente, entro quando, e su quale lavoro.
    service
      .from('commessa_todo' as never)
      .select(
        'id, titolo, priorita, scadenza_at, assegnato_a, commessa:commesse!commessa_todo_commessa_id_fkey ( codice_interno )',
      )
      .eq('tenant_id', tenantId)
      .in('stato', ['aperto', 'in_corso'])
      .limit(500),
  ]);

  /**
   * La pianificazione di oggi, dove esiste.
   *
   * Nel mondo presenze le cose da fare sono zero (FPM non ne ha nemmeno una):
   * quello che l'ufficio guarda al mattino e' **chi va dove**. Senza questo
   * pezzo la bacheca su un cliente Kantiere mostrerebbe otto caselle tutte
   * vuote — tecnicamente giusta e inutile.
   *
   * Il collegamento e' `pianificazione_membri` → `dipendenti.user_id`: la
   * pianificazione assegna le **persone del personale**, la bacheca le caselle
   * degli **account**. Chi non ha un account non ha una casella, e per questo
   * la riga sotto le raccoglie a parte.
   */
  const oggi = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
  const { data: blocchiRaw } = await service
    .from('pianificazione_blocchi' as never)
    .select(
      `id, tipo, titolo, ora_inizio, ora_fine, stato,
       cantiere:cantieri ( nome ),
       membri:pianificazione_membri ( dipendente_id )`,
    )
    .eq('tenant_id', tenantId)
    .eq('data', oggi)
    .eq('stato', 'pubblicato')
    .limit(200);

  const blocchi = (blocchiRaw ?? []) as unknown as Array<{
    id: string;
    tipo: string;
    titolo: string | null;
    ora_inizio: string;
    ora_fine: string;
    cantiere: { nome: string | null } | { nome: string | null }[] | null;
    membri: Array<{ dipendente_id: string }> | null;
  }>;

  // Da `dipendenti.id` all'account, per sapere in quale casella mettere il blocco.
  const perDipendente = new Map<string, string>();
  if (blocchi.length > 0) {
    const { data: dip } = await service
      .from('dipendenti' as never)
      .select('id, user_id')
      .eq('tenant_id', tenantId)
      .not('user_id', 'is', null);
    for (const d of (dip ?? []) as unknown as Array<{ id: string; user_id: string }>) {
      perDipendente.set(d.id, d.user_id);
    }
  }

  const oggiPerPersona = new Map<string, ImpegnoOggi[]>();
  for (const b of blocchi) {
    const c = Array.isArray(b.cantiere) ? b.cantiere[0] : b.cantiere;
    const dove = c?.nome ?? b.titolo ?? 'Da definire';
    for (const m of b.membri ?? []) {
      const userId = perDipendente.get(m.dipendente_id);
      if (!userId) continue;
      const lista = oggiPerPersona.get(userId) ?? [];
      lista.push({ id: `${b.id}:${m.dipendente_id}`, dove, dalle: b.ora_inizio.slice(0, 5) });
      oggiPerPersona.set(userId, lista);
    }
  }
  for (const lista of oggiPerPersona.values()) {
    lista.sort((a, b) => a.dalle.localeCompare(b.dalle));
  }

  await segnaAperturaBacheca(tenantId);

  const tenant = tenantRes.data as
    | { nome: string | null; logo_url: string | null; brand_color: string | null }
    | null;

  const persone: Persona[] = ((personeRes.data ?? []) as Array<{
    id: string;
    display_name: string | null;
  }>).map((u) => ({
    userId: u.id,
    nome: u.display_name?.trim() || 'Senza nome',
  }));

  const cose: CosaDaFare[] = ((coseRes.data ?? []) as unknown as Array<{
    id: string;
    titolo: string;
    priorita: string;
    scadenza_at: string | null;
    assegnato_a: string | null;
    commessa: { codice_interno: string } | { codice_interno: string }[] | null;
  }>).map((t) => {
    const c = Array.isArray(t.commessa) ? t.commessa[0] : t.commessa;
    return {
      id: t.id,
      titolo: t.titolo,
      priorita: normalizzaPriorita(t.priorita),
      scadenzaAt: t.scadenza_at,
      assegnatoA: t.assegnato_a,
      codiceLavoro: c?.codice_interno ?? null,
    };
  });

  const adesso = new Date();
  const caselle = componiBacheca(persone, cose, adesso);
  const totali = totaleBacheca(caselle);
  const orfane = coseOrfane(persone, cose);

  const oraAggiornamento = adesso.toLocaleTimeString('it-IT', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="min-h-[100dvh] bg-neutral-950 p-4 text-neutral-100 sm:p-6">
      <AggiornaDaSola />

      <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {tenant?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tenant.logo_url}
              alt=""
              className="h-10 w-auto max-w-[160px] object-contain"
            />
          ) : null}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold sm:text-2xl">
              {tenant?.nome ?? 'Bacheca'}
            </h1>
            <p className="text-xs text-neutral-400">
              Cosa resta da fare · aggiornato alle {oraAggiornamento}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <Totale valore={totali.cose} etichetta="da fare" />
          <Totale
            valore={totali.inRitardo}
            etichetta="in ritardo"
            allarme={totali.inRitardo > 0}
          />
          <Totale valore={totali.personeOccupate} etichetta={`su ${persone.length} persone`} />
        </div>
      </header>

      {caselle.length === 0 ? (
        <p className="py-20 text-center text-neutral-400">
          Nessuna persona in questo spazio di lavoro.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {caselle.map((c) => (
            <li
              key={c.persona.userId}
              className="flex min-h-[9rem] flex-col rounded-xl border border-white/10 bg-white/[0.04] p-3"
            >
              <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-white/10 pb-2">
                <p className="min-w-0 truncate text-sm font-semibold">{c.persona.nome}</p>
                <span className="shrink-0 font-mono text-xs tabular-nums text-neutral-400">
                  {c.cose.length === 0 ? '—' : c.cose.length}
                  {c.inRitardo > 0 ? (
                    <span className="ml-1.5 text-rose-300">{c.inRitardo} in ritardo</span>
                  ) : null}
                </span>
              </div>

              {/* Dove va oggi: in testa, perché è la prima cosa che si guarda
                  al mattino. Compare solo dove la pianificazione si usa. */}
              {(oggiPerPersona.get(c.persona.userId) ?? []).length > 0 ? (
                <ul className="mb-2 space-y-1 rounded-lg bg-white/[0.05] p-2">
                  {(oggiPerPersona.get(c.persona.userId) ?? []).slice(0, 3).map((i) => (
                    <li key={i.id} className="flex items-baseline gap-2 text-[13px]">
                      <span className="shrink-0 font-mono text-[11px] text-neutral-400">
                        {i.dalle}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{i.dove}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {c.cose.length === 0 && (oggiPerPersona.get(c.persona.userId) ?? []).length === 0 ? (
                <p className="flex flex-1 items-center justify-center gap-1.5 text-xs text-neutral-500">
                  <CircleCheck aria-hidden="true" className="h-3.5 w-3.5" />
                  Niente in sospeso
                </p>
              ) : c.cose.length === 0 ? null : (
                <ul className="space-y-1.5">
                  {/* Sei per casella: oltre, su un televisore non si legge più.
                      Il numero in alto dice quante sono in tutto. */}
                  {c.cose.slice(0, 6).map((t) => (
                    <Cosa key={t.id} cosa={t} adesso={adesso} />
                  ))}
                  {c.cose.length > 6 ? (
                    <li className="pt-0.5 text-[11px] text-neutral-500">
                      e altre {c.cose.length - 6}
                    </li>
                  ) : null}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {orfane.length > 0 ? (
        <p className="mt-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
          <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          {orfane.length}{' '}
          {orfane.length === 1 ? 'cosa da fare è assegnata' : 'cose da fare sono assegnate'} a
          qualcuno che non lavora più qui: nessuno le sta guardando.
        </p>
      ) : null}
    </div>
  );
}

function Cosa({ cosa, adesso }: { cosa: CosaDaFare; adesso: Date }) {
  const inRitardo =
    cosa.scadenzaAt !== null && new Date(cosa.scadenzaAt).getTime() < adesso.getTime();
  const urgente = cosa.priorita === 'urgente';

  return (
    <li className="flex items-start gap-2 text-[13px] leading-snug">
      <span
        aria-hidden="true"
        className={`mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full ${
          inRitardo ? 'bg-rose-400' : urgente ? 'bg-amber-400' : 'bg-neutral-500'
        }`}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{cosa.titolo}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-neutral-500">
          {cosa.codiceLavoro ? (
            <span className="font-mono">{cosa.codiceLavoro}</span>
          ) : (
            <span>Richiesta</span>
          )}
          {urgente ? <span className="text-amber-300">{etichettaPriorita('urgente')}</span> : null}
          {cosa.scadenzaAt ? (
            <span className={inRitardo ? 'text-rose-300' : undefined}>
              {new Date(cosa.scadenzaAt).toLocaleDateString('it-IT', {
                timeZone: 'Europe/Rome',
                day: '2-digit',
                month: '2-digit',
              })}
            </span>
          ) : null}
        </span>
      </span>
    </li>
  );
}

function Totale({
  valore,
  etichetta,
  allarme,
}: {
  valore: number;
  etichetta: string;
  allarme?: boolean;
}) {
  return (
    <div className="text-right">
      <p
        className={`text-2xl font-semibold tabular-nums sm:text-3xl ${
          allarme ? 'text-rose-300' : ''
        }`}
      >
        {valore}
      </p>
      <p className="text-[10px] uppercase tracking-wide text-neutral-500">{etichetta}</p>
    </div>
  );
}

/**
 * La stessa pagina per un indirizzo sbagliato, inesistente o spento.
 *
 * Una pagina sola per tutti e tre i casi, di proposito: distinguere
 * racconterebbe a chi prova gli indirizzi quali sono quelli buoni.
 */
function Rifiuto() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-neutral-950 p-6 text-center text-neutral-400">
      <div>
        <p className="text-sm">Questo indirizzo non è più valido.</p>
        <p className="mt-1 text-xs text-neutral-600">
          Chiedete in ufficio quello nuovo.
        </p>
      </div>
    </div>
  );
}

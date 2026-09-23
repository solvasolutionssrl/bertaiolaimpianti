'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';
import {
  leggiStatoGiornata,
  scriviVersioneRapportino,
  statoGiornataPerData,
} from '@/app/_actions/_lib/scrivi-versione-rapportino';
import {
  ricomputaRapportinoAuto,
  marcaRapportinoManuale,
} from '@/app/_actions/_lib/ricomputa-rapportino';
import { coppiaPausaCentrata } from '@/app/_actions/_lib/viaggio-timbra';
import { aggiornaRigheGiornata } from '@/app/_actions/_lib/righe-giornata';
import { cantiereScrivibile } from '@/app/_actions/_lib/lavoro-aperto';
import { romeDay, romeDayBoundsUtc, romeWallToUtcIso } from '@kommessa/api/rome-time';
import { leggiTutto } from '@kommessa/api/pagine';

type Result = { ok: true } | { ok: false; error: string };

async function nomeUtente(
  supabase: ReturnType<typeof createServerSupabase>,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('users' as never)
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();
  return (data as { display_name: string | null } | null)?.display_name ?? null;
}

// ── schema per registraOrePerDipendente ─────────────────────────────────────

const RegistraOreSchema = z
  .object({
    dipendenteId: z.string().uuid(),
    commessaId: z.string().uuid().optional(),
    cantiereId: z.string().uuid().optional(),
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato data non valido (YYYY-MM-DD)'),
    /** Ore di lavoro sul cantiere, pure: ordinarie e straordinarie si derivano. */
    ore_lavoro: z.number().min(0).max(24),
    /** Ore di viaggio attribuite al cantiere. */
    ore_viaggio: z.number().min(0).max(24),
    note: z.string().max(1000).optional(),
    /**
     * L'ufficio ha confermato di voler registrare ore su un cantiere chiuso.
     * Senza, la scrittura viene rifiutata con `CANTIERE_CHIUSO` e la UI chiede
     * conferma. Dall'app questa strada non esiste.
     */
    forzato: z.boolean().optional(),
  })
  .refine(
    (d) => {
      const hasCommessa = !!d.commessaId;
      const hasCantiere = !!d.cantiereId;
      return hasCommessa !== hasCantiere; // XOR: esattamente uno valorizzato
    },
    { message: 'Specificare esattamente uno tra commessa e cantiere' },
  );

async function guard() {
  const ctx = await requireTenantContext();
  if (!['admin', 'office'].includes(ctx.role)) throw new Error('FORBIDDEN');
  if (!(await tenantHasModule('kantiere'))) throw new Error('MODULO_OFF');
  return ctx;
}

// ── correggiViaggio ──────────────────────────────────────────────────────────
// Corregge a posteriori i km e/o il tempo di UNA tratta di viaggio.
//
// ⚠️ Corregge la SORGENTE (`timbratura_viaggio`), non la riga derivata della
// giornata, e la differenza non è di stile:
//  - i km su `rapportino_righe` non esistono proprio, non è una sua colonna;
//  - il tempo, corretto lì, obbligherebbe a marcare la giornata come manuale,
//    congelando anche le ore di lavoro rispetto alle timbrature future.
// Correggendo la sorgente il valore sopravvive al ricalcolo per costruzione
// (è ciò da cui il ricalcolo parte) e non si congela niente.
//
// ⚠️ `distanza_stimata_km` e `km_giustificazione` arrivano con la migration
// 20260923090000, che si applica a mano mentre il codice va online al push:
// si scrivono in un update SEPARATO, e se non ci sono ancora la correzione
// resta valida e torna un avviso, invece di fallire tutto.

const CorreggiViaggioSchema = z
  .object({
    trattaId: z.string().uuid(),
    /** Km percorsi. Assente = non si toccano. */
    km: z.number().min(0).max(5000).optional(),
    /** Minuti di viaggio. Assente = non si toccano. */
    minuti: z
      .number()
      .int()
      .min(0)
      .max(24 * 60)
      .optional(),
    motivo: z.string().trim().min(3).max(500),
  })
  .refine((d) => d.km !== undefined || d.minuti !== undefined, {
    message: 'Indica almeno un valore da correggere',
  });

export async function correggiViaggio(
  input: unknown,
): Promise<{ ok: true; avviso?: string } | { ok: false; error: string }> {
  const parsed = CorreggiViaggioSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };

  const ctx = await guard();
  const supabase = createServerSupabase();
  const { trattaId, km, minuti, motivo } = parsed.data;

  // Solo le colonne di sempre: quelle nuove potrebbero non esistere ancora.
  const { data: trattaRaw } = await supabase
    .from('timbratura_viaggio' as never)
    .select('id, dipendente_id, data, timbratura_id, distanza_km, durata_confermata_min')
    .eq('id', trattaId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  const tratta = trattaRaw as {
    id: string;
    dipendente_id: string;
    data: string | null;
    timbratura_id: string | null;
    distanza_km: number | null;
    durata_confermata_min: number | null;
  } | null;
  if (!tratta) return { ok: false, error: 'TRATTA_NON_TROVATA' };

  // Il giorno della tratta: `data` è valorizzata su tutto ciò che è stato
  // scritto dal 24/06/2026, anche sulle righe legate a una timbratura. Le più
  // vecchie lo ricavano dalla timbratura a cui sono attaccate.
  let giorno = tratta.data;
  if (!giorno && tratta.timbratura_id) {
    const { data: tRaw } = await supabase
      .from('timbrature' as never)
      .select('ts')
      .eq('id', tratta.timbratura_id)
      .maybeSingle();
    const ts = (tRaw as { ts: string } | null)?.ts;
    if (ts) giorno = romeDay(new Date(ts));
  }
  if (!giorno) return { ok: false, error: 'GIORNO_NON_RISOLTO' };

  const kmCambia =
    km !== undefined && Math.round(km * 100) !== Math.round((Number(tratta.distanza_km) || 0) * 100);
  const minutiCambia =
    minuti !== undefined && minuti !== (Number(tratta.durata_confermata_min) || 0);
  // Salvare un valore identico non è una correzione: non si scrive niente e
  // non si sporca la cronologia con una voce che non dice nulla.
  if (!kmCambia && !minutiCambia) return { ok: true };

  // Com'era la giornata prima: la versione in fondo dirà prima → dopo.
  const prima = await statoGiornataPerData(supabase, ctx.tenantId, tratta.dipendente_id, giorno);

  const patch: Record<string, unknown> = {};
  if (kmCambia) patch.distanza_km = km;
  if (minutiCambia) {
    patch.durata_confermata_min = minuti;
    patch.giustificazione = motivo;
  }
  const { error: eUpd } = await supabase
    .from('timbratura_viaggio' as never)
    .update(patch as never)
    .eq('id', trattaId)
    .eq('tenant_id', ctx.tenantId);
  if (eUpd) return { ok: false, error: eUpd.message };

  let avviso: string | undefined;
  if (kmCambia) {
    // La stima del provider si mette da parte solo alla PRIMA correzione
    // (`is null`): una seconda correzione non deve sovrascriverla con il
    // valore già corretto, o si perderebbe da dove si era partiti.
    const { error: eKm } = await supabase
      .from('timbratura_viaggio' as never)
      .update({
        distanza_stimata_km: tratta.distanza_km,
        km_giustificazione: motivo,
      } as never)
      .eq('id', trattaId)
      .eq('tenant_id', ctx.tenantId)
      .is('distanza_stimata_km', null);
    if (eKm) {
      avviso =
        'I km sono stati corretti, ma il valore di partenza e il motivo non sono stati archiviati: manca la modifica al database (migrazione 20260923090000).';
    }
  }

  // Il tempo entra nel conto delle ore: si lascia riderivare al ricalcolo, che
  // legge `durata_confermata_min` proprio da qui. I km no, il ricalcolo non li
  // guarda mai: non c'è niente da rifare. `versione: false` perché la versione
  // la scrive questa azione, e dice una cosa più precisa.
  if (minutiCambia) {
    await ricomputaRapportinoAuto(supabase, ctx.tenantId, tratta.dipendente_id, giorno, {
      versione: false,
    });
  }

  const { data: rapRaw } = await supabase
    .from('rapportini' as never)
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('dipendente_id', tratta.dipendente_id)
    .eq('data', giorno)
    .maybeSingle();
  const rapportinoId = (rapRaw as { id: string } | null)?.id ?? null;
  if (rapportinoId) {
    const scritta = await scriviVersioneRapportino({
      supabase,
      rapportinoId,
      tenantId: ctx.tenantId,
      azione: 'modifica_viaggio',
      modificatoDa: ctx.userId,
      modificatoDaNome: await nomeUtente(supabase, ctx.userId),
      prima,
    });
    // `modifica_viaggio` entra nel vocabolario con la stessa migration: finché
    // non è applicata la cronologia non può registrarla, e va detto.
    if (!scritta) {
      avviso =
        avviso ??
        'La correzione è stata salvata, ma non risulta nella cronologia: potrebbe mancare la modifica al database (migrazione 20260923090000).';
    }
  }

  revalidatePath('/office/kantiere/rapportini');
  return avviso ? { ok: true, avviso } : { ok: true };
}

// ── registraOrePerDipendente ─────────────────────────────────────────────────
// L'ufficio inserisce ore per conto di un dipendente (cantiere O commessa).
// Il rapportino risultante ha stato=approvato se creato ex-novo, oppure viene
// mantenuto nello stato esistente (salvo bozza → approvato).
// Una riga per lo stesso target sullo stesso rapportino viene AGGIORNATA.

export async function registraOrePerDipendente(input: unknown): Promise<Result> {
  const parsed = RegistraOreSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };

  const ctx = await guard();
  const supabase = createServerSupabase();

  const { dipendenteId, commessaId, cantiereId, data, ore_lavoro, ore_viaggio, note } = parsed.data;

  // Verifica che il dipendente appartenga al tenant
  const { data: dipRow, error: dipErr } = await supabase
    .from('dipendenti' as never)
    .select('id')
    .eq('id', dipendenteId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (dipErr || !dipRow) return { ok: false, error: 'Dipendente non trovato' };

  // Cantiere chiuso: l'ufficio puo' scrivere lo stesso, ma solo dopo aver
  // confermato. Il primo tentativo torna `CANTIERE_CHIUSO`, la UI chiede e
  // rimanda con `forzato`. E' il caso «ho lavorato oggi su un lavoro chiuso
  // ieri», che esiste davvero e lo sa l'ufficio, non chi sta in cantiere.
  if (cantiereId) {
    const scrivibile = await cantiereScrivibile(supabase, cantiereId, ctx.tenantId, {
      forzato: parsed.data.forzato,
    });
    if (!scrivibile.ok) return { ok: false, error: scrivibile.error };
  }

  const now = new Date().toISOString();

  // Cerca rapportino esistente per (dipendente_id, data)
  const { data: esistenteRaw } = await supabase
    .from('rapportini' as never)
    .select('id, stato')
    .eq('tenant_id', ctx.tenantId)
    .eq('dipendente_id', dipendenteId)
    .eq('data', data)
    .maybeSingle();

  const esistente = esistenteRaw as { id: string; stato: string } | null;

  let rapportinoId: string;

  if (esistente) {
    rapportinoId = esistente.id;
    // Se era in bozza, portarlo ad approvato (l'ufficio è fonte autoritativa)
    if (esistente.stato === 'bozza') {
      const { error: updErr } = await supabase
        .from('rapportini' as never)
        .update({
          stato: 'approvato',
          inviato_da: ctx.userId,
          inviato_at: now,
          approvato_da: ctx.userId,
          approvato_at: now,
        } as never)
        .eq('id', rapportinoId)
        .eq('tenant_id', ctx.tenantId);
      if (updErr) return { ok: false, error: updErr.message };
    }
    // Negli altri stati (inviato/approvato/respinto/ecc.) non tocchiamo lo stato:
    // l'aggiunta di una riga da parte dell'ufficio è comunque valida.
  } else {
    // Crea rapportino direttamente approvato
    const { data: nuovoRaw, error: insErr } = await supabase
      .from('rapportini' as never)
      .insert({
        tenant_id: ctx.tenantId,
        dipendente_id: dipendenteId,
        data,
        stato: 'approvato',
        inviato_da: ctx.userId,
        inviato_at: now,
        approvato_da: ctx.userId,
        approvato_at: now,
      } as never)
      .select('id')
      .single();
    if (insErr || !nuovoRaw) return { ok: false, error: insErr?.message ?? 'Errore creazione rapportino' };
    rapportinoId = (nuovoRaw as { id: string }).id;
  }

  // Com'era prima della correzione dell'ufficio.
  const primaModificaUfficio = await leggiStatoGiornata(supabase, rapportinoId);

  // Minuti puri del cantiere: le quote (ordinarie, straordinarie, viaggio
  // ordinario ed eccedente) le deriva lo scrittore unico su tutta la giornata.
  const scritte = await aggiornaRigheGiornata(supabase, {
    tenantId: ctx.tenantId,
    rapportinoId,
    data,
    modifiche: [
      {
        commessa_id: commessaId ?? null,
        cantiere_id: cantiereId ?? null,
        minutiLavoro: Math.round(ore_lavoro * 60),
        minutiViaggio: Math.round(ore_viaggio * 60),
        note: note ?? null,
      },
    ],
  });
  if (!scritte.ok) return { ok: false, error: scritte.error };

  // L'ufficio ha scritto a mano: marca il rapportino come manuale così l'auto
  // ricalcolo dalle timbrature non sovrascrive/cancella più queste righe.
  await marcaRapportinoManuale(supabase, rapportinoId);

  await scriviVersioneRapportino({
    supabase,
    rapportinoId,
    tenantId: ctx.tenantId,
    azione: 'modifica_ufficio',
    modificatoDa: ctx.userId,
    modificatoDaNome: await nomeUtente(supabase, ctx.userId),
    prima: primaModificaUfficio,
  });

  revalidatePath('/office/kantiere/rapportini');
  return { ok: true };
}

// ── chiudiGiornata: l'ufficio chiude una giornata rimasta aperta ────────────
// Inserisce l'uscita mancante (origine 'manuale') all'orario indicato per i
// target con un ingresso ancora aperto in quel giorno, poi ricalcola il
// rapportino. L'orario è "da muro" italiano (Europe/Rome).

const ChiudiGiornataSchema = z.object({
  dipendenteId: z.string().uuid(),
  giorno: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  oraUscita: z.string().regex(/^\d{2}:\d{2}$/),
});

export async function chiudiGiornata(input: unknown): Promise<Result> {
  const parsed = ChiudiGiornataSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  const ctx = await guard();
  const supabase = createServerSupabase();
  const { dipendenteId, giorno, oraUscita } = parsed.data;

  const { data: dip } = await supabase
    .from('dipendenti' as never)
    .select('id')
    .eq('id', dipendenteId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (!dip) return { ok: false, error: 'DIPENDENTE_NON_TROVATO' };

  // Timbrature del giorno italiano esatto.
  const { fromIso, toIso } = romeDayBoundsUtc(giorno);
  const { data: timbRaw } = await supabase
    .from('timbrature' as never)
    .select('id, commessa_id, cantiere_id, tipo, ts, pausa')
    .eq('tenant_id', ctx.tenantId)
    .eq('dipendente_id', dipendenteId)
    .gte('ts', fromIso)
    .lt('ts', toIso)
    .order('ts', { ascending: true });
  const timb = (timbRaw as {
    id: string;
    commessa_id: string | null;
    cantiere_id: string | null;
    tipo: 'ingresso' | 'uscita';
    ts: string;
    pausa: boolean | null;
  }[] | null) ?? [];

  // Target con turno ancora aperto. L'uscita di PAUSA non chiude il turno
  // (il dipendente è solo a pranzo): solo la fine turno (uscita pausa=false).
  const aperti = new Map<string, { commessa_id: string | null; cantiere_id: string | null; ingressoTs: string }>();
  for (const t of timb) {
    const key = t.cantiere_id ? `k:${t.cantiere_id}` : t.commessa_id ? `c:${t.commessa_id}` : '';
    if (!key) continue;
    if (t.tipo === 'ingresso') {
      if (!aperti.has(key)) {
        aperti.set(key, { commessa_id: t.commessa_id, cantiere_id: t.cantiere_id, ingressoTs: t.ts });
      }
    } else if (!t.pausa) {
      aperti.delete(key);
    }
  }
  if (aperti.size === 0) return { ok: false, error: 'NESSUNA_GIORNATA_APERTA' };

  const uscitaTs = romeWallToUtcIso(giorno, oraUscita);
  for (const a of aperti.values()) {
    if (Date.parse(uscitaTs) <= Date.parse(a.ingressoTs)) {
      return { ok: false, error: 'ORA_USCITA_NON_VALIDA' };
    }
  }

  // Com'era prima: dopo non c'è più modo di saperlo.
  const primaDellaChiusura = await statoGiornataPerData(supabase, ctx.tenantId, dipendenteId, giorno);

  const inserts = Array.from(aperti.values()).map((a) => ({
    tenant_id: ctx.tenantId,
    dipendente_id: dipendenteId,
    commessa_id: a.commessa_id,
    cantiere_id: a.cantiere_id,
    tipo: 'uscita',
    origine: 'manuale',
    modalita: 'ufficio',
    ts: uscitaTs,
    creato_da: ctx.userId,
  }));
  const { error: insErr } = await supabase.from('timbrature' as never).insert(inserts as never);
  if (insErr) return { ok: false, error: insErr.message };

  // Ricalcola il rapportino (resta automatico se il tecnico non l'ha toccato).
  // Senza versione automatica: la scriviamo noi, con chi e cosa.
  const rappChiuso = await ricomputaRapportinoAuto(supabase, ctx.tenantId, dipendenteId, giorno, {
    versione: false,
  });
  if (rappChiuso) {
    await scriviVersioneRapportino({
      supabase,
      rapportinoId: rappChiuso.id,
      tenantId: ctx.tenantId,
      azione: 'chiusura_ufficio',
      modificatoDa: ctx.userId,
      modificatoDaNome: await nomeUtente(supabase, ctx.userId),
      prima: primaDellaChiusura,
    });
  }

  revalidatePath('/office/kantiere/rapportini');
  revalidatePath(`/office/kantiere/dipendenti/${dipendenteId}`);
  return { ok: true };
}

// ── giornateAperte: giornate PASSATE con ingresso senza uscita ──────────────
// Promemoria per l'ufficio: chi ha dimenticato di timbrare l'uscita. Esclude
// la giornata odierna (in corso è normale).

export type GiornataAperta = {
  dipendenteId: string;
  dipendenteNome: string;
  giorno: string;
  ingressoTs: string;
  targetLabel: string;
};

export async function giornateAperte(
  input?: unknown,
): Promise<{ ok: true; giorni: GiornataAperta[] } | { ok: false; error: string }> {
  const parsed = z.object({ giorni: z.number().int().min(1).max(60).optional() }).safeParse(input ?? {});
  const n = parsed.success ? parsed.data.giorni ?? 21 : 21;
  let ctx;
  try {
    ctx = await guard();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const supabase = createServerSupabase();

  const oggi = romeDay(new Date());
  const past = new Date(Date.now() - n * 24 * 3600 * 1000);
  const { fromIso } = romeDayBoundsUtc(romeDay(past));

  type TimbraturaAperta = {
    dipendente_id: string;
    commessa_id: string | null;
    cantiere_id: string | null;
    tipo: 'ingresso' | 'uscita';
    ts: string;
    pausa: boolean | null;
  };
  // Tutte le timbrature del periodo, a pagine: oltre 1000 righe la lettura
  // unica si fermava e le giornate più recenti sparivano dal promemoria.
  let timb: TimbraturaAperta[];
  try {
    timb = await leggiTutto<TimbraturaAperta>(
      (da, a) =>
        supabase
          .from('timbrature' as never)
          .select('dipendente_id, commessa_id, cantiere_id, tipo, ts, pausa')
          .eq('tenant_id', ctx.tenantId)
          .gte('ts', fromIso)
          .order('ts', { ascending: true })
          .order('id')
          .range(da, a) as never,
      { contesto: 'giornate aperte' },
    );
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  // Pairing per (dipendente, giorno italiano, target). L'uscita di pausa non
  // chiude il turno: resta "aperto" finché non arriva la fine turno.
  const aperti = new Map<
    string,
    { dipId: string; giorno: string; commessaId: string | null; cantiereId: string | null; ingressoTs: string }
  >();
  for (const t of timb) {
    const giorno = romeDay(new Date(t.ts));
    const targetKey = t.cantiere_id ? `k:${t.cantiere_id}` : t.commessa_id ? `c:${t.commessa_id}` : '';
    if (!targetKey) continue;
    const key = `${t.dipendente_id}|${giorno}|${targetKey}`;
    if (t.tipo === 'ingresso') {
      if (!aperti.has(key)) {
        aperti.set(key, {
          dipId: t.dipendente_id,
          giorno,
          commessaId: t.commessa_id,
          cantiereId: t.cantiere_id,
          ingressoTs: t.ts,
        });
      }
    } else if (!t.pausa) {
      aperti.delete(key);
    }
  }

  // Solo giornate PASSATE (oggi in corso è normale).
  const aperte = Array.from(aperti.values()).filter((a) => a.giorno < oggi);
  if (aperte.length === 0) return { ok: true, giorni: [] };

  // Risolvi nomi dipendenti + label target.
  const dipIds = [...new Set(aperte.map((a) => a.dipId))];
  const cantIds = [...new Set(aperte.flatMap((a) => (a.cantiereId ? [a.cantiereId] : [])))];
  const commIds = [...new Set(aperte.flatMap((a) => (a.commessaId ? [a.commessaId] : [])))];

  const [dipRes, cantRes, commRes] = await Promise.all([
    supabase.from('dipendenti' as never).select('id, nome, cognome').in('id', dipIds),
    cantIds.length
      ? supabase.from('cantieri' as never).select('id, nome, codice').in('id', cantIds)
      : Promise.resolve({ data: [] as { id: string; nome: string | null; codice: string | null }[] }),
    commIds.length
      ? supabase.from('commesse' as never).select('id, codice_interno').in('id', commIds)
      : Promise.resolve({ data: [] as { id: string; codice_interno: string | null }[] }),
  ]);
  const dipMap = new Map<string, string>();
  for (const d of (dipRes.data as { id: string; nome: string; cognome: string }[] | null) ?? [])
    dipMap.set(d.id, `${d.cognome} ${d.nome}`.trim());
  const cantMap = new Map<string, string>();
  for (const c of (cantRes.data as { id: string; nome: string | null; codice: string | null }[] | null) ?? [])
    cantMap.set(c.id, c.nome || c.codice || 'Cantiere');
  const commMap = new Map<string, string>();
  for (const c of (commRes.data as { id: string; codice_interno: string | null }[] | null) ?? [])
    commMap.set(c.id, c.codice_interno || 'Commessa');

  const giorni: GiornataAperta[] = aperte
    .map((a) => ({
      dipendenteId: a.dipId,
      dipendenteNome: dipMap.get(a.dipId) ?? a.dipId,
      giorno: a.giorno,
      ingressoTs: a.ingressoTs,
      targetLabel: a.cantiereId
        ? cantMap.get(a.cantiereId) ?? 'Cantiere'
        : a.commessaId
          ? commMap.get(a.commessaId) ?? 'Commessa'
          : '',
    }))
    .sort((x, y) => (x.giorno < y.giorno ? 1 : x.giorno > y.giorno ? -1 : 0));

  return { ok: true, giorni };
}

// ── ricalcolo presenze dalle timbrature (riparazione/manutenzione) ───────────

const RicalcoloSchema = z.object({
  da: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  a: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * Ricalcola i rapportini dalle timbrature per il periodo indicato (solo
 * office/admin). Utile per riparare giornate rimaste "bloccate" (es. vecchio
 * flusso manuale con righe vuote): le timbrature sono la verità, qui le
 * riallineiamo. Salta le giornate già approvate/respinte dall'ufficio.
 */
export async function ricalcolaPresenzePeriodo(
  input: z.infer<typeof RicalcoloSchema>,
): Promise<{ ok: true; giorni: number } | { ok: false; error: string }> {
  const parsed = RicalcoloSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'DATI_NON_VALIDI' };
  const { da, a } = parsed.data;

  const ctx = await requireTenantContext();
  if (ctx.role !== 'admin' && ctx.role !== 'office') return { ok: false, error: 'NON_AUTORIZZATO' };
  if (!(await tenantHasModule('kantiere'))) return { ok: false, error: 'MODULO_ASSENTE' };
  if (da > a) return { ok: false, error: 'PERIODO_NON_VALIDO' };

  const supabase = createServerSupabase();
  const fromIso = romeDayBoundsUtc(da).fromIso;
  const toIso = romeDayBoundsUtc(a).toIso;

  // Tutte le timbrature del periodo, a pagine: un `.limit(20000)` restituiva
  // comunque al massimo 1000 righe e il ricalcolo saltava giornate in silenzio.
  let righe: { dipendente_id: string; ts: string }[];
  try {
    righe = await leggiTutto<{ dipendente_id: string; ts: string }>(
      (da, a) =>
        supabase
          .from('timbrature' as never)
          .select('dipendente_id, ts')
          .eq('tenant_id', ctx.tenantId)
          .gte('ts', fromIso)
          .lt('ts', toIso)
          .order('ts')
          .order('id')
          .range(da, a) as never,
      { contesto: 'ricalcolo presenze' },
    );
  } catch (e) {
    console.error('[ricalcolaPresenzePeriodo]', (e as Error).message);
    return { ok: false, error: 'LETTURA_TIMBRATURE' };
  }

  // coppie distinte (dipendente, giorno italiano)
  const coppie = new Map<string, { dipId: string; giorno: string }>();
  for (const r of righe) {
    const giorno = romeDay(new Date(r.ts));
    const k = `${r.dipendente_id}|${giorno}`;
    if (!coppie.has(k)) coppie.set(k, { dipId: r.dipendente_id, giorno });
  }

  let n = 0;
  for (const { dipId, giorno } of coppie.values()) {
    await ricomputaRapportinoAuto(supabase, ctx.tenantId, dipId, giorno);
    n += 1;
  }

  revalidatePath('/office/kantiere/rapportini');
  revalidatePath('/office/kantiere/dipendenti');
  return { ok: true, giorni: n };
}

// ── correzione anomalia: aggiungi una pausa pranzo dimenticata ───────────────

const AggiungiPausaSchema = z.object({
  dipendenteId: z.string().uuid(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  minuti: z.number().int().min(5).max(240),
});

/**
 * L'ufficio aggiunge una PAUSA PRANZO dimenticata a una giornata (caso tipico:
 * turno > 10h perché non è stata timbrata la pausa). Inserisce una coppia-pausa
 * (uscita+ingresso `pausa=true`, origine 'manuale') centrata nel turno, poi
 * ricalcola: le ore lavorate scendono e, se rientrano nella soglia, la giornata
 * si AUTO-APPROVA. Le timbrature restano la verità.
 */
export async function aggiungiPausaGiornata(
  input: z.infer<typeof AggiungiPausaSchema>,
): Promise<{ ok: true; minutiPausa: number } | { ok: false; error: string }> {
  const parsed = AggiungiPausaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'DATI_NON_VALIDI' };
  const { dipendenteId, data, minuti } = parsed.data;

  const ctx = await requireTenantContext();
  if (ctx.role !== 'admin' && ctx.role !== 'office') return { ok: false, error: 'NON_AUTORIZZATO' };
  if (!(await tenantHasModule('kantiere'))) return { ok: false, error: 'MODULO_ASSENTE' };

  const supabase = createServerSupabase();
  const { fromIso, toIso } = romeDayBoundsUtc(data);
  const { data: timbRaw } = await supabase
    .from('timbrature' as never)
    .select('commessa_id, cantiere_id, tipo, ts, pausa')
    .eq('tenant_id', ctx.tenantId)
    .eq('dipendente_id', dipendenteId)
    .gte('ts', fromIso)
    .lt('ts', toIso)
    .order('ts', { ascending: true });
  const timb =
    (timbRaw as {
      commessa_id: string | null;
      cantiere_id: string | null;
      tipo: 'ingresso' | 'uscita';
      ts: string;
      pausa: boolean | null;
    }[] | null) ?? [];

  // Estremi del turno: primo ingresso reale, ultima uscita reale (escludo pause).
  const lavori = timb.filter((t) => !t.pausa);
  const primoIngresso = lavori.find((t) => t.tipo === 'ingresso');
  const ultimaUscita = [...lavori].reverse().find((t) => t.tipo === 'uscita');
  if (!primoIngresso || !ultimaUscita) {
    return { ok: false, error: 'GIORNATA_NON_CHIUSA' };
  }

  const start = Date.parse(primoIngresso.ts);
  const end = Date.parse(ultimaUscita.ts);
  if (!(end > start)) return { ok: false, error: 'TURNO_NON_VALIDO' };
  // La pausa deve starci dentro al turno.
  const durataTurnoMin = (end - start) / 60000;
  if (minuti >= durataTurnoMin) return { ok: false, error: 'PAUSA_TROPPO_LUNGA' };

  // Com'era prima: la cronologia deve poter dire «lavoro 8:00 → 7:00». Prima
  // di questa riga la pausa dell'ufficio cambiava le ore senza lasciare traccia.
  const primaDellaPausa = await statoGiornataPerData(supabase, ctx.tenantId, dipendenteId, data);

  // Sostituisce l'eventuale pausa già presente (es. auto-chiusa dal sistema o
  // dichiarata in uscita): "aggiungi pausa" IMPOSTA la pausa della giornata, non
  // se ne accumulano due → altrimenti il pranzo verrebbe sottratto due volte.
  // Stessa logica di `modificaMiaGiornata`.
  await supabase
    .from('timbrature' as never)
    .delete()
    .eq('tenant_id', ctx.tenantId)
    .eq('dipendente_id', dipendenteId)
    .eq('pausa', true)
    .gte('ts', fromIso)
    .lt('ts', toIso);

  // Stessa coppia-pausa centrata della pausa dichiarata in chiusura turno.
  const { uscitaIso, ingressoIso } = coppiaPausaCentrata(primoIngresso.ts, ultimaUscita.ts, minuti);
  const base = {
    tenant_id: ctx.tenantId,
    dipendente_id: dipendenteId,
    commessa_id: primoIngresso.commessa_id,
    cantiere_id: primoIngresso.cantiere_id,
    pausa: true,
    origine: 'manuale',
    modalita: 'ufficio',
    creato_da: ctx.userId,
  };
  const { error: insErr } = await supabase.from('timbrature' as never).insert([
    { ...base, tipo: 'uscita', ts: uscitaIso },
    { ...base, tipo: 'ingresso', ts: ingressoIso },
  ] as never);
  if (insErr) return { ok: false, error: insErr.message };

  // Ricalcola la giornata: ore lavorate ridotte → eventuale auto-approvazione.
  const rappPausa = await ricomputaRapportinoAuto(supabase, ctx.tenantId, dipendenteId, data, {
    versione: false,
  });
  if (rappPausa) {
    await scriviVersioneRapportino({
      supabase,
      rapportinoId: rappPausa.id,
      tenantId: ctx.tenantId,
      azione: 'pausa_ufficio',
      modificatoDa: ctx.userId,
      modificatoDaNome: await nomeUtente(supabase, ctx.userId),
      prima: primaDellaPausa,
    });
  }

  revalidatePath('/office/kantiere/rapportini');
  revalidatePath('/office/kantiere/dipendenti');
  revalidatePath('/office/kantiere/anomalie');
  return { ok: true, minutiPausa: minuti };
}

import { arrotondaTimbrature } from '@kommessa/api/arrotondamento-timbri';
import 'server-only';

import { createServerSupabase } from '@kommessa/api/server';
import { romeDay, romeDayBoundsUtc } from '@kommessa/api/rome-time';
import { STATI_CANTIERE_VIVI } from '@kommessa/api/stato-lavoro';

import { leggiImpostazioniKantiere, regolaTimbriDa } from '@/app/_lib/kantiere-config';
import { modalitaLavoroDi } from '@/app/_lib/dipendenti-modalita';
import { leggiStatoTimbro } from '@/app/_lib/timbro/config';
import { giornateTimbroPersona } from '@/app/_lib/timbro/giornate';
import { vistaDaGiornata, type TimbroGiornataVista } from '@/app/_lib/timbro/vista';
import { titoloCase } from '@/app/mobile/_lib/display-case';

/**
 * «La mia giornata» per chi lavora da scrivania: cio' che serve alla barra
 * dell'ufficio e al dialog «Compila giornata». Una lettura sola, dal guscio.
 *
 * Esiste perche' chi gestisce le presenze da PC spesso timbra anche per se':
 * fino a ieri doveva prendere il telefono. Qui c'e' lo stato del turno (e da
 * dove e' partito), la scatola timbrata al terminale se c'e', e tutto cio'
 * che un dialog da scrivania deve sapere senza altre letture.
 */

export type ComeAperto = 'app' | 'qr' | 'terminale' | 'ufficio' | 'altro';

export interface TurnoMio {
  cantiereId: string;
  cantiereNome: string;
  inizioTs: string;
  inPausa: boolean;
  inizioPausaTs: string | null;
  come: ComeAperto;
  /** In sede sul progetto («lavoro dalla sede»). */
  inSede: boolean;
  /** Oggi c'e' un solo evento (l'ingresso): la divisione fra cantieri e' proponibile. */
  giornataPulita: boolean;
  pausaOggiFatta: boolean;
}

export interface CantiereOpzione {
  id: string;
  nome: string;
  codice: string | null;
  cliente: string | null;
}

export interface MiaGiornata {
  dipendenteId: string;
  giorno: string;
  modalitaLavoro: 'ufficio' | 'esterno';
  turno: TurnoMio | null;
  /** La giornata vista dal terminale (oggi, o la piu' vecchia da ripartire). */
  timbro: TimbroGiornataVista | null;
  /** Minuti di lavoro gia' attribuiti oggi (coppie ingresso→uscita). */
  lavoratiOggiMin: number;
  /** Ci sono timbrature oggi: «Registra giornata» non si propone. */
  haTimbratureOggi: boolean;
  cantieri: CantiereOpzione[];
  sedi: { id: string; nome: string; tipo: string; isDefault: boolean }[];
  sediPerCantiere: Record<string, string[]>;
  mezzi: { id: string; targa: string; modello: string | null }[];
  ultimoMezzoId: string | null;
  impostazioni: {
    passoMinuti: number;
    stepViaggio: number;
    sogliaPausaPranzoOre: number;
    splitAttivo: boolean;
    registraGiornataAttivo: boolean;
    tolleranzaChiusuraMin: number;
    /** Passo (min) delle timbrature nei calcoli; 0 = al minuto. */
    arrotondamentoTimbriMin: number;
  };
}

function comeDa(origine: string | null, modalita: string | null): ComeAperto {
  if (modalita === 'qr' || origine === 'qr') return 'qr';
  if (modalita === 'timbratrice' || origine === 'timbro') return 'terminale';
  if (modalita === 'ufficio') return 'ufficio';
  if (modalita === 'app' || origine === 'cronometro') return 'app';
  return 'altro';
}

export async function leggiMiaGiornata(tenantId: string, userId: string, role: string): Promise<MiaGiornata | null> {
  const supabase = createServerSupabase();
  const { data: dipRow } = await supabase
    .from('dipendenti' as never)
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();
  const dipendenteId = (dipRow as { id: string } | null)?.id;
  if (!dipendenteId) return null;

  const giorno = romeDay(new Date());
  const { fromIso, toIso } = romeDayBoundsUtc(giorno);

  const [timbRes, cantRes, sediRes, assocRes, mezziRes, ultimoRes, imp, modalita, statoTimbro] = await Promise.all([
    supabase
      .from('timbrature' as never)
      .select('id, cantiere_id, tipo, pausa, ts, origine, modalita, sede_lavoro_id')
      .eq('tenant_id', tenantId)
      .eq('dipendente_id', dipendenteId)
      .gte('ts', fromIso)
      .lt('ts', toIso)
      .order('ts'),
    supabase
      .from('cantieri' as never)
      .select('id, nome, codice, codice_commessa, cliente_nome')
      .eq('tenant_id', tenantId)
      .in('stato', STATI_CANTIERE_VIVI as unknown as string[])
      .order('nome'),
    supabase.from('sedi' as never).select('id, nome, tipo, is_default').eq('tenant_id', tenantId).eq('attivo', true),
    supabase.from('cantiere_sede' as never).select('cantiere_id, sede_id').eq('tenant_id', tenantId),
    supabase.from('mezzi' as never).select('id, targa, modello').eq('tenant_id', tenantId).eq('attivo', true).order('targa'),
    supabase
      .from('timbratura_viaggio' as never)
      .select('mezzo_id')
      .eq('dipendente_id', dipendenteId)
      .eq('autista', true)
      .not('mezzo_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    leggiImpostazioniKantiere(supabase, tenantId),
    modalitaLavoroDi(supabase, tenantId, dipendenteId),
    leggiStatoTimbro(tenantId),
  ]);

  type T = { id: string; cantiere_id: string | null; tipo: 'ingresso' | 'uscita'; pausa: boolean | null; ts: string; origine: string | null; modalita: string | null; sede_lavoro_id: string | null };
  // Orari arrotondati al passo del cliente: e' cosi' che si contano le ore.
  const timbrature = arrotondaTimbrature(((timbRes.data as T[] | null) ?? []).filter((t) => t.cantiere_id), regolaTimbriDa(imp));

  // Il turno aperto: per cantiere, finche' non arriva un'uscita di fine.
  type Stato = { inizio: T; inPausa: boolean; inizioPausaTs: string | null; ultimoIngresso: T };
  const aperti = new Map<string, Stato>();
  let lavorati = 0;
  const apertiMs = new Map<string, number>();
  for (const t of timbrature) {
    const k = t.cantiere_id!;
    const cur = aperti.get(k);
    if (t.tipo === 'ingresso') {
      if (!cur) aperti.set(k, { inizio: t, inPausa: false, inizioPausaTs: null, ultimoIngresso: t });
      else {
        cur.inPausa = false;
        cur.inizioPausaTs = null;
        cur.ultimoIngresso = t;
      }
      apertiMs.set(k, Date.parse(t.ts));
    } else {
      const da = apertiMs.get(k);
      if (da != null) {
        lavorati += Math.max(0, Math.round((Date.parse(t.ts) - da) / 60_000));
        apertiMs.delete(k);
      }
      if (t.pausa && cur) {
        cur.inPausa = true;
        cur.inizioPausaTs = t.ts;
      } else {
        aperti.delete(k);
      }
    }
  }
  const cantieri = ((cantRes.data as { id: string; nome: string | null; codice: string | null; codice_commessa: string | null; cliente_nome: string | null }[] | null) ?? []).map(
    (c) => ({ id: c.id, nome: titoloCase(c.nome ?? '') || c.codice || 'Cantiere', codice: c.codice_commessa ?? c.codice, cliente: c.cliente_nome }),
  );
  const nomeCantiere = new Map(cantieri.map((c) => [c.id, c.nome]));

  let turno: TurnoMio | null = null;
  const [primoAperto] = [...aperti.entries()];
  if (primoAperto) {
    const [cantiereId, st] = primoAperto;
    turno = {
      cantiereId,
      cantiereNome: nomeCantiere.get(cantiereId) ?? 'Cantiere',
      inizioTs: st.inizio.ts,
      inPausa: st.inPausa,
      inizioPausaTs: st.inizioPausaTs,
      come: comeDa(st.inizio.origine, st.inizio.modalita),
      // La sede di lavoro sta sull'ingresso di apertura: la ripresa dopo la
      // pausa non la ripete.
      inSede: !!st.inizio.sede_lavoro_id || !!st.ultimoIngresso.sede_lavoro_id,
      giornataPulita: timbrature.length === 1,
      pausaOggiFatta: timbrature.some((t) => t.cantiere_id === cantiereId && t.pausa),
    };
  }

  let timbro: TimbroGiornataVista | null = null;
  // Il registro si legge sempre: contiene i badge del terminale (se collegato)
  // e la presenza segnata dall'app o dal PC senza cantiere.
  void statoTimbro;
  void role;
  {
    const { oggi, daFare } = await giornateTimbroPersona(supabase, tenantId, dipendenteId);
    const scelta = daFare ?? oggi;
    if (scelta) {
      timbro = vistaDaGiornata(
        scelta,
        '',
        (id) => (nomeCantiere.has(id) ? { nome: nomeCantiere.get(id)!, codice: null } : null),
        modalita === 'ufficio' ? 'ufficio' : 'esterno',
      );
    }
  }

  const sediPerCantiere: Record<string, string[]> = {};
  for (const r of (assocRes.data as { cantiere_id: string; sede_id: string }[] | null) ?? []) {
    (sediPerCantiere[r.cantiere_id] ??= []).push(r.sede_id);
  }

  return {
    dipendenteId,
    giorno,
    modalitaLavoro: modalita === 'ufficio' ? 'ufficio' : 'esterno',
    turno,
    timbro,
    lavoratiOggiMin: lavorati,
    haTimbratureOggi: timbrature.length > 0,
    cantieri,
    sedi: ((sediRes.data as { id: string; nome: string; tipo: string; is_default: boolean }[] | null) ?? []).map((s) => ({
      id: s.id,
      nome: titoloCase(s.nome),
      tipo: s.tipo,
      isDefault: s.is_default,
    })),
    sediPerCantiere,
    mezzi: ((mezziRes.data as { id: string; targa: string; modello: string | null }[] | null) ?? []),
    ultimoMezzoId: (ultimoRes.data as { mezzo_id: string } | null)?.mezzo_id ?? null,
    impostazioni: {
      passoMinuti: imp.passoMinutiStepper,
      stepViaggio: imp.arrotondamentoViaggioMin,
      sogliaPausaPranzoOre: imp.sogliaPausaPranzoOre,
      splitAttivo: imp.splitFineTurnoAttivo,
      registraGiornataAttivo: imp.registraGiornataAttivo,
      tolleranzaChiusuraMin: imp.tolleranzaChiusuraMin,
      arrotondamentoTimbriMin: imp.arrotondamentoTimbriMin,
    },
  };
}

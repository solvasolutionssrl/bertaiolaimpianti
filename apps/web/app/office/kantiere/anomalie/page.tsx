import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { giornateIncomplete, type TimbraturaGiorno } from '@kommessa/api/kantiere-report';
import { eFestivo, eWeekend } from '@kommessa/api/kantiere-costi';
import { risolviTitoloCommessa } from '@/app/_lib/commessa-display';
import { AnomalieClient } from './_components/anomalie-client';

export const dynamic = 'force-dynamic';

// ---- local types -------------------------------------------------------

type TimbraturaRow = {
  dipendente_id: string;
  commessa_id: string | null;
  cantiere_id: string | null;
  tipo: string;
  ts: string;
};

type RapportinoRow = {
  id: string;
  dipendente_id: string;
  data: string;
  stato: string;
  inviato_at: string | null;
  updated_at: string | null;
};

type RigaStraordRow = {
  rapportino_id: string;
  commessa_id: string | null;
  cantiere_id: string | null;
  ore_straordinarie: number;
};

type RigaOreRow = {
  rapportino_id: string;
  commessa_id: string | null;
  cantiere_id: string | null;
  ore_ordinarie: number;
  ore_straordinarie: number;
  ore_viaggio: number;
};

type DipendenteRow = {
  id: string;
  nome: string;
  cognome: string;
  stato_attivo: boolean;
};

type CommessaRow = {
  id: string;
  codice_interno: string | null;
  nome_cartella: string | null;
  descrizione_ai_finale: string | null;
  descrizione_ai_proposta: string | null;
  note_iniziali: string | null;
};

type CantiereRow = {
  id: string;
  nome: string;
  codice: string | null;
};

/** Chiave stabile per raggruppamento: "c:uuid" per commessa, "k:uuid" per cantiere */
function targetKey(row: { commessa_id: string | null; cantiere_id: string | null }): string {
  if (row.commessa_id) return `c:${row.commessa_id}`;
  if (row.cantiere_id) return `k:${row.cantiere_id}`;
  return 'sconosciuto';
}

/** Etichetta display: titolo commessa o nome cantiere */
function targetLabel(
  row: { commessa_id: string | null; cantiere_id: string | null },
  commesseTitoloMap: Map<string, string>,
  cantieriNomeMap: Map<string, string>,
): string {
  if (row.commessa_id) return commesseTitoloMap.get(row.commessa_id) ?? row.commessa_id;
  if (row.cantiere_id) return cantieriNomeMap.get(row.cantiere_id) ?? row.cantiere_id;
  return 'Sconosciuto';
}

// ---- exported prop types -----------------------------------------------

export type IncompleteRow = {
  dipendente_id: string;
  dipendenteNome: string;
  commessa_id: string;
  commessaTitolo: string;
  giorno: string;
};

export type StraordinarioRow = {
  dipendenteNome: string;
  data: string;
  commessaTitolo: string;
  ore_straordinarie: number;
};

export type SenzaRapportinoRow = {
  nome: string;
};

export type ModificatoDopoInvioRow = {
  dipendenteNome: string;
  data: string;
  stato: string;
};

export type FestivoRow = {
  dipendenteNome: string;
  data: string;
  targetTitolo: string;
  ore_totali: number;
};

export type WeekendRow = {
  dipendenteNome: string;
  data: string;
  targetTitolo: string;
  ore_totali: number;
};

export type OreEccessiveRow = {
  dipendenteNome: string;
  data: string;
  ore_totali: number;
};

export type AnomalieAttivi = {
  incomplete: boolean;
  straordinari: boolean;
  senza_rapportino: boolean;
  modificato: boolean;
  festivo: boolean;
  weekend: boolean;
  ore_eccessive: boolean;
};

// ---- helpers -----------------------------------------------------------

function toYYYYMMDD(d: Date): string {
  // Giorno calendario in Europe/Rome (il server gira UTC): en-CA → YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(d);
}

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 13 * 24 * 60 * 60 * 1000); // ultimi 14 giorni
  return { from: toYYYYMMDD(from), to: toYYYYMMDD(to) };
}

/** Converte un timestamp ISO in data YYYY-MM-DD nel fuso Europe/Rome */
function tsToGiornoRome(ts: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date(ts));
}

// ---- page --------------------------------------------------------------

interface PageProps {
  searchParams: { from?: string; to?: string };
}

export default async function AnomaliePageWrapper({ searchParams }: PageProps) {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  // Leggi config anomalie dal modulo kantiere
  const { data: modRow } = await supabase
    .from('tenant_modules' as never)
    .select('config')
    .eq('tenant_id', ctx.tenantId)
    .eq('module_code', 'kantiere')
    .maybeSingle();

  const modConfig = ((modRow as { config: Record<string, unknown> | null } | null)?.config) ?? {};
  const rawAnomalie = modConfig.anomalie && typeof modConfig.anomalie === 'object'
    ? (modConfig.anomalie as Record<string, boolean>)
    : {};

  const attivi: AnomalieAttivi = {
    incomplete: rawAnomalie['incomplete'] !== false,
    straordinari: rawAnomalie['straordinari'] !== false,
    senza_rapportino: rawAnomalie['senza_rapportino'] !== false,
    modificato: rawAnomalie['modificato'] !== false,
    festivo: rawAnomalie['festivo'] !== false,
    weekend: rawAnomalie['weekend'] !== false,
    ore_eccessive: rawAnomalie['ore_eccessive'] !== false,
  };
  const anomalie_ore_max = typeof modConfig.anomalie_ore_max === 'number' ? modConfig.anomalie_ore_max : 13;

  const def = defaultRange();
  const from = searchParams.from ?? def.from;
  const to = searchParams.to ?? def.to;

  // Calcola la soglia ts per le timbrature: from 00:00 Rome / to 23:59:59 Rome
  // Usiamo semplicemente >=from e <=to sui giorni (la colonna ts è timestamptz)
  // Per semplicità confrontiamo la data Rome estratta in JS dopo aver caricato tutto il range UTC.
  // Usiamo: ts >= from (mezzanotte UTC del giorno from) e ts < day_after_to (00:00 UTC di to+1).
  const dayAfterTo = toYYYYMMDD(new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000));

  // ----------------------------------------------------------------
  // A) Timbrature incomplete (solo se attivo)
  // ----------------------------------------------------------------
  let timbraturaRows: TimbraturaRow[] = [];
  if (attivi.incomplete) {
    const { data: timbRaw } = (await supabase
      .from('timbrature' as never)
      .select('dipendente_id, commessa_id, cantiere_id, tipo, ts')
      .eq('tenant_id', ctx.tenantId)
      .gte('ts', `${from}T00:00:00.000Z`)
      .lt('ts', `${dayAfterTo}T00:00:00.000Z`)
      .limit(5000)) as { data: TimbraturaRow[] | null };
    timbraturaRows = timbRaw ?? [];
  }

  // Usa targetKey come commessa_id sintetico per giornateIncomplete (per-target grouping)
  const timbraturePerFn: TimbraturaGiorno[] = timbraturaRows
    .filter((t) => t.tipo === 'ingresso' || t.tipo === 'uscita')
    .map((t) => ({
      dipendente_id: t.dipendente_id,
      commessa_id: targetKey(t),
      giorno: tsToGiornoRome(t.ts),
      tipo: t.tipo as 'ingresso' | 'uscita',
    }));

  const incompleteRaw = attivi.incomplete ? giornateIncomplete(timbraturePerFn) : [];

  // ----------------------------------------------------------------
  // B) Rapportini e righe (per straordinario, modificato, festivo, weekend, ore_eccessive)
  // ----------------------------------------------------------------
  const needRapportini =
    attivi.straordinari ||
    attivi.senza_rapportino ||
    attivi.modificato ||
    attivi.festivo ||
    attivi.weekend ||
    attivi.ore_eccessive;

  let rapportini: RapportinoRow[] = [];
  let rapportinoIds: string[] = [];
  let dipIdsInPeriod: string[] = [];

  if (needRapportini) {
    const { data: rapRaw } = (await supabase
      .from('rapportini' as never)
      .select('id, dipendente_id, data, stato, inviato_at, updated_at')
      .eq('tenant_id', ctx.tenantId)
      .gte('data', from)
      .lte('data', to)
      .limit(2000)) as { data: RapportinoRow[] | null };

    rapportini = rapRaw ?? [];
    rapportinoIds = rapportini.map((r) => r.id);
    dipIdsInPeriod = [...new Set(rapportini.map((r) => r.dipendente_id))];
  }

  // Righe per straordinario
  let righeConStraord: RigaStraordRow[] = [];
  if (attivi.straordinari && rapportinoIds.length > 0) {
    const { data } = (await supabase
      .from('rapportino_righe' as never)
      .select('rapportino_id, commessa_id, cantiere_id, ore_straordinarie')
      .in('rapportino_id', rapportinoIds)
      .gt('ore_straordinarie', 0)) as { data: RigaStraordRow[] | null };
    righeConStraord = data ?? [];
  }

  // Righe per festivo/weekend/ore_eccessive
  let righeOre: RigaOreRow[] = [];
  if ((attivi.festivo || attivi.weekend || attivi.ore_eccessive) && rapportinoIds.length > 0) {
    const { data } = (await supabase
      .from('rapportino_righe' as never)
      .select('rapportino_id, commessa_id, cantiere_id, ore_ordinarie, ore_straordinarie, ore_viaggio')
      .in('rapportino_id', rapportinoIds)) as { data: RigaOreRow[] | null };
    righeOre = data ?? [];
  }

  const straordCommessaIds = [...new Set(righeConStraord.map((r) => r.commessa_id).filter((id): id is string => id != null))];
  const straordCantiereIds = [...new Set(righeConStraord.map((r) => r.cantiere_id).filter((id): id is string => id != null))];

  const oreCommessaIds = [...new Set(righeOre.map((r) => r.commessa_id).filter((id): id is string => id != null))];
  const oreCantiereIds = [...new Set(righeOre.map((r) => r.cantiere_id).filter((id): id is string => id != null))];

  // ----------------------------------------------------------------
  // C) Dipendenti attivi del tenant
  // ----------------------------------------------------------------
  const { data: dipendentiRaw } = (await supabase
    .from('dipendenti' as never)
    .select('id, nome, cognome, stato_attivo')
    .eq('tenant_id', ctx.tenantId)
    .eq('stato_attivo', true)) as { data: DipendenteRow[] | null };

  const dipendentiAttivi = dipendentiRaw ?? [];
  const dipIdsSet = new Set(dipIdsInPeriod);

  // ----------------------------------------------------------------
  // Batch-load: nomi dipendenti (attivi + quelli in rapportini/timbrature)
  // ----------------------------------------------------------------
  const allDipIds = [
    ...new Set([
      ...dipendentiAttivi.map((d) => d.id),
      ...timbraturaRows.map((t) => t.dipendente_id),
      ...dipIdsInPeriod,
    ]),
  ];

  const dipendentiMap = new Map<string, string>();
  if (allDipIds.length > 0) {
    const { data } = (await supabase
      .from('dipendenti' as never)
      .select('id, nome, cognome')
      .in('id', allDipIds)) as { data: DipendenteRow[] | null };
    for (const d of data ?? []) {
      dipendentiMap.set(d.id, `${d.nome} ${d.cognome}`.trim());
    }
  }

  // ----------------------------------------------------------------
  // Batch-load: titoli commesse
  // ----------------------------------------------------------------
  const timbCommessaIds = [...new Set(timbraturaRows.map((t) => t.commessa_id).filter((id): id is string => id != null))];
  const allCommessaIds = [...new Set([...timbCommessaIds, ...straordCommessaIds, ...oreCommessaIds])];

  const commesseTitoloMap = new Map<string, string>();
  if (allCommessaIds.length > 0) {
    const { data } = (await supabase
      .from('commesse' as never)
      .select(
        'id, codice_interno, nome_cartella, descrizione_ai_finale, descrizione_ai_proposta, note_iniziali',
      )
      .in('id', allCommessaIds)) as { data: CommessaRow[] | null };
    for (const c of data ?? []) {
      const titolo =
        risolviTitoloCommessa({
          descrizione_ai_finale: c.descrizione_ai_finale,
          descrizione_ai_proposta: c.descrizione_ai_proposta,
          note_iniziali: c.note_iniziali,
          nome_cartella: c.nome_cartella,
          codice_interno: c.codice_interno,
        }) || c.codice_interno || c.id;
      commesseTitoloMap.set(c.id, titolo);
    }
  }

  // ----------------------------------------------------------------
  // Batch-load: nomi cantieri
  // ----------------------------------------------------------------
  const timbCantiereIds = [...new Set(timbraturaRows.map((t) => t.cantiere_id).filter((id): id is string => id != null))];
  const allCantiereIds = [...new Set([...timbCantiereIds, ...straordCantiereIds, ...oreCantiereIds])];

  const cantieriNomeMap = new Map<string, string>();
  if (allCantiereIds.length > 0) {
    const { data } = (await supabase
      .from('cantieri' as never)
      .select('id, nome, codice')
      .in('id', allCantiereIds)) as { data: CantiereRow[] | null };
    for (const k of data ?? []) {
      cantieriNomeMap.set(k.id, k.nome || k.codice || k.id);
    }
  }

  // ----------------------------------------------------------------
  // Mappa targetKey → etichetta display (per risoluzione giornate incomplete)
  // ----------------------------------------------------------------
  const targetLabelByKey = new Map<string, string>();
  for (const t of timbraturaRows) {
    const key = targetKey(t);
    if (!targetLabelByKey.has(key)) {
      targetLabelByKey.set(key, targetLabel(t, commesseTitoloMap, cantieriNomeMap));
    }
  }

  // ----------------------------------------------------------------
  // Risolvi A) incomplete
  // ----------------------------------------------------------------
  const incomplete: IncompleteRow[] = incompleteRaw.map((r) => ({
    dipendente_id: r.dipendente_id,
    dipendenteNome: dipendentiMap.get(r.dipendente_id) ?? r.dipendente_id,
    commessa_id: r.commessa_id,
    commessaTitolo: targetLabelByKey.get(r.commessa_id) ?? r.commessa_id,
    giorno: r.giorno,
  }));

  // ----------------------------------------------------------------
  // Risolvi B) straordinario
  // ----------------------------------------------------------------
  const rapportinoMap = new Map<string, RapportinoRow>(rapportini.map((r) => [r.id, r]));

  const straordinario: StraordinarioRow[] = attivi.straordinari
    ? righeConStraord.map((riga) => {
        const rap = rapportinoMap.get(riga.rapportino_id);
        const dipId = rap?.dipendente_id ?? '';
        return {
          dipendenteNome: dipendentiMap.get(dipId) ?? dipId,
          data: rap?.data ?? '',
          commessaTitolo: targetLabel(riga, commesseTitoloMap, cantieriNomeMap),
          ore_straordinarie: riga.ore_straordinarie,
        };
      })
    : [];

  // ----------------------------------------------------------------
  // Risolvi C) senza rapportino
  // ----------------------------------------------------------------
  const senzaRapportino: SenzaRapportinoRow[] = attivi.senza_rapportino
    ? dipendentiAttivi
        .filter((d) => !dipIdsSet.has(d.id))
        .map((d) => ({ nome: `${d.nome} ${d.cognome}`.trim() }))
    : [];

  // ----------------------------------------------------------------
  // Risolvi D) modificato dopo invio
  // Si basa sulle versioni con azione 'modifica_tecnico' (modifica del
  // tecnico dopo l'invio), NON su updated_at (che viene bumpato anche dalle
  // azioni d'ufficio approva/respingi → falsi positivi).
  // ----------------------------------------------------------------
  let modificati: ModificatoDopoInvioRow[] = [];
  if (attivi.modificato && rapportini.length > 0) {
    const { data: vmodRaw } = await supabase
      .from('rapportino_versioni' as never)
      .select('rapportino_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('azione', 'modifica_tecnico')
      .in(
        'rapportino_id',
        rapportini.map((r) => r.id),
      );
    const modIds = new Set(
      ((vmodRaw as { rapportino_id: string }[] | null) ?? []).map((v) => v.rapportino_id),
    );
    modificati = rapportini
      .filter((r) => modIds.has(r.id))
      .map((r) => ({
        dipendenteNome: dipendentiMap.get(r.dipendente_id) ?? r.dipendente_id,
        data: r.data,
        stato: r.stato,
      }));
  }

  // ----------------------------------------------------------------
  // Risolvi E) festivo
  // ----------------------------------------------------------------
  // Mappa rapportino_id → data (per join rapido)
  const rapportinoDataMap = new Map<string, { data: string; dipendente_id: string }>(
    rapportini.map((r) => [r.id, { data: r.data, dipendente_id: r.dipendente_id }]),
  );

  const festivo: FestivoRow[] = [];
  if (attivi.festivo) {
    // Aggrega ore per (rapportino_id) dove la data del rapportino è festiva
    for (const riga of righeOre) {
      const info = rapportinoDataMap.get(riga.rapportino_id);
      if (!info) continue;
      if (!eFestivo(info.data)) continue;
      const oreTotali = (riga.ore_ordinarie ?? 0) + (riga.ore_straordinarie ?? 0) + (riga.ore_viaggio ?? 0);
      if (oreTotali <= 0) continue;
      festivo.push({
        dipendenteNome: dipendentiMap.get(info.dipendente_id) ?? info.dipendente_id,
        data: info.data,
        targetTitolo: targetLabel(riga, commesseTitoloMap, cantieriNomeMap),
        ore_totali: oreTotali,
      });
    }
    // Ordina per data desc
    festivo.sort((a, b) => b.data.localeCompare(a.data));
  }

  // ----------------------------------------------------------------
  // Risolvi F) weekend
  // ----------------------------------------------------------------
  const weekend: WeekendRow[] = [];
  if (attivi.weekend) {
    for (const riga of righeOre) {
      const info = rapportinoDataMap.get(riga.rapportino_id);
      if (!info) continue;
      if (!eWeekend(info.data)) continue;
      const oreTotali = (riga.ore_ordinarie ?? 0) + (riga.ore_straordinarie ?? 0) + (riga.ore_viaggio ?? 0);
      if (oreTotali <= 0) continue;
      weekend.push({
        dipendenteNome: dipendentiMap.get(info.dipendente_id) ?? info.dipendente_id,
        data: info.data,
        targetTitolo: targetLabel(riga, commesseTitoloMap, cantieriNomeMap),
        ore_totali: oreTotali,
      });
    }
    weekend.sort((a, b) => b.data.localeCompare(a.data));
  }

  // ----------------------------------------------------------------
  // Risolvi G) ore eccessive (somma per dipendente+data)
  // ----------------------------------------------------------------
  const oreEccessive: OreEccessiveRow[] = [];
  if (attivi.ore_eccessive) {
    // Aggrega (dipendente_id, data) → ore_ordinarie + ore_straordinarie
    const aggregato = new Map<string, { dipendente_id: string; data: string; ore: number }>();
    for (const riga of righeOre) {
      const info = rapportinoDataMap.get(riga.rapportino_id);
      if (!info) continue;
      const chiave = `${info.dipendente_id}|${info.data}`;
      const cur = aggregato.get(chiave) ?? { dipendente_id: info.dipendente_id, data: info.data, ore: 0 };
      cur.ore += (riga.ore_ordinarie ?? 0) + (riga.ore_straordinarie ?? 0);
      aggregato.set(chiave, cur);
    }
    for (const agg of aggregato.values()) {
      if (agg.ore > anomalie_ore_max) {
        oreEccessive.push({
          dipendenteNome: dipendentiMap.get(agg.dipendente_id) ?? agg.dipendente_id,
          data: agg.data,
          ore_totali: agg.ore,
        });
      }
    }
    oreEccessive.sort((a, b) => b.data.localeCompare(a.data));
  }

  return (
    <div className="w-full space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Anomalie</h1>
        <p className="text-sm text-muted-foreground">
          Segnalazioni automatiche nel periodo selezionato.
        </p>
      </header>
      <AnomalieClient
        incomplete={incomplete}
        straordinario={straordinario}
        senzaRapportino={senzaRapportino}
        modificati={modificati}
        festivo={festivo}
        weekend={weekend}
        oreEccessive={oreEccessive}
        anomalie_ore_max={anomalie_ore_max}
        attivi={attivi}
        filtri={{ from, to }}
      />
    </div>
  );
}

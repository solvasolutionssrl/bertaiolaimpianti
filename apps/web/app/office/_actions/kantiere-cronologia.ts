'use server';

import { z } from 'zod';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { romeDayBoundsUtc } from '@kommessa/api/rome-time';
import {
  affidabilitaGiornata,
  costruisciCronologia,
  riassuntoVersioni,
  type Affidabilita,
  type EventoCronologia,
  type SnapshotGiornata,
  type TimbraturaCronologia,
  type ViaggioCronologia,
} from '@kommessa/api/kantiere-cronologia';
import { tenantHasModule } from '@/app/_lib/modules';

/**
 * La cronologia completa di una giornata, per l'ufficio.
 *
 * Non legge un diario: ricostruisce la storia da timbrature, viaggi e versioni
 * del rapportino, cioè dai dati stessi. Vedi `@kommessa/api/kantiere-cronologia`.
 */

export interface CronologiaGiornataVista {
  persona: string;
  data: string;
  stato: string;
  cantieri: string[];
  minutiLavoro: number;
  minutiViaggio: number;
  affidabilita: Affidabilita;
  modificheDopoApprovazione: number;
  /** Almeno una modalità è dedotta (timbrature precedenti al 14/09/2026). */
  modalitaDedotte: boolean;
  eventi: EventoCronologia[];
}

type Esito = { ok: true; cronologia: CronologiaGiornataVista } | { ok: false; error: string };

export async function cronologiaGiornata(input: unknown): Promise<Esito> {
  const parsed = z.object({ rapportinoId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Richiesta non valida.' };

  const ctx = await requireTenantContext();
  if (!['owner', 'admin', 'office'].includes(ctx.role)) {
    return { ok: false, error: 'Non autorizzato.' };
  }
  if (!(await tenantHasModule('kantiere'))) return { ok: false, error: 'Modulo non attivo.' };

  const supabase = createServerSupabase();

  const { data: rappRaw } = await supabase
    .from('rapportini' as never)
    .select('id, dipendente_id, data, stato, approvato_at, approvato_da, auto_compilato')
    .eq('id', parsed.data.rapportinoId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  const rapp = rappRaw as {
    id: string;
    dipendente_id: string;
    data: string;
    stato: string;
    approvato_at: string | null;
    approvato_da: string | null;
    auto_compilato: boolean | null;
  } | null;
  if (!rapp) return { ok: false, error: 'Giornata non trovata.' };

  const { fromIso, toIso } = romeDayBoundsUtc(rapp.data);

  const [dipRes, timbRes, versRes, righeRes, viaggiSciolti] = await Promise.all([
    supabase
      .from('dipendenti' as never)
      .select('nome, cognome, user_id')
      .eq('id', rapp.dipendente_id)
      .maybeSingle(),
    supabase
      .from('timbrature' as never)
      .select('id, tipo, ts, origine, modalita, pausa, auto_chiusa, created_at, creato_da, geo_lat, cantiere_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('dipendente_id', rapp.dipendente_id)
      .gte('ts', fromIso)
      .lt('ts', toIso)
      .order('ts', { ascending: true }),
    supabase
      .from('rapportino_versioni' as never)
      .select('versione, azione, modificato_da_nome, created_at, snapshot')
      .eq('rapportino_id', rapp.id)
      .eq('tenant_id', ctx.tenantId)
      .order('versione', { ascending: true }),
    supabase
      .from('rapportino_righe' as never)
      .select('cantiere_id, ore_ordinarie, ore_straordinarie, ore_viaggio')
      .eq('rapportino_id', rapp.id),
    // Viaggi non legati a una timbratura: ore a mano e trasferimenti fra cantieri.
    supabase
      .from('timbratura_viaggio' as never)
      .select('id, timbratura_id, direzione, created_at, da_cantiere_id, sede_id, cantiere_id, distanza_km, durata_confermata_min, autista')
      .eq('tenant_id', ctx.tenantId)
      .eq('dipendente_id', rapp.dipendente_id)
      .eq('data', rapp.data)
      .is('timbratura_id', null),
  ]);

  const dip = dipRes.data as { nome: string | null; cognome: string | null; user_id: string | null } | null;
  const timb = (timbRes.data as {
    id: string;
    tipo: 'ingresso' | 'uscita';
    ts: string;
    origine: string | null;
    modalita: string | null;
    pausa: boolean | null;
    auto_chiusa: boolean | null;
    created_at: string | null;
    creato_da: string | null;
    geo_lat: number | null;
    cantiere_id: string | null;
  }[] | null) ?? [];
  const versioni = (versRes.data as {
    versione: number;
    azione: string;
    modificato_da_nome: string | null;
    created_at: string;
    snapshot: SnapshotGiornata | null;
  }[] | null) ?? [];
  const righe = (righeRes.data as {
    cantiere_id: string | null;
    ore_ordinarie: number | null;
    ore_straordinarie: number | null;
    ore_viaggio: number | null;
  }[] | null) ?? [];

  type RigaViaggio = {
    id: string;
    timbratura_id: string | null;
    direzione: string;
    created_at: string;
    da_cantiere_id: string | null;
    sede_id: string | null;
    cantiere_id: string | null;
    distanza_km: number | null;
    durata_confermata_min: number | null;
    autista: boolean | null;
  };
  const viaggi: RigaViaggio[] = [...((viaggiSciolti.data as RigaViaggio[] | null) ?? [])];
  if (timb.length > 0) {
    const { data } = await supabase
      .from('timbratura_viaggio' as never)
      .select('id, timbratura_id, direzione, created_at, da_cantiere_id, sede_id, cantiere_id, distanza_km, durata_confermata_min, autista')
      .in('timbratura_id', timb.map((t) => t.id));
    viaggi.push(...((data as RigaViaggio[] | null) ?? []));
  }

  // Nomi: chi ha inserito, cantieri, sedi.
  const idUtenti = [...new Set(timb.map((t) => t.creato_da).filter((x): x is string => !!x))];
  const idCantieri = [
    ...new Set(
      [
        ...timb.map((t) => t.cantiere_id),
        ...viaggi.flatMap((v) => [v.cantiere_id, v.da_cantiere_id]),
        ...righe.map((r) => r.cantiere_id),
      ].filter((x): x is string => !!x),
    ),
  ];
  const idSedi = [...new Set(viaggi.map((v) => v.sede_id).filter((x): x is string => !!x))];

  const [utentiRes, cantieriRes, sediRes] = await Promise.all([
    idUtenti.length
      ? supabase.from('users' as never).select('id, display_name').in('id', idUtenti)
      : Promise.resolve({ data: [] }),
    idCantieri.length
      ? supabase.from('cantieri' as never).select('id, nome, codice').in('id', idCantieri)
      : Promise.resolve({ data: [] }),
    idSedi.length
      ? supabase.from('sedi' as never).select('id, nome').in('id', idSedi)
      : Promise.resolve({ data: [] }),
  ]);
  const nomeUtente = new Map(
    ((utentiRes.data as { id: string; display_name: string | null }[] | null) ?? []).map((u) => [
      u.id,
      u.display_name,
    ]),
  );
  const nomeCantiere = new Map(
    ((cantieriRes.data as { id: string; nome: string | null; codice: string | null }[] | null) ?? []).map(
      (c) => [c.id, c.nome || c.codice || 'Cantiere'],
    ),
  );
  const nomeSede = new Map(
    ((sediRes.data as { id: string; nome: string | null }[] | null) ?? []).map((s) => [s.id, s.nome || 'Sede']),
  );

  const timbrature: TimbraturaCronologia[] = timb.map((t) => ({
    id: t.id,
    tipo: t.tipo,
    ts: t.ts,
    origine: t.origine,
    modalita: t.modalita,
    pausa: t.pausa,
    autoChiusa: t.auto_chiusa,
    createdAt: t.created_at,
    creatoDa: t.creato_da,
    creatoNome: t.creato_da ? (nomeUtente.get(t.creato_da) ?? null) : null,
    haGeo: t.geo_lat != null,
    cantiere: t.cantiere_id ? (nomeCantiere.get(t.cantiere_id) ?? null) : null,
  }));

  const viaggiCronologia: ViaggioCronologia[] = viaggi.map((v) => ({
    id: v.id,
    direzione: v.direzione,
    timbraturaId: v.timbratura_id,
    createdAt: v.created_at,
    daCantiere: v.da_cantiere_id ? (nomeCantiere.get(v.da_cantiere_id) ?? null) : null,
    sede: v.sede_id ? (nomeSede.get(v.sede_id) ?? null) : null,
    cantiere: v.cantiere_id ? (nomeCantiere.get(v.cantiere_id) ?? null) : null,
    km: v.distanza_km,
    minutiPagati: v.durata_confermata_min,
    autista: !!v.autista,
  }));

  const versioniCronologia = versioni.map((v) => ({
    versione: v.versione,
    azione: v.azione,
    quando: v.created_at,
    chi: v.modificato_da_nome,
    snapshot: v.snapshot,
  }));

  const userIdPersona = dip?.user_id ?? null;
  const eventi = costruisciCronologia({
    timbrature,
    viaggi: viaggiCronologia,
    versioni: versioniCronologia,
    userIdPersona,
    approvataAutoAl: rapp.stato === 'approvato' && !rapp.approvato_da ? rapp.approvato_at : null,
  });
  const riassunto = riassuntoVersioni(versioniCronologia);

  return {
    ok: true,
    cronologia: {
      persona: `${dip?.nome ?? ''} ${dip?.cognome ?? ''}`.trim() || 'Persona',
      data: rapp.data,
      stato: rapp.stato,
      cantieri: [
        ...new Set(
          righe.map((r) => (r.cantiere_id ? nomeCantiere.get(r.cantiere_id) : null)).filter((x): x is string => !!x),
        ),
      ],
      minutiLavoro: Math.round(
        righe.reduce((a, r) => a + Number(r.ore_ordinarie ?? 0) + Number(r.ore_straordinarie ?? 0), 0) * 60,
      ),
      minutiViaggio: Math.round(righe.reduce((a, r) => a + Number(r.ore_viaggio ?? 0), 0) * 60),
      affidabilita: affidabilitaGiornata({
        timbrature,
        azioniVersioni: riassunto.azioniSignificative,
        scrittaAMano: rapp.auto_compilato === false,
        userIdPersona,
      }),
      modificheDopoApprovazione: riassunto.modificheDopoApprovazione,
      modalitaDedotte: eventi.some((e) => e.ricostruita),
      eventi,
    },
  };
}

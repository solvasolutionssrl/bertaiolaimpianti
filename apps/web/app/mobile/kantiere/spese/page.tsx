import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Receipt } from 'lucide-react';

import { createServerSupabase } from '@kommessa/api/server';
import type { CategoriaSpesa } from '@kommessa/api/spese';
import { romeDay } from '@kommessa/api/rome-time';
import { titoloCase } from '@/app/mobile/_lib/display-case';
import { tenantHasModule } from '@/app/_lib/modules';
import { kontabilitaAttiva } from '@/app/_lib/kontabilita-config';

import { guardMobile } from '../../_lib/guard';
import { leggiMetodiAttivi } from '@/app/_lib/metodi-pagamento';
import { NuovaSpesa } from './_components/nuova-spesa';
import { SpeseClient, type SpesaRiga } from './_components/spese-client';
import { elencoCantieriPicker } from '../_lib/cantieri-picker-data';
import { mioTurnoAttivo } from '../_lib/turno-attivo';
import { LiveRefresh } from '@/app/_components/live-refresh';

export const metadata: Metadata = {
  title: 'Le mie spese',
};

export const dynamic = 'force-dynamic';

export default async function SpeseMobilePage() {
  const ctx = await guardMobile();
  const supabase = createServerSupabase();
  const metodi = (await leggiMetodiAttivi(supabase, ctx.tenantId)).map((m) => ({
    codice: m.codice,
    nome: m.nome,
  }));

  // Sotto-modulo Kontabilità: gated dal modulo kantiere + flag per-tenant.
  if (!(await tenantHasModule('kantiere')) || !(await kontabilitaAttiva(supabase, ctx.tenantId))) {
    notFound();
  }

  // Profilo dipendente dell'utente (filtro di sicurezza extra oltre l'RLS).
  const { data: dipRow } = await supabase
    .from('dipendenti' as never)
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('user_id', ctx.userId)
    .maybeSingle();
  const dipId = (dipRow as { id: string } | null)?.id ?? null;

  const isManager = ctx.role === 'admin' || ctx.role === 'office';

  // Nuovo flusso: prima si sceglie il cantiere (ricerca) → serve la lista picker
  // a TUTTI. Se c'è un turno aperto, lo si preseleziona. `cantieriOpts` (formato
  // semplice) alimenta il picker di modifica del dettaglio (solo manager).
  const [cantieriPicker, turno] = await Promise.all([
    elencoCantieriPicker(ctx.tenantId),
    mioTurnoAttivo(),
  ]);
  const cantieriOpts = cantieriPicker.map((c) => ({
    id: c.id,
    nome: c.nome ? titoloCase(c.nome) : c.codice || 'Cantiere',
  }));

  let spese: SpesaRiga[] = [];
  const cantieriNomi: Record<string, string> = {};

  if (dipId) {
    const { data: rows } = await supabase
      .from('spese' as never)
      .select(
        'id, cantiere_id, categoria, ragione_sociale, importo_totale, importo_iva, imponibile, valuta, data_scontrino, metodo_pagamento, note, created_at, r2_thumb_key, r2_key, foto_mime, numero_persone, stato',
      )
      .eq('tenant_id', ctx.tenantId)
      .eq('dipendente_id', dipId)
      .order('created_at', { ascending: false });
    const raw =
      (rows as
        | {
            id: string;
            cantiere_id: string | null;
            categoria: string;
            ragione_sociale: string | null;
            importo_totale: number | null;
            importo_iva: number | null;
            imponibile: number | null;
            valuta: string | null;
            data_scontrino: string | null;
            metodo_pagamento: string | null;
            note: string | null;
            created_at: string | null;
            r2_thumb_key: string | null;
            r2_key: string | null;
            foto_mime: string | null;
            numero_persone: number | null;
            stato: string | null;
          }[]
        | null) ?? [];

    spese = raw.map((r) => ({
      id: r.id,
      cantiereId: r.cantiere_id,
      categoria: r.categoria as CategoriaSpesa,
      ragioneSociale: r.ragione_sociale,
      importoTotale: r.importo_totale,
      importoIva: r.importo_iva,
      imponibile: r.imponibile,
      valuta: r.valuta,
      dataScontrino: r.data_scontrino,
      metodoPagamento: (r.metodo_pagamento as 'contanti' | 'carta' | 'altro' | null) ?? null,
      note: r.note,
      createdAt: r.created_at,
      hasThumb: !!r.r2_thumb_key,
      hasFile: !!r.r2_key,
      fotoMime: r.foto_mime,
      numeroPersone: r.numero_persone ?? 1,
      stato: (r.stato as SpesaRiga['stato']) ?? null,
    }));

    // Risolvi i nomi dei cantieri referenziati.
    const cantiereIds = [
      ...new Set(spese.map((s) => s.cantiereId).filter((x): x is string => !!x)),
    ];
    if (cantiereIds.length > 0) {
      const { data: cantRows } = await supabase
        .from('cantieri' as never)
        .select('id, nome, codice')
        .eq('tenant_id', ctx.tenantId)
        .in('id', cantiereIds);
      for (const c of (cantRows as
        | { id: string; nome: string | null; codice: string | null }[]
        | null) ?? []) {
        cantieriNomi[c.id] = c.nome ? titoloCase(c.nome) : c.codice || 'Cantiere';
      }
    }
  }

  // Chiavi giorno (Rome) per il raggruppamento Oggi/Ieri lato client — calcolate
  // sul server → deterministiche (niente Date.now() nel render del client).
  const todayKey = romeDay(new Date());
  const yesterdayKey = romeDay(new Date(Date.now() - 24 * 60 * 60 * 1000));

  return (
    <div className="animate-content-in flex min-h-[100dvh] flex-col gap-5 p-4">
      <header className="pt-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
          Kontabilità
        </p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold tracking-tight">Le mie spese</h1>
          {/* Lo scontrino appena fotografato resta "in elaborazione" per
              qualche secondo: la riga deve cambiare da sola, senza che nessuno
              debba tirare giù la pagina per ricaricarla. */}
          <LiveRefresh className="shrink-0 text-[11px]" />
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Scatta lo scontrino: leggo importo e categoria, tu controlli e salvi.
        </p>
      </header>

      {isManager && !dipId ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Il tuo profilo non è collegato a un dipendente: non puoi registrare spese a tuo
          nome. Chiedi in ufficio di collegarti.
        </p>
      ) : (
        <NuovaSpesa
          cantieri={cantieriPicker}
          turnoCantiereId={turno?.cantiereId ?? null}
          turnoCantiereNome={turno?.cantiereNome ?? null}
        />
      )}

      <SpeseClient
        spese={spese}
        metodi={metodi}
        cantieriNomi={cantieriNomi}
        canEdit={isManager}
        cantieri={cantieriOpts}
        todayKey={todayKey}
        yesterdayKey={yesterdayKey}
      />
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { QrCode, Clock, MapPin, HardHat } from 'lucide-react';

import { createServerSupabase } from '@kommessa/api/server';
import { romeDay, romeDayBoundsUtc } from '@kommessa/api/rome-time';
import { titoloCase } from '@/app/mobile/_lib/display-case';
import { codiceCantiereMostrato } from '@/app/_lib/cantiere-categoria';

import { guardMobile } from '../_lib/guard';
import { mioTurnoAttivo } from './_lib/turno-attivo';
import { caricaTurnoAzioniContesto } from './_lib/turno-azioni-contesto';
import {
  vedeTuttiICantieri,
  cantieriVisibiliTecnicoIds,
} from './_lib/visibilita-tecnico';
import { TurnoAzioniCantiere } from './_components/turno-azioni-cantiere';
import { IniziaTurnoButton } from './_components/inizia-turno';

export const metadata: Metadata = {
  title: 'Kantiere',
};

export const dynamic = 'force-dynamic';

function formatDataOggi(): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
}

function formatOra(ts: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
}

export default async function KantiereHomePage() {
  const ctx = await guardMobile();
  const supabase = createServerSupabase();

  // Dipendente collegato a questo account (null se office/admin senza scheda)
  const { data: meRow } = await supabase
    .from('dipendenti' as never)
    .select('id, nome, cognome')
    .eq('tenant_id', ctx.tenantId)
    .eq('user_id', ctx.userId)
    .maybeSingle();
  const me = (meRow as { id: string; nome: string; cognome: string } | null) ?? null;

  // Turno aperto del dipendente → in home la card azioni completa (pausa pranzo
  // + fine turno), con lo stesso contesto della scheda cantiere.
  const turno = me ? await mioTurnoAttivo() : null;
  const azioni = turno
    ? await caricaTurnoAzioniContesto(ctx.tenantId, ctx.userId, turno.cantiereId)
    : null;

  // Ultima timbratura di oggi → stato corrente (dentro/fuori)
  let ultima: { tipo: 'ingresso' | 'uscita'; ts: string } | null = null;
  if (me) {
    const { fromIso, toIso } = romeDayBoundsUtc(romeDay(new Date()));
    const { data: timbRows } = await supabase
      .from('timbrature' as never)
      .select('tipo, ts')
      .eq('dipendente_id', me.id)
      .gte('ts', fromIso)
      .lt('ts', toIso)
      .order('ts', { ascending: false })
      .limit(1);
    ultima =
      (timbRows as { tipo: 'ingresso' | 'uscita'; ts: string }[] | null)?.[0] ??
      null;
  }

  // Cantieri attivi recenti (lettura, max 4). Gate temporaneo (weekend): i
  // tecnici vedono solo i cantieri timbrabili (QR attivo → oggi Monfalcone);
  // admin/office vedono tutto.
  const vedeTutto = vedeTuttiICantieri(ctx.role);
  const visibiliIds = vedeTutto ? null : [...(await cantieriVisibiliTecnicoIds(ctx.tenantId))];
  type CantiereMini = {
    id: string;
    nome: string | null;
    codice: string | null;
    codice_commessa: string | null;
  };
  let cantieri: CantiereMini[] = [];
  if (vedeTutto || (visibiliIds && visibiliIds.length > 0)) {
    let query = supabase
      .from('cantieri' as never)
      .select('id, nome, codice, codice_commessa')
      .eq('tenant_id', ctx.tenantId)
      .eq('stato', 'attivo');
    if (visibiliIds) query = query.in('id', visibiliIds);
    const { data: cantieriRaw } = await query
      .order('nome', { ascending: true })
      .limit(4);
    cantieri = (cantieriRaw as CantiereMini[] | null) ?? [];
  }

  const dentro = ultima?.tipo === 'ingresso';

  return (
    <div className="animate-content-in flex min-h-[100dvh] flex-col gap-6 p-4">
      <header className="pt-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          <HardHat className="h-3.5 w-3.5" aria-hidden="true" />
          Kantiere
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {me ? `Ciao, ${titoloCase(me.nome)}` : 'Kantiere'}
        </h1>
        <p className="mt-0.5 text-xs capitalize text-muted-foreground">{formatDataOggi()}</p>
      </header>

      {/* Turno aperto → card azioni completa (pausa + fine turno); altrimenti stato di oggi */}
      {turno && azioni ? (
        <TurnoAzioniCantiere
          prominente
          cantiereId={turno.cantiereId}
          cantiereNome={turno.cantiereNome}
          cantiereHref={`/mobile/kantiere/cantieri/${turno.cantiereId}`}
          inizioTs={turno.inizioTs}
          inPausa={turno.inPausa}
          inizioPausaTs={turno.inizioPausaTs}
          pausaOggiFatta={azioni.pausaOggiFatta}
          sedi={azioni.sedi}
          mezzi={azioni.mezzi}
          sedeDefaultId={azioni.sedeDefaultId}
          sogliaPausaPranzoOre={azioni.sogliaPausaPranzoOre}
          sogliaAutoSpegnimentoPausaOre={azioni.sogliaAutoSpegnimentoPausaOre}
        />
      ) : me ? (
        <div
          className={
            'rounded-2xl border p-5 shadow-soft ' +
            (dentro
              ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
              : 'border-border bg-card')
          }
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Stato di oggi
          </p>
          {ultima ? (
            <p className="mt-1 text-lg font-semibold">
              {dentro ? 'Sei in cantiere' : 'Hai timbrato l’uscita'}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({ultima.tipo === 'ingresso' ? 'ingresso' : 'uscita'} alle {formatOra(ultima.ts)})
              </span>
            </p>
          ) : (
            <p className="mt-1 text-lg font-semibold text-muted-foreground">
              Nessuna timbratura oggi
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-5 text-sm text-muted-foreground">
          Nessun profilo dipendente collegato a questo account. Puoi comunque
          consultare cantieri e ore.
        </div>
      )}

      {/* Avvio turno manuale (senza QR): scegli un cantiere qualsiasi. Compare
          quando c'è un profilo dipendente e nessun turno è aperto. */}
      {!turno && me ? <IniziaTurnoButton prominente /> : null}

      {/* Azioni rapide — tap target grandi */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/mobile/kantiere/scansiona"
          className="col-span-2 flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary text-primary-foreground p-5 shadow-soft active:scale-[0.99] transition-transform"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15">
            <QrCode className="h-6 w-6" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-base font-semibold">Scansiona QR</span>
            <span className="block text-xs opacity-80">Timbra ingresso o uscita</span>
          </span>
        </Link>

        <Link
          href="/mobile/kantiere/ore"
          className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-soft active:scale-[0.99] transition-transform"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Clock className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold">Le mie ore</span>
        </Link>

        <Link
          href="/mobile/kantiere/cantieri"
          className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-soft active:scale-[0.99] transition-transform"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MapPin className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold">Cantieri</span>
        </Link>
      </div>

      {/* Cantieri recenti */}
      {cantieri.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Cantieri attivi
          </p>
          <div className="space-y-2">
            {cantieri.map((c) => (
              <Link
                key={c.id}
                href={`/mobile/kantiere/cantieri/${c.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-soft active:scale-[0.99] transition-transform"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {titoloCase(c.nome ?? '') || codiceCantiereMostrato(c) || 'Cantiere'}
                  </span>
                  {codiceCantiereMostrato(c) ? (
                    <span className="block font-mono text-[11px] text-muted-foreground">
                      {codiceCantiereMostrato(c)}
                    </span>
                  ) : null}
                </span>
                <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

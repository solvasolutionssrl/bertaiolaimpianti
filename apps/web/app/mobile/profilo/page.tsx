import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, CalendarCheck, ChevronRight } from 'lucide-react';

import { createServerSupabase } from '@kommessa/api/server';
import { Avatar, AvatarFallback } from '@kommessa/ui';
import type { CategoriaSpesa } from '@kommessa/api/spese';
import { titoloCase } from '@/app/mobile/_lib/display-case';

import { guardMobile } from '../_lib/guard';
import { tenantHasModule } from '../../_lib/modules';
import { leggiConfigDipendenti } from '../../_lib/dipendenti-config';
import { InstallPromptHint } from '../_components/install-prompt-hint';
import { CaricamentiLink } from './_components/caricamenti-link';
import { LogoutButton } from './logout-button';
import { PushToggle } from './push-toggle';
import { PreferenzeNotifiche, type PrefRow } from './preferenze-notifiche';
import { SpesePanoramica } from '../kantiere/spese/_components/spese-panoramica';
import type { SpesaRiga } from '../kantiere/spese/_components/spese-client';
import { elencoCantieriPicker } from '../kantiere/_lib/cantieri-picker-data';
import { mioTurnoAttivo } from '../kantiere/_lib/turno-attivo';
import type { PickerCantiere } from '../kantiere/_components/cantiere-picker';

export const metadata: Metadata = {
  title: 'Profilo',
};

export default async function ProfiloPage() {
  const ctx = await guardMobile();
  const supabase = createServerSupabase();

  const [profRes, tenRes] = await Promise.all([
    supabase.from('users').select('display_name, role, avatar_url').eq('id', ctx.userId).single(),
    // `app_mode` non è nei tipi generati → cast (come nel layout mobile).
    supabase.from('tenants' as never).select('nome, slug, app_mode').eq('id', ctx.tenantId).single(),
  ]);
  const profilo = profRes.data as {
    display_name: string | null;
    role: string | null;
    avatar_url: string | null;
  } | null;
  const tenant = tenRes.data as {
    nome: string | null;
    slug: string | null;
    app_mode: string | null;
  } | null;

  const appMode = tenant?.app_mode ?? null;
  const isKantiere = appMode === 'kantiere' || appMode === 'full';
  const isManager = ctx.role === 'admin' || ctx.role === 'office';

  // Ferie e permessi: se il modulo Dipendenti + sotto-flag ferie sono attivi.
  const hasDipendenti = await tenantHasModule('dipendenti');
  const hasFerie = hasDipendenti
    ? (await leggiConfigDipendenti(supabase, ctx.tenantId)).ferieAttiva
    : false;

  // Preferenze notifiche: solo mondo COMMESSE. In Kantiere le notifiche si
  // gestiscono dalla campanella fissa → niente matrice/quiet-hours (erano di
  // kommessa). Si evita anche di interrogarle.
  let prefs: PrefRow[] = [];
  let quiet: { quiet_hours_start: number | null; quiet_hours_end: number | null } | null = null;
  if (!isKantiere) {
    const [prefsRes, quietRes] = await Promise.all([
      supabase
        .from('notification_preferences_effective')
        .select('event_code, label, description, critical, in_app, push, email, ordine')
        .eq('user_id', ctx.userId)
        .order('ordine'),
      supabase
        .from('users')
        .select('quiet_hours_start, quiet_hours_end')
        .eq('id', ctx.userId)
        .maybeSingle(),
    ]);
    prefs = ((prefsRes.data ?? []) as any[]).map((r) => ({
      event_code: r.event_code,
      label: r.label,
      description: r.description ?? null,
      critical: r.critical ?? false,
      in_app: r.in_app ?? true,
      push: r.push ?? true,
      email: r.email ?? false,
    }));
    quiet = (quietRes.data ?? null) as {
      quiet_hours_start: number | null;
      quiet_hours_end: number | null;
    } | null;
  }

  // Panoramica spese: solo Kantiere + admin/office con profilo dipendente. Ultime
  // 3 con campi COMPLETI (per aprire il dettaglio direttamente dal profilo) +
  // opzioni/nomi cantiere.
  let mioDip: string | null = null;
  let ultimeSpese: SpesaRiga[] = [];
  let cantieriOpts: { id: string; nome: string }[] = [];
  let cantieriPicker: PickerCantiere[] = [];
  let turnoCantiereId: string | null = null;
  let turnoCantiereNome: string | null = null;
  const cantieriNomiSpese: Record<string, string> = {};
  if (isKantiere && isManager) {
    const { data: dipRow } = await supabase
      .from('dipendenti' as never)
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('user_id', ctx.userId)
      .maybeSingle();
    mioDip = (dipRow as { id: string } | null)?.id ?? null;
    if (mioDip) {
      const [speseRes, cantieri, turno] = await Promise.all([
        supabase
          .from('spese' as never)
          .select(
            'id, cantiere_id, categoria, ragione_sociale, importo_totale, importo_iva, imponibile, valuta, data_scontrino, metodo_pagamento, note, created_at, r2_thumb_key, r2_key, foto_mime, numero_persone, stato',
          )
          .eq('tenant_id', ctx.tenantId)
          .eq('dipendente_id', mioDip)
          .order('created_at', { ascending: false })
          .limit(3),
        elencoCantieriPicker(ctx.tenantId),
        mioTurnoAttivo(),
      ]);
      ultimeSpese = ((speseRes.data as any[] | null) ?? []).map((r) => ({
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
      cantieriPicker = cantieri;
      turnoCantiereId = turno?.cantiereId ?? null;
      turnoCantiereNome = turno?.cantiereNome ?? null;
      cantieriOpts = cantieri.map((c) => ({
        id: c.id,
        nome: c.nome ? titoloCase(c.nome) : c.codice || 'Cantiere',
      }));
      for (const c of cantieri) {
        cantieriNomiSpese[c.id] = c.nome ? titoloCase(c.nome) : c.codice || 'Cantiere';
      }
    }
  }

  const displayName = profilo?.display_name ?? ctx.email.split('@')[0] ?? 'Utente';
  const initials = displayName
    .split(/\s+/)
    .map((s) => s.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');

  return (
    <div className="animate-content-in flex min-h-[100dvh] flex-col gap-5 p-4">
      <header className="mt-2 flex items-center gap-3">
        <Avatar className="h-14 w-14">
          <AvatarFallback className="text-base">{initials}</AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-lg font-semibold">{displayName}</h1>
          <p className="text-xs text-muted-foreground">{ctx.email}</p>
          <p className="mt-0.5 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              {profilo?.role ?? ctx.role}
            </span>
          </p>
        </div>
      </header>

      {/* Caricamenti — entrata SEMPRE disponibile alla pagina dei file in
          salita. Il pannello fluttuante sparisce quando ha finito, quindi senza
          questa voce un upload fallito diventerebbe irraggiungibile. */}
      <CaricamentiLink />

      {/* Ferie e permessi (modulo Dipendenti): richieste + eventuali approvazioni. */}
      {hasFerie ? (
        <Link
          href="/mobile/permessi"
          className="flex items-center gap-3 rounded-lg border bg-card p-4 active:scale-[0.99]"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CalendarCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Ferie e permessi</span>
            <span className="block text-xs text-muted-foreground">
              Richiedi e vedi lo stato delle tue richieste
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      ) : null}

      {/* Area personale → panoramica spese (Kantiere admin/office): ultime 3 come
          card cliccabili che aprono DIRETTAMENTE il dettaglio + aggiungi + tutte. */}
      {isKantiere && isManager && mioDip ? (
        <SpesePanoramica
          spese={ultimeSpese}
          cantieriNomi={cantieriNomiSpese}
          canEdit={isManager}
          cantieri={cantieriOpts}
          cantieriPicker={cantieriPicker}
          turnoCantiereId={turnoCantiereId}
          turnoCantiereNome={turnoCantiereNome}
          dipendenteId={mioDip}
        />
      ) : null}

      <section className="rounded-lg border bg-card p-4 text-sm">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Azienda
        </p>
        <p className="mt-1 font-medium">{tenant?.nome ?? ctx.tenantSlug}</p>
      </section>

      {/* Gestione notifiche granulare: solo mondo commesse (in Kantiere è la
          campanella a gestire tutto). */}
      {!isKantiere ? (
        <>
          <section className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Notifiche push
            </p>
            <PushToggle />
          </section>

          <section className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Cosa, quando, come
            </p>
            <PreferenzeNotifiche
              initial={prefs}
              quietStart={quiet?.quiet_hours_start ?? null}
              quietEnd={quiet?.quiet_hours_end ?? null}
            />
          </section>
        </>
      ) : null}

      <section aria-label="Installazione app" className="flex flex-col gap-2">
        <InstallPromptHint />
      </section>

      <LogoutButton />

      <footer className="mt-auto pt-6 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
        Kommessa · powered by SOLVA
      </footer>
    </div>
  );
}

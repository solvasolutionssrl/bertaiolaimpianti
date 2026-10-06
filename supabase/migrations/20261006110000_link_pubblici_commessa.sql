-- ============================================================================
-- Link pubblico di una commessa: foto e video condivisibili con chi non ha un
-- account
-- ============================================================================
--
-- PERCHE'
--
-- I clienti chiedono «mandami un link con le foto». Oggi l'alternativa e'
-- scaricare le foto e rimandarle su WhatsApp: lavoro a mano, qualita' persa, e
-- nessun modo di smettere di condividerle dopo.
--
-- IL MODELLO DI SICUREZZA, DETTO IN CHIARO
--
-- Chi ha l'indirizzo entra. Non c'e' password e non c'e' account: e' il punto
-- della cosa, altrimenti non si potrebbe mandare in un messaggio. Quindi
-- l'indirizzo E' il segreto, e da li' discende tutto:
--
--   * 32 byte casuali (256 bit): non si indovina e non si enumera;
--   * in tabella finisce solo lo SHA-256 — stesso criterio di `api_tokens`:
--     chi legge il database non ottiene link funzionanti;
--   * scade da solo dopo 30 giorni, perche' un link dimenticato in una chat e'
--     un link che vive per sempre;
--   * si spegne in un istante, e si vede QUANTE VOLTE e' stato aperto: se
--     finisce dove non doveva, lo si chiude e si sa se qualcuno l'ha usato;
--   * UNO SOLO attivo per commessa: rigenerarlo uccide il precedente. Due link
--     vivi per lo stesso lavoro sono due cose da ricordarsi di revocare, e la
--     seconda non la revoca nessuno.
--
-- ⚠️ CHI LEGGE QUESTA TABELLA
--
-- Nessun utente. Nemmeno lo staff del tenant.
--
-- La pagina pubblica gira SENZA sessione, quindi la risoluzione del token la fa
-- il service role; e lo staff non ha motivo di leggere gli hash, gli basta
-- sapere che un link c'e', quando scade e quante volte e' stato aperto — cose
-- che arrivano dalla server action, sempre via service role, filtrate sul suo
-- tenant. RLS accesa SENZA nessuna policy permissiva = nessuno passa, tranne il
-- service role che la salta per definizione. Non e' una dimenticanza: e' la
-- configurazione voluta, ed e' il motivo per cui questa tabella non ha bisogno
-- di una policy per tenant.
--
-- ⚠️ `mostra_dettagli` NON e' una preferenza grafica
--
-- I «Dettagli» di una commessa sono la dettatura integrale del capo
-- (`commesse.note_iniziali`): possono contenere qualunque cosa, compreso un
-- numero di telefono o il nome di una persona — cioe' esattamente cio' che
-- questo link NON deve esporre. Per questo non e' una decisione presa una volta
-- per tutte nel codice: e' una scelta per singolo link, fatta da chi lo genera
-- con il testo sotto gli occhi.
--
-- Idempotente: rieseguibile a vuoto.
-- ============================================================================

begin;

create table if not exists public.commessa_link_pubblici (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  commessa_id         uuid not null references public.commesse(id) on delete cascade,
  -- SHA-256 esadecimale del token in chiaro. Il chiaro esiste una volta sola,
  -- nella schermata che lo crea.
  token_hash          text not null,
  mostra_dettagli     boolean not null default false,
  created_by          uuid references public.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  expires_at          timestamptz not null,
  revoked_at          timestamptz,
  revoked_by          uuid references public.users(id) on delete set null,
  aperture            integer not null default 0,
  ultima_apertura_at  timestamptz
);

comment on table public.commessa_link_pubblici is
  'Link pubblici (senza account) a una commessa: titolo, eventualmente i dettagli, e la libreria foto/video. '
  'Token opaco: in tabella solo lo SHA-256. Scade a 30 giorni, revocabile, uno attivo per commessa. '
  'Nessuna policy RLS permissiva: ci accede solo il service role.';

comment on column public.commessa_link_pubblici.mostra_dettagli is
  'Se mostrare `commesse.note_iniziali` sulla pagina pubblica. Scelta per singolo link: '
  'i dettagli sono la dettatura del capo e possono contenere telefoni e nomi.';

-- Risoluzione del token: una sola riga per hash.
create unique index if not exists commessa_link_pubblici_token_idx
  on public.commessa_link_pubblici (token_hash);

-- UNO attivo per commessa. Lo impone il database, non la buona volonta' del
-- codice: cosi' una doppia pressione sul tasto non lascia due link vivi.
create unique index if not exists commessa_link_pubblici_uno_attivo_idx
  on public.commessa_link_pubblici (commessa_id)
  where revoked_at is null;

-- Elenco del super admin, ordinato per data.
create index if not exists commessa_link_pubblici_tenant_idx
  on public.commessa_link_pubblici (tenant_id, created_at desc);

alter table public.commessa_link_pubblici enable row level security;

-- Nessuna policy, di proposito (vedi la nota in testa): RLS accesa e nessuna
-- regola permissiva significa che `anon` e `authenticated` non leggono e non
-- scrivono NIENTE. Il service role non passa da RLS.
-- Le `drop policy if exists` servono a riportare allo stato voluto un database
-- su cui qualcuno le avesse aggiunte a mano.
drop policy if exists commessa_link_pubblici_read on public.commessa_link_pubblici;
drop policy if exists commessa_link_pubblici_write on public.commessa_link_pubblici;

-- Cintura e bretelle: i privilegi di tabella, oltre alla RLS. Supabase concede
-- per default SELECT/INSERT/UPDATE/DELETE ai due ruoli applicativi su ogni
-- tabella nuova dello schema public; qui si revocano.
revoke all on public.commessa_link_pubblici from anon, authenticated;

-- ── il contatore delle aperture ─────────────────────────────────────────────
--
-- Una funzione e non un `update` dal codice, perche' `aperture = aperture + 1`
-- PostgREST non lo sa esprimere: si dovrebbe leggere, sommare e riscrivere, e
-- due visite nello stesso istante ne conterebbero una sola. Qui l'incremento
-- avviene dentro il database, dove la riga e' bloccata.
--
-- ⚠️ SECURITY DEFINER + `revoke execute from public, anon, authenticated`: in
-- `public` una funzione nuova nasce eseguibile da chiunque, e questa non serve
-- a nessun utente — la chiama solo il service role quando una pagina pubblica
-- si apre.

create or replace function public.incrementa_apertura_link(p_link_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.commessa_link_pubblici
     set aperture = aperture + 1,
         ultima_apertura_at = now()
   where id = p_link_id;
$$;

revoke execute on function public.incrementa_apertura_link(uuid) from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';

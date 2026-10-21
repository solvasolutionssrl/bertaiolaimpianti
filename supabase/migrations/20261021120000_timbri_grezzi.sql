-- =====================================================================
-- 20261021120000_timbri_grezzi.sql
--
-- Il registro degli eventi dell'orologio: ogni tocco di badge o azione di
-- timbratura **come e' arrivata**, prima di diventare una timbratura
-- attribuita.
--
-- ⭐ Perche' serve una tabella a parte, e non una colonna su `timbrature`.
-- `timbrature` ha un vincolo che regge tutto il mondo delle ore:
-- `num_nonnulls(commessa_id, cantiere_id) = 1` — ogni timbro dice anche DOVE.
-- Un tocco di badge a un terminale non lo sa: il luogo lo dira' la persona
-- dopo, ripartendo la giornata fra le commesse. Quindi questa tabella fa due
-- mestieri insieme: **registro** di cio' che e' arrivato, e **parcheggio** di
-- cio' che non e' ancora attribuibile. Cosi' `timbrature` non si tocca: nessun
-- vincolo da allentare, nessun valore nuovo nei suoi CHECK, nessun rischio per
-- le trentacinque persone che timbrano oggi.
--
-- ⭐ E scioglie il problema piu' difficile: un timbro **annullato** dal sistema
-- d'origine qui e' un cambio di `stato`, non la cancellazione di una riga di
-- `timbrature` che potrebbe essere gia' finita in un rapportino approvato.
--
-- ⚠️ Nasce per Timbro ma la colonna `sorgente` c'e' dal primo giorno: un domani
-- anche i timbri dell'app e del QR passeranno da qui, e lo schema non dovra'
-- cambiare. Oggi scrive solo l'import di Timbro — le cinque bocche esistenti
-- si spostano in un giro autorizzato a parte, non mentre la gente timbra.
--
-- Nomi delle colonne: `ts` come su `timbrature` (e' lo stesso concetto, e
-- chiamarlo diverso farebbe cercare due volte), `ricevuto_at` come sulle altre
-- tabelle di integrazione, `updated_at` perche' e' il nome che il trigger
-- condiviso `tg_set_updated_at()` si aspetta.
-- =====================================================================

create table if not exists public.timbri_grezzi (
  id              uuid primary key default extensions.gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,

  -- Da quale bocca arriva. Vocabolario chiuso: un valore nuovo e' una
  -- migration, perche' chi legge deve sapere cosa aspettarsi.
  sorgente        text not null check (sorgente in ('timbro', 'app', 'qr')),

  -- L'identificativo dell'evento NEL SISTEMA D'ORIGINE. E' la chiave
  -- dell'idempotenza: rileggere lo stesso evento due volte non lo duplica.
  esterno_id      text not null,

  -- La persona, se la conosciamo. NULL = badge non ancora assegnato a nessuno:
  -- l'evento resta qui e si attacca quando l'assegnazione arriva.
  dipendente_id   uuid references public.dipendenti(id) on delete set null,

  -- Il codice del badge come l'ha letto il lettore. Serve proprio per
  -- riattaccare gli eventi orfani quando il badge viene assegnato.
  badge           text,

  -- L'istante del tocco. ⚠️ NULL e' un caso vero, non una dimenticanza: un
  -- terminale senza orologio sincronizzato non sa che ora e'. Resta in sospeso
  -- e non entra in nessun calcolo finche' qualcuno non la sistema.
  ts              timestamptz,

  -- Quanto e' credibile quell'istante. Decide chi vince fra due tocchi
  -- ravvicinati che arrivano da bocche diverse: un orologio fisso batte un
  -- telefono, che puo' essere sfasato o essere stato offline.
  orologio        text not null check (orologio in ('fisso', 'telefono', 'sconosciuto')),

  -- Direzione DICHIARATA da chi l'ha generata. NULL = da dedurre.
  -- ⚠️ Un terminale badge non misura la direzione: la deduce chi vede la
  -- sequenza intera, e con due bocche quello siamo noi. Vedi
  -- `@kommessa/api/timbri-sequenza`.
  tipo            text check (tipo in ('ingresso', 'uscita')),

  -- Stato dell'evento nel sistema d'origine.
  stato           text not null default 'valido' check (stato in ('valido', 'annullato')),
  annullato_motivo text,

  ricevuto_at     timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- La riga come ce l'hanno data. Non si legge per lavorare: si legge il
  -- giorno che qualcosa non torna e bisogna capire cosa era arrivato davvero.
  grezzo          jsonb,

  -- L'idempotenza, imposta dal database e non dall'applicazione: un upsert su
  -- questa chiave e' l'unico modo di rileggere senza duplicare.
  constraint timbri_grezzi_origine_unica unique (tenant_id, sorgente, esterno_id)
);

-- La giornata di una persona: e' la lettura piu' frequente.
create index if not exists timbri_grezzi_persona_idx
  on public.timbri_grezzi (tenant_id, dipendente_id, ts);

-- Gli orfani da riattaccare: indice parziale, perche' sono pochi e si cercano
-- per codice badge.
create index if not exists timbri_grezzi_orfani_idx
  on public.timbri_grezzi (tenant_id, badge)
  where dipendente_id is null;

-- Il cursore della riconciliazione e la domanda «cosa e' arrivato ieri».
create index if not exists timbri_grezzi_arrivo_idx
  on public.timbri_grezzi (tenant_id, sorgente, updated_at desc);

-- Quelli in sospeso senza orario, da mostrare al super admin.
create index if not exists timbri_grezzi_senza_ora_idx
  on public.timbri_grezzi (tenant_id)
  where ts is null and stato = 'valido';

drop trigger if exists trg_timbri_grezzi_updated_at on public.timbri_grezzi;
create trigger trg_timbri_grezzi_updated_at
  before update on public.timbri_grezzi
  for each row execute function public.tg_set_updated_at();

alter table public.timbri_grezzi enable row level security;

-- ⚠️ SOLO LETTURA dall'applicazione, e nessuna policy di scrittura: le righe
-- le scrive l'import con la service role. E' la stessa forma delle altre
-- tabelle alimentate da fuori — una riga qui non e' un dato che un utente
-- inserisce, e' un fatto registrato.
drop policy if exists timbri_grezzi_read on public.timbri_grezzi;
create policy timbri_grezzi_read on public.timbri_grezzi
  for select
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
      -- Un tecnico vede i propri, perche' e' da li' che gli si chiede di
      -- ripartire la giornata.
      or dipendente_id = public.dipendente_del_utente()
    )
  );

revoke insert, update, delete on public.timbri_grezzi from anon, authenticated;

-- ⚠️ E ad `anon` si toglie anche la lettura. La RLS lo fermerebbe comunque
-- (`current_tenant_id()` per un anonimo e' nullo e la policy non passa), ma il
-- privilegio non serve a niente e un privilegio aperto per sbaglio e' il genere
-- di cosa che si scopre il giorno che una policy viene riscritta male.
revoke select on public.timbri_grezzi from anon;

comment on table public.timbri_grezzi is
  'Registro degli eventi dell''orologio, come arrivati, prima di diventare timbrature attribuite. E'' anche il parcheggio di cio'' che non ha ancora un cantiere. Scritta solo dalla service role. Vedi migration 20261021120000.';

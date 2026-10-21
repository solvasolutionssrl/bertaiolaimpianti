-- =====================================================================
-- 20261022090000_integrazione_timbro.sql
--
-- La timbratrice Timbro entra in Kommessa come INTEGRAZIONE: con una riga di
-- configurazione per cliente, un giro di lettura ogni due minuti, un registro
-- di cio' che e' arrivato, e due valori nuovi nei vocabolari di `timbrature`
-- per dire «questa riga nasce da un badge».
--
-- Quattro pezzi, tutti idempotenti:
--   1. `integrazione_timbro`: la configurazione, con il token. SEGRETA.
--   2. `timbri_grezzi`: due colonne descrittive in piu' (genere, dispositivo).
--   3. `timbrature.origine` += 'timbro', `timbrature.modalita` += 'timbratrice'.
--   4. due cron: l'import ogni 2 minuti, il promemoria delle ore ogni 15.
--   5. l'avviso `ore_da_inserire` nel catalogo degli eventi di notifica.
--
-- ⚠️ Perche' il token NON sta in `tenant_modules.config`: su quella tabella la
-- policy e' `tenant_id = current_tenant_id()` e `authenticated` ha il SELECT,
-- quindi ogni utente del cliente lo leggerebbe con una chiamata diretta dal
-- browser (verificato il 21/10/2026). Qui invece: RLS accesa e NESSUNA policy,
-- piu' `revoke all` da anon e authenticated. Ci arriva solo la service role,
-- come per `tenants.storage_config` e `tenants.r2_config`.
-- =====================================================================

-- ── 1. La configurazione del collegamento ──────────────────────────────

create table if not exists public.integrazione_timbro (
  tenant_id        uuid primary key references public.tenants(id) on delete cascade,

  -- spento: non si legge niente · osservazione: si legge e si mostra
  -- all'ufficio e al super admin, ma ai tecnici non si chiede niente ·
  -- attivo: anche i tecnici vedono la giornata e ripartiscono le ore.
  stato            text not null default 'spento'
                   check (stato in ('spento', 'osservazione', 'attivo')),

  -- Il token API di Timbro (Bearer). SEGRETO: vedi la testa del file.
  token            text,
  url_base         text not null default 'https://timbro-solva.vercel.app/api/v1',

  -- Da quando si importano i timbri, sull'ora del PASSAGGIO (`occurred_at`),
  -- non su quella di arrivo: un terminale senza rete manda i passaggi anche
  -- giorni dopo. NULL = l'import non parte.
  dal              date,

  -- Il segreto del webhook, se registrato. Idem segreto.
  webhook_id       text,
  webhook_secret   text,

  -- Il cursore della riconciliazione: il massimo `updated_at` visto. Il giro
  -- successivo riparte da qui meno un minuto.
  cursore_updated_at timestamptz,

  -- L'ultimo giro, per il semaforo: quando, com'e' andato, cosa ha detto.
  ultimo_giro_at   timestamptz,
  ultimo_giro_esito text check (ultimo_giro_esito is null or ultimo_giro_esito in ('ok', 'errore')),
  ultimo_giro_messaggio text,
  -- L'ultima volta che e' arrivato almeno un timbro: e' il segnale di vita vero.
  ultimo_timbro_at timestamptz,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists trg_integrazione_timbro_updated_at on public.integrazione_timbro;
create trigger trg_integrazione_timbro_updated_at
  before update on public.integrazione_timbro
  for each row execute function public.tg_set_updated_at();

alter table public.integrazione_timbro enable row level security;
-- Nessuna policy: ci accede solo la service role. Non e' una dimenticanza.
revoke all on public.integrazione_timbro from anon, authenticated;
grant all on public.integrazione_timbro to service_role;

comment on table public.integrazione_timbro is
  'Collegamento con la timbratrice Timbro, uno per cliente. Contiene il token: SOLO service role. Vedi migration 20261022090000.';

-- ── 2. `timbri_grezzi`: come si chiama il tocco, e da quale terminale ─────

alter table public.timbri_grezzi
  add column if not exists genere text
    check (genere is null or genere in ('badge', 'manuale', 'api'));
alter table public.timbri_grezzi
  add column if not exists dispositivo text;

comment on column public.timbri_grezzi.genere is
  'badge = badge avvicinato al terminale (misurato) · manuale = inserito a mano su Timbro · api = creato da un altro sistema.';

-- ── 3. I vocabolari di `timbrature` ────────────────────────────────────

alter table public.timbrature drop constraint if exists timbrature_origine_check;
alter table public.timbrature add constraint timbrature_origine_check check (
  origine in ('qr', 'cronometro', 'manuale', 'capo', 'timbro')
);

alter table public.timbrature drop constraint if exists timbrature_modalita_check;
alter table public.timbrature add constraint timbrature_modalita_check check (
  modalita is null or modalita in (
    'qr',
    'app',
    'capo',
    'divisione_fine_turno',
    'giornata_dichiarata',
    'pausa_dichiarata',
    'pausa_chiusa_sistema',
    'ufficio',
    'timbratrice'            -- giornata delimitata dai timbri del terminale e ripartita fra i cantieri
  )
);

-- ── 4. I cron ───────────────────────────────────────────────────────────
-- Stesso pattern degli altri: pg_cron + pg_net verso una rotta Next protetta
-- da `Authorization: Bearer $CRON_SECRET` (Vault, nome 'cron_secret').

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.trigger_timbro_import()
returns void
language plpgsql
security definer
set search_path = public, vault, net, extensions
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'cron_secret'
  limit 1;
  if v_secret is null then
    raise warning 'cron_secret assente in Vault: import Timbro saltato';
    return;
  end if;
  perform net.http_post(
    url := 'https://www.kommessa.it/api/cron/timbro-import',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 50000
  );
end;
$$;

create or replace function public.trigger_promemoria_ore()
returns void
language plpgsql
security definer
set search_path = public, vault, net, extensions
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'cron_secret'
  limit 1;
  if v_secret is null then
    raise warning 'cron_secret assente in Vault: promemoria ore saltato';
    return;
  end if;
  perform net.http_post(
    url := 'https://www.kommessa.it/api/cron/promemoria-ore',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 50000
  );
end;
$$;

revoke execute on function public.trigger_timbro_import() from public, anon, authenticated;
revoke execute on function public.trigger_promemoria_ore() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'timbro-import';
exception when others then null;
end $$;
select cron.schedule('timbro-import', '*/2 * * * *', $$select public.trigger_timbro_import()$$);

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'promemoria-ore';
exception when others then null;
end $$;
-- Ogni quarto d'ora: l'orario del promemoria lo decide ogni cliente, e la rotta
-- manda solo a chi e' nella sua finestra. Fuori dai minuti tondi, come gli altri.
select cron.schedule('promemoria-ore', '7,22,37,52 * * * *', $$select public.trigger_promemoria_ore()$$);

-- ── 5. L'avviso nel catalogo ───────────────────────────────────────────
-- La chiave esterna da `notification_preferences` impedisce di salvare la
-- preferenza di un avviso che non esiste: la voce va qui PRIMA che qualcuno
-- possa spegnerla. Le colonne `default_*` non si leggono piu' (vedi
-- 20261008100000): il predefinito vero sta in `@kommessa/api/avvisi`.
insert into public.notification_event_types (code, label, description, default_in_app, default_push, default_email, critical, ordine)
values (
  'ore_da_inserire',
  'Ore da inserire',
  'Promemoria: la giornata timbrata non e'' ancora stata ripartita fra i cantieri.',
  true, true, false, false, 60
)
on conflict (code) do nothing;

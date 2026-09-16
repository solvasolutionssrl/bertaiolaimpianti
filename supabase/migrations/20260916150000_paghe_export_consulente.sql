-- Export delle presenze verso il programma paghe del consulente (16/09/2026)
--
-- Nuova area "Personalizzazioni": funzioni costruite su misura per un singolo
-- cliente. La prima e' l'export mensile delle presenze nel tracciato che il
-- consulente del lavoro importa nel suo programma paghe.
--
-- Il file si costruisce da quello che Kommessa sa gia' (straordinari, ore di
-- viaggio, ferie e permessi approvati): quei dati non si copiano qui, si
-- leggono al momento della generazione, cosi' una correzione sulla giornata si
-- riflette subito sul file. Queste tabelle tengono soltanto le tre cose che in
-- Kommessa non esistono:
--
--   paghe_mesi        lo stato del mese (in lavorazione o consegnato allo Studio)
--   paghe_eventi      le variazioni dei dipendenti che ancora non usano l'app,
--                     inserite dall'ufficio al posto del vecchio foglio Excel
--   paghe_certificati il numero dell'attestato di malattia e il documento del
--                     medico, che il tracciato chiede e Kommessa non raccoglie
--
-- Le scritture passano dalle action con service role, come per ferie e
-- permessi: in lettura vede solo l'ufficio del proprio cliente.

-- ---------- stato del mese -------------------------------------------
create table if not exists public.paghe_mesi (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  periodo        text not null,                  -- mese esportato, forma AAAA-MM
  stato          text not null default 'bozza'
                   check (stato in ('bozza','consegnato')),
  consegnato_at  timestamptz,
  consegnato_da  uuid references public.users(id) on delete set null,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint paghe_mesi_periodo_chk check (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  constraint paghe_mesi_unico unique (tenant_id, periodo)
);

drop trigger if exists trg_paghe_mesi_updated_at on public.paghe_mesi;
create trigger trg_paghe_mesi_updated_at
  before update on public.paghe_mesi
  for each row execute function public.tg_set_updated_at();

-- ---------- variazioni inserite dall'ufficio --------------------------
-- Una riga = un evento da comunicare: un giorno di ferie, due ore di permesso,
-- una settimana di malattia. `record` dice se viaggia come evento giornaliero
-- o come periodo; e' il tracciato a imporlo, non una nostra preferenza.
create table if not exists public.paghe_eventi (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  periodo        text not null,
  dipendente_id  uuid not null references public.dipendenti(id) on delete cascade,
  causale        text not null,                  -- codice del programma paghe
  dal            date not null,
  al             date not null,
  ore            numeric(6,2) not null default 0,
  record         text not null default '14' check (record in ('12','14')),
  nota           text,
  creato_da      uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint paghe_eventi_periodo_chk check (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  constraint paghe_eventi_date_chk check (al >= dal),
  constraint paghe_eventi_ore_chk check (ore >= 0 and ore <= 999.99)
);
create index if not exists paghe_eventi_mese_idx on public.paghe_eventi (tenant_id, periodo);
create index if not exists paghe_eventi_dip_idx on public.paghe_eventi (dipendente_id, dal);

drop trigger if exists trg_paghe_eventi_updated_at on public.paghe_eventi;
create trigger trg_paghe_eventi_updated_at
  before update on public.paghe_eventi
  for each row execute function public.tg_set_updated_at();

-- ---------- attestati di malattia -------------------------------------
-- Il numero dell'attestato telematico non si inventa: se manca, il file esce
-- lo stesso e lo Studio lo inserisce a mano, ma l'ufficio deve vederlo.
-- Il certificato si aggancia alla richiesta di assenza quando esiste, oppure
-- all'evento scritto a mano; le date restano comunque sulla riga cosi' si
-- ritrova anche se la richiesta viene cancellata.
create table if not exists public.paghe_certificati (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  dipendente_id   uuid not null references public.dipendenti(id) on delete cascade,
  permesso_id     uuid references public.permesso_richieste(id) on delete set null,
  evento_id       uuid references public.paghe_eventi(id) on delete cascade,
  dal             date not null,
  al              date not null,
  -- Come si qualifica il numero: P attestato telematico (il PUC), M protocollo
  -- del cartaceo, C codice fiscale dell'ente per la donazione di sangue.
  tipo_info       text not null default 'P' check (tipo_info in ('C','P','M')),
  numero          text,
  -- Documento del medico su R2, come le ricevute delle spese.
  r2_key          text,
  nome_file       text,
  mime            text,
  size_bytes      integer,
  nota            text,
  creato_da       uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint paghe_certificati_date_chk check (al >= dal)
);
create index if not exists paghe_certificati_dip_idx
  on public.paghe_certificati (tenant_id, dipendente_id, dal);
create index if not exists paghe_certificati_permesso_idx
  on public.paghe_certificati (permesso_id);

drop trigger if exists trg_paghe_certificati_updated_at on public.paghe_certificati;
create trigger trg_paghe_certificati_updated_at
  before update on public.paghe_certificati
  for each row execute function public.tg_set_updated_at();

-- ---------- letture ---------------------------------------------------
-- Solo l'ufficio del proprio cliente. I tecnici non vedono queste tabelle: qui
-- dentro ci sono dati di tutti i colleghi e certificati medici.
alter table public.paghe_mesi enable row level security;
alter table public.paghe_eventi enable row level security;
alter table public.paghe_certificati enable row level security;

drop policy if exists paghe_mesi_office_read on public.paghe_mesi;
create policy paghe_mesi_office_read on public.paghe_mesi
  for select using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  );

drop policy if exists paghe_mesi_platform_admin_read on public.paghe_mesi;
create policy paghe_mesi_platform_admin_read on public.paghe_mesi
  for select using (public.is_platform_admin());

drop policy if exists paghe_eventi_office_read on public.paghe_eventi;
create policy paghe_eventi_office_read on public.paghe_eventi
  for select using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  );

drop policy if exists paghe_eventi_platform_admin_read on public.paghe_eventi;
create policy paghe_eventi_platform_admin_read on public.paghe_eventi
  for select using (public.is_platform_admin());

drop policy if exists paghe_certificati_office_read on public.paghe_certificati;
create policy paghe_certificati_office_read on public.paghe_certificati
  for select using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  );

drop policy if exists paghe_certificati_platform_admin_read on public.paghe_certificati;
create policy paghe_certificati_platform_admin_read on public.paghe_certificati
  for select using (public.is_platform_admin());

-- ---------- accensione del modulo -------------------------------------
-- Il modulo nasce acceso solo per il cliente che lo ha chiesto, con il codice
-- ditta confermato dal consulente. Gli altri clienti non vedono nemmeno la
-- voce in menu finche' il super admin non la accende.
insert into public.tenant_modules (tenant_id, module_code, attivo, config, configured_at)
select t.id,
       'paghe',
       true,
       jsonb_build_object(
         'fornitore', 'essepaghe',
         'codice_ditta', '100145',
         'programma_presenze', 'Kommessa'
       ),
       now()
from public.tenants t
where t.nome ilike 'FPM%'
on conflict (tenant_id, module_code) do nothing;

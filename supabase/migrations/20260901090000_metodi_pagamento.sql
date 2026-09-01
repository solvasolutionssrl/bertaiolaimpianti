-- Metodi di pagamento gestibili dall'ufficio.
--
-- Prima erano un elenco chiuso nel codice ('contanti' | 'carta' | 'altro'),
-- ripetuto in quattro punti diversi: nel prompt dell'AI, nello schema di
-- validazione, nella scheda spesa dell'app e nel form dell'ufficio. Aggiungerne
-- uno voleva dire toccare tutti e quattro e rifare il deploy.
--
-- ⚠️ REGOLA FERREA: `codice` NON si tocca mai.
-- `spese.metodo_pagamento` contiene quel testo (oggi 'carta' e 'contanti' su
-- righe gia' registrate). Rinominare il codice spezzerebbe lo storico e le
-- scritture gia' uscite verso i gestionali. Si rinomina soltanto `nome`, che e'
-- l'etichetta mostrata a schermo.

create table if not exists public.metodi_pagamento (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- Stabile per sempre: e' il valore che finisce in spese.metodo_pagamento.
  codice text not null check (codice ~ '^[a-z0-9_]{2,40}$'),
  -- Quello che si legge a schermo. Rinominabile.
  nome text not null check (length(btrim(nome)) between 2 and 40),
  attivo boolean not null default true,
  ordine integer not null default 0,
  -- I tre di partenza: si rinominano e si spengono, ma non si cancellano.
  di_sistema boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, codice)
);

create index if not exists metodi_pagamento_tenant_idx
  on public.metodi_pagamento (tenant_id, attivo, ordine);

alter table public.metodi_pagamento enable row level security;

-- Lettura: chiunque nel tenant (serve al tecnico che compila la spesa).
drop policy if exists metodi_pagamento_read on public.metodi_pagamento;
create policy metodi_pagamento_read on public.metodi_pagamento
  for select using (tenant_id = public.current_tenant_id());

-- Scrittura: solo chi governa le impostazioni.
drop policy if exists metodi_pagamento_write on public.metodi_pagamento;
create policy metodi_pagamento_write on public.metodi_pagamento
  for all using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner', 'admin', 'office')
  ) with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner', 'admin', 'office')
  );

-- I tre di partenza per i clienti che gia' esistono. Idempotente: rigirando la
-- migrazione non duplica e non sovrascrive un nome gia' cambiato dall'ufficio.
insert into public.metodi_pagamento (tenant_id, codice, nome, ordine, di_sistema)
select t.id, v.codice, v.nome, v.ordine, true
from public.tenants t
cross join (values
  ('carta',    'Carta aziendale', 10),
  ('contanti', 'Contanti',        20),
  ('altro',    'Altro',           30)
) as v(codice, nome, ordine)
on conflict (tenant_id, codice) do nothing;

comment on table public.metodi_pagamento is
  'Metodi di pagamento delle spese, per tenant. `codice` e'' immutabile (finisce in spese.metodo_pagamento); si rinomina solo `nome`.';

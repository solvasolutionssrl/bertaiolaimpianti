-- ============================================================
-- La bacheca: un indirizzo da aprire su una televisione in ufficio
-- ============================================================
-- Una pagina sola per cliente, con una casella per persona e dentro le cose
-- che le restano da fare. Si batte l'indirizzo una volta sul televisore e resta
-- li' per mesi.
--
-- ## Come e' protetta, e perche' diversamente dal link di una commessa
--
-- Il collegamento di una commessa (`commessa_link_pubblici`) non ha password:
-- **l'indirizzo e' il segreto**, perche' deve finire in un messaggio a un
-- cliente. Qui no: l'indirizzo vive per mesi su uno schermo in una stanza di
-- passaggio, e un indirizzo che si legge dalla barra del browser non protegge
-- niente. Quindi due strati — indirizzo casuale **piu'** password — e una
-- sessione lunga (30 giorni), perche' una televisione che chiede la password
-- ogni mattina viene spenta.
--
-- ⚠️ Chi ha l'indirizzo puo' provare le password a raffica: senza un freno,
-- una password di sei caratteri su un indirizzo noto si trova. Da qui
-- `tentativi_falliti` e `bloccata_fino_a`, con la logica (pura e testata) in
-- `@kommessa/api/bacheca`.
--
-- ⚠️ La password e' salvata come **scrypt + sale per riga**, mai in chiaro.
-- Non c'e' nessun modo di rileggerla: chi la perde ne imposta un'altra.
--
-- ⚠️ RLS accesa e **nessuna policy permissiva**, piu' `revoke all` da anon e
-- authenticated. Non e' una dimenticanza: ci accede solo il service role,
-- perche' la pagina pubblica una sessione non ce l'ha per definizione. Stessa
-- scelta di `commessa_link_pubblici`.
--
-- Idempotente.
-- ============================================================

create table if not exists public.bacheche_pubbliche (
  -- Una per cliente: la chiave primaria e' il tenant. Non serve un id suo, e
  -- cosi' il vincolo «una sola» lo impone il database invece del codice.
  tenant_id   uuid primary key references public.tenants(id) on delete cascade,

  -- L'indirizzo: 16 byte casuali in base64url. Non e' il segreto, ma non deve
  -- nemmeno essere indovinabile.
  token       text not null unique,

  -- La password: scrypt con sale per riga. Mai in chiaro, mai rileggibile.
  password_hash text not null,
  password_sale text not null,

  attiva      boolean not null default true,

  -- Freno ai tentativi (vedi sopra).
  tentativi_falliti int not null default 0,
  bloccata_fino_a   timestamptz,

  -- Chi l'ha accesa e quando, quante volte e' stata aperta.
  creata_da   uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  aperture    integer not null default 0,
  ultima_apertura_at timestamptz
);

comment on table public.bacheche_pubbliche is
  'La pagina da televisione di un cliente: indirizzo casuale + password. Ci accede SOLO il service role.';
comment on column public.bacheche_pubbliche.token is
  'L''indirizzo (/tv/<token>). Non e'' il segreto: lo e'' la password.';
comment on column public.bacheche_pubbliche.password_hash is
  'scrypt(password, password_sale). Non rileggibile: chi la perde ne imposta un''altra.';

create index if not exists bacheche_pubbliche_token_idx
  on public.bacheche_pubbliche (token);

drop trigger if exists trg_bacheche_pubbliche_updated_at on public.bacheche_pubbliche;
create trigger trg_bacheche_pubbliche_updated_at
  before update on public.bacheche_pubbliche
  for each row execute function public.tg_set_updated_at();

-- -------------------------------------------------------
-- Nessuno entra da qui se non il service role
-- -------------------------------------------------------
alter table public.bacheche_pubbliche enable row level security;

-- Niente policy: con RLS accesa e nessuna policy permissiva, `anon` e
-- `authenticated` non leggono e non scrivono nulla. Il service role scavalca.
revoke all on public.bacheche_pubbliche from anon, authenticated;

-- -------------------------------------------------------
-- Il contatore delle aperture
-- -------------------------------------------------------
-- Come per i link pubblici: un `update ... set aperture = aperture + 1` fatto
-- dal codice perde colpi con due televisori accesi. Qui l'incremento e'
-- atomico. SECURITY DEFINER, e revocata a tutti tranne il service role.
create or replace function public.incrementa_apertura_bacheca(p_tenant uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.bacheche_pubbliche
     set aperture = aperture + 1,
         ultima_apertura_at = now()
   where tenant_id = p_tenant;
$$;

revoke execute on function public.incrementa_apertura_bacheca(uuid) from public, anon, authenticated;

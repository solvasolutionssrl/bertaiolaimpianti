-- ⚠️⚠️ **QUESTO FILE NON SI RIESEGUE DA SOLO.**
-- La policy `commessa_todo_squadra_write` che crea qui e' stata **sostituita**
-- due volte: da `20261008130000` (che aggiunge «solo sulle richieste») e da
-- `20261009140000` (che aggiunge «e solo persone di questo spazio di lavoro»).
-- Ogni file preso da solo e' idempotente, ma rieseguendo QUESTO dopo gli altri
-- si torna alla versione senza vincoli — cioe' si riapre in silenzio proprio
-- cio' che i due dopo sono stati scritti per chiudere. Se serve rifare lo
-- schema, si riapplicano in ordine.
-- ============================================================
-- Chi ha in mano una cosa da fare, e chi ci va
-- ============================================================
-- La segretaria risponde al telefono e affida la richiesta a un caposquadra —
-- che oggi, in Bertaiola, e' un dipendente con ruolo `office`. Il caposquadra
-- la gira a uno o piu' tecnici. Quella seconda mano non esisteva: la colonna
-- `commessa_todo.assegnato_a` e' scalare, e girarla a due persone voleva dire
-- scegliere quale delle due perdere.
--
-- ## Due domande diverse, due posti diversi
--
-- ⭐ `assegnato_a` **resta** e non cambia significato: e' **chi ne risponde**,
-- la persona a cui l'ufficio ha affidato la cosa. Questa tabella dice **chi ci
-- va**. Non sono due verita' sulla stessa domanda — che sarebbe il difetto da
-- evitare — sono due domande: «a chi chiedo come sta andando» e «chi ci mette
-- le mani». Il caposquadra resta in mano a, i tecnici compaiono accanto, e si
-- legge tutta la catena: Erica -> Cristian -> Luca + Thomas.
--
-- L'alternativa era sostituire la colonna con questa tabella. Sono 103 letture
-- in 19 file, in produzione, con tredici persone dentro: si perderebbe chi
-- aveva incaricato chi, e si riscriverebbe ogni predicato «le mie cose da
-- fare» per guadagnare un livello di indirezione.
--
-- ## Un dato che non c'era
--
-- `assegnato_at`: su `commessa_todo` il momento dell'assegnazione **non e'
-- registrato**, e l'elenco del tecnico ripiega su `created_at`. Qui c'e', come
-- su `commessa_tecnici`.
--
-- ## Chi puo' cosa
--
-- La squadra la scrive **solo admin/office**: mandare un collega da qualche
-- parte e' una decisione di chi organizza, e un tecnico non riassegna. Lo
-- dicono la policy qui sotto **e** il trigger `commessa_todo_tecnico_guard`,
-- che gia' impedisce a un tecnico di toccare `assegnato_a`.
--
-- Chi e' in squadra, invece, deve poter **spuntare** la cosa e scriverci una
-- nota: senza questo, un tecnico mandato su una richiesta al telefono (che non
-- ha commessa, quindi nessuna squadra di commessa a cui appoggiarsi) la
-- vedrebbe e non la potrebbe chiudere. Per questo le due policy del tecnico
-- vengono riscritte per intero piu' sotto.
--
-- Idempotente: create if not exists, drop policy if exists prima di ogni
-- create policy.
-- ============================================================

create table if not exists public.commessa_todo_squadra (
  todo_id      uuid not null references public.commessa_todo(id) on delete cascade,
  user_id      uuid not null references public.users(id)         on delete cascade,
  tenant_id    uuid not null references public.tenants(id)       on delete cascade,
  assegnato_da uuid references public.users(id) on delete set null,
  assegnato_at timestamptz not null default now(),
  primary key (todo_id, user_id)
);

create index if not exists commessa_todo_squadra_user_idx
  on public.commessa_todo_squadra(user_id);
create index if not exists commessa_todo_squadra_tenant_idx
  on public.commessa_todo_squadra(tenant_id);

comment on table public.commessa_todo_squadra is
  'Chi ci va: i tecnici a cui chi ha in mano una cosa da fare l''ha girata. Distinta da commessa_todo.assegnato_a, che dice chi ne RISPONDE. La scrive solo admin/office; chi e'' in squadra puo'' spuntare la cosa e scriverci una nota.';
comment on column public.commessa_todo_squadra.assegnato_da is
  'Chi ha mandato questa persona. Serve a leggere la catena: segretaria -> caposquadra -> tecnici.';

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.commessa_todo_squadra enable row level security;

drop policy if exists commessa_todo_squadra_read  on public.commessa_todo_squadra;
drop policy if exists commessa_todo_squadra_write on public.commessa_todo_squadra;

create policy commessa_todo_squadra_read on public.commessa_todo_squadra
  for select
  using (tenant_id = public.current_tenant_id());

-- Mandare qualcuno e' di chi organizza. Un tecnico non si aggiunge e non si
-- toglie: anche il suo «non ci vado» passa da chi gliel'ha chiesto.
create policy commessa_todo_squadra_write on public.commessa_todo_squadra
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('admin'::public.app_role, 'office'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('admin'::public.app_role, 'office'::public.app_role)
  );

-- ── il tecnico in squadra puo' spuntare e annotare ──────────────────────────
-- ⚠️ Riscritte per intero, non toccate: la versione in vigore e' quella di
-- `20261007100000_tecnico_cose_da_fare.sql`, e una policy non si modifica a
-- pezzi. Rispetto a quella cambia **solo** il terzo ramo della condizione:
-- «oppure mi hanno mandato su questa cosa da fare».

drop policy if exists commessa_todo_update_tecnico on public.commessa_todo;

create policy commessa_todo_update_tecnico on public.commessa_todo
  for update
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() = 'tecnico'::public.app_role
    and (
      -- ne risponde lui
      assegnato_a = auth.uid()
      -- oppure e' in squadra sulla commessa a cui la cosa appartiene
      or (
        commessa_id is not null
        and exists (
          select 1 from public.commessa_tecnici ct
           where ct.commessa_id = commessa_todo.commessa_id
             and ct.user_id = auth.uid()
        )
      )
      -- oppure ce l'hanno mandato: e' l'unica strada per una richiesta al
      -- telefono, che non ha commessa e quindi nessuna squadra di commessa.
      or exists (
        select 1 from public.commessa_todo_squadra sq
         where sq.todo_id = commessa_todo.id
           and sq.user_id = auth.uid()
      )
    )
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() = 'tecnico'::public.app_role
    and (
      assegnato_a = auth.uid()
      or (
        commessa_id is not null
        and exists (
          select 1 from public.commessa_tecnici ct
           where ct.commessa_id = commessa_todo.commessa_id
             and ct.user_id = auth.uid()
        )
      )
      or exists (
        select 1 from public.commessa_todo_squadra sq
         where sq.todo_id = commessa_todo.id
           and sq.user_id = auth.uid()
      )
    )
  );

drop policy if exists commessa_todo_nota_insert_tecnico on public.commessa_todo_nota;

create policy commessa_todo_nota_insert_tecnico on public.commessa_todo_nota
  for insert
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() = 'tecnico'::public.app_role
    and author_id = auth.uid()
    and exists (
      select 1 from public.commessa_todo td
       where td.id = commessa_todo_nota.todo_id
         and td.tenant_id = public.current_tenant_id()
         and (
           td.assegnato_a = auth.uid()
           or (
             td.commessa_id is not null
             and exists (
               select 1 from public.commessa_tecnici ct
                where ct.commessa_id = td.commessa_id
                  and ct.user_id = auth.uid()
             )
           )
           or exists (
             select 1 from public.commessa_todo_squadra sq
              where sq.todo_id = td.id
                and sq.user_id = auth.uid()
           )
         )
    )
  );

-- ── il registro conosce questo avviso ───────────────────────────────────────
-- `todo_assegnato` esiste gia' (20261005120000): e' lo stesso avviso, perche'
-- per chi lo riceve e' la stessa cosa — «devi occuparti di questo». Chi gliel
-- 'ha dato cambia, non cosa riceve. Niente riga nuova.

-- ── grant ───────────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.commessa_todo_squadra
  to authenticated;

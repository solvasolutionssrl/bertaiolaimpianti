-- Portale clienti chiuso a chiave (16/09/2026)
--
-- Il portale non è in uso: zero utenti in `external_users`, login non
-- collegato. Le policy però lasciavano al ruolo `cliente` gli stessi permessi
-- dello staff: le `*_tenant_scope` sono FOR ALL e controllano solo il tenant,
-- quindi un utente `cliente` avrebbe letto e scritto commesse, clienti, file,
-- ticket e preset di tutto il tenant. Le `*_cliente_scope` del portale sono
-- permissive, cioè aggiungono accesso invece di toglierlo.
--
-- Finché il portale non viene completato, il ruolo `cliente` non tocca niente:
-- una policy RESTRITTIVA per tabella, che si somma in AND a tutte le altre.
--
-- Per riaprire il portale, in ordine:
--   1. scrivere le policy per il ruolo `cliente` tabella per tabella (lettura
--      delle proprie commesse, dei file pubblici, dei propri ticket);
--   2. togliere le policy `*_no_cliente` qui sotto;
--   3. riaccendere la funzione `portale_clienti` del tenant dal super admin.
--
-- Nota: il service role continua a passare (bypassa la RLS), quindi le
-- funzioni di servizio e i cron non cambiano comportamento.

do $$
declare
  t text;
  tabelle text[] := array[
    'clienti',
    'commesse',
    'commessa_voci',
    'commessa_tags',
    'commessa_bozze',
    'file_refs',
    'file_annotations',
    'interventi',
    'preset',
    'tickets',
    'ticket_messages'
  ];
begin
  foreach t in array tabelle loop
    execute format('drop policy if exists %I on public.%I', t || '_no_cliente', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to public '
      || 'using (coalesce(public.current_role()::text, '''') <> ''cliente'') '
      || 'with check (coalesce(public.current_role()::text, '''') <> ''cliente'')',
      t || '_no_cliente', t
    );
  end loop;
end $$;

comment on policy clienti_no_cliente on public.clienti is
  'Portale clienti chiuso (16/09/2026): il ruolo cliente non accede. Vedi migration 20260916090000.';

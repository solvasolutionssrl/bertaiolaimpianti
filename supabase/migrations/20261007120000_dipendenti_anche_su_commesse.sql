-- ============================================================
-- Il personale non e' una cosa del mondo presenze
-- ============================================================
-- L'anagrafica dei dipendenti viveva sotto `/office/kantiere/`, il cui guscio
-- rimbalza chi non ha il modulo presenze. Risultato: un cliente del mondo
-- commesse con il modulo «Dipendenti» acceso vedeva la voce «Dipendenti» nel
-- menu e cliccandola tornava alla pagina iniziale. Nessun errore, nessun
-- messaggio: una voce di menu che non apre niente.
--
-- Il codice adesso la mette sotto **Personale** e mostra cio' che riguarda i
-- turni solo dove si timbra. Qui si accende il modulo per Bertaiola.
--
-- ⚠️ `pianificazione_attiva` e `ferie_attiva` restano SPENTE, e non per
-- prudenza: la pianificazione settimanale assegna le persone ai **cantieri**
-- (`pianificazione_blocchi.cantiere_id` e' una chiave esterna rigida su
-- `cantieri`), e un tenant del mondo commesse ha commesse, non cantieri. Il
-- selettore direbbe «nessun cantiere» e si potrebbero creare solo blocchi
-- «evento». Accenderla senza una colonna `commessa_id` sarebbe dare una
-- funzione che non funziona.
--
-- Idempotente: on conflict sulla coppia (tenant, modulo).
-- ============================================================

insert into public.tenant_modules (tenant_id, module_code, attivo, config, configured_at)
select t.id,
       'dipendenti',
       true,
       jsonb_build_object('pianificazione_attiva', false, 'ferie_attiva', false),
       now()
  from public.tenants t
 where t.slug = 'BER'
on conflict (tenant_id, module_code) do update
   set attivo = true,
       -- Le chiavi che non nominiamo restano come sono: un domani che qualcuno
       -- accende le ferie a mano, una riesecuzione non le spegne.
       config = coalesce(public.tenant_modules.config, '{}'::jsonb)
                || jsonb_build_object('pianificazione_attiva', false),
       configured_at = now();

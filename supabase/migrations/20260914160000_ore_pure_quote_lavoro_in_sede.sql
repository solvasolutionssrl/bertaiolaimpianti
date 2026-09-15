-- ============================================================================
-- Ore «pure» e quote derivate + lavoro in sede sul progetto (14/09/2026)
-- ============================================================================
--
-- 1) DATI PURI. Ogni riga del rapportino (un cantiere) salva i minuti di lavoro
--    e i minuti di viaggio così come sono stati timbrati o dichiarati. Prima le
--    giornate timbrate si salvavano già divise (8 ordinarie + 2 straordinarie) e
--    quelle scritte a mano mettevano tutto nelle ordinarie: due modalità diverse
--    per lo stesso dato.
--
-- 2) QUOTE DERIVATE. Le colonne ore_* restano, ma sono derivate dai minuti con
--    la regola del tenant (`@kommessa/api/kantiere-quote`):
--      ore_ordinarie          lavoro dentro l'orario ordinario giornaliero
--      ore_straordinarie      lavoro oltre l'orario ordinario
--      ore_viaggio            viaggio totale (andata, ritorno, trasferimenti)
--      ore_viaggio_ordinarie  viaggio che entra nell'orario ordinario rimasto   (NUOVA)
--      ore_viaggio_eccedenti  viaggio oltre l'orario ordinario                  (NUOVA)
--    rapportini.orario_ordinario_min registra l'orario ordinario con cui la
--    giornata è stata derivata (NULL = giornata precedente alla regola).
--
--    Le giornate esistenti NON si ricalcolano (scelta del cliente): si
--    riempiono solo i minuti puri, che sono esatti (lavoro = ordinarie +
--    straordinarie, viaggio = ore_viaggio). Le quote di viaggio restano NULL, e
--    chi legge le tratta come prima: tutto il viaggio a parte.
--
-- 3) LAVORO IN SEDE SUL PROGETTO. timbrature.sede_lavoro_id valorizzato = il
--    tratto di lavoro sul cantiere è stato svolto in quella sede (es. al
--    computer), non sul posto. Il viaggio si calcola verso la sede.
-- ============================================================================

alter table public.rapportino_righe
  add column if not exists minuti_lavoro integer,
  add column if not exists minuti_viaggio integer,
  add column if not exists ore_viaggio_ordinarie numeric(4,2),
  add column if not exists ore_viaggio_eccedenti numeric(4,2);

alter table public.rapportino_righe drop constraint if exists rapportino_righe_minuti_chk;
alter table public.rapportino_righe add constraint rapportino_righe_minuti_chk check (
  (minuti_lavoro is null or minuti_lavoro between 0 and 1440)
  and (minuti_viaggio is null or minuti_viaggio between 0 and 1440)
  and (ore_viaggio_ordinarie is null or ore_viaggio_ordinarie >= 0)
  and (ore_viaggio_eccedenti is null or ore_viaggio_eccedenti >= 0)
);

comment on column public.rapportino_righe.minuti_lavoro is 'Minuti di lavoro sul cantiere, puri (timbrati o dichiarati). Fonte delle quote ore_ordinarie/ore_straordinarie.';
comment on column public.rapportino_righe.minuti_viaggio is 'Minuti di viaggio attribuiti al cantiere, puri (andata, ritorno, trasferimenti).';
comment on column public.rapportino_righe.ore_viaggio_ordinarie is 'Quota derivata: viaggio dentro l''orario ordinario giornaliero. NULL = riga precedente alla regola del 14/09/2026.';
comment on column public.rapportino_righe.ore_viaggio_eccedenti is 'Quota derivata: viaggio oltre l''orario ordinario giornaliero. NULL = riga precedente alla regola del 14/09/2026.';

alter table public.rapportini
  add column if not exists orario_ordinario_min integer;
alter table public.rapportini drop constraint if exists rapportini_orario_ordinario_chk;
alter table public.rapportini add constraint rapportini_orario_ordinario_chk check (
  orario_ordinario_min is null or orario_ordinario_min between 1 and 1440
);
comment on column public.rapportini.orario_ordinario_min is 'Orario ordinario giornaliero (minuti) con cui sono state derivate le quote. NULL = giornata precedente alla regola del 14/09/2026.';

-- Minuti puri delle righe esistenti: esatti, nessuna quota ricalcolata.
update public.rapportino_righe
   set minuti_lavoro = round((coalesce(ore_ordinarie, 0) + coalesce(ore_straordinarie, 0)) * 60),
       minuti_viaggio = round(coalesce(ore_viaggio, 0) * 60)
 where minuti_lavoro is null;

alter table public.timbrature
  add column if not exists sede_lavoro_id uuid references public.sedi(id) on delete set null;
comment on column public.timbrature.sede_lavoro_id is 'Lavoro svolto in questa sede sul progetto del cantiere (non sul posto). NULL = presenza sul cantiere.';

-- Data da cui vale la regola delle quote per i tenant Kantiere esistenti: le
-- giornate precedenti restano come registrate anche se ricalcolate. I tenant
-- nuovi non hanno la chiave: la regola vale da subito.
update public.tenant_modules
   set config = coalesce(config, '{}'::jsonb) || jsonb_build_object('quote_ore_dal', '2026-09-15')
 where module_code = 'kantiere'
   and not (coalesce(config, '{}'::jsonb) ? 'quote_ore_dal');

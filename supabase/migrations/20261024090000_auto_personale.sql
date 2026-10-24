-- =====================================================================
-- 20261024090000_auto_personale.sql
-- «Auto personale» fra le opzioni dei mezzi (24/10/2026).
--
-- Chi usa la propria auto per andare in cantiere lo deve poter dire, e i
-- chilometri devono restare tracciati per il rimborso. Invece di un valore
-- speciale da riconoscere in ogni tendina (sei punti nell'app), e' una RIGA
-- VERA in `mezzi`, marcata `personale`: compare da se' ovunque si scelga un
-- mezzo, e `timbratura_viaggio.mezzo_id` la cita come qualunque altro mezzo,
-- quindi i conti dei chilometri per persona funzionano senza codice nuovo.
--
-- ⚠️ La riga e' UNA per cliente (indice unico parziale) e non si rinomina ne'
-- si cancella: lo impediscono le azioni dell'ufficio. `targa` e' obbligatoria
-- sulla tabella, quindi porta il segnaposto 'AUTO PERSONALE'.
--
-- Idempotente.
-- =====================================================================

alter table public.mezzi add column if not exists personale boolean not null default false;

comment on column public.mezzi.personale is
  'Vera solo sulla voce «Auto personale» del cliente: non e'' un mezzo aziendale, serve a dichiarare i km con la propria auto.';

create unique index if not exists mezzi_personale_uq
  on public.mezzi (tenant_id) where personale;

-- Una voce per ogni cliente che usa il modulo presenze.
insert into public.mezzi (tenant_id, targa, modello, tipo, personale, attivo, note)
select tm.tenant_id, 'AUTO PERSONALE', 'Auto personale', 'autovettura', true, true,
       'Voce di sistema: la usa chi viaggia con la propria auto. I chilometri restano tracciati per il rimborso.'
from public.tenant_modules tm
where tm.module_code = 'kantiere' and tm.attivo
  and not exists (select 1 from public.mezzi m where m.tenant_id = tm.tenant_id and m.personale);

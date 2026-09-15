-- Impostazioni Kantiere: via le chiavi che nessun codice legge più (15/09/2026).
--
--  - km_switch_attivo: i trasferimenti fra cantieri sono sempre viaggio e i loro
--    km contano sempre, sul cantiere di destinazione. L'interruttore non esiste più.
--  - anomalie_ore_max: la pagina Anomalie usa la soglia di verifica della giornata
--    (anomalia_turno_ore_max); questo valore non era letto da nessuna parte.
--
-- Solo rimozione di chiavi: le altre impostazioni restano come sono.

update public.tenant_modules
set config = config - 'km_switch_attivo' - 'anomalie_ore_max'
where module_code = 'kantiere'
  and (config ? 'km_switch_attivo' or config ? 'anomalie_ore_max');

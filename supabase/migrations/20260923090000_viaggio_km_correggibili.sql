-- =====================================================================
-- Km e tempo di viaggio correggibili a posteriori, con la storia.
--
-- ⚠️ RIBALTA UNA SCELTA ESPLICITA. La migration che ha introdotto i km
-- (20260624040000_viaggio_km.sql) dice testualmente: «I km arrivano
-- dall'API di routing e sono trattati come DEFINITIVI (il tecnico/ufficio
-- corregge solo il TEMPO)». Da oggi si correggono anche i km, su richiesta
-- del cliente, ma solo alla condizione che resti distinguibile che cosa ha
-- detto il provider e che cosa ha corretto una persona: un km corretto che
-- sembra un km misurato e' un dato peggiore di un km sbagliato, perche'
-- nessuno sa piu' di chi fidarsi (i km finiscono nei costi, nei rimborsi
-- e nell'export verso il gestionale).
--
-- Si ricalca esattamente il modello che il TEMPO ha gia':
--   durata_stimata_min (provider)  →  durata_confermata_min (valore buono)
--                                  +  giustificazione (perche')
-- che diventa per i km:
--   distanza_stimata_km (provider) →  distanza_km (valore buono)
--                                  +  km_giustificazione (perche')
--
-- Il valore "buono" resta nella colonna di sempre, `distanza_km`, cosi'
-- TUTTI i lettori esistenti (costi, report, scheda cantiere, mezzi, API
-- pubblica, export gestionale) continuano a leggere il numero giusto senza
-- sapere niente di questa migration.
--
-- Idempotente: applicabile piu' volte senza danni.
-- =====================================================================

-- 1. La stima del provider, messa da parte prima di qualunque correzione.
alter table public.timbratura_viaggio
  add column if not exists distanza_stimata_km numeric(8,2);

comment on column public.timbratura_viaggio.distanza_stimata_km is
  'Km come li ha detti il provider di routing. NULL = mai corretta, quindi distanza_km e'' ancora la stima. Si valorizza alla PRIMA correzione, non alla scrittura.';

-- 2. Il motivo della correzione, come `giustificazione` fa per il tempo.
alter table public.timbratura_viaggio
  add column if not exists km_giustificazione text;

comment on column public.timbratura_viaggio.km_giustificazione is
  'Perche'' i km sono stati corretti a mano. Obbligatorio lato applicazione quando distanza_km cambia.';

-- NB: nessun backfill di `distanza_stimata_km`. Lasciarla NULL sulle righe
-- esistenti e' l'informazione giusta: quelle non sono mai state corrette, e
-- riempirla con `distanza_km` direbbe "corretta a un valore identico alla
-- stima", che e' un fatto diverso e falso.

-- 3. La cronologia deve poter dire «viaggio corretto», che prima non era un
--    fatto esprimibile: il vocabolario delle azioni e' chiuso da un CHECK.
alter table public.rapportino_versioni drop constraint if exists rapportino_versioni_azione_check;
alter table public.rapportino_versioni add constraint rapportino_versioni_azione_check check (
  azione in (
    'invio', 'modifica_tecnico', 'modifica_ufficio', 'approvazione', 'respinta', 'riapertura',
    'pausa_ufficio', 'chiusura_ufficio', 'ricalcolo',
    -- Dal 23/09/2026: km o tempo di una tratta corretti a posteriori.
    'modifica_viaggio'
  )
);

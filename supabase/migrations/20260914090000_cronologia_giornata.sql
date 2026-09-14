-- Cronologia della giornata: modalita' precisa su ogni timbratura + nuove azioni
-- della cronologia.
--
-- Perche' `modalita` e non `origine`. `origine` non dice davvero COME e' nata una
-- timbratura: l'avvio turno da app scrive 'manuale', pausa e ripresa da app
-- scrivono 'qr', e sotto 'manuale' finiscono insieme la divisione a fine turno,
-- la giornata dichiarata, la pausa chiusa dal sistema e le correzioni
-- dell'ufficio. `origine` resta com'e' (la usa il calcolo e altro codice): la
-- modalita' si aggiunge accanto, scritta nello STESSO inserimento della
-- timbratura, quindi non puo' divergere dal dato.
--
-- Le righe vecchie restano con modalita' NULL: la cronologia la deduce e lo
-- dichiara. Non la inventiamo nel database.
--
-- ⚠️ Va applicata PRIMA del codice che scrive `modalita`: senza la colonna gli
-- inserimenti delle timbrature fallirebbero.

alter table public.timbrature add column if not exists modalita text;

alter table public.timbrature drop constraint if exists timbrature_modalita_check;
alter table public.timbrature add constraint timbrature_modalita_check check (
  modalita is null or modalita in (
    'qr',                    -- cartello QR
    'app',                   -- tasto nell'app: avvio, pausa, ripresa, fine, cambio cantiere
    'capo',                  -- dal capo squadra per un membro
    'divisione_fine_turno',  -- ricostruita alla chiusura dividendo la giornata fra cantieri
    'giornata_dichiarata',   -- giornata registrata a fine giornata senza timbrature
    'pausa_dichiarata',      -- pausa dichiarata alla chiusura del turno
    'pausa_chiusa_sistema',  -- pausa rimasta aperta, chiusa dal sistema dopo la soglia
    'ufficio'                -- inserita o corretta dall'ufficio
  )
);

comment on column public.timbrature.modalita is
  'Come e'' nata la timbratura (vocabolario chiuso). NULL sulle righe precedenti al 14/09/2026: la cronologia la deduce.';

-- Nuove azioni: le modifiche dell'ufficio che prima non lasciavano traccia e il
-- ricalcolo che sposta le ore di una giornata gia' chiusa.
alter table public.rapportino_versioni drop constraint if exists rapportino_versioni_azione_check;
alter table public.rapportino_versioni add constraint rapportino_versioni_azione_check check (
  azione in (
    'invio', 'modifica_tecnico', 'modifica_ufficio', 'approvazione', 'respinta', 'riapertura',
    'pausa_ufficio', 'chiusura_ufficio', 'ricalcolo'
  )
);

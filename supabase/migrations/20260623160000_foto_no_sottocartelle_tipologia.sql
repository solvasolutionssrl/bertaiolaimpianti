-- Cartella Foto: niente sottocartelle automatiche per tipologia.
--
-- Prima, ogni tipologia di impianto selezionata creava una sottocartella sotto
-- "Foto/In corso/" (Sanitario, Gas, Condizionamento, Bagni, Centrale, ...) →
-- decine di sottocartelle vuote per commessa. Il cliente vuole solo le 3
-- cartelle foto per fase, già create dallo scaffold fisso (provisiona-cartelle
-- + SCAFFOLD_TREE): Foto/Sopralluogo, Foto/In corso, Foto/Finali. Le foto si
-- caricano comunque lì (api/upload/media → Foto/{momento}).
--
-- Azzeriamo quindi `cartella_template` di tutte le voci legate a "Foto". La
-- tipologia resta selezionabile: semplicemente non genera più una cartella.
-- È reversibile/configurabile: per far sì che in futuro una tipologia crei una
-- certa cartella basta reimpostare il suo `cartella_template`.
--
-- NB: tocca SOLO le voci con template "Foto..."; Documenti/Materiali/Preventivi
-- restano invariati. Catalogo globale (tenant_id null) usato di fatto solo da
-- Bertaiola (gli altri tenant non hanno commesse).

update public.voci_catalogo
set cartella_template = null
where cartella_template ilike 'Foto%';

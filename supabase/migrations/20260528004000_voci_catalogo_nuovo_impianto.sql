-- =====================================================================
-- 20260528004000_voci_catalogo_nuovo_impianto.sql
-- Aggiunge la voce 39 'Nuovo Impianto' al catalogo globale.
-- Richiesta cliente Bertaiola post-go-live (28/05/2026).
--
-- cartella_template = NULL: il template di cartella per i nuovi impianti
-- (es. "Preventivi/") è predisposto ma non attivo. L'admin del tenant può
-- popolare il campo dalla UI admin quando deciso, e da quel momento la
-- creazione automatica della cartella partirà.
-- =====================================================================

INSERT INTO public.voci_catalogo
  (id, nome, categoria, "default", cartella_template, ordine_visualizzazione, note)
VALUES
  (39, 'Nuovo Impianto', 'impiantistica', false, NULL, 39,
   'Installazione ex novo (prima posa). Predisposto: per attivare la creazione automatica di una cartella dedicata (es. "Preventivi/") popolare cartella_template dalla UI admin.')
ON CONFLICT (id) DO NOTHING;

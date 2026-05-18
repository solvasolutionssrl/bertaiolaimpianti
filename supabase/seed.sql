-- =====================================================================
-- seed.sql
-- Seed dati iniziali per dev/staging:
--   1) Tenant pilota Bertaiola (slug=BER)
--   2) 38 voci_catalogo (Tassonomia_Lavori.md §2-3)
--
-- NON crea utenti auth (vanno via Edge Function di onboarding).
-- Idempotente: tutte le INSERT usano ON CONFLICT DO NOTHING/UPDATE.
-- =====================================================================

-- ---- 1) Tenant Bertaiola ------------------------------------------------
INSERT INTO public.tenants (slug, nome, brand_color, logo_url, plan, storage_provider, storage_config)
VALUES (
  'BER',
  'Bertaiola Impianti',
  '#D97706',
  'https://placehold.co/256x256?text=BER',
  'pilot',
  'supabase',
  '{"bucket": "ber-files"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE
  SET nome             = EXCLUDED.nome,
      brand_color      = EXCLUDED.brand_color,
      logo_url         = EXCLUDED.logo_url,
      plan             = EXCLUDED.plan,
      storage_provider = EXCLUDED.storage_provider,
      storage_config   = EXCLUDED.storage_config,
      updated_at       = now();

-- ---- 2) Voci catalogo (38 voci, ordine 1..38) ---------------------------
-- Sezione A (sempre attiva, default=true):  1-10 + 26
-- Sezione B (selezionabile, default=false): 11-25, 27-38

INSERT INTO public.voci_catalogo (id, nome, categoria, "default", cartella_template, ordine_visualizzazione, note) VALUES
  -- ===== Sezione A — sempre attive (Tassonomia §2) =====
  ( 1, 'Cliente / Cantiere',          'sempre_attiva',    true,  NULL,                          1, 'Dato strutturato: vive in DB (clienti + commesse), non in cartella'),
  ( 2, 'Ticket',                      'sempre_attiva',    true,  NULL,                          2, 'Dato strutturato: tabella tickets'),
  ( 3, 'Responsabile',                'sempre_attiva',    true,  NULL,                          3, 'Dato strutturato: commesse.responsabile_id'),
  ( 4, 'Preventivo',                  'sempre_attiva',    true,  'Preventivi',                  4, 'PDF firmato'),
  ( 5, 'Cartella cantiere',           'sempre_attiva',    true,  '',                            5, 'Cartella radice della commessa'),
  ( 6, 'Ordine materiali cantiere',   'sempre_attiva',    true,  'Materiali',                   6, 'DDT entrata, ordini fornitori'),
  ( 7, 'POS + Documenti',             'sempre_attiva',    true,  'Documenti/POS',               7, 'Piano Operativo Sicurezza'),
  ( 8, 'Tracciatura cantiere',        'sempre_attiva',    true,  NULL,                          8, 'Solo timeline DB, nessuna cartella'),
  ( 9, 'Cartellone',                  'sempre_attiva',    true,  'Documenti/Cartellone',        9, 'Cartello cantiere obbligatorio'),
  (10, 'Fornitura cassette',          'sempre_attiva',    true,  'Documenti/Cassette_DPI',     10, 'Cassette pronto soccorso / DPI'),

  -- ===== Sezione B — impiantistica (11-19) =====
  (11, 'Colonne sanitario',           'impiantistica',    false, 'Foto/In corso/ColonneSanitario',  11, 'Civile / ristrutturazione'),
  (12, 'Colonne riscaldamento',       'impiantistica',    false, 'Foto/In corso/ColonneRiscaldamento', 12, 'Civile / ristrutturazione'),
  (13, 'Impianto sanitario',          'impiantistica',    false, 'Foto/In corso/Sanitario',     13, 'Bagni, cucine'),
  (14, 'Impianto condizionamento',    'impiantistica',    false, 'Foto/In corso/Condizionamento', 14, 'Climatizzazione'),
  (15, 'Impianto gas interno',        'impiantistica',    false, 'Foto/In corso/Gas',           15, 'Caldaia, fornelli'),
  (16, 'Impianto aspirazione centralizzata', 'impiantistica', false, 'Foto/In corso/Aspirazione', 16, 'Premium residenziale'),
  (17, 'Impianto solare',             'impiantistica',    false, 'Foto/In corso/Solare',        17, 'Solare termico'),
  (18, 'Pannelli solari',             'impiantistica',    false, 'Foto/In corso/Fotovoltaico',  18, 'Fotovoltaico (separato da 17)'),
  (19, 'Ordine C.T., bagni e apparecchiature', 'impiantistica', false, 'Materiali/CentraleTermica', 19, 'Centrale termica + sanitari'),

  -- ===== Sezione B — ventilazione & collaudi (20-21) =====
  (20, 'Fori ventilazione',           'ventilazione',     false, 'Foto/In corso/Ventilazione',  20, 'Caldaie / locali tecnici'),
  (21, 'Collaudo tenuta',             'ventilazione',     false, 'Documenti/Collaudi',          21, 'Quasi sempre su gas'),

  -- ===== Sezione B — documentazione tecnica (22-25) =====
  (22, 'Disegni DICO',                'documentazione',   false, 'Documenti/DICO',              22, 'Disegni a corredo della DICO'),
  (23, 'Compilazione DICO',           'documentazione',   false, 'Documenti/DICO',              23, 'Dichiarazione di conformita'),
  (24, 'Agg. 26/24',                  'documentazione',   false, 'Documenti/DICO',              24, 'Voce storica Bertaiola — definizione esatta da chiarire'),
  (25, 'Agg. 26/24.4',                'documentazione',   false, 'Documenti/DICO',              25, 'Sotto-versione di 24 — da chiarire'),

  -- ===== Sezione A — foto (26) =====
  (26, 'Foto (cantiere)',             'sempre_attiva',    true,  'Foto',                        26, 'Sorgente principale: PWA tecnico'),

  -- ===== Sezione B — tubazioni & idraulica (27-29) =====
  (27, 'Tubazioni passaggi esterni',  'tubazioni',        false, 'Foto/In corso/TubazioniEsterne', 27, 'Allacci esterni / contatore'),
  (28, 'Piatto doccia + vasca',       'tubazioni',        false, 'Foto/In corso/Doccia',        28, 'Bagni'),
  (29, 'Collettori riscaldamento',    'tubazioni',        false, 'Foto/In corso/Collettori',    29, 'Pavimento radiante'),

  -- ===== Sezione B — montaggi (30-32) =====
  (30, 'Posa impianto pavimento',     'montaggi',         false, 'Foto/In corso/PavimentoRadiante', 30, 'Riscaldamento a pavimento'),
  (31, 'Montaggio bagni',             'montaggi',         false, 'Foto/In corso/Bagni',         31, 'Sanitari, accessori'),
  (32, 'Montaggio centrale',          'montaggi',         false, 'Foto/In corso/Centrale',      32, 'Centrale termica'),

  -- ===== Sezione B — impianti elettrici / allacci (33-35) =====
  (33, 'Contatore SAT',               'allacci',          false, 'Documenti/Allacci',           33, 'Allaccio gas'),
  (34, 'CIRCE - CURIT',               'allacci',          false, 'Documenti/Allacci/CatastoTermico', 34, 'Catasto regionale impianti termici (Lombardia/Piemonte)'),
  (35, 'Allacci obbligatori',         'allacci',          false, 'Documenti/Allacci',           35, 'Acqua, gas, energia'),

  -- ===== Sezione B — supporto (36-37) =====
  (36, 'Assistenza per collaudi',     'supporto',         false, 'Documenti/Collaudi',          36, 'Presenza tecnico in collaudo'),
  (37, 'Adesivi info cliente',        'supporto',         false, 'Materiali/Adesivi',           37, 'Etichette su impianti consegnati'),

  -- ===== Sezione B — alimentazione (38) =====
  (38, 'Alimentazione (220 / 380 / ecc.)', 'alimentazione', false, 'Documenti/Allacci',         38, 'Specifica tensione richiesta')
ON CONFLICT (id) DO UPDATE
  SET nome                  = EXCLUDED.nome,
      categoria             = EXCLUDED.categoria,
      "default"             = EXCLUDED."default",
      cartella_template     = EXCLUDED.cartella_template,
      ordine_visualizzazione = EXCLUDED.ordine_visualizzazione,
      note                  = EXCLUDED.note;

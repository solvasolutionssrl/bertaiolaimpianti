-- Pausa pranzo: traccia quando il dipendente esce dall'area cantiere per la
-- pausa senza terminare il turno.
--
-- Modello: la pausa è una normale coppia uscita→ingresso marcata `pausa=true`.
--   - uscita  pausa=true  → inizio pausa (orologio fermo, turno ANCORA aperto)
--   - ingresso pausa=true → ripresa turno (orologio riparte)
--   - uscita  pausa=false → fine turno (turno chiuso)
--
-- Le ore lavorate restano corrette SENZA modifiche al calcolo: l'accoppiamento
-- ingresso→uscita esistente esclude già il "buco" della pausa. Il flag serve
-- solo a: distinguere lo stato (in pausa vs in lavoro vs chiuso), saltare la
-- domanda sul viaggio in pausa/ripresa, ed etichettare la UI.
--
-- Additiva e con default: nessun impatto sulle timbrature esistenti.

alter table public.timbrature
  add column if not exists pausa boolean not null default false;

comment on column public.timbrature.pausa is
  'true = la timbratura è un evento di pausa pranzo (uscita=inizio pausa, ingresso=ripresa). false = inizio/fine turno normale.';

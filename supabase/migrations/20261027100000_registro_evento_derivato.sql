-- ─────────────────────────────────────────────────────────────────────────────
-- `timbri_grezzi.derivato`: l'evento non è stato MISURATO, è stato dedotto.
--
-- Oggi l'unico caso è lo **specchio della chiusura** (`presenza-registro.ts`):
-- quando si chiude il turno da un'altra bocca e nel registro la presenza
-- risulta ancora aperta, si scrive l'uscita anche nel registro.
--
-- ⚠️ Quel controllo guarda il registro **nell'istante della scrittura**, e
-- quell'istante può mentire: il passaggio al terminale arriva con l'import,
-- fino a due minuti dopo. Misurato su una giornata vera di FPM (26/10/2026):
-- badge di uscita alle 18:03:30, specchio alle 18:05 — due uscite per un solo
-- gesto, e la giornata diventava «da verificare».
--
-- Con la colonna, chi legge può rifare la domanda ADESSO: uno specchio vale
-- solo se senza di lui la giornata resterebbe aperta (`timbri-sequenza.ts`).
-- Il riconoscimento stava nel payload `grezzo`, che il lettore non carica:
-- una colonna costa niente e si legge senza tirarsi dietro il JSON.
--
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.timbri_grezzi
  add column if not exists derivato boolean not null default false;

comment on column public.timbri_grezzi.derivato is
  'true = evento dedotto, non misurato (oggi: lo specchio della chiusura). Chi legge lo scarta se la giornata si chiude da sé.';

-- Backfill: le righe già scritte dallo specchio si riconoscono dal payload.
update public.timbri_grezzi
   set derivato = true
 where derivato = false
   and grezzo->>'specchio' = 'fine_turno';

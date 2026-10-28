-- Orario forfettario (personalizzazione FPM, 28/10/2026).
--
-- Un flag contrattuale sulla persona: in Kommessa le ore vere si registrano e
-- si leggono come sempre. Lo guarda SOLO l'export mensile per il consulente
-- del lavoro, dove una giornata lavorata vale l'orario pieno a prescindere
-- dalle ore fatte (niente straordinario, niente viaggio oltre l'orario; ferie e
-- malattie restano assenze come per chiunque).
--
-- Idempotente: si puo' rilanciare.

alter table public.dipendenti
  add column if not exists orario_forfettario boolean not null default false;

comment on column public.dipendenti.orario_forfettario is
  'Contratto con orario forfettario: nell''export paghe una giornata lavorata vale la giornata intera. Non cambia le ore registrate.';

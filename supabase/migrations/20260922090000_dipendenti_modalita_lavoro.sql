-- Come lavora una persona: prevalentemente in ufficio, oppure fuori.
--
-- ⚠️ NON e' un ruolo e non e' un permesso. Il ruolo (`users.role`) dice cosa ti
-- e' **permesso fare** e regge guard e RLS: deve restare piccolo e stabile.
-- Questo dice **come l'app si comporta con te**, ed e' una proprieta' del
-- lavoro, non dell'account. Per questo sta sulla scheda dipendente accanto a
-- `a_turni` e al costo orario: su FPM due persone su trentaquattro non hanno
-- nemmeno un account, e il loro lavoro esiste lo stesso.
--
-- Farne un ruolo porterebbe subito all'esplosione combinatoria — «office che
-- timbra», «tecnico che sta in sede», «caposquadra in ufficio» — e mescolerebbe
-- i permessi con il comportamento dell'interfaccia.
--
-- `esterno` e' il comportamento di sempre: applicando questa migration nessuno
-- cambia, e chi lavora in cantiere non vede nessuna differenza. La modalita'
-- ufficio si accende persona per persona dall'elenco Dipendenti.

alter table public.dipendenti
  add column if not exists modalita_lavoro text not null default 'esterno';

-- Vocabolario chiuso. Aggiungere un valore domani (per esempio «misto») si fa
-- allargando il check; cambiare il significato di uno esistente no.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'dipendenti_modalita_lavoro_chk'
  ) then
    alter table public.dipendenti
      add constraint dipendenti_modalita_lavoro_chk
      check (modalita_lavoro in ('ufficio', 'esterno'));
  end if;
end $$;

comment on column public.dipendenti.modalita_lavoro is
  'Come lavora la persona: ufficio | esterno. Cambia cosa chiede l''app (timbratura e viaggio), non i permessi.';

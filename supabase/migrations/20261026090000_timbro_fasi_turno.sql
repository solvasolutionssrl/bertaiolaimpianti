-- =====================================================================
-- Timbro: le FASI DEL TURNO (26/10/2026)
--
-- Dal 26/10 Timbro manda su ogni passaggio tre cose nuove: la fase che la
-- timbratura dichiara (`step`), chi l'ha stabilita (`step_source`) e se, un
-- istante prima, Timbro conosceva un turno aperto (`shift_was_open`), piu' il
-- puntatore alla timbratura valida precedente della stessa persona.
--
-- Il contratto e' ADDITIVO: finche' FPM resta in modalita' «Solo evento» i
-- campi arrivano `null` e non cambia niente. Si salvano da subito perche' il
-- giorno che Luca accende «Evento con fasi del turno» il dato c'e' gia', senza
-- un buco nello storico.
--
-- ⚠️ Non si aggiunge nessun vincolo sui valori: l'elenco delle fasi e delle
-- origini e' di Timbro, non nostro. Un valore nuovo deve poter entrare e
-- farsi leggere come «non la riconosco» (lo fa `@kommessa/api/timbro-passo`),
-- non far fallire l'import di tutta la giornata.
-- =====================================================================

alter table public.timbri_grezzi
  add column if not exists passo text,
  add column if not exists passo_origine text,
  add column if not exists turno_era_aperto boolean,
  add column if not exists precedente_esterno_id text,
  add column if not exists precedente_at timestamptz;

comment on column public.timbri_grezzi.passo is
  'La fase del turno dichiarata dal passaggio (`step` di Timbro): start, pause_start, pause_end, end. NULL = nessuno l''ha indicata.';
comment on column public.timbri_grezzi.passo_origine is
  'Chi ha stabilito la fase (`step_source`): person e office sono dichiarazioni, inferred e'' un''ipotesi del terminale, api l''abbiamo scritta noi.';
comment on column public.timbri_grezzi.turno_era_aperto is
  'Se un istante prima Timbro conosceva un turno aperto. ⚠️ E'' un fatto della CREAZIONE: non si ricalcola se una timbratura precedente viene poi annullata.';
comment on column public.timbri_grezzi.precedente_esterno_id is
  'Il passaggio valido precedente della stessa persona entro l''orizzonte (16 h): serve a ricalcolare da soli dopo un annullamento.';

-- Si cerca per fase quando si indaga una giornata storta: senza indice e'
-- una scansione su tutta la tabella del cliente.
create index if not exists timbri_grezzi_passo_idx
  on public.timbri_grezzi (tenant_id, passo)
  where passo is not null;

-- =====================================================================
-- 20260811100000_scritture_ack.sql
-- Due tempi diversi, e serve tenerli separati.
--
-- `scritto_at`    = quando il record e' finito DAVVERO sul gestionale, cosi'
--                   come lo dichiara l'agente. E' il tempo che conta per
--                   l'ufficio: «questa ora quando e' arrivata in ERGO?».
-- `registrato_at` = quando ce l'ha detto. Lo mette il server.
--
-- Se fossero lo stesso campo si perderebbe proprio il caso interessante:
-- l'agente scrive, perde la rete, riconferma tre ore dopo. Con un campo solo
-- risulterebbe scritto tre ore dopo — e a fine mese, sul confine fra due
-- periodi di paga, quella differenza cambia il conto.
--
-- Lo scarto fra i due e' anche il termometro della salute del collegamento:
-- se cresce, l'agente sta accumulando ritardo.
-- =====================================================================

alter table public.integrazione_scritture
  add column if not exists registrato_at timestamptz not null default now();

comment on column public.integrazione_scritture.scritto_at is
  'Quando il record e'' finito sul gestionale, dichiarato dall''agente.';
comment on column public.integrazione_scritture.registrato_at is
  'Quando l''agente ce l''ha comunicato. Lo scarto con scritto_at misura il ritardo del collegamento.';

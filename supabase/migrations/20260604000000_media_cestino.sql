-- =====================================================================
-- 20260604000000_media_cestino.sql
-- Cestino media con retention 30 giorni — "cassaforte R2".
--
-- Contesto: office e super admin possono ora eliminare media (foto/video/
-- pdf, inclusi gli allegati riunione) direttamente dall'app. L'eliminazione
-- NON è distruttiva subito: il file sparisce da Nextcloud (e da tutte le
-- gallerie dell'app), ma l'oggetto su R2 resta come backup per 30 giorni.
-- R2 è staging interno: il cliente non lo vede, quindi il backup è
-- invisibile per costruzione e lo gestisce solo SOLVA da /admin/media.
--
-- Un job pg_cron giornaliero (vedi 20260604000100_cron_purge_cestino.sql)
-- fa il purge definitivo dei file oltre `purge_after`.
--
-- Il soft-delete usa colonne già esistenti: file_refs.deleted_at +
-- status='deleted'. Qui aggiungiamo solo i metadati per chi/quando/dove.
-- =====================================================================

alter table public.file_refs
  add column if not exists deleted_by uuid null
    references public.users(id) on delete set null,
  add column if not exists purge_after timestamptz null,
  add column if not exists trash_nc_path text null;

comment on column public.file_refs.deleted_by is
  'Utente che ha spostato il file nel cestino dall''app (office/super admin). NULL per cron/sistema.';
comment on column public.file_refs.purge_after is
  'Quando il backup nel cestino diventa eliminabile in via definitiva (deleted_at + 30gg). Il cron purge cancella R2/dotfolder dopo questa data.';
comment on column public.file_refs.trash_nc_path is
  'Solo per file legacy senza r2_key: path Nextcloud (dotfolder .cestino_solva) dove il file è stato spostato, per poterlo ripristinare. NULL quando la cassaforte è R2.';

-- Indice per il cron di purge: solo i record con una scadenza pendente.
create index if not exists file_refs_purge_after_idx
  on public.file_refs(purge_after)
  where purge_after is not null;

-- ---------------------------------------------------------------------
-- Il portale cliente legge da portal_files_view (def. in 20260101001500):
-- non filtrava i file nel cestino. Ricreiamo la view aggiungendo
-- `deleted_at is null` così un file eliminato sparisce anche dal portale.
-- (Stessa definizione, sola aggiunta del filtro soft-delete.)
-- ---------------------------------------------------------------------
create or replace view public.portal_files_view as
select
  f.id,
  f.tenant_id,
  f.commessa_id,
  f.voce_id,
  f.path,
  f.filename,
  f.mime as mime_type,
  f.size_bytes,
  f.uploaded_at,
  f.taken_at,
  f.pubblico
from public.file_refs f
join public.commesse c on c.id = f.commessa_id
where f.commessa_id is not null
  and f.deleted_at is null
  and (
    f.pubblico
    or f.path like c.cloud_folder_path || '/Preventivi/%'
    or f.path like c.cloud_folder_path || '/Documenti/POS/%'
    or f.path like c.cloud_folder_path || '/Documenti/DICO/%'
    or f.path like c.cloud_folder_path || '/Documenti/Certificazioni/%'
    or f.path like c.cloud_folder_path || '/Chiusura/%'
  );

-- Landing pubblica QR: sottotitolo gestibile dal super admin.
--
-- Quando un visitatore qualsiasi (telefono normale, non autenticato) inquadra
-- il QR di un cantiere, /t/[token] mostra una landing informativa con:
--   - nome azienda (tenants.nome)
--   - sottotitolo gestibile (questa colonna; se null usa un default in codice)
--   - nome del cantiere
--   - blocco "cos'è Kantiere" + riferimento Solva (costante di prodotto)
--
-- La landing è la STESSA per ogni cantiere del tenant: cambiano solo il nome
-- azienda e il nome cantiere, presi automaticamente. Il super admin gestisce
-- solo questo sottotitolo dal pannello /admin/tenants/[id] (tab Branding).
--
-- Additiva e nullable: nessun impatto sui tenant esistenti (default in codice).

alter table public.tenants
  add column if not exists landing_tagline text;

comment on column public.tenants.landing_tagline is
  'Sottotitolo mostrato nella landing pubblica del QR cantiere. Null => default applicativo.';

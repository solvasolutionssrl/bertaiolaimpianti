# Email templates Kommessa — Supabase Auth

**Versione**: 1.0 — 2026-05-25

6 template HTML pronti da incollare in Supabase → Authentication → Email
Templates. Stile coerente con la favicon: K bianca su sfondo blu
`#1340A6`, accent arancio `#D97706`, layout sobrio italiano.

Tutti i template sono:
- **600px max-width**, mobile-friendly (responsive via max-width)
- **Inline CSS only**, niente `<style>` (strippato da Gmail/Outlook)
- **Table-based layout**, bulletproof su Outlook 2007+ / Word renderer
- **Preheader nascosto** (testo preview in inbox)
- **Bottone bulletproof** (td con bg-color + `<a>` interno → funziona ovunque)
- **Fallback URL plaintext** sotto il bottone (per chi disabilita HTML)
- **Light + dark mode** compatibili (colori solidi, no immagini)
- **Italiano professionale**, "tu" informale

## Subject + file (in ordine Supabase)

Copia-incolla questi subject nel campo "Subject heading" e il
contenuto del file `.html` corrispondente nel campo "Message body
(HTML)".

| # | Template Supabase | Subject | File |
|---|---|---|---|
| 1 | Confirm signup | `Conferma la tua email Kommessa` | `01-confirm-signup.html` |
| 2 | Invite user | `Sei stato invitato su Kommessa` | `02-invite.html` |
| 3 | Magic Link | `Il tuo link di accesso a Kommessa` | `03-magic-link.html` |
| 4 | Change Email Address | `Conferma il cambio di indirizzo email` | `05-email-change.html` |
| 5 | Reset Password | `Reimposta la tua password Kommessa` | `04-recovery.html` |
| 6 | Reauthentication | `Codice di verifica Kommessa` | `06-reauthentication.html` |

## Variabili template Supabase

I template usano Go template syntax. Supabase popola al volo:

| Variabile | Significato |
|---|---|
| `{{ .ConfirmationURL }}` | URL azione (link cliccabile) — usato in 1-5 |
| `{{ .Token }}` | OTP a 6 cifre — usato in 6 (reauthentication) |
| `{{ .Email }}` | Email del destinatario |
| `{{ .NewEmail }}` | Nuova email (solo template change-email) |
| `{{ .SiteURL }}` | URL base del sito (es. `https://kommessa.solva.it`) |

**Importante**: lascia le variabili così come sono — Supabase le interpreta
al momento dell'invio. Se le togli, le email partono incomplete.

## Test preview locale

Apri ogni file `.html` direttamente nel browser: il rendering è
identico a quello dell'email finale (sostituisci manualmente
`{{ .ConfirmationURL }}` con `https://example.com` per testare il link).

Per test cross-client (Outlook, Gmail, Apple Mail) puoi usare:
- [HTMLemail.io Test](https://htmlemail.io) — incolla HTML + screenshot multi-client (free tier)
- [Mailtrap](https://mailtrap.io) — invio test senza spammare destinatari reali
- Resend ha un **Test mode**: invia da Resend Dashboard → Send Test → incolla HTML

## Modifiche future

Se cambia il brand (colore, nome, logo):
1. Find/replace `Kommessa` → nuovo nome
2. Find/replace `#1340A6` (primary blue) + `#D97706` (accent orange)
3. Cambia il footer "Powered by SOLVA" se serve

Non rinominare i file: la corrispondenza con i template Supabase è
documentata sopra.

## Ordine consigliato di test

Dopo aver incollato e salvato:

1. **Confirm signup** — crea un nuovo utente (es. via signup pubblico se attivo, o invito a un'email tua)
2. **Magic link** — vai su login Kommessa → "Hai dimenticato la password?" → controlla email
3. **Reset password** — stesso flow
4. **Invite** — `/admin/tenants/<id>` → tab utenti → "Invita via email"
5. **Change email** — profilo utente → cambia email (se feature attiva)
6. **Reauthentication** — meno comune, scatta su operazioni sensibili

Se uno non arriva, controlla **Resend → Logs** (dovresti vedere la
richiesta tracciata) + **Supabase → Auth → Logs**.

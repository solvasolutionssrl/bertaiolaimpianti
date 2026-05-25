# Setup email brand Kommessa (Resend + Supabase SMTP)

**Versione**: 1.0 — 2026-05-25
**Stato**: pronto per applicazione

## Obiettivo

Sostituire le email di sistema Supabase (invito, reset password, magic
link, conferma email) con email branded "Kommessa", inviate tramite
Resend e firmate dal dominio del prodotto.

## Cosa fa Claude / cosa fai tu

| Step | Chi |
|---|---|
| Codice "crea utente manuale" (no email) | ✅ già implementato |
| Codice "imposta password manuale" da SA | ✅ già implementato |
| Account Resend + verifica dominio | 👤 tu |
| Inserimento SMTP custom in Supabase Dashboard | 👤 tu |
| Sostituzione template HTML email Supabase | 👤 tu (HTML fornito sotto) |
| Test invio | 👤 tu |

Il flusso "manuale" (#1, #2) **non richiede SMTP** — puoi usarlo subito
senza configurare nulla. Lo SMTP serve solo per i flussi che generano
email automatiche (invito via email, reset via email, magic-link).

---

## Passo 1 — Account Resend + verifica dominio

1. Accedi a [resend.com](https://resend.com) (account già esistente —
   `RESEND_API_KEY` è in `.env.local`).
2. Domains → **Add Domain**.
3. Scegli il dominio mittente. Suggerimento: **`mail.kommessa.app`**
   come sottodominio dedicato, così le impostazioni DNS email non
   inquinano il dominio principale.
4. Resend mostra i record DNS da aggiungere al registrar del dominio:
   - `MX` (per ricezione bounce/replies)
   - `TXT` (SPF: `v=spf1 include:amazonses.com -all`)
   - `TXT` (DKIM: chiave pubblica, ne aggiunge 3 — `resend._domainkey.*`)
   - `TXT` (DMARC: `v=DMARC1; p=none;` per iniziare in modalità soft)
5. Aggiungi i record sul DNS (Cloudflare, Aruba, OVH, dipende dal
   registrar).
6. In Resend clicca **Verify** — di solito ci vogliono 1-30 min.
7. Risultato atteso: domain "Verified" con tutti i record verdi.

**Note pratiche**:
- Se non hai accesso al DNS del dominio finale, parla con il cliente o
  usa per ora un sottodominio nostro (es. `mail.solva.it`).
- Per testare puoi anche usare il dominio `kommessa.app` se è registrato,
  o un sottodominio temporaneo come `notify.kommessa.app`.

## Passo 2 — Configura SMTP custom in Supabase

1. Apri il dashboard Supabase del progetto pilot
   (`BertaiolaImpianti_GestioneCommesse`).
2. **Authentication → Email Templates → SMTP Settings** (in alto a
   destra o nel menu).
3. Abilita **"Enable custom SMTP"** e compila:

```
Sender email:    notify@mail.kommessa.app
Sender name:     Kommessa
Host:            smtp.resend.com
Port:            587
Username:        resend
Password:        <RESEND_API_KEY>   ← la stessa che hai in .env.local
Min interval:    60   (1 email al minuto per utente, anti-spam)
```

4. **Save** + clicca **"Send test email"** → verifica arrivo.

**Limiti free tier Resend**: 100 email/giorno e 3000/mese — più che
sufficiente per inviti e reset password di un tenant pilota. Quando
serve scalare, piano Pro a $20/mese.

## Passo 3 — Sostituisci i template email

In Supabase → **Authentication → Email Templates**. Sono 4-5 template:
- Confirm signup
- Magic Link
- Reset Password
- Change Email Address
- (Invite — solo per pattern admin invite)

Per ciascuno, sostituisci il body HTML con la versione brand Kommessa
sotto. Le variabili Supabase (`{{ .ConfirmationURL }}`, `{{ .Email }}`,
`{{ .Token }}`) restano valide — Supabase le interpola al volo.

### Template "Reset Password" (esempio completo)

```html
<!DOCTYPE html>
<html lang="it">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f7fb;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <!-- Header con logo K -->
        <tr><td style="background:linear-gradient(135deg,#1340A6 0%,#1340A6 55%,#D97706 100%);padding:24px;text-align:center;">
          <div style="display:inline-block;width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:12px;line-height:56px;color:#fff;font-size:32px;font-weight:800;letter-spacing:-0.04em;">K</div>
          <p style="margin:12px 0 0;color:#fff;font-size:14px;letter-spacing:0.14em;text-transform:uppercase;font-weight:600;">Kommessa</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px 28px;">
          <h1 style="margin:0 0 12px;font-size:20px;font-weight:600;">Reimposta la tua password</h1>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.5;color:#444;">
            Hai richiesto di reimpostare la password del tuo account Kommessa.
            Clicca il pulsante qui sotto — il link è valido per <strong>1 ora</strong>.
          </p>
          <p style="margin:24px 0;">
            <a href="{{ .ConfirmationURL }}"
               style="display:inline-block;background:#1340A6;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px;">
              Reimposta password
            </a>
          </p>
          <p style="margin:18px 0 0;font-size:13px;color:#666;line-height:1.5;">
            Se non hai richiesto tu il reset, puoi ignorare questa email —
            la tua password resta invariata.
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f5f7fb;padding:18px 28px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;font-size:12px;color:#888;">
            Kommessa · Gestione commesse impiantistiche<br>
            Powered by SOLVA
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

**Subject** suggerito: `Reimposta la tua password Kommessa`

### Template "Magic Link"

Stesso layout, cambia solo title + body:
- H1: "Accedi a Kommessa"
- Body: "Clicca il pulsante qui sotto per accedere senza password. Il link scade dopo 1 ora."
- Bottone: "Accedi a Kommessa"
- Subject: `Accedi a Kommessa`

### Template "Invite"

- H1: "Sei stato invitato su Kommessa"
- Body: "Il tuo team ti ha invitato a usare Kommessa per gestire le commesse. Clicca il pulsante per attivare l'account e impostare la tua password."
- Bottone: "Attiva il mio account"
- Subject: `Sei stato invitato su Kommessa`

### Template "Confirm signup"

- H1: "Conferma il tuo indirizzo email"
- Body: "Ultimo passo: conferma la tua email cliccando il pulsante qui sotto. Il link scade dopo 24 ore."
- Bottone: "Conferma email"
- Subject: `Conferma la tua email Kommessa`

### Template "Change Email Address"

- H1: "Conferma il nuovo indirizzo email"
- Body: "Hai chiesto di cambiare l'email del tuo account Kommessa. Clicca il pulsante per confermare il nuovo indirizzo."
- Bottone: "Conferma nuova email"
- Subject: `Conferma il cambio email Kommessa`

## Passo 4 — Test

1. Crea un utente di prova in un tenant via "Invita via email" (UI
   esistente in `/admin/tenants/[id]/users`).
2. Verifica che l'email arrivi:
   - dal mittente `Kommessa <notify@mail.kommessa.app>`,
   - con il layout brand sopra,
   - dal server `resend.com` (controllabile nei header).
3. Clicca il link → verifica che il flow di onboarding funzioni come
   prima (Supabase intercetta `/auth/v1/verify` automaticamente).
4. Vai su Resend → **Logs** → vedrai l'email tracciata (delivered /
   opened / clicked).

## Troubleshooting

| Problema | Causa probabile | Fix |
|---|---|---|
| Test SMTP fallisce con 401 | API key sbagliata o non Resend | Verifica `RESEND_API_KEY` è quella corretta |
| Email finisce in spam | SPF/DKIM/DMARC non completi | Aspetta verifica DNS in Resend, controlla allineamento `From:` |
| Email arriva ma layout rotto | Provider client (Gmail/Outlook) strippa CSS | I template sopra usano solo inline CSS — funzionano su tutti i client |
| Bottone "Send test" su Supabase 500 | Rate limit Resend o porta bloccata | Riprova; in alternativa porta 465 con SSL |

## Note finali

- I template Supabase non supportano partial/include — vanno duplicati
  in ogni template. Tieni una copia "master" in questo doc per averli
  in sync.
- Quando passi a multi-tenant brand custom (logo cliente nelle email),
  serve uscire da Supabase SMTP e fare invio Resend custom via
  `auth.admin.generateLink()` + nostra route — vedi note in `tenant.ts`
  per la traccia.
- Per Bertaiola pilota, la versione brand "Kommessa" generica è OK —
  Bertaiola appare già come tenant nel branding office, non nelle email
  di sistema.

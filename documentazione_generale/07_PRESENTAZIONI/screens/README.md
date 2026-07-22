# Screenshot demo — Kommessa + Kantiere

Screenshot dell'app catturati dai **tenant DEMO** (dati 100% fittizi) per
presentazioni e materiale commerciale. Alta risoluzione retina (desktop 2x /
iPhone 3x), ottimizzati JPEG q82.

- Mondo **Commesse** → tenant `DEMOK` "Rossi Impianti (DEMO)"
- Mondo **Cantiere** → tenant `DEMOC` "Nordest Cantieri (DEMO)"
- Login: codice azienda + utente + `Demo2026!` (vedi `Tenant_DEMO_Kommessa_Kantiere.docx`)

I full-res PNG originali stanno in `~/Downloads/Kommessa_screens/` (non versionati).

## Usati nel deck (`Preventivo_Kommessa_Kantiere`)

| File | Slide | Cosa mostra |
|---|---|---|
| `kommessa-03-scheda-commessa.jpg` | 5 | Scheda commessa (office desktop) |
| `kommessa-06-mobile-scheda.jpg` | 5 | Scheda commessa (PWA) |
| `kommessa-08-mobile-dettatura.jpg` | 6 | Dettatura vocale AI |
| `kantiere-09-mobile-turno.jpg` | 8 | Turno in corso (app tecnico) |
| `kantiere-02-presenze-ore.jpg` | 8 | Presenze e ore (cruscotto office) |
| `kantiere-12-mobile-spese.jpg` | 9 | Note spese (app) |
| `kantiere-13-pianificazione.jpg` | 10 | Pianificazione settimanale |

## Scorta (non nel deck, pronti all'uso)

- **Commesse**: `kommessa-01-dashboard`, `-02-commesse-lista`, `-04-clienti`, `-05-mobile-commesse`, `-07-mobile-oggi`
- **Cantiere office**: `kantiere-01-dashboard`, `-03-cantieri`, `-04-cantiere-detail`, `-05-kontabilita`, `-06-qr`, `-07-ore-costi`, `-14-qr-stampa`
- **Cantiere mobile**: `kantiere-08-mobile-cruscotto`, `-10-mobile-scansiona`, `-11-mobile-ore`
- **Accessi**: `accessi-01-login-desktop`, `accessi-02-login-mobile`

> Generati via `puppeteer-core` + Google Chrome (login reale sui demo, emulazione
> desktop/iPhone). Il tour di onboarding viene chiuso prima dello scatto.

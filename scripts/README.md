# `scripts/` — utility e banchi di prova

**Versione**: 1.1
**Stato**: attivo

Script operativi (import una tantum, manutenzioni, banchi di prova) che vivono fuori dal ciclo applicativo. Si eseguono con `node` o con `tsx`.

> ⚠️ Molti di questi script scrivono sul database di **produzione**. Prima di lanciarne uno, leggere il suo header: dice cosa tocca e su quale tenant. I banchi di prova girano solo sui tenant demo (`DEMOK`, `DEMOC`).

---

## Banchi di prova

| Cartella | A cosa serve |
|---|---|
| `banco-ui/` | Chrome guidato sulle interfacce (ufficio, app tecnici, Registra giornata, impostazioni, campanella...). Vedi `banco-ui/README.md`. |
| `banco-upload/` | Banco del caricamento media, con R2 finto. Vedi `banco-upload/README.md`. |

## Dati e manutenzione

| Script | A cosa serve |
|---|---|
| `reset-tenant-data.mjs` | Azzera i dati operativi di un tenant. |
| `backfill-versioni-v1.mjs` | Scrive la versione 1 delle commesse che non ce l'hanno. |
| `cleanup-pianificazione-duplicati.mjs` | Toglie i blocchi doppi dalla pianificazione. |
| `archivio-kantiere/esporta.mjs` | Esporta in CSV le presenze (sola lettura; gli esiti restano fuori dal repo). |
| `demo/` | Crea e allinea gli accessi dei tenant dimostrativi. |

## Import una tantum (FPM)

| Script | A cosa serve |
|---|---|
| `import-cantieri-fpm.mjs` + `data/cantieri-fpm.json` | Prima importazione dei cantieri. |
| `geocode-cantieri-fpm.mjs` | Coordinate degli indirizzi dei cantieri importati. |
| `allinea-dipendenti-da-file.ts` | Allinea l'anagrafica dipendenti a un file del cliente. |

## Gestionale

| Script | A cosa serve |
|---|---|
| `abbina-gestionale.ts` | Abbina le anagrafiche nostre a quelle del gestionale. |
| `promuovi-gestionale.ts` | Promuove i record letti dal gestionale. |

## Varie

| Script | A cosa serve |
|---|---|
| `setup-r2-cors.ts` | Imposta il CORS su un bucket R2 nuovo. |
| `gen-splash.mjs` | Genera le immagini di avvio della PWA. |
| `shortcut-ios/` | Costruisce il comando iOS «Carica su Kommessa». Vedi `shortcut-ios/README.md`. |

---

## Storico

La migrazione one-time da Freshdesk (`migrate-freshdesk.ts`) è stata **rimossa il 16/09/2026**: Freshdesk è abbandonato dal prodotto (ticketing nativo) e lo script non era più eseguibile, perché importava pacchetti `@impiantixplus/*` che non esistono più. I ticket importati allora restano riconoscibili dal valore `source = 'imported_from_freshdesk'`.

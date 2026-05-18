# `apps/web` — Next.js 14 (App Router)

**Versione**: 1.0
**Stato**: scaffolding iniziale (Sprint 0)

Una sola applicazione Next.js serve tutte e tre le superfici prodotto di impiantiXplus. La separazione avviene per **host** in `middleware.ts` e per **route group** nell'App Router — questo permette codice condiviso (auth, fetch Supabase, layout, componenti UI da `@impiantixplus/ui`) senza duplicare app o build.

---

## Le tre superfici

| Superficie | Host atteso (prod) | Route group | Pubblico | Note |
|---|---|---|---|---|
| **Office** | `app.impiantixplus.app` | `app/(office)/...` | Personale ufficio Bertaiola | Dashboard commesse, ticketing nativo, anagrafica clienti, ricerca |
| **Mobile (PWA tecnici)** | `m.impiantixplus.app` | `app/(mobile)/...` | Tecnici in cantiere | PWA installabile, scatto foto via camera, upload background |
| **Portale cliente** | `cliente.impiantixplus.app` | `app/(portal)/...` | Clienti finali Bertaiola | Magic-link auth, stato lavori, download documenti, "Richiedi intervento" |

Il routing per host è gestito in [`middleware.ts`](./middleware.ts):

- `m.*` → rewrite a `/mobile/...`
- `cliente.*` → rewrite a `/portal/...`
- Tutto il resto → office

In locale, per testare le tre superfici dal solo `localhost:3000`, l'app accetta lo header `X-Tenant-Surface` o un fallback su segmenti espliciti (`/mobile`, `/portal`).

---

## PWA tecnici — testing su iPhone reale

La PWA è la mobile experience ufficiale (no React Native, no Expo, no App Store — vedi `CLAUDE.md` v3).

### Setup minimo (Sprint 1)

In `apps/web/app/(mobile)/` configurare:

- `manifest.webmanifest` esposto con `display: standalone`, `theme_color`, icone 192/512 (vedi sezione "Icone PWA")
- Service Worker in `apps/web/public/sw.js` registrato dal layout della route group
- Header `link rel="manifest"` nel layout mobile

### Testare su iPhone reale (procedura raccomandata)

iOS Safari **non** permette di installare una PWA via `localhost` con IP diverso, e richiede HTTPS per i Service Worker. Procedura:

1. **Espone l'ambiente di sviluppo via HTTPS**: usa un tunnel come `ngrok` o (consigliato) `cloudflared`.
   ```bash
   pnpm dev
   # in un secondo terminale
   cloudflared tunnel --url http://localhost:3000
   # output → https://<random>.trycloudflare.com
   ```
2. **Genera un QR code** dell'URL HTTPS (anche `qrencode -t ANSI "https://..."` da terminale o un servizio QR online).
3. **Inquadra il QR con la camera dell'iPhone**, apri il link in Safari.
4. Naviga sull'host che simula `m.<dominio>` — in alternativa, per il test locale, vai direttamente su `https://<tunnel>/mobile`.
5. **Aggiungi alla schermata Home**: tasto Condividi → "Aggiungi alla schermata Home". L'icona PWA appare in home, l'app parte full-screen con il manifest applicato.

Da quel momento puoi verificare:

- `<input type="file" accept="image/*" capture="environment">` apre la fotocamera nativa
- Geolocation API restituisce coordinate (concedere permesso)
- Web Push (iOS 16.4+) richiede PWA installata: testare `Notification.requestPermission()`
- Service Worker offline shell: spegnere wifi e ricaricare → la schermata principale deve restare navigabile

### Tip: dev menu Safari

Su Mac, in Safari → Sviluppo → `<nome iPhone>` → seleziona la PWA: ottieni una DevTools collegata all'iPhone fisico, utile per ispezionare il Service Worker e console errors.

---

## Icone PWA (192 / 512)

Lo standard Web App Manifest richiede almeno una icona 192x192 e una 512x512, idealmente PNG con sfondo opaco e bordi safe-zone.

### Sorgente brand

Il materiale brand del prodotto vive in [`documentazione_generale/03_BRAND/`](../../documentazione_generale/03_BRAND/) (il logo finale `impiantiXplus` è in lavorazione — al momento i candidati e le indicazioni cromatiche sono nei documenti markdown).

### Procedura suggerita

1. Esporta dal master Figma / Illustrator il logo squadrato (1024x1024 PNG con sfondo solid color brand).
2. Genera le due dimensioni richieste:
   ```bash
   # macOS: imagemagick (brew install imagemagick)
   magick logo-1024.png -resize 192x192 apps/web/public/icons/icon-192.png
   magick logo-1024.png -resize 512x512 apps/web/public/icons/icon-512.png
   # versioni maskable (safe-zone 80%) per Android adaptive icons
   magick logo-1024.png -resize 192x192 -gravity center -background "#<brand-bg>" -extent 240x240 -resize 192x192 apps/web/public/icons/icon-192-maskable.png
   magick logo-1024.png -resize 512x512 -gravity center -background "#<brand-bg>" -extent 640x640 -resize 512x512 apps/web/public/icons/icon-512-maskable.png
   ```
3. Aggiungile al manifest:
   ```json
   {
     "icons": [
       { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
       { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
       { "src": "/icons/icon-192-maskable.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
       { "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
     ]
   }
   ```
4. Verifica con Chrome DevTools → Application → Manifest che entrambe siano riconosciute senza warning.

Per il favicon classico (`/favicon.ico`) si può rigenerare dallo stesso master.

---

## Comandi locali

```bash
pnpm --filter @impiantixplus/web dev        # solo questa app
pnpm --filter @impiantixplus/web build
pnpm --filter @impiantixplus/web lint
pnpm --filter @impiantixplus/web typecheck
```

Oppure dalla root: `pnpm dev` (lancia tutto il workspace in parallelo via turbo).

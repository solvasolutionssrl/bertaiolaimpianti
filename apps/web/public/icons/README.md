# PWA Icons

Mancano gli asset PNG `icon-192.png` e `icon-512.png` (referenziati da
`apps/web/app/manifest.ts`). Non versioniamo asset binari finali in attesa
del file logo definitivo del tenant Bertaiola.

## Come generarli

A partire dal logo master in SVG presente in `/branding/` (TBD) oppure dal
PNG quadrato del cliente:

```bash
# Esempio con ImageMagick (richiede sfondo già "safe area" per maskable):
magick branding/impiantixplus-logo.png -resize 192x192 \
  apps/web/public/icons/icon-192.png
magick branding/impiantixplus-logo.png -resize 512x512 \
  apps/web/public/icons/icon-512.png
```

In alternativa, generatore web: <https://realfavicongenerator.net/> →
configurare:

- Theme color: `#D97706` (Ocra)
- Background: `#FFFFFF`
- Safe area maskable: 80% (padding 10% per lato)
- iOS: include apple-touch-icon-180.png (suggerito ma non obbligatorio:
  Next 14 Metadata API lo genera automaticamente se presente
  `apps/web/app/apple-icon.png`)

## Verifica

```bash
pnpm --filter @impiantixplus/web dev
# poi: chrome://inspect → DevTools → Application → Manifest
# deve mostrare entrambe le icone "any" + "maskable" valide
```

## File attesi

- `icon-192.png` — 192×192, sfondo Ocra o trasparente con safe area
- `icon-512.png` — 512×512, idem
- (opz.) `apple-touch-icon.png` — 180×180, generato da Next se in `app/`

# PWA Icons

Le icone della PWA (`icon-192.png`, `icon-512.png`, `apple-icon`) **NON** sono
file statici versionati nel repo: vengono **generate dinamicamente** dai
Route Handlers Next 14 in:

- `apps/web/app/icons/icon-192.png/route.tsx` → 192×192
- `apps/web/app/icons/icon-512.png/route.tsx` → 512×512
- `apps/web/app/apple-icon.tsx` → 180×180 (convenzione Next 14 Metadata API)

Sotto il cofano usano `next/og` (Satori + resvg, runtime edge) per renderizzare
da JSX. Niente dipendenze native (sharp, libvips). Le risposte vengono cachate
da Vercel come immutable.

## Vantaggi

- Niente PNG binari da committare → repo pulito
- Cambi al design = un commit TSX, non Photoshop
- Allineato al theme (`#1340A6` primary, `#F26B23` accent) che vive in CSS
  variables: niente drift visivo

## Per cambiare il design

Modifica i `route.tsx`. Concept attuale: "X+" mono bold arancio su sfondo
blu profondo con grid pattern bianco a bassa opacità + glow accent in basso-
destra. Coerente col linguaggio "Engineering Blueprint" della app.

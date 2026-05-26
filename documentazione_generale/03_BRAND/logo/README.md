# Logo Kommessa — PNG

Versioni PNG del logo Kommessa per uso esterno (presentazioni, email
signature, carta intestata, social, ecc.).

| File | Dimensione | Uso tipico |
|---|---|---|
| `kommessa-logo-1024.png` | 1024×1024 | stampe, asset hi-dpi |
| `kommessa-logo-512.png` | 512×512 | standard web |
| `kommessa-logo-256.png` | 256×256 | slide / sezioni interne PPT |
| `kommessa-logo-128.png` | 128×128 | icona piccola, footer |

## Design

Stessa estetica della favicon dinamica del prodotto
(`apps/web/app/icon.tsx`):

- **Colori**: gradient diagonale 135° da `#1340A6` (primary blu) a
  `#D97706` (accent arancio), con stop intermedio del blu al 55%.
- **Glyph**: "K" maiuscola Helvetica/Arial Bold bianca centrata.
- **Forma**: rounded-square, raggio = 22% del lato.
- **Trasparenza**: PNG con alpha → il rounded-corner è "tagliato",
  funziona su sfondo chiaro e scuro.

## Rigenerazione

Per rifare i PNG (es. dopo un cambio di palette):

```bash
cd documentazione_generale/03_BRAND/logo
python3 _genera_logo.py
```

Richiede `Pillow` (`pip3 install --user Pillow`).

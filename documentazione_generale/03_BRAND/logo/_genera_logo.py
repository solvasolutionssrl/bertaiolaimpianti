#!/usr/bin/env python3
"""
Genera i PNG del logo Kommessa partendo dallo stesso design della
favicon dinamica (apps/web/app/icon.tsx):

  - K bianca centrata
  - sfondo gradient diagonale 135° da #1340A6 (blu primary) a #D97706
    (arancio accent), con stop al 55% del blu
  - rounded square (corner radius proporzionato)

Esporta 4 dimensioni:
  - kommessa-logo-1024.png  (stampe / asset hi-dpi)
  - kommessa-logo-512.png   (standard)
  - kommessa-logo-256.png   (presentazioni)
  - kommessa-logo-128.png   (favicon-like, icona piccola)

Esecuzione:
  cd documentazione_generale/03_BRAND/logo
  python3 _genera_logo.py
"""

from __future__ import annotations

import os
from PIL import Image, ImageDraw, ImageFont

PRIMARY = (0x13, 0x40, 0xA6)   # #1340A6
ACCENT  = (0xD9, 0x77, 0x06)   # #D97706
WHITE   = (255, 255, 255)


def lerp(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    t = max(0.0, min(1.0, t))
    return (
        int(a[0] + (b[0] - a[0]) * t),
        int(a[1] + (b[1] - a[1]) * t),
        int(a[2] + (b[2] - a[2]) * t),
    )


def make_logo(size: int) -> Image.Image:
    """Crea l'immagine quadrata size×size col logo Kommessa."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()

    # Gradient 135° (top-left = primary, bottom-right = accent), con uno
    # stop intermedio al 55% del blu come nella favicon CSS:
    #   linear-gradient(135deg, #1340A6 0%, #1340A6 55%, #D97706 100%)
    # Proiezione su direzione diagonale: t = (x + y) / (2 * (size - 1)).
    diag_max = 2 * (size - 1)
    for y in range(size):
        for x in range(size):
            t = (x + y) / diag_max
            if t <= 0.55:
                color = PRIMARY
            else:
                # rimappa t da [0.55..1.0] su [0..1] per il segmento finale
                local = (t - 0.55) / 0.45
                color = lerp(PRIMARY, ACCENT, local)
            px[x, y] = (*color, 255)

    # Applica una maschera rounded-square. Radius proporzionato: 14/64 ~= 0.22
    radius = int(size * 0.22)
    mask = Image.new("L", (size, size), 0)
    mdraw = ImageDraw.Draw(mask)
    mdraw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    img.putalpha(mask)

    # K bianca centrata. Font: tenta SF/Helvetica bold su mac, fallback bold
    # default di PIL (non bello ma funziona).
    draw = ImageDraw.Draw(img)
    font_paths = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",  # ha più cuts inclusi Bold
        "/System/Library/Fonts/Avenir Next.ttc",
        "/Library/Fonts/Arial Bold.ttf",
    ]
    font_size = int(size * 0.62)  # come favicon: text-2xl su 64 → ~38 = 0.6
    font = None
    for fp in font_paths:
        if os.path.exists(fp):
            try:
                font = ImageFont.truetype(fp, font_size)
                break
            except Exception:
                continue
    if font is None:
        font = ImageFont.load_default()

    # Posizionamento ottico: PIL calcola il bbox del glyph reale,
    # poi centriamo. Aggiustamento verticale per il "K" che ha più
    # peso visivo sopra al baseline.
    text = "K"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = (size - tw) / 2 - bbox[0]
    y = (size - th) / 2 - bbox[1] - int(size * 0.02)
    draw.text((x, y), text, font=font, fill=WHITE)

    return img


def main() -> None:
    here = os.path.dirname(os.path.abspath(__file__))
    for s in (1024, 512, 256, 128):
        img = make_logo(s)
        out = os.path.join(here, f"kommessa-logo-{s}.png")
        img.save(out, "PNG", optimize=True)
        print(f"OK {out}")


if __name__ == "__main__":
    main()

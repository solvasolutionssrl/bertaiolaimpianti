export interface CompressImageOptions {
  /** Lato lungo massimo in px. Default 2048. */
  maxDimension?: number;
  /** Qualita' JPEG 0-1. Default 0.82. */
  quality?: number;
}

/**
 * Compressione client-side via Canvas API (Safari iOS 14+ compatibile).
 * - Riduce a max `maxDimension` px sul lato lungo (default 2048)
 * - JPEG quality `quality` (default 0.82) — ottima per documentazione cantiere
 * - Salta se < 200 KB o se il risultato non è più piccolo del 5%
 *
 * I default (2048/0.82) valgono per le foto commessa. Gli scontrini Kantiere
 * passano `quality: 0.88` (testo piccolo → bordi caratteri più nitidi); oltre
 * i 2048px non si va perché OpenAI vision ridimensiona comunque a 2048.
 */
export function compressImage(
  file: File,
  opts: CompressImageOptions = {},
): Promise<File> {
  const MAX = opts.maxDimension ?? 2048;
  const QUALITY = opts.quality ?? 0.82;
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/') || file.size < 200 * 1024) {
      resolve(file);
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { naturalWidth: w, naturalHeight: h } = img;
      if (w > MAX || h > MAX) {
        const r = Math.min(MAX / w, MAX / h);
        w = Math.round(w * r);
        h = Math.round(h * r);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size * 0.95) { resolve(file); return; }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
            type: 'image/jpeg',
            lastModified: file.lastModified,
          }));
        },
        'image/jpeg',
        QUALITY,
      );
    };

    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}

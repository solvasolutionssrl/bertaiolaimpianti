'use client';

import exifr from 'exifr';

/**
 * Legge la data di scatto/creazione di un file immagine o video.
 *
 * Strategia:
 *  1. Tenta EXIF DateTimeOriginal / CreateDate (foto JPEG/HEIC).
 *  2. Fallback `File.lastModified` (timestamp del file sul filesystem).
 *  3. Se entrambi NaN, ritorna null.
 *
 * Su iOS Safari, una foto scattata e selezionata dal Photos picker
 * arriva spesso con EXIF intatti; un File trascinato da una libreria
 * "moderna" può aver perso EXIF (privacy stripping). Per i video l'EXIF
 * di solito non c'è: si usa lastModified.
 *
 * Performance: exifr legge solo i primi KB del file (cap di default ~64KB).
 * Non scarica/decodifica l'intera immagine. ~5-20ms per foto iPhone tipica.
 */
export async function readImageDate(file: File): Promise<Date | null> {
  // Solo per immagini: per video non vale la pena far girare exifr.
  if (file.type.startsWith('image/')) {
    try {
      const parsed = (await exifr.parse(file, {
        pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate'],
      })) as
        | {
            DateTimeOriginal?: Date | string;
            CreateDate?: Date | string;
            ModifyDate?: Date | string;
          }
        | undefined;
      const raw =
        parsed?.DateTimeOriginal ??
        parsed?.CreateDate ??
        parsed?.ModifyDate ??
        null;
      if (raw) {
        const d = raw instanceof Date ? raw : new Date(raw);
        if (!Number.isNaN(d.getTime())) return d;
      }
    } catch {
      // EXIF malformato/assente: cadiamo sul fallback.
    }
  }
  // Fallback: lastModified del File. Su iOS spesso = data scatto per foto/video
  // appena selezionati da Photos picker.
  if (file.lastModified > 0) {
    const d = new Date(file.lastModified);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/**
 * Formatta una data come "22 mag · 14:03" (giorno+mese+ora se quest'anno,
 * altrimenti aggiunge l'anno). Locale italiana, font compatto.
 */
export function fmtScattoDate(d: Date): string {
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const date = d.toLocaleDateString('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: 'short',
    year: sameYear ? undefined : '2-digit',
  });
  const time = d.toLocaleTimeString('it-IT', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${date} · ${time}`;
}

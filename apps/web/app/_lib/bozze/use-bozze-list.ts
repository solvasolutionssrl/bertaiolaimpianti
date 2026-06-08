'use client';

/**
 * Hook per la sezione "Da completare": elenco delle bozze dell'utente,
 * fuso tra IndexedDB locale e server (GET /api/bozze) con last-write-wins
 * su updatedAt. Mostra anche le bozze non ancora sincronizzate (offline).
 */

import { useCallback, useEffect, useState } from 'react';

import { getAllBozze } from './idb-store';
import type { BozzaPayload, ServerBozza } from './types';

export interface BozzaListItem {
  id: string;
  numeroBozza: number | null;
  titolo: string;
  updatedAt: number;
  /** true se esiste solo in locale (mai sincronizzata col server). */
  soloLocale: boolean;
}

/** Titolo leggibile derivato dal payload della bozza. */
export function titoloBozza(p: BozzaPayload): string {
  const desc = p?.descrizioneFinale?.trim();
  if (desc) return desc;
  const cliente = p?.clienteNew?.ragione_sociale?.trim();
  if (cliente) return cliente;
  const note = p?.noteIniziali?.trim();
  if (note) return note.length > 60 ? `${note.slice(0, 57)}…` : note;
  return 'Bozza senza titolo';
}

export function useBozzeList(): {
  bozze: BozzaListItem[];
  loading: boolean;
  reload: () => Promise<void>;
} {
  const [bozze, setBozze] = useState<BozzaListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    // 1. Locali (IndexedDB)
    const locali = await getAllBozze();
    const byId = new Map<string, BozzaListItem>();
    for (const l of locali) {
      byId.set(l.id, {
        id: l.id,
        numeroBozza: l.numeroBozza,
        titolo: titoloBozza(l.payload),
        updatedAt: l.updatedAt,
        soloLocale: l.lastSyncedAt == null,
      });
    }
    // 2. Server (se online)
    try {
      const res = await fetch('/api/bozze', { cache: 'no-store' });
      if (res.ok) {
        const json = (await res.json()) as { bozze: ServerBozza[] };
        for (const s of json.bozze ?? []) {
          const serverUpdated = new Date(s.updatedAt).getTime();
          const existing = byId.get(s.id);
          // Last-write-wins: tieni la versione piu' recente.
          if (!existing || serverUpdated >= existing.updatedAt) {
            byId.set(s.id, {
              id: s.id,
              numeroBozza: s.numeroBozza,
              titolo: titoloBozza(s.payload),
              updatedAt: serverUpdated,
              soloLocale: false,
            });
          } else {
            existing.soloLocale = false; // esiste anche sul server
          }
        }
      }
    } catch {
      // offline: mostriamo solo le locali
    }

    const list = Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt);
    setBozze(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { bozze, loading, reload };
}

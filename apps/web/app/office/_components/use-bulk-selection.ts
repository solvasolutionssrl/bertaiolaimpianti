'use client';

import { useCallback, useMemo, useState } from 'react';

/**
 * Hook di selezione multipla per righe di tabella.
 *
 * Espone uno stato `Set<string>` di id selezionati con primitive comode:
 * - `toggle(id)` / `toggleAll(ids)` / `clear()`
 * - `isSelected(id)` / `isAllSelected(ids)` per i checkbox
 * - `count` per la action bar
 *
 * Tutta la logica vive nel client: i bulk Server Action ricevono l'array
 * di id e fanno il resto. Non c'è cache: cambi visibili dopo `router.refresh()`.
 */
export function useBulkSelection<T extends { id: string }>() {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((items: T[] | string[]) => {
    setSelected((prev) => {
      const ids = (items as Array<T | string>).map((i) =>
        typeof i === 'string' ? i : i.id,
      );
      // Se TUTTI gli ids attualmente visibili sono già selezionati → svuota,
      // altrimenti seleziona tutti gli ids visibili (preservando eventuali
      // selezioni esistenti fuori dalla pagina corrente).
      const allInSet = ids.length > 0 && ids.every((id) => prev.has(id));
      if (allInSet) {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      }
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setSelected(new Set());
  }, []);

  const isSelected = useCallback(
    (id: string) => selected.has(id),
    [selected],
  );

  const isAllSelected = useCallback(
    (items: T[] | string[]) => {
      const ids = (items as Array<T | string>).map((i) =>
        typeof i === 'string' ? i : i.id,
      );
      if (ids.length === 0) return false;
      return ids.every((id) => selected.has(id));
    },
    [selected],
  );

  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  return {
    selectedIds,
    toggle,
    toggleAll,
    clear,
    isSelected,
    isAllSelected,
    count: selected.size,
  };
}

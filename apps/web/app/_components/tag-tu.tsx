import { TAG_TU } from '@kommessa/api/zone-dati';
import { cn } from '@kommessa/ui';

/**
 * «tu» accanto al nome di chi guarda, nelle liste che contengono anche lui
 * (Presenze e ore, Kontabilita', pianificazione, cruscotto del telefono).
 * Un posto solo per la forma: prima era scritto a mano in Presenze e ore.
 */
export function TagTu({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'ml-1.5 inline-flex rounded-full border border-primary/40 bg-primary/10 px-1.5 py-px align-middle text-[10px] font-semibold leading-4 text-primary',
        className,
      )}
      data-tag-tu
    >
      {TAG_TU}
    </span>
  );
}

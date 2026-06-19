'use client';

import * as React from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { Input } from '@kommessa/ui';

interface Suggestion {
  label: string;
  lat: number;
  lng: number;
}

interface Props {
  value: string;
  onChange: (label: string) => void;
  onSelect: (r: { label: string; lat: number | null; lng: number | null }) => void;
  placeholder?: string;
  id?: string;
}

/**
 * Input indirizzo con autocomplete geocoding (Photon→Nominatim via
 * `/api/geocode/autocomplete`).
 *
 * UX modellata su `tag-editor.tsx`:
 *  - debounce ~300ms sulla digitazione
 *  - dropdown assoluto con i suggerimenti
 *  - tastiera ↑/↓/Enter/Esc
 *  - blur-timeout ~150ms così i click sui suggerimenti vengono registrati
 *
 * Comportamento dati:
 *  - selezione suggerimento → `onChange(label)` + `onSelect({label,lat,lng})`
 *  - digitazione libera (senza selezione) → `onChange(text)` +
 *    `onSelect({label:text,lat:null,lng:null})` (le coord. precedenti
 *    diventano stantie, quindi le azzeriamo)
 *
 * Degrada con grazia: se l'API non risponde, il testo si digita comunque.
 */
export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  id,
}: Props) {
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [activeIdx, setActiveIdx] = React.useState(-1);

  // Evita di sovrascrivere i suggerimenti con risposte fuori-ordine.
  const reqIdRef = React.useRef(0);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (blurRef.current) clearTimeout(blurRef.current);
    };
  }, []);

  const fetchSuggestions = React.useCallback((q: string) => {
    const query = q.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    const myReq = ++reqIdRef.current;
    setLoading(true);
    fetch('/api/geocode/autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
      .then((r) => (r.ok ? r.json() : { suggestions: [] }))
      .then((data: { suggestions?: Suggestion[] }) => {
        if (myReq !== reqIdRef.current) return; // risposta stantia
        const list = Array.isArray(data.suggestions) ? data.suggestions : [];
        setSuggestions(list);
        setActiveIdx(-1);
        setOpen(list.length > 0);
      })
      .catch(() => {
        if (myReq !== reqIdRef.current) return;
        setSuggestions([]);
      })
      .finally(() => {
        if (myReq === reqIdRef.current) setLoading(false);
      });
  }, []);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value;
    // Digitazione libera: le coordinate precedenti non valgono più.
    onChange(text);
    onSelect({ label: text, lat: null, lng: null });

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(text), 300);
  }

  function pick(s: Suggestion) {
    onChange(s.label);
    onSelect({ label: s.label, lat: s.lat, lng: s.lng });
    setOpen(false);
    setSuggestions([]);
    setActiveIdx(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      if (e.key === 'Escape') setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      if (activeIdx >= 0 && activeIdx < suggestions.length) {
        e.preventDefault();
        pick(suggestions[activeIdx]!);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <div className="relative">
        <Input
          id={id}
          type="text"
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
          onBlur={() => {
            // Aspetta che un eventuale click su un suggerimento parta
            blurRef.current = setTimeout(() => setOpen(false), 150);
          }}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
        />
        {loading ? (
          <Loader2
            className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        ) : null}
      </div>

      {open && suggestions.length > 0 ? (
        <ul
          role="listbox"
          className="absolute left-0 top-full z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover py-1 shadow-md"
        >
          {suggestions.map((s, i) => (
            <li key={`${s.label}-${s.lat}-${s.lng}`} role="option" aria-selected={i === activeIdx}>
              <button
                type="button"
                onMouseDown={(e) => {
                  // mousedown (non click) per battere il blur dell'input
                  e.preventDefault();
                  pick(s);
                }}
                onMouseEnter={() => setActiveIdx(i)}
                className={`flex w-full items-start gap-2 px-2.5 py-1.5 text-left text-sm transition-colors ${
                  i === activeIdx ? 'bg-muted' : 'hover:bg-muted/60'
                }`}
              >
                <MapPin
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">{s.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Tag as TagIcon, X } from 'lucide-react';
import { cn } from '@kommessa/ui';

import { aggiungiTag, rimuoviTag } from '../_actions/commessa-tag';
import { useAlert } from './confirm-provider';

interface Props {
  commessaId: string;
  initialTags: string[];
  /** Lista tag esistenti nel tenant per autocomplete (tag, conteggio uso). */
  tenantTags: Array<{ tag: string; usage_count: number }>;
  canEdit: boolean;
}

/**
 * Editor inline di tag per una commessa.
 *
 * UX:
 *  - chip "+ Aggiungi tag" → si trasforma in input
 *  - autocomplete dai tag esistenti nel tenant (suggerimenti sotto)
 *  - Enter o tap su un suggerimento → conferma
 *  - X su un tag → rimuove
 *
 * Server-side validation in commessa-tag.ts (length 1-40, lowercase,
 * solo caratteri sicuri). Lato client mostriamo errori ricevuti.
 */
export function TagEditor({ commessaId, initialTags, tenantTags, canEdit }: Props) {
  const router = useRouter();
  const showAlert = useAlert();
  const [tags, setTags] = React.useState(initialTags);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  // Suggerimenti: tag che matchano il draft e che non sono già applicati
  const suggestions = React.useMemo(() => {
    const d = draft.trim().toLowerCase();
    if (d.length === 0) return [];
    const have = new Set(tags);
    return tenantTags
      .filter((t) => t.tag.includes(d) && !have.has(t.tag))
      .slice(0, 6);
  }, [draft, tenantTags, tags]);

  const addTag = async (raw: string) => {
    const t = raw.trim().toLowerCase();
    if (!t) return;
    if (tags.includes(t)) {
      setDraft('');
      return;
    }
    setPending(true);
    const res = await aggiungiTag({ commessaId, tag: t });
    setPending(false);
    if (!res.ok) {
      await showAlert({ title: 'Errore', body: res.error });
      return;
    }
    setTags((arr) => [...arr, t]);
    setDraft('');
    router.refresh();
  };

  const removeTag = async (t: string) => {
    setPending(true);
    const res = await rimuoviTag({ commessaId, tag: t });
    setPending(false);
    if (!res.ok) {
      await showAlert({ title: 'Errore', body: res.error });
      return;
    }
    setTags((arr) => arr.filter((x) => x !== t));
    router.refresh();
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.length === 0 && !adding ? (
          <p className="text-xs italic text-muted-foreground">Nessun tag</p>
        ) : null}
        {tags.map((t) => (
          <TagChip
            key={t}
            tag={t}
            onRemove={canEdit ? () => removeTag(t) : undefined}
            disabled={pending}
          />
        ))}

        {canEdit ? (
          adding ? (
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value.toLowerCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void addTag(draft);
                  } else if (e.key === 'Escape') {
                    setAdding(false);
                    setDraft('');
                  }
                }}
                onBlur={() => {
                  // Aspetta che un eventuale click su suggerimento parta
                  setTimeout(() => {
                    setAdding(false);
                    setDraft('');
                  }, 150);
                }}
                placeholder="tag…"
                maxLength={40}
                disabled={pending}
                className="h-6 w-32 rounded-full border border-primary/40 bg-card px-2.5 text-xs outline-none ring-2 ring-primary/20"
              />
              {suggestions.length > 0 ? (
                <div className="absolute left-0 top-full z-10 mt-1 min-w-[10rem] overflow-hidden rounded-md border border-border bg-popover shadow-md">
                  {suggestions.map((s) => (
                    <button
                      key={s.tag}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        void addTag(s.tag);
                      }}
                      className="flex w-full items-center justify-between px-2 py-1 text-left text-xs hover:bg-muted"
                    >
                      <span>{s.tag}</span>
                      <span className="font-mono text-[9px] text-muted-foreground">
                        {s.usage_count}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border bg-card px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50"
            >
              {pending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
              Tag
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}

export function TagChip({
  tag,
  onRemove,
  href,
  disabled,
}: {
  tag: string;
  onRemove?: () => void;
  href?: string;
  disabled?: boolean;
}) {
  const inner = (
    <span className="inline-flex items-center gap-0.5">
      <TagIcon className="h-2.5 w-2.5 opacity-60" aria-hidden="true" />
      {tag}
    </span>
  );

  if (href) {
    return (
      <a
        href={href}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-xs text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary',
        )}
      >
        {inner}
      </a>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-xs text-foreground',
      )}
    >
      {inner}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Rimuovi tag ${tag}`}
          className="-mr-1 ml-0.5 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      ) : null}
    </span>
  );
}

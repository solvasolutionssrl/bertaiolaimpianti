'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Send, Sparkles, User } from 'lucide-react';

import { Button, Card } from '@impiantixplus/ui';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const QUICK_PROMPTS: string[] = [
  'Stato commesse a rischio questa settimana',
  'Quali tecnici hanno fatto più ore questa settimana?',
  'Suggerisci voci mancanti per una commessa che mi indichi',
  'Recap audit ultimi 7 giorni',
];

export function CopilotChat({ previewMode }: { previewMode: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streaming]);

  const send = async (text: string) => {
    if (!text.trim() || streaming) return;
    setError(null);
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
    };
    const assistantId = crypto.randomUUID();
    const placeholder: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
    };
    const nextMessages = [...messages, userMsg, placeholder];
    setMessages(nextMessages);
    setInput('');
    setStreaming(true);

    try {
      const res = await fetch('/api/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages
            .filter((m) => m.id !== assistantId)
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        acc += chunk;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: acc } : m,
          ),
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Errore sconosciuto';
      setError(msg);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content:
                  'Errore durante la generazione della risposta. Riprova tra qualche secondo.',
              }
            : m,
        ),
      );
    } finally {
      setStreaming(false);
    }
  };

  return (
    <Card className="flex h-[640px] flex-col overflow-hidden">
      {previewMode ? (
        <div className="border-b border-amber-300/40 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          Modalità preview: ti faremo provare quando attiveremo lo storage
          cloud. Per ora le risposte sono simulate.
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto p-5"
      >
        {messages.length === 0 ? (
          <EmptyState onSelect={send} />
        ) : (
          messages.map((m) => <Bubble key={m.id} message={m} />)
        )}
        {streaming &&
        messages.length > 0 &&
        messages[messages.length - 1]?.content === '' ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Il co-pilot sta pensando…
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="border-t border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="border-t border-border bg-muted/30 p-3"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder="Chiedi al co-pilot…"
            rows={2}
            className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            disabled={streaming}
          />
          <Button
            type="submit"
            size="icon"
            disabled={streaming || !input.trim()}
            aria-label="Invia"
          >
            {streaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function EmptyState({ onSelect }: { onSelect: (q: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 py-10 text-center">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Sparkles className="h-6 w-6" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold">Inizia con un&apos;azione rapida</p>
        <p className="text-xs text-muted-foreground">
          Oppure scrivi direttamente nella casella in basso.
        </p>
      </div>
      <div className="grid w-full max-w-md gap-2">
        {QUICK_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onSelect(p)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-left text-sm transition-colors hover:border-primary/40 hover:bg-primary-soft/40"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function Bubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <div
      className={
        'flex gap-2 ' + (isUser ? 'flex-row-reverse' : 'flex-row')
      }
    >
      <div
        className={
          'mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ' +
          (isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-primary-soft text-primary')
        }
        aria-hidden="true"
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
      </div>
      <div
        className={
          'max-w-[78%] rounded-2xl px-4 py-2 text-sm leading-relaxed ' +
          (isUser
            ? 'rounded-tr-sm bg-primary text-primary-foreground'
            : 'rounded-tl-sm border border-border bg-card text-foreground')
        }
      >
        <div className="whitespace-pre-wrap">
          {message.content || (isUser ? '' : '…')}
        </div>
      </div>
    </div>
  );
}

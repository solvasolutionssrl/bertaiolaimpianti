import { Card, CardContent } from '@impiantixplus/ui';
import { StickyNote, Mic } from 'lucide-react';
import { createServerSupabase } from '@impiantixplus/api/server';

import { VoiceNoteCapture } from './_components/voice-note-capture';

export const dynamic = 'force-dynamic';

interface VoceNotaRow {
  voce_id: number;
  nome: string | null;
  note: string;
  updated_at: string | null;
}

interface VocaleRow {
  id: string;
  transcript: string;
  durationSec: number | null;
  preview: boolean;
  createdAt: string;
}

/**
 * Tab Note: aggrega
 *  - note "per fase" salvate in `commessa_voci.note`
 *  - note vocali (transcript) salvate in `audit_events` con action='voice_note'
 *
 * Quando nascerà una tabella `commessa_note` dedicata spostiamo entrambe lì.
 */
export default async function NoteTab({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createServerSupabase();

  const [vociRes, audioRes] = await Promise.all([
    supabase
      .from('commessa_voci')
      .select(`voce_id, note, updated_at, voce:voce_id ( id, nome )`)
      .eq('commessa_id', params.id)
      .not('note', 'is', null),
    supabase
      .from('audit_events')
      .select('id, after_data, created_at')
      .eq('entity_type', 'commessa')
      .eq('entity_id', params.id)
      .eq('action', 'voice_note')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const noteFasi: VoceNotaRow[] = (vociRes.data ?? [])
    .filter((r: any) => r.note)
    .map((r: any) => {
      const v = Array.isArray(r.voce) ? r.voce[0] : r.voce;
      return {
        voce_id: r.voce_id as number,
        nome: (v?.nome as string | undefined) ?? null,
        note: r.note as string,
        updated_at: (r.updated_at as string | null) ?? null,
      };
    });

  const noteVocali: VocaleRow[] = (audioRes.data ?? []).map((e: any) => {
    const d = (e.after_data ?? {}) as {
      transcript?: string;
      audio_duration_sec?: number | null;
      _preview?: boolean;
    };
    return {
      id: e.id as string,
      transcript: d.transcript ?? '',
      durationSec: d.audio_duration_sec ?? null,
      preview: Boolean(d._preview),
      createdAt: e.created_at as string,
    };
  });

  const empty = noteFasi.length === 0 && noteVocali.length === 0;

  return (
    <div className="space-y-4">
      {/* Voice capture */}
      <VoiceNoteCapture commessaId={params.id} />

      {empty ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <StickyNote
            className="h-7 w-7 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-sm font-medium">Nessuna nota inserita</p>
          <p className="max-w-md text-xs text-muted-foreground">
            Registra una nota vocale qui sopra, oppure aggiungi note alle
            singole fasi dalla sezione Fasi.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Note vocali */}
          {noteVocali.length > 0 ? (
            <Card>
              <div className="border-b border-border bg-accent-soft/40 px-4 py-2">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent-soft-foreground">
                  <Mic className="h-3.5 w-3.5" aria-hidden="true" />
                  Note vocali ({noteVocali.length})
                </p>
              </div>
              <CardContent className="divide-y divide-border p-0">
                {noteVocali.map((n) => (
                  <article key={n.id} className="p-4">
                    <header className="mb-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <span>{fmtData(n.createdAt)}</span>
                      {n.durationSec != null ? (
                        <span className="font-mono">
                          · {fmtDuration(n.durationSec)}
                        </span>
                      ) : null}
                      {n.preview ? (
                        <span className="rounded bg-warning/20 px-1.5 py-0.5 font-semibold text-warning-foreground">
                          preview
                        </span>
                      ) : null}
                    </header>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {n.transcript}
                    </p>
                  </article>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {/* Note per fase */}
          {noteFasi.length > 0 ? (
            <Card>
              <div className="border-b border-border bg-muted/40 px-4 py-2">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <StickyNote className="h-3.5 w-3.5" aria-hidden="true" />
                  Note per fase ({noteFasi.length})
                </p>
              </div>
              <CardContent className="divide-y divide-border p-0">
                {noteFasi.map((n) => (
                  <div key={n.voce_id} className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {n.nome ?? `Voce ${n.voce_id}`}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{n.note}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}

function fmtData(iso: string): string {
  try {
    return new Date(iso).toLocaleString('it-IT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function fmtDuration(sec: number): string {
  const mm = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const ss = Math.floor(sec % 60)
    .toString()
    .padStart(2, '0');
  return `${mm}:${ss}`;
}

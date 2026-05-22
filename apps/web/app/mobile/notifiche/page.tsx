import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Camera,
  CloudUpload,
  CheckCircle2,
  PencilLine,
  Mic,
  FileText,
  Folder,
  AlertCircle,
  Clock,
  Activity,
  Briefcase,
} from 'lucide-react';

import { createServerSupabase } from '@impiantixplus/api/server';
import { createServiceSupabase } from '@impiantixplus/api/service';

import { guardMobile } from '../_lib/guard';
import { Hero, HeroMeta, MetaLine, Stagger } from '../_components/blueprint';

export const metadata: Metadata = {
  title: 'Attività',
};

export const dynamic = 'force-dynamic';

/**
 * /mobile/notifiche — TIMELINE ATTIVITÀ del tenant.
 *
 * Mostra la cronistoria di cosa è successo sull'applicativo:
 *  - upload foto/video
 *  - sync su Nextcloud
 *  - annotazioni create/aggiornate
 *  - note vocali
 *  - briefing modificati
 *  - onboarding utenti
 *
 * Visibilità:
 *  - admin / owner: tutti gli eventi del tenant (cross-utente)
 *  - altri ruoli: solo eventi che li coinvolgono come attore
 *
 * Sostituisce il vecchio "centro notifiche" che usava `notifiche` (RLS
 * problematica con owner senza row). audit_events è già scritto da tutto
 * il sistema → fonte di verità unica.
 */
export default async function AttivitaPage() {
  const ctx = await guardMobile();
  const isAdminLike = ctx.role === 'admin' || ctx.role === 'owner';

  // audit_events ha RLS che potrebbe non includere admin/owner per default
  // → usiamo service-role e filtriamo manualmente per tenant + ruolo.
  const service = createServiceSupabase();

  let query = service
    .from('audit_events')
    .select(
      'id, created_at, action, entity_type, entity_id, actor_user_id, actor_role, metadata',
    )
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: false })
    .limit(60);

  if (!isAdminLike) {
    query = query.eq('actor_user_id', ctx.userId);
  }

  const { data: eventsRaw } = await query;
  const events = (eventsRaw ?? []) as AuditEventRow[];

  // Joinone manuale con users per il display_name (RLS-safe via service role)
  const actorIds = Array.from(
    new Set(events.map((e) => e.actor_user_id).filter((v): v is string => Boolean(v))),
  );
  const usersById = new Map<string, string>();
  if (actorIds.length > 0) {
    const supabase = createServerSupabase();
    const { data: users } = await supabase
      .from('users')
      .select('id, display_name')
      .in('id', actorIds);
    for (const u of users ?? []) {
      if (u.id) usersById.set(u.id, u.display_name ?? '');
    }
  }

  // Carica nomi commesse per gli eventi che ne citano una (via metadata.commessa_id)
  const commessaIds = Array.from(
    new Set(
      events
        .map((e) => (e.metadata as Record<string, unknown> | null)?.commessa_id)
        .filter((v): v is string => typeof v === 'string'),
    ),
  );
  const commesseById = new Map<string, string>();
  if (commessaIds.length > 0) {
    const supabase = createServerSupabase();
    const { data: commesse } = await supabase
      .from('commesse')
      .select('id, codice_interno')
      .in('id', commessaIds);
    for (const c of commesse ?? []) {
      if (c.id) commesseById.set(c.id, c.codice_interno ?? '');
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col pb-24">
      <Hero>
        <HeroMeta>
          {isAdminLike ? 'tutti gli utenti' : 'le tue azioni'} · ultime 60
        </HeroMeta>
        <h1 className="mt-1 font-mono text-3xl font-bold leading-none tracking-tightest text-primary-foreground">
          ATTIVITÀ
        </h1>
        <p className="mt-2 text-sm text-primary-foreground/70">
          Cronistoria di cosa sta accadendo sull&apos;app.
        </p>
      </Hero>

      <div className="flex flex-col gap-4 px-4 pt-5">
        {events.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
            <Activity className="mx-auto mb-2 h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium">Nessuna attività ancora</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Eventi e modifiche compariranno qui in tempo reale.
            </p>
          </div>
        ) : (
          <Stagger className="flex flex-col gap-2">
            {events.map((e) => (
              <EventCard
                key={e.id}
                event={e}
                actorName={
                  e.actor_user_id ? usersById.get(e.actor_user_id) ?? null : null
                }
                commessaCodice={getCommessaCodice(e, commesseById)}
                showActor={isAdminLike}
              />
            ))}
          </Stagger>
        )}
      </div>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

interface AuditEventRow {
  id: string;
  created_at: string;
  action: string;
  entity_type: string;
  entity_id: string;
  actor_user_id: string | null;
  actor_role: string | null;
  metadata: unknown;
}

function getCommessaCodice(
  e: AuditEventRow,
  byId: Map<string, string>,
): string | null {
  const m = e.metadata as Record<string, unknown> | null;
  const id = typeof m?.commessa_id === 'string' ? m.commessa_id : null;
  if (!id) return null;
  return byId.get(id) ?? null;
}

function EventCard({
  event,
  actorName,
  commessaCodice,
  showActor,
}: {
  event: AuditEventRow;
  actorName: string | null;
  commessaCodice: string | null;
  showActor: boolean;
}) {
  const v = describeAction(event);
  const meta = event.metadata as Record<string, unknown> | null;
  const commessaId =
    typeof meta?.commessa_id === 'string' ? meta.commessa_id : null;

  return (
    <article className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 shadow-soft">
      <span
        className={
          'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ' +
          v.toneClass
        }
      >
        <v.Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">
          {v.title}
        </p>
        {v.body && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {v.body}
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <MetaLine className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {fmtRelative(event.created_at)}
          </MetaLine>
          {showActor && actorName && (
            <MetaLine>· {actorName}</MetaLine>
          )}
          {commessaCodice && commessaId && (
            <Link
              href={`/mobile/commessa/${commessaId}`}
              className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-primary hover:underline"
            >
              <Briefcase className="h-3 w-3" aria-hidden="true" />
              {commessaCodice}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

function describeAction(event: AuditEventRow): {
  title: string;
  body: string | null;
  Icon: React.ComponentType<{ className?: string }>;
  toneClass: string;
} {
  const meta = event.metadata as Record<string, unknown> | null;
  const filename = typeof meta?.filename === 'string' ? meta.filename : null;
  const size = typeof meta?.size_bytes === 'number' ? meta.size_bytes : null;
  const mime = typeof meta?.mime === 'string' ? meta.mime : '';
  const isVideo = mime.startsWith('video/');

  switch (event.action) {
    case 'media.upload.init':
      return {
        title: isVideo ? 'Video in caricamento' : 'Foto in caricamento',
        body: filename ?? null,
        Icon: CloudUpload,
        toneClass: 'border-primary/30 bg-primary/10 text-primary',
      };
    case 'media.upload.complete':
    case 'file.upload':
      return {
        title: isVideo ? 'Video caricato' : 'Foto caricata',
        body:
          [filename, size != null ? formatBytes(size) : null]
            .filter(Boolean)
            .join(' · ') || null,
        Icon: Camera,
        toneClass: 'border-success/30 bg-success/10 text-success',
      };
    case 'media.upload.abort':
      return {
        title: 'Upload annullato',
        body: filename ?? null,
        Icon: AlertCircle,
        toneClass: 'border-amber-500/30 bg-amber-500/10 text-amber-700',
      };
    case 'media.sync.synced':
      return {
        title: 'File sincronizzato col cloud',
        body:
          typeof meta?.nextcloud_path === 'string'
            ? String(meta.nextcloud_path).split('/').pop() ?? null
            : null,
        Icon: CheckCircle2,
        toneClass: 'border-success/30 bg-success/10 text-success',
      };
    case 'media.annotate.flatten':
      return {
        title: 'Foto annotata e salvata',
        body: filename ?? 'Annotazione fusa con la foto originale',
        Icon: PencilLine,
        toneClass: 'border-accent/40 bg-accent/10 text-accent-soft-foreground',
      };
    case 'annotation.create':
    case 'annotation.update':
      return {
        title:
          event.action === 'annotation.create'
            ? 'Annotazione creata'
            : 'Annotazione aggiornata',
        body:
          typeof meta?.shapes_count === 'number'
            ? `${meta.shapes_count} elementi`
            : null,
        Icon: PencilLine,
        toneClass: 'border-accent/40 bg-accent/10 text-accent-soft-foreground',
      };
    case 'commessa.dettagli.update':
      return {
        title: 'Dettagli commessa aggiornati',
        body:
          typeof meta?.length === 'number'
            ? `${meta.length} caratteri`
            : null,
        Icon: FileText,
        toneClass: 'border-primary/30 bg-primary/10 text-primary',
      };
    case 'voice_note':
      return {
        title: 'Nota vocale registrata',
        body:
          typeof meta?.duration_sec === 'number'
            ? `${Math.round(meta.duration_sec)}s`
            : null,
        Icon: Mic,
        toneClass: 'border-primary/30 bg-primary/10 text-primary',
      };
    case 'create':
      if (event.entity_type === 'commessa') {
        return {
          title: 'Nuova commessa creata',
          body: typeof meta?.codice_interno === 'string'
            ? String(meta.codice_interno)
            : null,
          Icon: Folder,
          toneClass: 'border-primary/30 bg-primary/10 text-primary',
        };
      }
      return {
        title: `Creato: ${event.entity_type}`,
        body: null,
        Icon: Activity,
        toneClass: 'border-border bg-muted text-muted-foreground',
      };
    case 'onboarding.completed':
      return {
        title: 'Onboarding completato',
        body: null,
        Icon: CheckCircle2,
        toneClass: 'border-success/30 bg-success/10 text-success',
      };
    case 'onboarding.skipped':
    case 'onboarding.reset':
      return {
        title:
          event.action === 'onboarding.skipped' ? 'Onboarding saltato' : 'Onboarding reset',
        body: null,
        Icon: Activity,
        toneClass: 'border-border bg-muted text-muted-foreground',
      };
    default:
      return {
        title: event.action,
        body: event.entity_type,
        Icon: Activity,
        toneClass: 'border-border bg-muted text-muted-foreground',
      };
  }
}

function fmtRelative(iso: string): string {
  const date = new Date(iso);
  const ms = Date.now() - date.getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'adesso';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min fa`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h fa`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}g fa`;
  return date.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

function formatBytes(n: number): string {
  if (!n || n <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

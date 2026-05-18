'use client';

import * as React from 'react';
import { Loader2, MoonStar } from 'lucide-react';
import {
  toggleNotificationPref,
  setQuietHours,
} from './_actions/preferenze';

export interface PrefRow {
  event_code: string;
  label: string;
  description: string | null;
  critical: boolean;
  in_app: boolean;
  push: boolean;
  email: boolean;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

/**
 * UI granulare preferenze notifiche.
 * Layout: ogni event_code = card con 3 chip-toggle (in-app, push, email).
 * Quiet hours: due select sotto (start/end), oppure "off".
 * Stile field-log coerente con /mobile/notifiche.
 */
export function PreferenzeNotifiche({
  initial,
  quietStart,
  quietEnd,
}: {
  initial: PrefRow[];
  quietStart: number | null;
  quietEnd: number | null;
}) {
  const [rows, setRows] = React.useState<PrefRow[]>(initial);
  const [qStart, setQStart] = React.useState<number | null>(quietStart);
  const [qEnd, setQEnd] = React.useState<number | null>(quietEnd);
  const [pendingKey, setPendingKey] = React.useState<string | null>(null);

  async function flip(
    code: string,
    channel: 'in_app' | 'push' | 'email',
    value: boolean,
  ) {
    const key = `${code}:${channel}`;
    setPendingKey(key);
    // optimistic
    setRows((prev) =>
      prev.map((r) => (r.event_code === code ? { ...r, [channel]: value } : r)),
    );
    const res = await toggleNotificationPref({ eventCode: code, channel, value });
    if (!res.ok) {
      // rollback
      setRows((prev) =>
        prev.map((r) =>
          r.event_code === code ? { ...r, [channel]: !value } : r,
        ),
      );
      alert(res.error);
    }
    setPendingKey(null);
  }

  async function saveQuiet(start: number | null, end: number | null) {
    setPendingKey('quiet');
    setQStart(start);
    setQEnd(end);
    const res = await setQuietHours({ start, end });
    if (!res.ok) alert(res.error);
    setPendingKey(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* QUIET HOURS */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <MoonStar className="h-3.5 w-3.5 text-primary" />
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Modalità silenziosa
          </p>
          {pendingKey === 'quiet' ? (
            <Loader2 className="ml-auto h-3 w-3 animate-spin text-muted-foreground" />
          ) : null}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Nessun push in questa fascia oraria (le notifiche critiche
          arrivano comunque).
        </p>
        <div className="mt-2 flex items-center gap-2">
          <HourSelect
            value={qStart}
            onChange={(v) => saveQuiet(v, qEnd)}
            label="dalle"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <HourSelect
            value={qEnd}
            onChange={(v) => saveQuiet(qStart, v)}
            label="alle"
          />
          {qStart != null || qEnd != null ? (
            <button
              type="button"
              onClick={() => saveQuiet(null, null)}
              className="ml-auto font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              reset
            </button>
          ) : null}
        </div>
      </div>

      {/* EVENT TYPES */}
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li
            key={r.event_code}
            className="rounded-lg border border-border bg-card px-3 py-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <h3 className="truncate text-sm font-medium tracking-tight">
                    {r.label}
                  </h3>
                  {r.critical ? (
                    <span className="rounded-sm bg-destructive/10 px-1 font-mono text-[8px] uppercase tracking-wider text-destructive">
                      critico
                    </span>
                  ) : null}
                </div>
                {r.description ? (
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                    {r.description}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <ChannelToggle
                code={r.event_code}
                channel="in_app"
                label="in-app"
                active={r.in_app}
                disabled={r.critical}
                pending={pendingKey === `${r.event_code}:in_app`}
                onToggle={(v) => flip(r.event_code, 'in_app', v)}
              />
              <ChannelToggle
                code={r.event_code}
                channel="push"
                label="push"
                active={r.push}
                disabled={false}
                pending={pendingKey === `${r.event_code}:push`}
                onToggle={(v) => flip(r.event_code, 'push', v)}
              />
              <ChannelToggle
                code={r.event_code}
                channel="email"
                label="email"
                active={r.email}
                disabled={false}
                pending={pendingKey === `${r.event_code}:email`}
                onToggle={(v) => flip(r.event_code, 'email', v)}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChannelToggle({
  code: _code,
  channel: _channel,
  label,
  active,
  disabled,
  pending,
  onToggle,
}: {
  code: string;
  channel: 'in_app' | 'push' | 'email';
  label: string;
  active: boolean;
  disabled: boolean;
  pending: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled || pending}
      onClick={() => onToggle(!active)}
      aria-pressed={active}
      className={[
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
          : 'border-border bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground',
        disabled && 'cursor-not-allowed opacity-50',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {pending ? (
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
      ) : (
        <span
          aria-hidden="true"
          className={[
            'inline-block h-1.5 w-1.5 rounded-full',
            active ? 'bg-primary-foreground' : 'bg-muted-foreground/40',
          ].join(' ')}
        />
      )}
      {label}
    </button>
  );
}

function HourSelect({
  value,
  onChange,
  label,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  label: string;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 text-xs">
      <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="bg-transparent font-mono text-xs focus:outline-none"
      >
        <option value="">—</option>
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h.toString().padStart(2, '0')}:00
          </option>
        ))}
      </select>
    </label>
  );
}

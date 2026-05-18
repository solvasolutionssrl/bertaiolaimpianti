'use server';

import { z } from 'zod';
import { createServerSupabase } from '@impiantixplus/api/server';
import { requireTenantContext } from '@impiantixplus/api/tenant';

const togglePrefSchema = z.object({
  eventCode: z.string().min(1).max(64),
  channel: z.enum(['in_app', 'push', 'email']),
  value: z.boolean(),
});

export async function toggleNotificationPref(
  input: z.infer<typeof togglePrefSchema>,
) {
  const parsed = togglePrefSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.message };
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  // Upsert della riga preferenza; gli altri canali sono mantenuti via
  // SELECT precedente per non sovrascrivere ad esempio email quando si
  // tocca push. Fallback ai default del catalogo se la riga non esiste.
  const { data: cur } = await supabase
    .from('notification_preferences_effective')
    .select('in_app, push, email')
    .eq('user_id', ctx.userId)
    .eq('event_code', parsed.data.eventCode)
    .maybeSingle();

  const next = {
    in_app: (cur as any)?.in_app ?? true,
    push: (cur as any)?.push ?? true,
    email: (cur as any)?.email ?? false,
    [parsed.data.channel]: parsed.data.value,
  };

  const { error } = await supabase.from('notification_preferences').upsert(
    {
      user_id: ctx.userId,
      event_code: parsed.data.eventCode,
      in_app: next.in_app,
      push: next.push,
      email: next.email,
    } as never,
    { onConflict: 'user_id,event_code' },
  );
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

const quietHoursSchema = z.object({
  start: z.number().int().min(0).max(23).nullable(),
  end: z.number().int().min(0).max(23).nullable(),
});

export async function setQuietHours(input: z.infer<typeof quietHoursSchema>) {
  const parsed = quietHoursSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.message };
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('users')
    .update({
      quiet_hours_start: parsed.data.start,
      quiet_hours_end: parsed.data.end,
    } as never)
    .eq('id', ctx.userId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

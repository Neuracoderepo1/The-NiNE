import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual, randomUUID } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));

// Cron-only entry point. There is intentionally no POST handler.
export async function GET(req: NextRequest) {
  if (!authorized(req)) return json({ error: 'unauthorized' }, 401);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json({ error: 'server_not_configured' }, 500);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const owner = `the-nine-${randomUUID()}`;
  const { data: got, error: leaseErr } = await db.rpc('try_acquire_simulation_lease', { p_owner: owner, p_lease_seconds: 240 });
  if (leaseErr) return json({ error: 'lease_error', detail: leaseErr.message }, 500);
  if (!got) return json({ ok: true, skipped: true, reason: 'simulation_busy' });

  let runId: string | number | null = null;
  try {
    const { data: cfg, error: cfgErr } = await db.from('simulation_config').select('*').limit(1).maybeSingle();
    if (cfgErr || !cfg) return json({ error: 'config_unavailable', detail: cfgErr?.message }, 500);
    if (!cfg.enabled) return json({ ok: true, skipped: true, reason: 'simulation_disabled' });
    const maxActions = Number(cfg.max_actions_per_tick);
    const interval = Number(cfg.tick_interval_seconds);

    const { data: world, error: we } = await db.from('world_state').select('*').eq('id', 1).single();
    if (we || !world) return json({ error: 'world_unavailable', detail: we?.message }, 500);

    // Respect tick interval (80% tolerance so cron jitter never drops a tick).
    const ageSec = (Date.now() - new Date(world.updated_at).getTime()) / 1000;
    if (Number.isFinite(ageSec) && Number.isFinite(interval) && ageSec < interval * 0.8) {
      return json({ ok: true, skipped: true, reason: 'tick_interval_not_elapsed' });
    }

    const { data: chars, error: ce } = await db.from('characters').select('*').order('name');
    if (ce) return json({ error: 'characters_unavailable', detail: ce.message }, 500);

    const expected = Number(world.tick);
    const next = expected + 1;
    const startedAt = new Date().toISOString();
    const run = await db.from('simulation_runs').insert({ start_tick: expected, status: 'running' }).select('id').maybeSingle();
    runId = run.data?.id ?? null;

    const residents = (chars ?? []).slice(0, Number.isFinite(maxActions) ? maxActions : undefined);
    let processed = 0;
    for (const r of residents) {
      // Fresh row each time: earlier actions in this tick may have changed this resident.
      const { data: c, error: fe } = await db.from('characters').select('*').eq('id', r.id).single();
      if (fe || !c) throw new Error(`character_read: ${fe?.message}`);
      const food = Number(c.needs?.food ?? 70), energy = Number(c.needs?.energy ?? 80), social = Number(c.needs?.social ?? 50);
      const nearby = (chars ?? []).find((x: any) => x.id !== c.id && x.location === c.location);
      let type = 'work'; let reason = 'Role-driven contribution.';
      if (food < 28) { type = 'eat'; reason = 'Food need is urgent.'; }
      else if (energy < 25) { type = 'rest'; reason = 'Energy is low.'; }
      else if (social < 30 && nearby) { type = 'talk'; reason = 'Social need is low.'; }
      else if (c.role === 'explorer') type = 'explore';
      else if (c.role === 'healer' && nearby) type = 'help';
      else if (c.role === 'organizer' && nearby) type = 'talk';

      // Proposal: need/mood/activity changes. Inventory, shared resources and social needs
      // are applied by the authoritative database functions below.
      const needs = { ...c.needs };
      let mood = c.mood, activity = c.current_activity, narrative = '';
      needs.food = clamp(food - 4); needs.energy = clamp(energy - 8); needs.social = clamp(social - 3);
      if (type === 'eat') { needs.food = clamp(needs.food + 35); needs.energy = clamp(needs.energy + 4); mood = 'satisfied'; activity = 'eating'; narrative = `${c.name} stopped to eat and restored some energy.`; }
      else if (type === 'rest') { needs.energy = clamp(needs.energy + 30); mood = 'calm'; activity = 'resting'; narrative = `${c.name} rested and recovered energy.`; }
      else if (type === 'talk') { mood = 'engaged'; activity = `talking with ${nearby?.name ?? 'someone'}`; narrative = `${c.name} spoke with ${nearby?.name ?? 'someone'} about the settlement.`; }
      else if (type === 'help') { needs.social = clamp(needs.social + 8); mood = 'fulfilled'; activity = `helping ${nearby?.name ?? 'someone'}`; narrative = `${c.name} helped ${nearby?.name ?? 'someone'} with a health check.`; }
      else if (type === 'explore') { needs.energy = clamp(needs.energy - 6); mood = 'excited'; activity = 'exploring north'; narrative = `${c.name} explored toward the north.`; }
      else { mood = 'focused'; activity = `working on ${c.role}`; narrative = `${c.name} worked on ${c.role}.`; }

      const u = await db.from('characters').update({ needs, mood, current_activity: activity, last_action: { type }, last_reason: reason, action_count: Number(c.action_count || 0) + 1, updated_at: new Date().toISOString() }).eq('id', c.id);
      if (u.error) throw new Error(`character_update: ${u.error.message}`);

      // Database-authoritative consequences.
      const meta: Record<string, unknown> = { reason };
      if (['work', 'explore', 'eat', 'help'].includes(type)) {
        const w = await db.rpc('apply_world_action', { p_character: c.id, p_action: type, p_target: type === 'help' ? nearby?.id ?? null : null, p_amount: 2 });
        if (w.error) throw new Error(`apply_world_action: ${w.error.message}`);
        if (w.data?.ok === false) meta.world_action_rejected = w.data.reason;
      }
      if (type === 'talk' && nearby) {
        const s2 = await db.rpc('apply_social_event', { p_actor: c.id, p_target: nearby.id, p_actor_social_delta: 22, p_target_social_delta: 5 });
        if (s2.error) throw new Error(`apply_social_event: ${s2.error.message}`);
        if (s2.data?.ok === false) meta.social_event_rejected = s2.data.reason;
      }

      const ev = await db.from('world_events').insert({ tick: next, actor_id: c.id, actor_name: c.name, action: type, narrative, metadata: meta });
      if (ev.error) throw new Error(`event_insert: ${ev.error.message}`);
      const mem = await db.from('memories').insert({ character_id: c.id, memory_type: 'recent_action', content: `${narrative} Reason: ${reason}`, importance: type === 'talk' || type === 'help' ? 0.65 : 0.45 });
      if (mem.error) throw new Error(`memory_insert: ${mem.error.message}`);
      processed++;
    }

    const { data: tickRes, error: tickErr } = await db.rpc('advance_world_tick', { p_expected_tick: expected });
    if (!tickErr && tickRes?.ok === false) {
      if (runId != null) await db.from('simulation_runs').update({ status: 'aborted', error_message: String(tickRes.reason), completed_at: new Date().toISOString() }).eq('id', runId);
      return json({ error: 'tick_conflict', reason: tickRes.reason }, 409);
    }
    if (tickErr) {
      if (runId != null) await db.from('simulation_runs').update({ status: 'aborted', error_message: tickErr.message, completed_at: new Date().toISOString() }).eq('id', runId);
      return json({ error: 'tick_conflict', detail: tickErr.message }, 409);
    }
    if (runId != null) await db.from('simulation_runs').update({ status: 'completed', end_tick: next, actions_processed: processed, completed_at: new Date().toISOString() }).eq('id', runId);
    return json({ ok: true, tick: next, processed, startedAt });
  } catch (e: any) {
    if (runId != null) await db.from('simulation_runs').update({ status: 'failed', error_message: String(e?.message ?? e).slice(0, 500), completed_at: new Date().toISOString() }).eq('id', runId);
    return json({ error: 'simulation_failed', detail: String(e?.message ?? e) }, 500);
  } finally {
    await db.rpc('release_simulation_lease', { p_owner: owner });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { Ctx, applyNeeds, decide, num, rngFor, socialOutcome, traitsOf } from '../../../lib/engine';
import { narrate } from '../../../lib/narrator';
import { PlannedEvent, rollDiscovery, rollEnvironment, scarcityEvents } from '../../../lib/worldEvents';
import { buildChronicle } from '../../../lib/chronicle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

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
  const warnings: string[] = [];
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
    const { data: relRows } = await db.from('relationships').select('*');
    const { data: knownRows } = await db.from('world_discoveries').select('name');

    const expected = Number(world.tick);
    const next = expected + 1;
    const startedAt = new Date().toISOString();
    const run = await db.from('simulation_runs').insert({ start_tick: expected, status: 'running' }).select('id').maybeSingle();
    runId = run.data?.id ?? null;

    const rels = new Map<string, any>();
    for (const r of relRows ?? []) { rels.set(`${r.character_a}|${r.character_b}`, r); rels.set(`${r.character_b}|${r.character_a}`, r); }
    const known = new Set<string>((knownRows ?? []).map((k: any) => String(k.name)));
    const ctx: Ctx = { tick: next, day: Number(world.day), hour: Number(world.hour), season: String(world.season), weather: String(world.weather), resources: { ...(world.resources ?? {}) }, chars: chars ?? [], rels };
    const startResources = { ...ctx.resources };
    const rndTick = rngFor(`tick:${next}`);

    // ---- helpers -----------------------------------------------------------
    const adjustResources = async (effects?: Record<string, number>) => {
      if (!effects || !Object.keys(effects).length) return;
      const { data, error } = await db.from('world_state').select('resources').eq('id', 1).single();
      if (error || !data) throw new Error(`resources_read: ${error?.message}`);
      const res: Record<string, number> = { ...data.resources };
      for (const [k, v] of Object.entries(effects)) res[k] = Math.max(0, num(res[k], 0) + v);
      const u = await db.from('world_state').update({ resources: res, updated_at: new Date().toISOString() }).eq('id', 1);
      if (u.error) throw new Error(`resources_update: ${u.error.message}`);
      ctx.resources = res;
    };
    const applyWorldEvent = async (p: PlannedEvent, finderId?: string) => {
      const patch: Record<string, unknown> = {};
      if (p.weather) patch.weather = p.weather;
      if (p.season) patch.season = p.season;
      if (Object.keys(patch).length) {
        const u = await db.from('world_state').update(patch).eq('id', 1);
        if (u.error) throw new Error(`world_update: ${u.error.message}`);
      }
      await adjustResources(p.effects);
      const ev = await db.from('world_events').insert({
        tick: next, actor_id: null, actor_name: 'THE WORLD', action: 'world_event', narrative: p.text,
        metadata: { kind: p.kind, weather: p.weather, season: p.season, name: p.discovery?.name, effects: p.effects ?? {} },
      });
      if (ev.error) throw new Error(`world_event_insert: ${ev.error.message}`);
      if (p.memory) {
        const rows = ctx.chars.map((c: any) => ({
          character_id: c.id, memory_type: 'world_event', content: p.text,
          importance: finderId ? (c.id === finderId ? p.memory!.importance : 0.45) : p.memory!.importance,
        }));
        const m = await db.from('memories').insert(rows);
        if (m.error) warnings.push(`world_memory: ${m.error.message}`);
      }
    };

    // ---- environment: season and weather before anyone acts ----------------
    for (const p of rollEnvironment(ctx, rndTick)) {
      try {
        await applyWorldEvent(p);
        if (p.weather) ctx.weather = p.weather;
        if (p.season) ctx.season = p.season;
      } catch (e: any) { warnings.push(`environment: ${String(e?.message ?? e)}`); }
    }

    // ---- residents act, in a fresh random order each tick -------------------
    const order = (chars ?? []).slice(0, Number.isFinite(maxActions) ? maxActions : undefined);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rndTick() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }

    const explorers: any[] = [];
    let processed = 0;
    for (const r of order) {
      // Fresh snapshot each time: earlier actions in this tick may have changed anyone.
      const { data: all, error: fe } = await db.from('characters').select('*').order('name');
      if (fe || !all) throw new Error(`character_read: ${fe?.message}`);
      ctx.chars = all;
      const c = all.find((x: any) => x.id === r.id);
      if (!c) throw new Error('character_read: resident missing');

      const rnd = rngFor(`${next}:${c.id}`);
      const d = decide(c, ctx, rnd);
      const soc = d.type === 'talk' && d.target ? socialOutcome(c, d.target, ctx, rnd) : null;
      const upd = applyNeeds(c, d, ctx, rnd, soc);
      const narrative = narrate(c, d, ctx, rnd, soc) + (upd.hurt ? ` ${c.name} was hurt in the process.` : '');

      const u = await db.from('characters').update({
        needs: upd.needs, mood: upd.mood, current_activity: upd.activity,
        last_action: { type: d.type, target: d.target?.name ?? null }, last_reason: d.reason,
        action_count: Number(c.action_count || 0) + 1, updated_at: new Date().toISOString(),
      }).eq('id', c.id);
      if (u.error) throw new Error(`character_update: ${u.error.message}`);

      // Database-authoritative consequences.
      const meta: Record<string, unknown> = { reason: d.reason, urgent: d.urgent };
      if (['work', 'explore', 'eat', 'help'].includes(d.type)) {
        const w = await db.rpc('apply_world_action', { p_character: c.id, p_action: d.type, p_target: d.type === 'help' ? d.target?.id ?? null : null, p_amount: d.type === 'help' ? 5 : 2 });
        if (w.error) throw new Error(`apply_world_action: ${w.error.message}`);
        if (w.data?.ok === false) meta.world_action_rejected = w.data.reason;
        else if (w.data?.resources) ctx.resources = w.data.resources;
      }
      if (d.type === 'work' && c.role === 'healer' && num(ctx.resources.medicine, 0) < 80 && rnd() < 0.6) {
        try { await adjustResources({ medicine: 2 }); } catch (e: any) { warnings.push(`healer_work: ${String(e?.message ?? e)}`); }
      }
      if (d.type === 'help' && d.target) meta.target = d.target.name;
      if (d.type === 'explore') explorers.push(c);
      if (soc && d.target) {
        const s2 = await db.rpc('apply_social_event', { p_actor: c.id, p_target: d.target.id, p_affinity_delta: soc.affinity, p_trust_delta: soc.trust, p_actor_social_delta: soc.actorSocial, p_target_social_delta: soc.targetSocial });
        if (s2.error) throw new Error(`apply_social_event: ${s2.error.message}`);
        if (s2.data?.ok === false) meta.social_event_rejected = s2.data.reason;
        meta.partner = d.target.name; meta.outcome = soc.outcome;
      }

      const ev = await db.from('world_events').insert({ tick: next, actor_id: c.id, actor_name: c.name, action: d.type, narrative, metadata: meta });
      if (ev.error) throw new Error(`event_insert: ${ev.error.message}`);

      // Routine work is only occasionally memorable; everything else is remembered.
      const mems: any[] = [];
      if (d.type !== 'work' || rnd() < 0.3) {
        mems.push({ character_id: c.id, memory_type: 'recent_action', content: `${narrative} Reason: ${d.reason}`, importance: soc?.outcome === 'tense' ? 0.7 : d.type === 'talk' || d.type === 'help' ? 0.65 : 0.45 });
      }
      if (d.target && (d.type === 'talk' || d.type === 'help')) {
        mems.push({ character_id: d.target.id, memory_type: 'interaction', content: narrative, importance: soc?.outcome === 'tense' ? 0.7 : 0.6 });
      }
      if (mems.length) {
        const mem = await db.from('memories').insert(mems);
        if (mem.error) throw new Error(`memory_insert: ${mem.error.message}`);
      }
      processed++;
    }

    // ---- discoveries and scarcity alerts (never fatal) -----------------------
    try {
      const disc = rollDiscovery(explorers, known, rngFor(`disc:${next}`), traitsOf);
      if (disc && disc.event.discovery) {
        const ins = await db.from('world_discoveries').insert({ character_id: disc.finderId, name: disc.event.discovery.name, description: disc.event.discovery.description });
        if (ins.error) throw new Error(`discovery_insert: ${ins.error.message}`);
        known.add(disc.event.discovery.name);
        await applyWorldEvent({ ...disc.event, effects: disc.effects }, disc.finderId);
      }
    } catch (e: any) { warnings.push(`discovery: ${String(e?.message ?? e)}`); }
    try {
      for (const p of scarcityEvents(startResources, ctx.resources)) await applyWorldEvent(p);
    } catch (e: any) { warnings.push(`scarcity: ${String(e?.message ?? e)}`); }

    // ---- advance the clock ---------------------------------------------------
    const { data: tickRes, error: tickErr } = await db.rpc('advance_world_tick', { p_expected_tick: expected });
    if (!tickErr && tickRes?.ok === false) {
      if (runId != null) await db.from('simulation_runs').update({ status: 'failed', error_message: String(tickRes.reason), completed_at: new Date().toISOString() }).eq('id', runId);
      return json({ error: 'tick_conflict', reason: tickRes.reason }, 409);
    }
    if (tickErr) {
      if (runId != null) await db.from('simulation_runs').update({ status: 'failed', error_message: tickErr.message, completed_at: new Date().toISOString() }).eq('id', runId);
      return json({ error: 'tick_conflict', detail: tickErr.message }, 409);
    }

    // ---- day chronicle (never fatal) -------------------------------------------
    try {
      const day = Number(world.day);
      const dayFirstExpected = expected - (Number(world.hour) - (day === 1 ? 6 : 0));
      const { data: existing } = await db.from('day_chronicle').select('stats').eq('day', day).maybeSingle();
      const { data: evs, error: evErr } = await db.from('world_events').select('tick,actor_name,action,narrative,metadata')
        .gt('tick', dayFirstExpected).lte('tick', next).order('tick').order('created_at').limit(1000);
      if (evErr) throw new Error(evErr.message);
      const startRes = (existing?.stats?.resources_start as Record<string, number> | undefined) ?? startResources;
      const partial = existing ? !!existing.stats?.partial : expected > dayFirstExpected;
      const chron = buildChronicle(day, ctx.season, evs ?? [], startRes, ctx.resources, partial);
      const up = await db.from('day_chronicle').upsert({
        day, season: ctx.season, summary: chron.summary, highlights: chron.highlights, stats: chron.stats,
        first_tick: dayFirstExpected + 1, last_tick: next, updated_at: new Date().toISOString(),
      }, { onConflict: 'day' });
      if (up.error) throw new Error(up.error.message);
    } catch (e: any) { warnings.push(`chronicle: ${String(e?.message ?? e)}`); }

    if (runId != null) await db.from('simulation_runs').update({ status: 'completed', end_tick: next, actions_processed: processed, completed_at: new Date().toISOString() }).eq('id', runId);
    return json({ ok: true, tick: next, processed, startedAt, warnings });
  } catch (e: any) {
    if (runId != null) await db.from('simulation_runs').update({ status: 'failed', error_message: String(e?.message ?? e).slice(0, 500), completed_at: new Date().toISOString() }).eq('id', runId);
    return json({ error: 'simulation_failed', detail: String(e?.message ?? e) }, 500);
  } finally {
    await db.rpc('release_simulation_lease', { p_owner: owner });
  }
}

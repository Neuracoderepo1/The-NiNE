// Personality- and needs-driven decision engine for THE NINE.
// Pure functions only: everything here is deterministic given a seeded rng.

export const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
export const num = (v: unknown, d: number) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

export function rngFor(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Stable per-resident variation so the nine never move in lockstep.
export const hashId = (id: string) => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return h; };

export type ActionType = 'eat' | 'rest' | 'talk' | 'work' | 'explore' | 'help' | 'reflect';
export type Ctx = {
  tick: number; day: number; hour: number; season: string; weather: string;
  resources: Record<string, number>;
  chars: any[];
  rels: Map<string, any>;
};
export type Decision = { type: ActionType; target: any | null; reason: string; urgent: boolean; scores: Partial<Record<ActionType, number>> };
export type SocialOutcome = { outcome: 'warm' | 'tense'; affinity: number; trust: number; actorSocial: number; targetSocial: number };

// personality is stored as [{trait, weight}] (older rows may be plain strings).
export function traitsOf(c: { personality?: unknown }): Record<string, number> {
  const out: Record<string, number> = {};
  const p = Array.isArray(c.personality) ? c.personality : [];
  for (const x of p as any[]) {
    if (typeof x === 'string') out[x] = 0.7;
    else if (x && typeof x.trait === 'string') out[x.trait] = num(x.weight, 0.5);
  }
  return out;
}

export const isNight = (hour: number) => hour >= 22 || hour < 6;
export const relOf = (ctx: Ctx, a: string, b: string) => ctx.rels.get(`${a}|${b}`);

export function pickTalkTarget(c: any, others: any[], ctx: Ctx, rnd: () => number): any | null {
  if (!others.length) return null;
  const t = traitsOf(c);
  let best: any = null, bestScore = -Infinity;
  for (const o of others) {
    const rel = relOf(ctx, c.id, o.id);
    const aff = num(rel?.affinity, 0), trust = num(rel?.trust, 0.5);
    const lonely = (100 - num(o.needs?.social, 50)) / 100;
    let s = aff * 0.8 + trust * 0.4 + lonely * 0.5 + rnd() * 0.5 - (aff > 0.8 ? 0.4 : 0);
    if ((t['wary'] ?? 0) > 0.6) s += (trust - 0.5) * 1.2; // wary people seek those they trust
    if ((t['curious'] ?? 0) > 0.8) s += rnd() * 0.4;      // curious people sample widely
    if (s > bestScore) { bestScore = s; best = o; }
  }
  return best;
}

export function decide(c: any, ctx: Ctx, rnd: () => number): Decision {
  const t = traitsOf(c);
  const T = (k: string) => t[k] ?? 0;
  const needs = c.needs ?? {};
  const food = num(needs.food, 70), energy = num(needs.energy, 80), social = num(needs.social, 50);
  const night = isNight(ctx.hour);
  const R = (k: string) => num(ctx.resources[k], 0);
  const others = ctx.chars.filter((x) => x.id !== c.id && x.location === c.location);
  const sociable = Math.max(T('social'), T('community-minded'), T('empathetic'), T('persuasive'));
  const caring = Math.max(T('empathetic'), T('generous'), T('community-minded'), T('protective'));

  // Survival gates keep residents alive regardless of personality.
  const hungerGate = 24 + (hashId(c.id) % 10);
  if (food < hungerGate && R('food') > 0) return { type: 'eat', target: null, reason: 'Hunger could not wait any longer.', urgent: true, scores: {} };
  if (energy < 24) return { type: 'rest', target: null, reason: 'Exhaustion forced a stop.', urgent: true, scores: {} };

  const s: Record<ActionType, number> = { eat: 0, rest: 0, talk: 0, work: 0, explore: 0, help: 0, reflect: 0 };
  const why: Record<ActionType, string> = {
    eat: 'Hunger was setting in.', rest: 'Energy was running low.', talk: 'Wanted to catch up with someone.',
    work: 'Had work that needed doing.', explore: 'The unknown was pulling at them.', help: 'Someone nearby needed care.',
    reflect: 'Needed a quiet moment to think.',
  };

  // eat
  if (R('food') > 0) {
    s.eat = clamp((68 - food) / 68, 0, 1) * 3.2 - (R('food') < 30 ? T('generous') * 0.8 : 0);
    if (R('food') < 30 && T('generous') > 0.6) why.eat = 'Hungry, but mindful of how little food the settlement had left.';
  } else s.eat = -9;

  // rest
  s.rest = clamp((72 - energy) / 72, 0, 1) * 3.2 + (night ? 1.8 : 0) - (!night ? T('ambitious') * 0.4 : 0);
  if (night) why.rest = 'It was late and the settlement was winding down.';

  // talk
  if (others.length) {
    s.talk = clamp((70 - social) / 70, 0, 1) * 2.6 + sociable * 0.9 + (night ? 0.5 : 0) - T('wary') * 0.5 - T('independent') * 0.5 - T('suspicious') * 0.3;
    why.talk = social < 45 ? 'Felt the need for company.' : sociable > 0.8 ? 'Naturally drawn to other people.' : why.talk;
  } else s.talk = -9;

  // work: role-aware and responsive to what the settlement is short of
  let w = 1.1 + (night ? -1.2 : 0.5) + T('ambitious') * 0.6 + Math.max(T('practical'), T('organized'), T('obsessive')) * 0.4 - (energy < 40 ? 0.9 : 0);
  if (c.role === 'farmer' || c.role === 'hunter') { w += clamp((70 - R('food')) / 70, 0, 1) * 2; if (R('food') < 70) why.work = 'Food was scarce, so the work mattered.'; }
  let exploreBoost = 0;
  if (c.role === 'builder') {
    if (R('wood') < 20) { w -= 2.5; exploreBoost = 1.4; } else w += 0.3;
    if (R('stone') > 120) w -= 2;
  }
  if (c.role === 'inventor') {
    if (R('tools') > 60) w -= 1.6;
    else { w += clamp((25 - R('tools')) / 25, 0, 1) * 1.2; if (R('tools') < 25) why.work = 'The settlement was running short of tools.'; }
  }
  if (c.role === 'healer') w += R('medicine') < 15 ? 0.8 : 0;
  s.work = w;

  // explore
  s.explore = 0.1 + T('curious') * 1.1 + T('restless') + T('independent') * 0.3 + T('experimental') * 0.4 + (c.role === 'explorer' ? 1.3 : 0)
    + (Math.min(R('wood'), R('stone')) < 30 ? 0.5 : 0) - (night ? 2 : 0) - (energy < 40 ? 1.1 : 0)
    - (['storm', 'snow'].includes(ctx.weather) ? 2.5 : 0) - (ctx.weather === 'rain' ? 0.6 : 0) + exploreBoost;
  if (T('curious') > 0.8) why.explore = 'Curiosity got the better of them.';
  if (exploreBoost) why.explore = 'Timber was running out, so they went to gather more.';
  if (c.role === 'explorer') why.explore = 'Exploring is what they do best.';

  // help: only when somebody actually needs it
  const needy = others.filter((o) => num(o.needs?.health, 90) < 85).sort((a, b) => num(a.needs?.health, 90) - num(b.needs?.health, 90))[0] ?? null;
  if (needy) {
    s.help = ((100 - num(needy.needs?.health, 90)) / 100) * 5 + caring * 1.2 + (c.role === 'healer' ? 1.4 : 0) - (R('medicine') <= 0 ? 1 : 0);
    why.help = c.role === 'healer' ? `${needy.name} was unwell, and tending to the sick is their calling.` : `${needy.name} looked unwell.`;
  } else s.help = -9;

  // reflect
  s.reflect = 0.2 + Math.max(T('reflective'), T('analytical')) * 0.9 + T('patient') * 0.4 + (night ? 0.7 : 0) + (['tense', 'exhausted', 'hungry'].includes(c.mood) ? 0.5 : 0);

  let best: ActionType = 'work', bestScore = -Infinity;
  for (const k of Object.keys(s) as ActionType[]) {
    if (s[k] <= -9) continue;
    const v = s[k] + rnd() * 0.5;
    if (v > bestScore) { bestScore = v; best = k; }
  }
  const target = best === 'help' ? needy : best === 'talk' ? pickTalkTarget(c, others, ctx, rnd) : null;
  return { type: best, target, reason: why[best], urgent: false, scores: s };
}

export function socialOutcome(a: any, b: any, ctx: Ctx, rnd: () => number): SocialOutcome {
  const ta = traitsOf(a), tb = traitsOf(b);
  const rel = relOf(ctx, a.id, b.id);
  const aff = num(rel?.affinity, 0);
  const conflictChance = clamp(0.04 + (ta['wary'] ?? 0) * 0.1 + (ta['suspicious'] ?? 0) * 0.08 + (tb['suspicious'] ?? 0) * 0.04
    - (ta['generous'] ?? 0) * 0.05 - Math.max(0, aff) * 0.1, 0, 0.3);
  if (aff < 0.5 && rnd() < conflictChance) return { outcome: 'tense', affinity: -0.04, trust: -0.02, actorSocial: 8, targetSocial: 0 };
  const compat = clamp(((ta['generous'] ?? 0) + (tb['generous'] ?? 0)) / 2 * 0.6
    + ((ta['curious'] ?? 0) > 0.6 && (tb['curious'] ?? 0) > 0.6 ? 0.25 : 0)
    + (Math.max(ta['empathetic'] ?? 0, tb['empathetic'] ?? 0) > 0.8 ? 0.15 : 0), 0, 1);
  return {
    outcome: 'warm',
    affinity: Math.round((0.012 + 0.025 * compat) * (1 - Math.max(0, aff) * 0.8) * 1000) / 1000,
    trust: Math.round((0.012 - 0.01 * (tb['wary'] ?? 0) + 0.008 * (ta['empathetic'] ?? 0)) * 1000) / 1000,
    actorSocial: 22, targetSocial: 5,
  };
}

const ROLE_WORK: Record<string, string> = {
  farmer: 'tending the fields', hunter: 'tracking game', builder: 'repairing shelters', inventor: 'tinkering on a new tool',
  healer: 'preparing remedies', teacher: 'preparing lessons', trader: 'checking the stalls', organizer: 'planning the day', explorer: 'mapping the edges',
};
const DIRECTIONS = ['north', 'east', 'south', 'west', 'the ridge', 'the river bend', 'the old trail'];

export function applyNeeds(c: any, d: Decision, ctx: Ctx, rnd: () => number, social?: SocialOutcome | null) {
  const t = traitsOf(c);
  const T = (k: string) => t[k] ?? 0;
  const n = c.needs ?? {};
  let food = num(n.food, 70), energy = num(n.energy, 80), socialNeed = num(n.social, 50), health = num(n.health, 90);
  const night = isNight(ctx.hour);
  const sociable = Math.max(T('social'), T('community-minded'), T('empathetic'), T('persuasive'));

  food -= 3 + (hashId(c.id) % 3) + (d.type === 'explore' ? 1 : 0);
  energy -= 6 + (d.type === 'explore' ? 5 : 0) + (d.type === 'work' ? 2 + (T('ambitious') > 0.7 ? 1 : 0) : 0);
  socialNeed -= 2 + Math.round(sociable * 2);

  let activity = '';
  switch (d.type) {
    case 'eat': food += 35; energy += 4; activity = 'eating'; break;
    case 'rest': energy += night ? 40 : 30; activity = night ? 'sleeping' : 'resting'; break;
    case 'talk': activity = `talking with ${d.target?.name ?? 'someone'}`; break;
    case 'help': socialNeed += 8; activity = `helping ${d.target?.name ?? 'someone'}`; break;
    case 'explore': activity = `exploring ${DIRECTIONS[Math.floor(rnd() * DIRECTIONS.length)]}`; break;
    case 'reflect': energy += 3; activity = 'reflecting quietly'; break;
    default: activity = ROLE_WORK[c.role] ?? `working on ${c.role}`;
  }

  // Health pressure and recovery give carers something real to respond to.
  if (food < 20) health -= 2;
  if (energy < 15) health -= 1;
  if (['storm', 'snow', 'cold'].includes(ctx.weather) && !['rest', 'reflect', 'eat'].includes(d.type) && rnd() < 0.35) health -= 1;
  const hurt = (d.type === 'work' || d.type === 'explore') && rnd() < 0.03;
  if (hurt) health -= 12;
  if (food > 50 && energy > 50 && rnd() < 0.5) health += 1;

  food = clamp(food); energy = clamp(energy); socialNeed = clamp(socialNeed); health = clamp(health);

  let mood: string;
  if (hurt) mood = 'hurt';
  else if (food < 25) mood = 'hungry';
  else if (energy < 20) mood = 'exhausted';
  else switch (d.type) {
    case 'eat': mood = 'satisfied'; break;
    case 'rest': mood = energy > 70 ? 'rested' : 'calm'; break;
    case 'talk': mood = social?.outcome === 'tense' ? 'tense' : T('generous') > 0.7 ? 'warm' : 'engaged'; break;
    case 'help': mood = 'fulfilled'; break;
    case 'explore': mood = T('curious') > 0.7 ? 'excited' : 'alert'; break;
    case 'reflect': mood = 'thoughtful'; break;
    default: mood = T('ambitious') > 0.8 ? 'driven' : T('practical') > 0.8 ? 'focused' : 'steady';
  }
  return { needs: { ...n, food, energy, social: socialNeed, health }, mood, activity, hurt };
}

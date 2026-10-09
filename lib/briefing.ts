// Rule-based "state of the world" briefing, built from live data. Pure functions.
export type BEvent = { id: string; tick: number; actor_name: string; action: string; narrative: string; metadata?: any };
export type BChar = { id: string; name: string; role: string; mood: string; current_activity: string; needs: any; last_action?: any; last_reason?: string | null };
export type BRel = { character_a: string; character_b: string; affinity: number; relationship_label: string };
export type BChron = { day: number; first_tick: number; last_tick: number; stats?: any; summary: string };
export type BWorld = { tick: number; day: number; hour: number; season: string; weather: string; resources: Record<string, number> };
export type WindowKey = 'recent' | 'hour' | 'day';

export type Moment = { tick: number; kind: string; text: string };
export type Alert = { level: 'crit' | 'warn' | 'info' | 'ok'; text: string };
export type Briefing = {
  meta: { day: number; hour: number; season: string; weather: string };
  stores: { name: string; value: number; deltaToday: number | null }[];
  asOf: number; from: number; ticks: number; windowLabel: string;
  lede: string[];
  mix: { action: string; count: number; pct: number }[];
  moments: Moment[];
  alerts: Alert[];
  social: { talks: number; helps: number; tense: number; topPair: string | null; helper: { name: string; count: number } | null; pairs: { pair: string; n: number }[] };
  now: { id: string; name: string; role: string; mood: string; activity: string; reason: string | null; health: number; food: number; energy: number; social: number }[];
};

export const WINDOWS: { key: WindowKey; label: string; ticks: number }[] = [
  { key: 'recent', label: 'LAST 30 MIN', ticks: 6 },
  { key: 'hour', label: 'LAST HOUR', ticks: 12 },
  { key: 'day', label: 'TODAY', ticks: 24 },
];

const SEVERE = new Set(['storm', 'hot', 'snow', 'cold']);
const NOUN: Record<string, string> = { work: 'work', rest: 'rest', eat: 'eating', talk: 'conversation', explore: 'exploration', help: 'caring for one another', reflect: 'quiet reflection' };
const WEATHER: Record<string, string> = {
  storm: 'a storm is battering the settlement', rain: 'rain is falling over the fields', clear: 'the sky is clear', cloudy: 'clouds hang low over the settlement',
  fog: 'fog has settled over the paths', windy: 'a hard wind is blowing through', hot: 'a heatwave presses down on the settlement', snow: 'snow is falling', cold: 'a bitter cold has set in',
};
const WARN_AT: Record<string, number> = { food: 40, wood: 20, stone: 15, tools: 12, medicine: 12 };

const n = (v: unknown, d = 0) => { const x = Number(v); return Number.isFinite(x) ? x : d; };
const plural = (c: number, one: string, many = one + 's') => `${c} ${c === 1 ? one : many}`;
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const timeOfDay = (h: number) => (h >= 5 && h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night');

export function buildBriefing(
  input: { world: BWorld; chars: BChar[]; events: BEvent[]; rels: BRel[]; chron: BChron[] },
  key: WindowKey,
): Briefing {
  const { world, chars, events, rels, chron } = input;
  const asOf = n(world.tick);
  const spec = WINDOWS.find((w) => w.key === key) ?? WINDOWS[1];
  const today = chron.find((c) => c.day === world.day);
  const from = key === 'day' ? Math.max(0, n(today?.first_tick, asOf - 23) - 1) : asOf - spec.ticks;
  const ticks = Math.max(1, asOf - from);
  const windowLabel = key === 'recent' ? 'In the last half hour' : key === 'hour' ? 'Over the last hour' : 'So far today';

  const win = events.filter((e) => e.tick > from && e.tick <= asOf).sort((a, b) => a.tick - b.tick);
  const acts = win.filter((e) => e.action !== 'world_event');
  const byName = new Map(chars.map((c) => [c.name, c]));

  // --- what the nine did ----------------------------------------------------
  const counts: Record<string, number> = {};
  for (const e of acts) counts[e.action] = (counts[e.action] ?? 0) + 1;
  const total = acts.length;
  const mix = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([action, count]) => ({ action, count, pct: total ? Math.round((count / total) * 100) : 0 }));

  // --- social ----------------------------------------------------------------
  const talks = acts.filter((e) => e.action === 'talk');
  const helps = acts.filter((e) => e.action === 'help');
  const tenseTalks = talks.filter((e) => e.metadata?.outcome === 'tense');
  const pairCount: Record<string, number> = {};
  for (const e of talks) if (e.metadata?.partner) { const k = [e.actor_name, e.metadata.partner].sort().join(' & '); pairCount[k] = (pairCount[k] ?? 0) + 1; }
  const pairs = Object.entries(pairCount).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([pair, c]) => ({ pair, n: c }));
  const helperCount: Record<string, number> = {};
  for (const e of helps) helperCount[e.actor_name] = (helperCount[e.actor_name] ?? 0) + 1;
  const helperTop = Object.entries(helperCount).sort((a, b) => b[1] - a[1])[0];
  const social = {
    talks: talks.length, helps: helps.length, tense: tenseTalks.length,
    topPair: pairs[0] && pairs[0].n >= 2 ? pairs[0].pair : null,
    helper: helperTop ? { name: helperTop[0], count: helperTop[1] } : null,
    pairs,
  };

  // --- key moments -------------------------------------------------------------
  const moments: Moment[] = [];
  const minor: { tick: number; weather: string }[] = [];
  for (const e of win) {
    if (e.action === 'world_event') {
      const kind = e.metadata?.kind as string | undefined;
      if (kind === 'weather' && !SEVERE.has(String(e.metadata?.weather))) { minor.push({ tick: e.tick, weather: String(e.metadata?.weather) }); continue; }
      moments.push({ tick: e.tick, kind: kind === 'weather' ? 'storm' : kind ?? 'world', text: e.narrative });
      continue;
    }
    if (e.action === 'talk' && e.metadata?.outcome === 'tense') moments.push({ tick: e.tick, kind: 'conflict', text: e.narrative });
    if (/was hurt in the process/.test(e.narrative)) moments.push({ tick: e.tick, kind: 'hurt', text: e.narrative });
  }
  if (minor.length) {
    const seq = minor.map((m) => m.weather).filter((w, i, a) => i === 0 || a[i - 1] !== w);
    moments.push({ tick: minor[minor.length - 1].tick, kind: 'weather', text: seq.length === 1 ? `The weather turned ${seq[0]}.` : `The weather drifted: ${seq.join(' → ')}.` });
  }
  const careNewest = [...helps].reverse();
  for (const e of careNewest.slice(0, 3)) moments.push({ tick: e.tick, kind: 'care', text: e.narrative });
  if (careNewest.length > 3) moments.push({ tick: careNewest[careNewest.length - 1].tick, kind: 'care', text: `${plural(careNewest.length - 3, 'more act')} of care in this window.` });
  moments.sort((a, b) => b.tick - a.tick);
  const trimmed = moments.slice(0, 12);

  // --- watchlist ----------------------------------------------------------------
  const alerts: Alert[] = [];
  for (const c of chars) {
    const h = n(c.needs?.health, 90), f = n(c.needs?.food, 70), en = n(c.needs?.energy, 80);
    if (h < 15) alerts.push({ level: 'crit', text: `${c.name}'s health is critically low (${Math.round(h)}).` });
    else if (h < 40) alerts.push({ level: 'warn', text: `${c.name} is unwell (health ${Math.round(h)}).` });
    if (f < 25) alerts.push({ level: 'warn', text: `${c.name} is going hungry (food ${Math.round(f)}).` });
    if (en < 18) alerts.push({ level: 'warn', text: `${c.name} is close to exhaustion (energy ${Math.round(en)}).` });
  }
  for (const [k, lim] of Object.entries(WARN_AT)) {
    const v = n(world.resources?.[k], 999);
    if (v < lim) alerts.push({ level: v < lim / 2 ? 'crit' : 'warn', text: `Shared ${k} is low (${Math.round(v)}).` });
  }
  const idName = new Map(chars.map((c) => [c.id, c.name]));
  for (const r of rels) if (n(r.affinity) <= -0.15) alerts.push({ level: 'warn', text: `${idName.get(r.character_a) ?? '?'} and ${idName.get(r.character_b) ?? '?'} are at odds (${r.relationship_label}, ${n(r.affinity).toFixed(2)}).` });
  const avgSocial = chars.length ? chars.reduce((s, c) => s + n(c.needs?.social, 50), 0) / chars.length : 50;
  if (avgSocial < 15) alerts.push({ level: 'info', text: `The settlement is starved of company (average social need ${Math.round(avgSocial)}/100).` });
  const rank = { crit: 0, warn: 1, info: 2, ok: 3 } as const;
  alerts.sort((a, b) => rank[a.level] - rank[b.level]);
  const watch: Alert[] = alerts.length ? alerts.slice(0, 8) : [{ level: 'ok', text: 'Nothing needs urgent attention.' }];

  // --- the lede --------------------------------------------------------------------
  const lede: string[] = [];
  lede.push(`It is ${timeOfDay(n(world.hour))} on Day ${world.day} of ${world.season}, and ${WEATHER[world.weather] ?? `the weather is ${world.weather}`}.`);

  if (total) {
    const [a, b] = mix;
    lede.push(`${windowLabel} (${plural(ticks, 'tick')}), ${a.pct}% of the settlement's activity was ${NOUN[a.action] ?? a.action}${b ? `, followed by ${NOUN[b.action] ?? b.action} (${b.pct}%)` : ''}.`);
  }

  const socialBits: string[] = [];
  if (social.helper) socialBits.push(`${social.helper.name} led the caring, with ${plural(social.helper.count, 'act')} of care out of ${social.helps} in total`);
  else if (social.helps) socialBits.push(`${plural(social.helps, 'act')} of care were recorded`);
  if (social.talks) socialBits.push(`${plural(social.talks, 'conversation')} took place${social.topPair ? `, most often between ${social.topPair}` : ''}`);
  if (social.tense) socialBits.push(`${plural(social.tense, 'exchange')} turned tense`);
  if (socialBits.length) lede.push(`${socialBits[0].charAt(0).toUpperCase()}${socialBits[0].slice(1)}${socialBits.length > 1 ? `; ${list(socialBits.slice(1))}` : ''}.`);
  else if (total) lede.push('The nine kept mostly to their own work, with little contact between them.');

  const delta = (today?.stats?.resources_delta ?? {}) as Record<string, number>;
  const moves = Object.entries(delta).filter(([, v]) => Math.abs(n(v)) >= 3).sort((a, b) => Math.abs(n(b[1])) - Math.abs(n(a[1]))).slice(0, 3)
    .map(([k, v]) => `${k} ${n(v) > 0 ? 'rose by' : 'fell by'} ${Math.abs(Math.round(n(v)))}`);
  if (moves.length) lede.push(`In the stores today, ${list(moves)}.`);

  const found = trimmed.filter((m) => m.kind === 'discovery');
  const hurt = trimmed.filter((m) => m.kind === 'hurt').length;
  const extras: string[] = [];
  if (found.length) {
    const m = found[0].text.match(/^(\w+) discovered something: ([^.]+)\./);
    if (m) {
      const what = m[2].toLowerCase(), mass = /(herbs|timber)$/.test(what);
      extras.push(`${m[1]} found ${mass ? '' : /^[aeiou]/.test(what) ? 'an ' : 'a '}${what}`);
    }
  }
  if (hurt) extras.push(`${plural(hurt, 'resident')} got hurt on the job`);
  if (extras.length) lede.push(`${extras[0].charAt(0).toUpperCase()}${extras[0].slice(1)}${extras.length > 1 ? `, and ${extras[1]}` : ''}.`);

  const top = watch[0];
  if (top && (top.level === 'crit' || top.level === 'warn')) lede.push(`Most pressing: ${top.text}`);

  // --- where everyone is now ---------------------------------------------------------
  const now = chars.map((c) => ({
    id: c.id, name: c.name, role: c.role, mood: c.mood, activity: c.current_activity, reason: c.last_reason ?? null,
    health: Math.round(n(c.needs?.health, 0)), food: Math.round(n(c.needs?.food, 0)), energy: Math.round(n(c.needs?.energy, 0)), social: Math.round(n(c.needs?.social, 0)),
  }));
  void byName;

  const stores = Object.entries(world.resources ?? {}).map(([name, value]) => ({
    name, value: Math.round(n(value)), deltaToday: today?.stats?.resources_delta ? Math.round(n(today.stats.resources_delta[name])) : null,
  }));
  const meta = { day: world.day, hour: n(world.hour), season: world.season, weather: world.weather };

  return { meta, stores, asOf, from: from + 1, ticks, windowLabel, lede, mix, moments: trimmed, alerts: watch, social, now };
}

/** Structured facts + instructions, ready to paste into any language model for narration. */
export function narrationPrompt(b: Briefing): string {
  const { meta } = b;
  const sign = (v: number | null) => (v === null ? '' : ` (${v > 0 ? '+' : ''}${v} today)`);
  const L: string[] = [];
  L.push('You are the narrator of THE NINE, a simulated settlement of nine artificial residents (AI behaviour is simulated; do not claim they are conscious).');
  L.push(`Write a vivid but grounded news-style briefing, 3 to 5 short paragraphs and about 200 words, covering ${b.windowLabel.startsWith('So far') ? 'the current day so far' : b.windowLabel.includes('half hour') ? 'the last half hour' : 'the last hour'}. Use ONLY the facts below: do not invent events, people, numbers or causes. Name specific residents. End with one sentence on what to watch next. Plain prose, no bullet points or headings.`);
  L.push('');
  L.push('FACTS');
  L.push(`Time: Day ${meta.day}, ${String(meta.hour).padStart(2, '0')}:00 (${timeOfDay(meta.hour)}), ${meta.season}, weather: ${meta.weather}`);
  L.push(`Window: ticks ${b.from}-${b.asOf} (${b.ticks} ticks, about ${b.ticks * 5} minutes)`);
  L.push(`Shared stores: ${b.stores.map((x) => `${x.name} ${x.value}${sign(x.deltaToday)}`).join(', ')}`);
  L.push(`What the nine did: ${b.mix.length ? b.mix.map((m) => `${m.action} ${m.pct}%`).join(', ') : 'no actions recorded'}`);
  L.push(`Social: ${b.social.talks} conversations, ${b.social.helps} acts of care${b.social.helper ? ` (most by ${b.social.helper.name}: ${b.social.helper.count})` : ''}, ${b.social.tense} tense exchanges${b.social.pairs.length ? `; most frequent pairs: ${b.social.pairs.map((p) => `${p.pair} x${p.n}`).join(', ')}` : ''}`);
  L.push('');
  L.push('KEY MOMENTS (oldest first)');
  if (b.moments.length) for (const m of [...b.moments].reverse()) L.push(`- T${m.tick} [${m.kind}] ${m.text}`);
  else L.push('- none');
  L.push('');
  L.push('WATCHLIST');
  for (const a of b.alerts) L.push(`- [${a.level}] ${a.text}`);
  L.push('');
  L.push('RESIDENTS RIGHT NOW (needs are 0-100; low is bad)');
  for (const r of b.now) L.push(`- ${r.name} (${r.role}): ${r.activity}, mood ${r.mood}${r.reason ? `, why: "${r.reason.replace(/\.$/, '')}"` : ''}. health ${r.health}, food ${r.food}, energy ${r.energy}, social ${r.social}`);
  L.push('');
  L.push('BASELINE SUMMARY (formulaic, for reference only; rewrite it, do not copy it)');
  L.push(b.lede.join(' '));
  return L.join('\n');
}

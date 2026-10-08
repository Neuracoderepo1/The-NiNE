// Day chronicle: rule-based daily summary built from the day's recorded events.
type Ev = { tick: number; actor_name: string; action: string; narrative: string; metadata?: any };
export type Chronicle = { summary: string; highlights: { tick: number; kind: string; text: string }[]; stats: Record<string, any> };

const list = (xs: string[]) => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

export function buildChronicle(day: number, season: string, events: Ev[], start: Record<string, number>, end: Record<string, number>, partial: boolean): Chronicle {
  const actions: Record<string, number> = {};
  const weather: string[] = [];
  const highlights: Chronicle['highlights'] = [];
  const pairs: Record<string, number> = {};
  const discoveries: string[] = [];
  let tense = 0; const tensePairs: string[] = [];

  for (const e of events) {
    const kind = e.metadata?.kind as string | undefined;
    if (e.action === 'world_event') {
      if (kind === 'weather') weather.push(e.metadata?.weather);
      if (kind === 'discovery') discoveries.push(String(e.metadata?.name ?? 'something'));
      if (kind === 'weather' && !['storm', 'snow', 'hot'].includes(String(e.metadata?.weather))) continue;
      highlights.push({ tick: e.tick, kind: kind ?? 'world', text: e.narrative });
      continue;
    }
    actions[e.action] = (actions[e.action] ?? 0) + 1;
    if (e.action === 'talk' && e.metadata?.partner) {
      const key = [e.actor_name, e.metadata.partner].sort().join(' & ');
      pairs[key] = (pairs[key] ?? 0) + 1;
      if (e.metadata.outcome === 'tense') { tense++; tensePairs.push(key); highlights.push({ tick: e.tick, kind: 'conflict', text: e.narrative }); }
    }
  }

  const keys = Array.from(new Set([...Object.keys(start), ...Object.keys(end)]));
  const delta: Record<string, number> = {};
  for (const k of keys) delta[k] = Math.round(Number(end[k] ?? 0) - Number(start[k] ?? 0));

  const parts: string[] = [`Day ${day} of ${season}.`];
  const wlog = [weather.length ? weather[0] : null, weather.length > 1 ? weather[weather.length - 1] : null].filter(Boolean);
  if (weather.length === 1) parts.push(`The weather turned ${weather[0]}.`);
  else if (weather.length > 1) parts.push(`The weather shifted ${weather.length} times, ending ${wlog[wlog.length - 1]}.`);

  const moves = Object.entries(delta).filter(([, v]) => Math.abs(v) >= 4).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3)
    .map(([k, v]) => `${v > 0 ? 'gained' : 'lost'} ${Math.abs(v)} ${k}`);
  if (moves.length) parts.push(`The stores ${list(moves)}${partial ? ' since this record began' : ''}.`);

  const top = Object.entries(pairs).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 2) parts.push(`${top[0]} spoke most, ${top[1]} times.`);
  if (tense) parts.push(`Tempers flared ${tense} time${tense > 1 ? 's' : ''}${tensePairs.length ? ` (${list(Array.from(new Set(tensePairs)))})` : ''}.`);
  if (discoveries.length) parts.push(`Explorers found ${list(discoveries.map((d) => d.toLowerCase()))}.`);
  if (actions.help) parts.push(`${actions.help} act${actions.help > 1 ? 's' : ''} of care were recorded.`);
  if (parts.length === 1) parts.push('A quiet day in the settlement.');

  return {
    summary: parts.join(' '),
    highlights: highlights.sort((a, b) => a.tick - b.tick).slice(-12),
    stats: { actions, weather, discoveries, tense_exchanges: tense, resources_start: start, resources_end: end, resources_delta: delta, partial },
  };
}

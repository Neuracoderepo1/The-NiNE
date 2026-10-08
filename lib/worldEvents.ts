// Random world events: weather, seasons, discoveries. Pure planning; the runner applies effects.
import { Ctx, num } from './engine';

export type PlannedEvent = {
  kind: 'weather' | 'season' | 'discovery' | 'scarcity';
  text: string;
  effects?: Record<string, number>;
  weather?: string;
  season?: string;
  discovery?: { name: string; description: string };
  memory?: { importance: number; finderOnly?: boolean };
};

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const DAYS_PER_SEASON = 7;
export const seasonForDay = (day: number) => SEASONS[Math.floor((Math.max(1, day) - 1) / DAYS_PER_SEASON) % 4];

const NEXT: Record<string, Record<string, string[]>> = {
  spring: { clear: ['clear', 'cloudy', 'cloudy', 'windy'], cloudy: ['clear', 'rain', 'rain', 'fog'], rain: ['cloudy', 'rain', 'clear'], fog: ['clear', 'cloudy'], windy: ['clear', 'cloudy', 'rain'], storm: ['rain', 'cloudy'] },
  summer: { clear: ['clear', 'clear', 'hot', 'cloudy'], hot: ['hot', 'clear', 'storm'], cloudy: ['clear', 'rain', 'storm'], rain: ['cloudy', 'clear'], storm: ['rain', 'cloudy'], windy: ['clear', 'hot'], fog: ['clear'] },
  autumn: { clear: ['clear', 'cloudy', 'windy', 'fog'], cloudy: ['rain', 'fog', 'windy', 'clear'], rain: ['rain', 'storm', 'cloudy'], fog: ['fog', 'cloudy', 'clear'], windy: ['cloudy', 'rain', 'storm'], storm: ['rain', 'cloudy'] },
  winter: { clear: ['clear', 'cold', 'cloudy'], cold: ['cold', 'snow', 'clear'], cloudy: ['snow', 'cold', 'fog'], snow: ['snow', 'cold', 'cloudy'], fog: ['cold', 'cloudy'], windy: ['cold', 'snow'], rain: ['snow', 'cloudy'], storm: ['snow', 'cold'] },
};
const WEATHER_TEXT: Record<string, [string, Record<string, number>]> = {
  clear: ['The sky cleared over the settlement.', {}],
  cloudy: ['Clouds rolled in and the light grew flat.', {}],
  rain: ['Rain began to fall, soaking the fields.', { food: 4 }],
  storm: ['A storm broke over the settlement. Stores and timber took a beating.', { wood: -3, food: -2 }],
  fog: ['A thick fog settled over the paths.', {}],
  windy: ['A hard wind swept through the settlement.', {}],
  hot: ['A heatwave settled in and food began to spoil.', { food: -3 }],
  snow: ['Snow began to fall, and the cold crept into the stores.', { food: -2 }],
  cold: ['A bitter cold set in. The fires burned through extra wood.', { wood: -2 }],
};

export const DISCOVERIES: { name: string; description: string; effects: Record<string, number> }[] = [
  { name: 'Wild orchard', description: 'A forgotten orchard of fruit trees, heavy with ripe fruit.', effects: { food: 12 } },
  { name: 'Clay deposit', description: 'A bank of fine clay by the river, good for building.', effects: { stone: 6 } },
  { name: 'Medicinal herbs', description: 'A hillside thick with healing herbs.', effects: { medicine: 6 } },
  { name: 'Abandoned tool cache', description: 'A buried cache of old but serviceable tools.', effects: { tools: 4 } },
  { name: 'Hidden spring', description: 'A clean spring tucked behind the ridge.', effects: { food: 4 } },
  { name: 'Fallen timber', description: 'A stand of storm-felled trees, already seasoned.', effects: { wood: 10 } },
  { name: 'Stone outcrop', description: 'An exposed seam of good building stone.', effects: { stone: 9 } },
];

export function rollEnvironment(ctx: Ctx, rnd: () => number): PlannedEvent[] {
  const out: PlannedEvent[] = [];
  const season = seasonForDay(ctx.day);
  if (season !== ctx.season) out.push({ kind: 'season', season, text: `The season turned to ${season}.`, memory: { importance: 0.5 } });

  const table = NEXT[season] ?? NEXT.spring;
  if (rnd() < 0.18) {
    const opts = table[ctx.weather] ?? table.clear ?? ['clear'];
    const next = opts[Math.floor(rnd() * opts.length) % opts.length];
    if (next !== ctx.weather) {
      const [text, effects] = WEATHER_TEXT[next] ?? [`The weather turned ${next}.`, {}];
      out.push({ kind: 'weather', weather: next, text, effects, memory: next === 'storm' ? { importance: 0.5 } : undefined });
    }
  }
  return out;
}

export function rollDiscovery(explorers: any[], known: Set<string>, rnd: () => number, traits: (c: any) => Record<string, number>): { event: PlannedEvent; finderId: string; effects: Record<string, number> } | null {
  const pool = DISCOVERIES.filter((d) => !known.has(d.name));
  if (!pool.length) return null;
  for (const c of explorers) {
    const chance = 0.01 + 0.02 * num(traits(c)['curious'], 0);
    if (rnd() < chance) {
      const d = pool[Math.floor(rnd() * pool.length) % pool.length];
      return {
        finderId: c.id, effects: d.effects,
        event: { kind: 'discovery', text: `${c.name} discovered something: ${d.name.toLowerCase()}. ${d.description}`, discovery: { name: d.name, description: d.description }, memory: { importance: 0.75 } },
      };
    }
  }
  return null;
}

export const SCARCITY: [string, number, string][] = [
  ['food', 30, 'Food stores are running dangerously low.'],
  ['wood', 15, 'The wood pile is nearly empty.'],
  ['medicine', 10, 'Medicine is almost gone.'],
  ['tools', 8, 'The settlement is running out of usable tools.'],
];
export function scarcityEvents(before: Record<string, number>, after: Record<string, number>): PlannedEvent[] {
  return SCARCITY.filter(([k, lim]) => num(before[k], 999) >= lim && num(after[k], 999) < lim)
    .map(([, , text]) => ({ kind: 'scarcity' as const, text, memory: { importance: 0.6 } }));
}

// Rule-based narrator: turns a decision into a sentence, flavoured by personality,
// weather, time of day, and what the settlement is short of.
import { Ctx, Decision, SocialOutcome, isNight, traitsOf, num } from './engine';

const pick = <T,>(arr: T[], rnd: () => number): T => arr[Math.floor(rnd() * arr.length) % arr.length];

const FLAVOR: Record<string, string> = {
  strategic: "with a strategist's eye", wary: 'keeping a careful watch on the others', curious: 'driven by curiosity',
  'community-minded': 'thinking of the whole settlement', patient: 'unhurried as ever', creative: 'with a restless imagination',
  suspicious: 'trusting nothing at face value', empathetic: 'with quiet compassion', independent: 'on their own terms',
  social: 'with an easy warmth', practical: 'with practical care', protective: 'ever watchful over the others',
  resilient: 'steady through it all', analytical: 'weighing every detail', calm: 'with a calm hand', reflective: 'lost in thought',
  organized: 'with careful order', restless: 'unable to sit still', experimental: 'ready to try something new', persuasive: 'with a ready word',
};

function flavorOf(c: any, rnd: () => number): string {
  const t = traitsOf(c);
  const top = Object.entries(t).sort((a, b) => b[1] - a[1]).map(([k]) => k).filter((k) => FLAVOR[k]).slice(0, 2);
  return top.length && rnd() < 0.55 ? FLAVOR[pick(top, rnd)] : '';
}

function weatherClause(ctx: Ctx, rnd: () => number): string {
  if (rnd() > 0.35) return '';
  if (isNight(ctx.hour)) return pick(['under the stars', 'by lamplight', 'in the quiet of the night'], rnd);
  const m: Record<string, string> = { rain: 'in the rain', storm: 'despite the storm', fog: 'through the fog', hot: 'in the heat', windy: 'against the wind', snow: 'in the snow', cold: 'in the cold' };
  return m[ctx.weather] ?? '';
}

export function scarcityTopic(ctx: Ctx): string {
  const r = ctx.resources;
  const low: [string, number, string][] = [
    ['food', 40, 'dwindling food'], ['wood', 20, 'the shrinking wood pile'], ['medicine', 12, 'the low medicine stores'],
    ['tools', 12, 'the shortage of tools'], ['stone', 15, 'the lack of stone'],
  ];
  const hit = low.filter(([k, lim]) => num(r[k], 99) < lim).sort((a, b) => num(r[a[0]], 99) / a[1] - num(r[b[0]], 99) / b[1])[0];
  return hit ? hit[2] : `the coming ${ctx.season}`;
}

export function narrate(c: any, d: Decision, ctx: Ctx, rnd: () => number, social?: SocialOutcome | null): string {
  const n = c.name as string;
  const o = d.target?.name as string | undefined;
  const fl = flavorOf(c, rnd), wx = weatherClause(ctx, rnd);
  const tail = [fl, wx].filter(Boolean).join(', ');
  const t = tail ? `, ${tail}` : '';

  switch (d.type) {
    case 'eat': return pick([`${n} ate a meal${t}.`, `${n} stopped to eat${t}, restoring some strength.`], rnd);
    case 'rest': return isNight(ctx.hour)
      ? pick([`${n} turned in for the night${wx ? `, ${wx}` : ''}.`, `${n} slept${wx ? `, ${wx}` : ''}.`], rnd)
      : pick([`${n} sat down to rest${t}.`, `${n} took a break to recover${t}.`], rnd);
    case 'talk': {
      const topic = scarcityTopic(ctx);
      if (social?.outcome === 'tense') return pick([`${n} and ${o} argued over ${topic}${t}.`, `${n} snapped at ${o} while they discussed ${topic}.`], rnd);
      return pick([`${n} talked with ${o} about ${topic}${t}.`, `${n} and ${o} shared a long conversation about ${topic}.`, `${n} sat with ${o} and traded stories${t}.`], rnd);
    }
    case 'help': return pick([`${n} tended to ${o}'s health${t}.`, `${n} looked after ${o}${t}.`], rnd);
    case 'explore': return pick([`${n} ventured out to explore${t}.`, `${n} wandered beyond the settlement${t}.`], rnd);
    case 'reflect': return pick([`${n} sat quietly, thinking about ${scarcityTopic(ctx)}.`, `${n} spent a while lost in thought${wx ? `, ${wx}` : ''}.`], rnd);
    default: {
      const role = c.role as string;
      const verbs: Record<string, string> = {
        farmer: 'tended the fields', hunter: 'tracked game at the treeline', builder: 'worked on the shelters', inventor: 'tinkered with a new design',
        healer: 'prepared remedies', teacher: 'prepared lessons', trader: 'checked the stalls', organizer: 'planned the day ahead', explorer: 'charted the edges of the map',
      };
      return `${n} ${verbs[role] ?? `worked as ${role}`}${t}.`;
    }
  }
}

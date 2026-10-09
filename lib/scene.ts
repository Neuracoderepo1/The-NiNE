// Scene logic: where residents stand, and what the light looks like. Pure functions.
export type Pt = { x: number; y: number };
export type Placed = Pt & { zone: string };

// Percent coordinates (0-100) inside the settlement scene.
export const ZONES: Record<string, Pt & { label: string }> = {
  square: { x: 50, y: 50, label: 'THE SQUARE' },
  clinic: { x: 23, y: 35, label: 'CLINIC' },
  school: { x: 40, y: 25, label: 'SCHOOLHOUSE' },
  market: { x: 64, y: 28, label: 'MARKET' },
  workshop: { x: 83, y: 46, label: 'WORKSHOP' },
  yard: { x: 73, y: 65, label: 'BUILDERS’ YARD' },
  homes: { x: 50, y: 78, label: 'HOMES' },
  fields: { x: 24, y: 69, label: 'FIELDS' },
  treeline: { x: 22, y: 15, label: 'THE WOODS' },
  ridge: { x: 76, y: 10, label: 'THE RIDGE' },
  bank: { x: 14, y: 85, label: 'RIVERBANK' },
  e_north: { x: 50, y: 8, label: '' },
  e_east: { x: 93, y: 54, label: '' },
  e_south: { x: 90, y: 84, label: '' },
  e_west: { x: 5, y: 48, label: '' },
  bend: { x: 36, y: 86, label: '' },
  trail: { x: 7, y: 23, label: '' },
};

const ROLE_WORK: Record<string, string> = {
  farmer: 'fields', hunter: 'treeline', builder: 'yard', inventor: 'workshop', healer: 'clinic',
  teacher: 'school', trader: 'market', organizer: 'square', explorer: 'ridge',
};
const DIRECTION: Record<string, string> = {
  north: 'e_north', east: 'e_east', south: 'e_south', west: 'e_west',
  'the ridge': 'ridge', 'the river bend': 'bend', 'the old trail': 'trail',
};

export function zoneOf(c: any): string {
  const t = c?.last_action?.type;
  switch (t) {
    case 'eat': case 'talk': return 'square';
    case 'rest': return 'homes';
    case 'help': return 'clinic';
    case 'reflect': return 'bank';
    case 'explore': {
      const m = String(c.current_activity ?? '').match(/^exploring (.+)$/);
      return (m && DIRECTION[m[1]]) || 'ridge';
    }
    case 'work': return ROLE_WORK[c.role] ?? 'square';
    default: return 'square';
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function place(chars: any[]): Map<string, Placed> {
  const base = new Map<string, string>(chars.map((c) => [c.id, zoneOf(c)]));
  const byName = new Map<string, any>(chars.map((c) => [c.name, c]));
  const zone = new Map<string, string>();
  for (const c of chars) {
    let z = base.get(c.id)!;
    const type = c.last_action?.type, target = c.last_action?.target;
    if ((type === 'talk' || type === 'help') && target) {
      const o = byName.get(target);
      if (o) z = base.get(o.id)!; // conversations happen where the other person is
    }
    zone.set(c.id, z);
  }
  const groups = new Map<string, string[]>();
  for (const c of chars) { const z = zone.get(c.id)!; groups.set(z, [...(groups.get(z) ?? []), c.id]); }
  const out = new Map<string, Placed>();
  for (const [z, ids] of Array.from(groups.entries())) {
    const p = ZONES[z] ?? ZONES.square, n = ids.length;
    ids.forEach((id, i) => {
      if (n === 1) { out.set(id, { x: p.x, y: p.y, zone: z }); return; }
      // Pairs stand side by side; larger groups form a ring wide enough to keep labels apart.
      const a = (i / n) * Math.PI * 2 + (n === 2 ? 0 : -Math.PI / 2);
      const rx = Math.min(4 + 2.2 * n, 17), ry = n === 2 ? 0 : Math.min(2 + 2.4 * n, 18);
      out.set(id, { x: clamp(p.x + Math.cos(a) * rx, 6, 94), y: clamp(p.y + Math.sin(a) * ry, 8, 90), zone: z });
    });
  }
  return out;
}

export function lightOf(hour: number) {
  const h = ((hour % 24) + 24) % 24;
  let night = 0;
  if (h >= 21 || h < 4) night = 1;
  else if (h >= 19) night = (h - 19) / 2;
  else if (h < 6) night = 1 - (h - 4) / 2;
  const warm = Math.max(0, 1 - Math.abs(h - 6.5) / 1.8, 1 - Math.abs(h - 18) / 1.8);
  return { night, warm };
}

export function celestial(hour: number) {
  const h = ((hour % 24) + 24) % 24;
  const day = h >= 6 && h < 18;
  const t = day ? (h - 6) / 12 : ((h < 6 ? h + 24 : h) - 18) / 12;
  return { kind: day ? 'sun' : 'moon', x: 6 + 88 * t, y: 13 - 9 * Math.sin(Math.PI * t) };
}

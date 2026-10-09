import type { CSSProperties } from 'react';

const MOODS: Record<string, string> = {
  hungry: '#d49a6a', exhausted: '#8d8fa8', hurt: '#d16a6a', tense: '#d1736a',
  satisfied: '#8fb9a0', rested: '#8fb9a0', calm: '#8fb9a0',
  warm: '#d7b98e', engaged: '#d7b98e', fulfilled: '#e0b0b8',
  excited: '#e0c15a', driven: '#e0c15a', thoughtful: '#9db7c9', steady: '#9db7c9', focused: '#9db7c9', alert: '#c9c98f',
};
export const moodColor = (m?: string) => MOODS[String(m ?? '').toLowerCase()] ?? '#8e958d';

const WORK_BADGE: Record<string, string> = {
  farmer: '🌾', hunter: '🏹', builder: '🔨', inventor: '🔧', healer: '🌿', teacher: '📖', trader: '🪙', organizer: '📋', explorer: '🧭',
};
export function badgeOf(c: any): string {
  switch (c?.last_action?.type) {
    case 'eat': return '🍲';
    case 'rest': return '💤';
    case 'talk': return '💬';
    case 'help': return '🩺';
    case 'explore': return '🧭';
    case 'reflect': return '💭';
    case 'work': return WORK_BADGE[c.role] ?? '⚒';
    default: return '·';
  }
}

const initials = (n: string) => n.slice(0, 2).toUpperCase();
const level = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0; };
const needColor = (v: number) => (v < 25 ? '#d1736a' : v < 50 ? '#d7b98e' : '#a9d1a7');

export default function Avatar({ c, color, size = 38, needs = true }: { c: any; color: string; size?: number; needs?: boolean }) {
  const food = level(c.needs?.food), energy = level(c.needs?.energy);
  const style = { ['--s' as any]: `${size}px`, ['--ring' as any]: moodColor(c.mood) } as CSSProperties;
  return (
    <span className="av-wrap" style={style}>
      <span className="av">
        <span className="pulse" key={c.action_count} />
        <span className="av-core" style={{ background: color }}>{initials(c.name)}</span>
        <span className="av-badge" aria-hidden>{badgeOf(c)}</span>
      </span>
      {needs && (
        <span className="av-needs" title={`food ${food} · energy ${energy}`}>
          <i><u style={{ width: `${food}%`, background: needColor(food) }} /></i>
          <i><u style={{ width: `${energy}%`, background: needColor(energy) }} /></i>
        </span>
      )}
    </span>
  );
}

'use client';
import { memo, useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import Avatar from './Avatar';
import { ZONES, celestial, lightOf, place } from '../lib/scene';

const X = (p: number) => p * 10;
const Y = (p: number) => p * 6.8;
const Z = ZONES;

function curve(z: { x: number; y: number }) {
  const x1 = 500, y1 = 340, x2 = X(z.x), y2 = Y(z.y);
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  return `M${x1} ${y1} Q${mx - (dy / len) * 28} ${my + (dx / len) * 28} ${x2} ${y2}`;
}

const Tree = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <ellipse cx="0" cy="16" rx="13" ry="4" fill="#000" opacity=".22" />
    <rect x="-2.5" y="4" width="5" height="12" fill="var(--trunk)" />
    <circle cx="0" cy="-4" r="14" fill="var(--tree)" />
    <circle cx="-6" cy="2" r="10" fill="var(--tree2)" />
    <circle cx="7" cy="1" r="9" fill="var(--tree)" />
    <ellipse cx="0" cy="-12" rx="9" ry="4" fill="var(--snow)" style={{ opacity: 'var(--snowop)' as any }} />
  </g>
);

function House({ cx, cy, w = 64, h = 40, roof = 'var(--roof)', children }: { cx: number; cy: number; w?: number; h?: number; roof?: string; children?: ReactNode }) {
  return (
    <g transform={`translate(${cx - w / 2} ${cy - h / 2})`}>
      <ellipse cx={w / 2} cy={h + 3} rx={w * 0.62} ry={7} fill="#000" opacity=".25" />
      <rect width={w} height={h} rx="3" fill="var(--wall)" />
      <polygon points={`-6,2 ${w / 2},${-h * 0.62} ${w + 6},2`} fill={roof} />
      <polygon points={`-6,2 ${w / 2},${-h * 0.62} ${w + 6},2`} fill="var(--snow)" style={{ opacity: 'var(--snowop)' as any }} transform={`translate(0 -2) scale(1 .5) translate(0 ${-h * 0.2})`} />
      <rect className="win" x={w * 0.14} y={h * 0.3} width={w * 0.2} height={h * 0.28} rx="2" />
      <rect x={w * 0.6} y={h * 0.42} width={w * 0.2} height={h * 0.58} rx="2" fill="var(--door)" />
      {children}
    </g>
  );
}

const Label = ({ x, y, t }: { x: number; y: number; t: string }) => (t ? <text className="zl" x={x} y={y} textAnchor="middle">{t}</text> : null);

const Scenery = memo(function Scenery() {
  const woods = Array.from({ length: 24 }, (_, i) => ({ x: 24 + i * 24 + ((i * 37) % 19), y: 34 + ((i * 53) % 58), s: 0.8 + (i % 4) * 0.12 }));
  const west = [[24, 190], [40, 262], [18, 330], [44, 402], [22, 470], [36, 540]].map(([x, y], i) => ({ x, y, s: 0.9 + (i % 3) * 0.1 }));
  const east = [[968, 200], [950, 272], [975, 350], [948, 424], [972, 500], [950, 572]].map(([x, y], i) => ({ x, y, s: 0.9 + (i % 3) * 0.1 }));
  const sq = { x: X(Z.square.x), y: Y(Z.square.y) };
  const hm = { x: X(Z.homes.x), y: Y(Z.homes.y) - 34 };
  return (
    <svg className="scene-svg" viewBox="0 0 1000 680" aria-hidden>
      <defs>
        <radialGradient id="g-ground" cx=".5" cy=".45" r=".78"><stop offset="0" style={{ stopColor: 'var(--g1)' }} /><stop offset="1" style={{ stopColor: 'var(--g2)' }} /></radialGradient>
        <radialGradient id="g-fire"><stop offset="0" stopColor="#ffb25a" stopOpacity=".7" /><stop offset="1" stopColor="#ffb25a" stopOpacity="0" /></radialGradient>
        <pattern id="p-dots" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="5" cy="7" r="1.1" fill="#fff" opacity=".05" /><circle cx="19" cy="18" r="1" fill="#fff" opacity=".04" /></pattern>
      </defs>
      <rect width="1000" height="680" fill="url(#g-ground)" />
      <rect width="1000" height="680" fill="url(#p-dots)" />

      {/* ridge */}
      <polygon points="610,92 700,22 760,62 830,6 910,60 960,40 1000,86 1000,100 610,100" fill="var(--ridge)" />
      <polygon points="830,6 800,40 832,34 856,44" fill="var(--snow)" style={{ opacity: 'var(--snowop)' as any }} />
      <Label x={885} y={120} t={Z.ridge.label} />

      {/* river */}
      <path d="M0 612 C150 590 250 640 400 618 S700 598 1000 626 L1000 680 L0 680 Z" fill="var(--water)" />
      <path d="M0 618 C150 598 250 646 400 624 S700 604 1000 632" fill="none" stroke="var(--water-hi)" strokeWidth="2" strokeDasharray="14 18" className="flow" />
      <Label x={820} y={660} t="THE RIVER" />

      {/* paths */}
      {(['clinic', 'school', 'market', 'workshop', 'yard', 'homes', 'fields', 'treeline', 'bank'] as const).map((k) => (
        <path key={k} d={curve(Z[k])} fill="none" stroke="var(--path)" strokeWidth="11" strokeLinecap="round" opacity=".9" />
      ))}

      {/* woods and edges */}
      {woods.map((t, i) => <Tree key={'w' + i} {...t} />)}
      {west.map((t, i) => <Tree key={'l' + i} {...t} />)}
      {east.map((t, i) => <Tree key={'r' + i} {...t} />)}
      <Label x={X(Z.treeline.x) + 10} y={22} t={Z.treeline.label} />

      {/* fields */}
      <g transform={`translate(${X(Z.fields.x) - 100} ${Y(Z.fields.y) - 92})`}>
        {[0, 1, 2, 3].map((r) => (
          <g key={r}>
            <rect x="0" y={r * 20} width="200" height="14" rx="3" fill="var(--soil)" />
            <line x1="6" x2="194" y1={r * 20 + 7} y2={r * 20 + 7} stroke="var(--crop)" strokeWidth="4" strokeDasharray="3 7" strokeLinecap="round" />
          </g>
        ))}
      </g>
      <Label x={X(Z.fields.x)} y={Y(Z.fields.y) - 100} t={Z.fields.label} />

      {/* clinic */}
      <House cx={X(Z.clinic.x)} cy={Y(Z.clinic.y) - 36} w={70} h={42} roof="var(--roof2)">
        <g fill="#e9e5dc"><rect x="29" y="-26" width="12" height="4" /><rect x="33" y="-30" width="4" height="12" /></g>
      </House>
      <Label x={X(Z.clinic.x)} y={Y(Z.clinic.y) - 84} t={Z.clinic.label} />

      {/* school */}
      <House cx={X(Z.school.x)} cy={Y(Z.school.y) - 36} w={96} h={44} roof="var(--roof3)">
        <rect x="42" y="-42" width="12" height="14" fill="var(--wall)" /><rect x="46" y="-50" width="4" height="9" fill="var(--door)" />
      </House>
      <Label x={X(Z.school.x)} y={Y(Z.school.y) - 96} t={Z.school.label} />

      {/* market */}
      <g transform={`translate(${X(Z.market.x) - 80} ${Y(Z.market.y) - 66})`}>
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(${i * 56} 0)`}>
            <rect x="2" y="12" width="3" height="26" fill="var(--door)" /><rect x="43" y="12" width="3" height="26" fill="var(--door)" />
            <rect x="0" y="6" width="48" height="12" rx="2" fill={['#b4624a', '#c8a45a', '#6f8fa6'][i]} />
            <rect x="4" y="28" width="40" height="9" rx="2" fill="var(--wall)" />
          </g>
        ))}
      </g>
      <Label x={X(Z.market.x)} y={Y(Z.market.y) - 76} t={Z.market.label} />

      {/* workshop */}
      <House cx={X(Z.workshop.x)} cy={Y(Z.workshop.y) - 36} w={74} h={44} roof="var(--roof4)">
        <rect x="52" y="-34" width="9" height="20" fill="var(--wall)" />
        <circle className="smoke" cx="56" cy="-40" r="5" fill="#cfd3cc" opacity=".25" />
      </House>
      <Label x={X(Z.workshop.x)} y={Y(Z.workshop.y) - 92} t={Z.workshop.label} />

      {/* builders yard */}
      <g transform={`translate(${X(Z.yard.x) - 70} ${Y(Z.yard.y) - 70})`}>
        {[0, 1, 2, 3].map((i) => <rect key={i} x="0" y={30 - i * 8} width={62 - i * 6} height="6" rx="1" fill="var(--plank)" />)}
        <g stroke="var(--plank)" strokeWidth="4" fill="none"><path d="M82 52 V8 H138 V52" /><path d="M82 30 H138" /></g>
      </g>
      <Label x={X(Z.yard.x)} y={Y(Z.yard.y) - 78} t={Z.yard.label} />

      {/* homes */}
      {[[-96, -4], [-32, -22], [32, -22], [96, -4]].map(([dx, dy], i) => <House key={i} cx={hm.x + dx} cy={hm.y + dy} w={46} h={30} roof={['var(--roof)', 'var(--roof2)', 'var(--roof3)', 'var(--roof4)'][i]} />)}
      

      {/* square */}
      <circle cx={sq.x} cy={sq.y} r="82" fill="var(--plaza)" stroke="var(--path)" strokeWidth="3" />
      <circle cx={sq.x} cy={sq.y} r="62" fill="none" stroke="var(--path)" strokeWidth="1.5" strokeDasharray="4 8" opacity=".7" />
      <circle className="fire-glow" cx={sq.x} cy={sq.y} r="52" fill="url(#g-fire)" />
      <g><circle cx={sq.x} cy={sq.y} r="11" fill="#2a2d29" /><circle className="fire" cx={sq.x} cy={sq.y} r="6" fill="#ff9d3d" /></g>
      <Label x={sq.x} y={sq.y + 104} t={Z.square.label} />
    </svg>
  );
});

type Props = { chars: any[]; world: { day: number; hour: number; season: string; weather: string }; colors: string[]; onSelect: (c: any) => void };

export default function Settlement({ chars, world, colors, onSelect }: Props) {
  const pos = useMemo(() => place(chars), [chars]);
  const { night, warm } = lightOf(Number(world.hour));
  const sky = celestial(Number(world.hour));
  const links = chars.flatMap((c) => {
    const t = c.last_action?.type, tn = c.last_action?.target;
    const o = tn && chars.find((x) => x.name === tn);
    const a = pos.get(c.id), b = o && pos.get(o.id);
    if ((t !== 'talk' && t !== 'help') || !a || !b || (a.x === b.x && a.y === b.y)) return [];
    return [{ k: `${c.id}-${o.id}-${c.action_count}`, a, b, tense: c.mood === 'tense', help: t === 'help' }];
  });
  return (
    <div className={`scene season-${world.season} wx-${world.weather}${night > 0.5 ? ' is-night' : ''}`}>
      <Scenery />
      <svg className="scene-links" viewBox="0 0 1000 680" aria-hidden>
        {links.map((l) => <line key={l.k} x1={X(l.a.x)} y1={Y(l.a.y)} x2={X(l.b.x)} y2={Y(l.b.y)} className={l.tense ? 'lk tense' : l.help ? 'lk help' : 'lk'} />)}
      </svg>
      <div className="tint-night" style={{ opacity: night * 0.62 }} />
      <div className="tint-warm" style={{ opacity: warm * 0.5 }} />
      <div className="fx" /><div className="fx2" />
      <div className={`celestial ${sky.kind}`} style={{ left: `${sky.x}%`, top: `${sky.y}%` } as CSSProperties} />
      <div className="hud"><b>DAY {world.day}</b> · {String(world.hour).padStart(2, '0')}:00 · {String(world.weather).toUpperCase()}</div>
      {chars.map((c, i) => {
        const p = pos.get(c.id);
        if (!p) return null;
        return (
          <button key={c.id} className="resident" style={{ left: `${p.x}%`, top: `${p.y}%`, zIndex: 10 + Math.round(p.y) }} onClick={() => onSelect(c)} aria-label={`${c.name}: ${c.current_activity}`}>
            {c.last_action?.type === 'talk' && <span className="bubble"><i /><i /><i /></span>}
            <Avatar c={c} color={colors[i % colors.length]} size={38} />
            <span className="label"><b>{c.name}</b><em>{c.current_activity}</em></span>
          </button>
        );
      })}
    </div>
  );
}

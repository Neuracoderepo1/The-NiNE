'use client';
import { useMemo, useState } from 'react';

type Rel = { id: string; character_a: string; character_b: string; affinity: number; trust: number; relationship_label: string };
type Ch = { id: string; name: string };

export default function RelationshipGraph({ chars, rels, colors, onSelect }: { chars: Ch[]; rels: Rel[]; colors: string[]; onSelect: (id: string) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const R = 150, C = 200;
  const nodes = useMemo(() => chars.map((c, i) => {
    const a = (i / Math.max(chars.length, 1)) * Math.PI * 2 - Math.PI / 2;
    return { ...c, i, x: C + Math.cos(a) * R, y: C + Math.sin(a) * R, lx: C + Math.cos(a) * (R + 30), ly: C + Math.sin(a) * (R + 30) + 4, a };
  }), [chars]);
  const pos = new Map(nodes.map((n) => [n.id, n]));
  const edges = rels.map((r) => ({ ...r, aff: Number(r.affinity), a: pos.get(r.character_a), b: pos.get(r.character_b) }))
    .filter((e) => e.a && e.b && Math.abs(e.aff) >= 0.04).sort((x, y) => Math.abs(x.aff) - Math.abs(y.aff));
  const strongest = [...edges].sort((x, y) => y.aff - x.aff);
  const tension = [...edges].filter((e) => e.aff < 0).sort((x, y) => x.aff - y.aff);
  const name = (id: string) => chars.find((c) => c.id === id)?.name ?? '?';
  const active = (e: (typeof edges)[number]) => !hover || e.character_a === hover || e.character_b === hover;

  return (
    <div className="rg">
      <svg viewBox="-40 0 480 400" role="img" aria-label="Relationship web between the nine residents">
        <circle cx={C} cy={C} r={R} fill="none" stroke="#1f241f" strokeDasharray="2 6" />
        {edges.map((e) => {
          const w = 0.6 + Math.min(1, Math.abs(e.aff)) * 5;
          return (
            <path key={e.id} d={`M${e.a!.x} ${e.a!.y} Q${C} ${C} ${e.b!.x} ${e.b!.y}`} fill="none" strokeLinecap="round"
              stroke={e.aff < 0 ? '#d1736a' : '#a9d1a7'} strokeWidth={w} opacity={active(e) ? (hover ? 0.9 : 0.2 + Math.min(0.55, Math.abs(e.aff) * 0.7)) : 0.04}>
              <title>{`${name(e.character_a)} & ${name(e.character_b)}: ${e.relationship_label} (${e.aff >= 0 ? '+' : ''}${e.aff.toFixed(2)})`}</title>
            </path>
          );
        })}
        {nodes.map((n) => (
          <g key={n.id} className="rg-node" onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(n.id)} onBlur={() => setHover(null)} onClick={() => onSelect(n.id)} tabIndex={0} role="button" aria-label={n.name}>
            <circle cx={n.x} cy={n.y} r={hover === n.id ? 17 : 14} fill={colors[n.i % colors.length]} stroke="#0b0d0c" strokeWidth="3" />
            <text x={n.x} y={n.y + 3.5} textAnchor="middle" className="rg-in">{n.name.slice(0, 3).toUpperCase()}</text>
            <text x={n.lx} y={n.ly} textAnchor={Math.cos(n.a) > 0.3 ? 'start' : Math.cos(n.a) < -0.3 ? 'end' : 'middle'} className="rg-nm">{n.name}</text>
          </g>
        ))}
      </svg>
      <div className="rg-side">
        <small>STRONGEST BONDS</small>
        {strongest.filter((e) => e.aff > 0).slice(0, 4).map((e) => (
          <p key={e.id} className="rg-row"><span>{name(e.character_a)} &amp; {name(e.character_b)}</span><i>{e.relationship_label}</i><b className="up">+{e.aff.toFixed(2)}</b></p>
        ))}
        {!strongest.some((e) => e.aff > 0) && <p className="empty">Bonds are still forming.</p>}
        <small className="rg-gap">TENSION</small>
        {tension.slice(0, 3).map((e) => (
          <p key={e.id} className="rg-row"><span>{name(e.character_a)} &amp; {name(e.character_b)}</span><i>{e.relationship_label}</i><b className="down">{e.aff.toFixed(2)}</b></p>
        ))}
        {!tension.length && <p className="empty">No open conflicts.</p>}
        <p className="rg-key"><u className="g" />warm <u className="r" />tense · thicker line = stronger</p>
      </div>
    </div>
  );
}

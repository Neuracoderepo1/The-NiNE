'use client';
type Chron = { day: number; stats?: any };

const META: { k: string; label: string; icon: string; warn: number; max: number; color: string }[] = [
  { k: 'food', label: 'FOOD', icon: '🌾', warn: 40, max: 200, color: '#a9d1a7' },
  { k: 'wood', label: 'WOOD', icon: '🪵', warn: 20, max: 200, color: '#c9a36a' },
  { k: 'stone', label: 'STONE', icon: '🪨', warn: 15, max: 600, color: '#9fb0be' },
  { k: 'tools', label: 'TOOLS', icon: '🔧', warn: 12, max: 120, color: '#d7b98e' },
  { k: 'medicine', label: 'MEDICINE', icon: '🌿', warn: 12, max: 120, color: '#e0b0b8' },
];

function Spark({ pts, color }: { pts: number[]; color: string }) {
  if (pts.length < 2) return <svg className="spark" viewBox="0 0 100 26" aria-hidden><line x1="0" x2="100" y1="13" y2="13" stroke="#30352f" strokeDasharray="3 4" /></svg>;
  const lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1;
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * 100, 23 - ((v - lo) / span) * 20] as const);
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const last = xy[xy.length - 1];
  return (
    <svg className="spark" viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden>
      <path d={`${d} L100 26 L0 26 Z`} fill={color} opacity=".12" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="2.4" fill={color} />
    </svg>
  );
}

export default function Resources({ resources, chron }: { resources: Record<string, number>; chron: Chron[] }) {
  // History: each chronicle day's closing stock, oldest first, then the live value.
  const days = [...chron].sort((a, b) => a.day - b.day);
  return (
    <div className="res-grid">
      {META.map((m) => {
        const v = Math.round(Number(resources?.[m.k] ?? 0));
        const hist = days.map((d) => Number(d.stats?.resources_end?.[m.k])).filter((n) => Number.isFinite(n));
        const series = [...hist, v];
        const first = series[0], delta = v - first;
        const low = v < m.warn;
        return (
          <div key={m.k} className={`res${low ? ' low' : ''}`}>
            <div className="res-top"><span className="res-ic" aria-hidden>{m.icon}</span><small>{m.label}</small>{low && <em className="res-flag">LOW</em>}</div>
            <div className="res-val">{v}</div>
            <div className="res-bar" title={`warning below ${m.warn}`}>
              <u style={{ width: `${Math.min(100, (v / m.max) * 100)}%`, background: low ? '#d1736a' : m.color }} />
              <b style={{ left: `${(m.warn / m.max) * 100}%` }} />
            </div>
            <Spark pts={series} color={low ? '#d1736a' : m.color} />
            <div className={`res-d ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}`}>{series.length > 2 ? `${delta > 0 ? '+' : ''}${delta} over ${series.length - 1} days` : 'trend builds daily'}</div>
          </div>
        );
      })}
    </div>
  );
}

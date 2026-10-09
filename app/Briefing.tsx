'use client';
import { useMemo, useState } from 'react';
import Avatar from './Avatar';
import { WINDOWS, buildBriefing, narrationPrompt } from '../lib/briefing';
import type { BChar, BChron, BEvent, BRel, BWorld, WindowKey } from '../lib/briefing';

const ICON: Record<string, string> = { storm: '⛈', weather: '🌦', season: '🍂', discovery: '🧭', scarcity: '⚠️', conflict: '⚡', care: '🩺', hurt: '🤕', world: '✦' };
const ACT_LABEL: Record<string, string> = { work: 'Work', rest: 'Rest', eat: 'Eating', talk: 'Talking', explore: 'Exploring', help: 'Caring', reflect: 'Reflecting' };
const ACT_COLOR: Record<string, string> = { work: '#9db7c9', rest: '#8f9fc0', eat: '#d7b98e', talk: '#a9d1a7', explore: '#e0c15a', help: '#e0b0b8', reflect: '#b8a3cf' };
const tone = (v: number) => (v < 25 ? 'lo' : v < 50 ? 'mid' : 'ok');

export default function Briefing({ world, chars, events, rels, chron, colors, onSelect }: {
  world: BWorld; chars: (BChar & { age?: number; action_count?: number })[]; events: BEvent[]; rels: BRel[]; chron: BChron[]; colors: string[]; onSelect: (id: string) => void;
}) {
  const [win, setWin] = useState<WindowKey>('hour');
  const [copy, setCopy] = useState<'idle' | 'ok' | 'fail'>('idle');
  const b = useMemo(() => buildBriefing({ world, chars, events, rels, chron }, win), [world, chars, events, rels, chron, win]);
  const copyPrompt = async () => {
    const text = narrationPrompt(b);
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch {
      try { const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); ok = document.execCommand('copy'); document.body.removeChild(t); } catch { ok = false; }
    }
    setCopy(ok ? 'ok' : 'fail');
    setTimeout(() => setCopy('idle'), 2500);
  };
  const maxPct = Math.max(1, ...b.mix.map((m) => m.pct));
  return (
    <section className="briefing">
      <div className="section-head">
        <div><small>THE BRIEFING</small><h2>What is happening in the world.</h2></div>
        <div className="brief-tools">
          <button className={`copybtn${copy === 'ok' ? ' done' : ''}`} onClick={copyPrompt} title="Copies the facts and narration instructions, ready to paste into any AI model">
            {copy === 'ok' ? 'COPIED \u2713' : copy === 'fail' ? 'COPY FAILED' : 'COPY FOR AI NARRATION'}
          </button>
          <div className="seg" role="tablist" aria-label="Time window">
            {WINDOWS.map((w) => <button key={w.key} role="tab" aria-selected={w.key === win} className={w.key === win ? 'on' : ''} onClick={() => setWin(w.key)}>{w.label}</button>)}
          </div>
        </div>
      </div>
      <div className="brief-grid">
        <div className="brief-main">
          <div className="brief-meta">AS OF TICK {b.asOf} · COVERING TICKS {b.from}–{b.asOf}</div>
          {b.lede.map((p, i) => <p key={i} className={i === 0 ? 'lede first' : 'lede'}>{p}</p>)}
          <h4 className="bh">KEY MOMENTS</h4>
          {b.moments.length ? (
            <ul className="moments">
              {b.moments.map((m, i) => <li key={i} className={`m-${m.kind}`}><span className="m-ic" aria-hidden>{ICON[m.kind] ?? ICON.world}</span><b>T{m.tick}</b><span>{m.text}</span></li>)}
            </ul>
          ) : <p className="empty">A quiet stretch: nothing notable happened in this window.</p>}
        </div>
        <div className="brief-side">
          <div className="bcard">
            <small>WATCHLIST</small>
            <ul className="alerts">{b.alerts.map((a, i) => <li key={i} className={`al-${a.level}`}><i />{a.text}</li>)}</ul>
          </div>
          <div className="bcard">
            <small>WHAT THE NINE DID</small>
            {b.mix.length ? <div className="mix">{b.mix.map((m) => (
              <div key={m.action} className="mix-row"><span>{ACT_LABEL[m.action] ?? m.action}</span><i><u style={{ width: `${(m.pct / maxPct) * 100}%`, background: ACT_COLOR[m.action] ?? '#8e958d' }} /></i><em>{m.pct}%</em></div>
            ))}</div> : <p className="empty">No actions recorded yet.</p>}
          </div>
          <div className="bcard">
            <small>SOCIAL PULSE</small>
            <div className="pulse-grid">
              <div><strong>{b.social.talks}</strong><span>conversations</span></div>
              <div><strong>{b.social.helps}</strong><span>acts of care</span></div>
              <div className={b.social.tense ? 'warnv' : ''}><strong>{b.social.tense}</strong><span>tense exchanges</span></div>
            </div>
            {b.social.pairs.length > 0 && <p className="pairs">{b.social.pairs.map((p) => `${p.pair} ×${p.n}`).join(' · ')}</p>}
          </div>
        </div>
      </div>
      <h4 className="bh">WHERE EVERYONE IS RIGHT NOW</h4>
      <div className="nowgrid">
        {b.now.map((r, i) => {
          const c = chars.find((x) => x.id === r.id)!;
          return (
            <button key={r.id} className="nowcard" onClick={() => onSelect(r.id)}>
              <Avatar c={c} color={colors[i % colors.length]} size={34} needs={false} />
              <div className="now-body">
                <div className="now-top"><b>{r.name}</b><em>{r.role}</em></div>
                <p>{r.activity}<span> · {r.mood}</span></p>
                {r.reason && <p className="now-why">“{r.reason}”</p>}
                <div className="chips">
                  <span className={tone(r.health)}>HP {r.health}</span><span className={tone(r.food)}>FOOD {r.food}</span><span className={tone(r.energy)}>EN {r.energy}</span><span className={tone(r.social)}>SOC {r.social}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

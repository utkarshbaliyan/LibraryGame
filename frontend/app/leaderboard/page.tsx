'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import GameNav from '@/components/GameNav';
import { fetchLeaderboard, type LeaderboardEntry } from '@/lib/api';

function isoWeek(): string {
  const d = new Date();
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayOfWeek + 1);
  const diff = d.getTime() - monday.getTime();
  const week = Math.floor(diff / (7 * 86400000)) + 1;
  return `${d.getFullYear()}-W${String(week).padStart(2,'0')}`;
}

function secsToReset(): number {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
  monday.setHours(0,0,0,0);
  return Math.floor((monday.getTime() - now.getTime()) / 1000);
}

function fmtCountdown(secs: number): string {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m`;
  return `${m}m`;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return (
    <span style={{
      fontFamily:"'Space Mono',monospace", fontSize:13, fontWeight:700,
      color:'#f59e0b', textShadow:'0 0 14px rgba(245,158,11,0.6)',
      minWidth:32, textAlign:'right', display:'inline-block',
    }}>
      #1
    </span>
  );
  if (rank === 2) return (
    <span style={{
      fontFamily:"'Space Mono',monospace", fontSize:13, fontWeight:700,
      color:'#94a3b8', textShadow:'0 0 10px rgba(148,163,184,0.4)',
      minWidth:32, textAlign:'right', display:'inline-block',
    }}>
      #2
    </span>
  );
  if (rank === 3) return (
    <span style={{
      fontFamily:"'Space Mono',monospace", fontSize:13, fontWeight:700,
      color:'#cd7c3b', textShadow:'0 0 10px rgba(205,124,59,0.4)',
      minWidth:32, textAlign:'right', display:'inline-block',
    }}>
      #3
    </span>
  );
  return (
    <span style={{
      fontFamily:"'Space Mono',monospace", fontSize:12,
      color:'var(--dim)',
      minWidth:32, textAlign:'right', display:'inline-block',
    }}>
      #{rank}
    </span>
  );
}

export default function LeaderboardPage() {
  const [entries, setEntries]     = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [err, setErr]             = useState('');
  const [myName, setMyName]       = useState('');
  const [resetIn, setResetIn]     = useState(secsToReset());

  useEffect(() => {
    setMyName(localStorage.getItem('sl_name') ?? '');
  }, []);

  const load = useCallback(async () => {
    setErr('');
    try {
      const data = await fetchLeaderboard();
      setEntries(data);
    } catch {
      setErr('Could not reach server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const iv = setInterval(() => { load(); setResetIn(secsToReset()); }, 30000);
    return () => clearInterval(iv);
  }, [load]);

  const myEntry = entries.find(e => e.name === myName);

  return (
    <>
      <GameNav minimal />
      <main className="page-wrap" style={{ maxWidth:720 }}>

        {/* Header */}
        <motion.div
          initial={{ opacity:0, y:14 }}
          animate={{ opacity:1, y:0 }}
          transition={{ duration:0.3 }}
          style={{ marginBottom:36 }}
        >
          <div className="label-chip" style={{ marginBottom:12 }}>Rankings</div>
          <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
            <div>
              <h1 className="fantasy-h1" style={{ fontSize:26, marginBottom:6 }}>
                Hall of Scholars
              </h1>
              <div style={{ fontSize:12, color:'var(--dim)', fontFamily:"'Space Mono',monospace" }}>
                {isoWeek()} · resets in{' '}
                <span style={{ color:'var(--amber)' }}>{fmtCountdown(resetIn)}</span>
              </div>
            </div>

            {myEntry && (
              <div style={{
                padding:'10px 16px',
                background:'rgba(245,158,11,0.06)',
                border:'1px solid rgba(245,158,11,0.18)',
                borderRadius:6,
                textAlign:'center',
              }}>
                <div style={{
                  fontFamily:"'Space Mono',monospace",
                  fontSize:10, color:'var(--dim)', letterSpacing:'0.1em', marginBottom:3,
                }}>
                  YOUR RANK
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <RankBadge rank={entries.indexOf(myEntry) + 1} />
                  <span style={{
                    fontFamily:"'Space Mono',monospace",
                    fontSize:16, fontWeight:700, color:'var(--accent)',
                  }}>
                    {fmtTime(myEntry.weekly_secs)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {err && (
          <div style={{
            padding:'12px 16px', marginBottom:20,
            background:'rgba(248,113,113,0.07)', border:'1px solid rgba(248,113,113,0.2)',
            borderRadius:6, fontFamily:"'Space Mono',monospace", fontSize:12, color:'var(--red)',
          }}>
            ⚠ {err}
          </div>
        )}

        {loading && (
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} style={{
                height:60, background:'var(--card)', border:'1px solid var(--border)',
                borderRadius:8, opacity:0.35 + i*0.1,
              }} />
            ))}
          </div>
        )}

        {/* Top 3 podium */}
        {!loading && entries.length >= 3 && (
          <div style={{
            display:'grid', gridTemplateColumns:'1fr 1fr 1fr',
            gap:10, marginBottom:20,
          }}>
            {/* Silver */}
            <motion.div
              initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}
              transition={{ delay:0.08, duration:0.28 }}
              className="game-card"
              style={{
                padding:'20px 16px',
                textAlign:'center',
                marginTop:24,
                borderColor:'rgba(148,163,184,0.2)',
              }}
            >
              <div style={{ fontSize:22, marginBottom:8 }}>🥈</div>
              <div style={{
                fontFamily:"'Space Mono',monospace",
                fontSize:18, fontWeight:700, color:'#94a3b8',
                textShadow:'0 0 10px rgba(148,163,184,0.4)',
                marginBottom:4,
              }}>
                {fmtTime(entries[1].weekly_secs)}
              </div>
              <div style={{ fontSize:12, color:'var(--muted)', fontWeight:600 }}>
                {entries[1].name}
              </div>
            </motion.div>

            {/* Gold */}
            <motion.div
              initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}
              transition={{ delay:0.04, duration:0.28 }}
              className="game-card"
              style={{
                padding:'20px 16px',
                textAlign:'center',
                borderColor:'rgba(245,158,11,0.3)',
                boxShadow:'0 0 28px rgba(245,158,11,0.07)',
              }}
            >
              <div style={{ fontSize:28, marginBottom:8 }}>🥇</div>
              <div style={{
                fontFamily:"'Space Mono',monospace",
                fontSize:22, fontWeight:700, color:'#f59e0b',
                textShadow:'0 0 18px rgba(245,158,11,0.5)',
                marginBottom:4,
              }}>
                {fmtTime(entries[0].weekly_secs)}
              </div>
              <div style={{ fontSize:13, color:'var(--text)', fontWeight:600 }}>
                {entries[0].name}
              </div>
            </motion.div>

            {/* Bronze */}
            <motion.div
              initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}
              transition={{ delay:0.12, duration:0.28 }}
              className="game-card"
              style={{
                padding:'20px 16px',
                textAlign:'center',
                marginTop:40,
                borderColor:'rgba(205,124,59,0.2)',
              }}
            >
              <div style={{ fontSize:20, marginBottom:8 }}>🥉</div>
              <div style={{
                fontFamily:"'Space Mono',monospace",
                fontSize:18, fontWeight:700, color:'#cd7c3b',
                textShadow:'0 0 10px rgba(205,124,59,0.4)',
                marginBottom:4,
              }}>
                {fmtTime(entries[2].weekly_secs)}
              </div>
              <div style={{ fontSize:12, color:'var(--muted)', fontWeight:600 }}>
                {entries[2].name}
              </div>
            </motion.div>
          </div>
        )}

        {/* Full table */}
        {!loading && entries.length > 0 && (
          <motion.div
            className="game-card"
            initial={{ opacity:0 }}
            animate={{ opacity:1 }}
            transition={{ delay:0.15 }}
            style={{ overflow:'hidden' }}
          >
            {/* Table header */}
            <div style={{
              display:'grid',
              gridTemplateColumns:'52px 1fr 100px',
              padding:'10px 20px',
              borderBottom:'1px solid var(--border)',
              fontFamily:"'Space Mono',monospace",
              fontSize:9, letterSpacing:'0.18em',
              color:'var(--dim)', textTransform:'uppercase',
            }}>
              <span style={{ textAlign:'right' }}>RANK</span>
              <span style={{ paddingLeft:16 }}>NAME</span>
              <span style={{ textAlign:'right' }}>STUDY TIME</span>
            </div>

            <AnimatePresence>
              {entries.map((e, i) => {
                const isMe = e.name === myName;
                const isTop3 = i < 3;
                return (
                  <motion.div
                    key={e.name}
                    initial={{ opacity:0, x:-10 }}
                    animate={{ opacity:1, x:0 }}
                    transition={{ delay: i * 0.03 }}
                    style={{
                      display:'grid',
                      gridTemplateColumns:'52px 1fr 100px',
                      padding:'13px 20px',
                      borderBottom: i < entries.length - 1 ? '1px solid var(--border)' : 'none',
                      alignItems:'center',
                      background: isMe ? 'rgba(245,158,11,0.04)' : 'transparent',
                      borderLeft: isMe ? '2px solid var(--accent)' : '2px solid transparent',
                      transition:'background 0.2s',
                    }}
                  >
                    <RankBadge rank={i + 1} />
                    <div style={{ paddingLeft:16, display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{
                        fontSize:13, fontWeight: isTop3 ? 700 : 500,
                        color: isMe ? 'var(--accent)' : 'var(--text)',
                      }}>
                        {e.name}
                      </span>
                      {isMe && (
                        <span style={{
                          fontFamily:"'Space Mono',monospace",
                          fontSize:9, color:'var(--accent)',
                          letterSpacing:'0.1em',
                          padding:'1px 6px',
                          border:'1px solid rgba(245,158,11,0.22)',
                          borderRadius:3,
                        }}>
                          YOU
                        </span>
                      )}
                    </div>
                    <div style={{
                      textAlign:'right',
                      fontFamily:"'Space Mono',monospace",
                      fontSize:13, fontWeight:700,
                      color: i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : i === 2 ? '#cd7c3b' : isMe ? 'var(--accent)' : 'var(--muted)',
                    }}>
                      {fmtTime(e.weekly_secs)}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}

        {!loading && entries.length === 0 && !err && (
          <div style={{
            textAlign:'center', padding:'60px 24px',
            fontFamily:"'Space Mono',monospace",
            fontSize:12, color:'var(--dim)', letterSpacing:'0.12em', lineHeight:2,
          }}>
            NO DATA THIS WEEK<br />
            <span style={{ fontSize:10, opacity:0.6 }}>Study for at least 60 seconds to appear here.</span>
          </div>
        )}

        {myName && !myEntry && !loading && entries.length > 0 && (
          <div style={{
            marginTop:16, padding:'12px 18px',
            background:'rgba(245,158,11,0.04)',
            border:'1px solid rgba(245,158,11,0.14)',
            borderRadius:8,
            fontFamily:"'Space Mono',monospace",
            fontSize:12, color:'var(--dim)', textAlign:'center',
          }}>
            You&apos;re not on the board yet — study for at least 1 minute to appear.
          </div>
        )}
      </main>
    </>
  );
}

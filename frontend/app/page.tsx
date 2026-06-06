'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import GameNav from '@/components/GameNav';
import { fetchRooms, createRoom, type RoomInfo } from '@/lib/api';

const REFRESH_SECS = 5;

// ── Create room modal ──────────────────────────────────────────────────────
function CreateModal({ onClose }: { onClose: () => void }) {
  const [label, setLabel] = useState('');
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = label.trim();
    if (trimmed.length < 2 || trimmed.length > 50) { setErr('Name must be 2–50 characters.'); return; }
    setBusy(true); setErr('');
    try {
      const name = localStorage.getItem('sl_display') ?? localStorage.getItem('sl_name') ?? 'Scholar';
      const { roomId } = await createRoom(trimmed, name);
      localStorage.setItem('sl_roomId', roomId);
      window.location.href = '/game';
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to create room.');
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div
        className="modal-panel" style={{ maxWidth:500 }}
        initial={{ opacity:0, scale:0.96, y:16 }}
        animate={{ opacity:1, scale:1, y:0 }}
        exit={{ opacity:0, scale:0.96, y:8 }}
        transition={{ duration:0.2 }}
      >
        <div className="label-chip" style={{ marginBottom:12 }}>Found A Library</div>
        <h2 style={{
          fontFamily:'var(--font-cinzel, serif)',
          fontSize:20, fontWeight:700,
          marginBottom:6, color:'var(--text)',
        }}>
          Open Your Study Chamber
        </h2>
        <p style={{ fontSize:13, color:'var(--muted)', marginBottom:24, lineHeight:1.6 }}>
          Name your library — other scholars can find and join it from the lobby.
        </p>
        <form onSubmit={submit}>
          <div style={{ marginBottom:20 }}>
            <label style={{
              display:'block', fontFamily:"'Space Mono',monospace",
              fontSize:11, color:'var(--muted)', letterSpacing:'0.08em', marginBottom:7,
            }}>
              CHAMBER NAME
            </label>
            <input
              ref={inputRef}
              className={`game-input${err ? ' error' : ''}`}
              value={label}
              onChange={e => { setLabel(e.target.value); setErr(''); }}
              placeholder="Morning Grind, UPSC Focus Room…"
              maxLength={50}
            />
            <div style={{ display:'flex', justifyContent:'space-between', marginTop:5, fontSize:11, color:'var(--dim)' }}>
              {err ? <span style={{ color:'var(--red)' }}>{err}</span> : <span>2–50 characters</span>}
              <span>{label.length}/50</span>
            </div>
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button type="submit" className="btn-neon" style={{ flex:1, justifyContent:'center' }} disabled={busy}>
              {busy ? 'OPENING…' : 'OPEN CHAMBER'}
            </button>
            <button type="button" className="btn-ghost" onClick={onClose}>CANCEL</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── Room card ──────────────────────────────────────────────────────────────
function ChamberCard({ room, onJoin, index }: { room: RoomInfo; onJoin: (id: string) => void; index: number }) {
  const label   = room.metadata?.label ?? 'Study Hall';
  const creator = room.metadata?.createdBy;

  return (
    <motion.div
      className="game-card"
      initial={{ opacity:0, y:16 }}
      animate={{ opacity:1, y:0 }}
      transition={{ duration:0.28, delay: index * 0.06, ease:'easeOut' }}
      whileHover={{ y: -3 }}
      style={{ padding:'20px 22px', cursor:'pointer' }}
      onClick={() => onJoin(room.roomId)}
    >
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom:14 }}>
        <div style={{ minWidth:0 }}>
          <div style={{ marginBottom:6 }}>
            <span className="zone-badge purple">Chamber</span>
          </div>
          <div style={{
            fontFamily:"'Space Mono',monospace",
            fontSize:14, fontWeight:700, color:'var(--text)',
            whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
          }}>
            {label}
          </div>
          {creator && (
            <div style={{ fontSize:11, color:'var(--dim)', marginTop:3 }}>
              by {creator}
            </div>
          )}
        </div>
        <button
          className="btn-neon"
          style={{ flexShrink:0, fontSize:10, padding:'6px 16px' }}
          onClick={e => { e.stopPropagation(); onJoin(room.roomId); }}
        >
          JOIN
        </button>
      </div>
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        paddingTop:10, borderTop:'1px solid var(--border)',
      }}>
        <span style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span className="live-dot" style={{ width:6, height:6 }} />
          <span style={{
            fontFamily:"'Space Mono',monospace",
            fontSize:12, fontWeight:700,
            color: room.clients > 0 ? 'var(--accent)' : 'var(--dim)',
          }}>
            {room.clients}
          </span>
          <span style={{ fontSize:11, color:'var(--dim)' }}>
            {room.clients === 1 ? 'scholar' : 'scholars'}
          </span>
        </span>
        <span style={{
          fontFamily:"'Space Mono',monospace",
          fontSize:9, letterSpacing:'0.16em', color:'var(--dim)',
        }}>
          {room.roomId.slice(0,6)}
        </span>
      </div>
    </motion.div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function LobbyPage() {
  const router = useRouter();
  const [rooms, setRooms]           = useState<RoomInfo[]>([]);
  const [loading, setLoading]       = useState(true);
  const [countdown, setCountdown]   = useState(REFRESH_SECS);
  const [showCreate, setShowCreate] = useState(false);
  const [fetchErr, setFetchErr]     = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval>>(null);

  const load = useCallback(async () => {
    setFetchErr('');
    try {
      setRooms(await fetchRooms());
    } catch {
      setFetchErr('Server offline — is it running on :2567?');
    } finally {
      setLoading(false);
      setCountdown(REFRESH_SECS);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown(c => { if (c <= 1) { load(); return REFRESH_SECS; } return c - 1; });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  function gate(then: () => void) {
    if (!localStorage.getItem('sl_name') || !localStorage.getItem('sl_display')) {
      router.push('/join');
    } else {
      then();
    }
  }

  function enterRoom(roomId: string) {
    localStorage.setItem('sl_roomId', roomId);
    gate(() => router.push('/game'));
  }

  const globalRoom     = rooms.find(r => r.metadata?.isGlobal);
  const communityRooms = rooms.filter(r => !r.metadata?.isGlobal);
  const totalPlayers   = rooms.reduce((s, r) => s + r.clients, 0);

  return (
    <>
      <GameNav />

      <main style={{ maxWidth:1000, margin:'0 auto', padding:'0 24px 80px' }}>

        {/* ── Hero ── */}
        <motion.div
          initial={{ opacity:0, y:-10 }}
          animate={{ opacity:1, y:0 }}
          transition={{ duration:0.4 }}
          style={{
            textAlign:'center',
            padding:'56px 0 44px',
            position:'relative',
          }}
        >
          {/* Ambient glow */}
          <div style={{
            position:'absolute', top:0, left:'50%', transform:'translateX(-50%)',
            width:600, height:200,
            background:'radial-gradient(ellipse at 50% 40%, rgba(245,158,11,0.09) 0%, transparent 70%)',
            pointerEvents:'none',
          }} />

          <motion.div
            initial={{ opacity:0, y:8 }}
            animate={{ opacity:1, y:0 }}
            transition={{ delay:0.1, duration:0.5 }}
            style={{ position:'relative' }}
          >
            <div style={{
              fontFamily:"'Space Mono',monospace",
              fontSize:10, letterSpacing:'0.35em',
              color:'var(--muted)', marginBottom:14, textTransform:'uppercase',
            }}>
              Welcome to
            </div>
            <h1 style={{
              fontFamily:'var(--font-cinzel, serif)',
              fontSize: 'clamp(32px, 6vw, 56px)',
              fontWeight:700,
              letterSpacing:'0.06em',
              color:'var(--accent)',
              textShadow:'0 0 40px rgba(245,158,11,0.5), 0 0 80px rgba(245,158,11,0.15)',
              marginBottom:10,
              lineHeight:1.1,
            }}>
              FOCUS LIBRARY
            </h1>
            <div style={{
              fontFamily:"'Space Mono',monospace",
              fontSize:11, letterSpacing:'0.3em',
              color:'var(--muted)', textTransform:'uppercase',
              marginBottom:32,
            }}>
              FOCUS &nbsp;·&nbsp; LEARN &nbsp;·&nbsp; ACHIEVE
            </div>

            {/* Stats row */}
            <div style={{
              display:'inline-flex', alignItems:'center', gap:0,
              background:'rgba(28,16,3,0.9)',
              border:'1px solid var(--border)',
              borderRadius:8,
              overflow:'hidden',
            }}>
              {[
                { icon:'◆', label:'ONLINE', val: totalPlayers, color:'var(--accent)' },
                { icon:'⊞', label:'ROOMS', val: rooms.length, color:'var(--purple)' },
                { icon:'↺', label:'REFRESH', val: `${countdown}s`, color:'var(--cyan)' },
              ].map((s, i) => (
                <div key={s.label} style={{
                  padding:'12px 22px',
                  borderRight: i < 2 ? '1px solid var(--border)' : 'none',
                  display:'flex', flexDirection:'column', alignItems:'center', gap:3,
                }}>
                  <span style={{
                    fontFamily:"'Space Mono',monospace",
                    fontSize:18, fontWeight:700, color: s.color,
                  }}>
                    {s.val}
                  </span>
                  <span style={{
                    fontFamily:"'Space Mono',monospace",
                    fontSize:8, letterSpacing:'0.2em', color:'var(--dim)',
                  }}>
                    {s.label}
                  </span>
                </div>
              ))}
              <button
                onClick={load}
                style={{
                  padding:'12px 16px',
                  background:'none', border:'none', cursor:'pointer',
                  fontFamily:"'Space Mono',monospace",
                  fontSize:11, color:'var(--dim)',
                  transition:'color 0.15s, background 0.15s',
                  borderLeft:'1px solid var(--border)',
                }}
                onMouseEnter={e => { e.currentTarget.style.color='var(--accent)'; e.currentTarget.style.background='rgba(245,158,11,0.06)'; }}
                onMouseLeave={e => { e.currentTarget.style.color='var(--dim)'; e.currentTarget.style.background='none'; }}
                title="Refresh rooms"
              >
                ↺
              </button>
            </div>
          </motion.div>
        </motion.div>

        {/* ── Divider ── */}
        <div className="divider-gold" style={{ marginBottom:36 }} />

        {/* ── Error ── */}
        {fetchErr && (
          <div style={{
            padding:'12px 18px', marginBottom:24,
            background:'rgba(248,113,113,0.07)', border:'1px solid rgba(248,113,113,0.22)',
            borderRadius:6, fontFamily:"'Space Mono',monospace", fontSize:12, color:'var(--red)',
          }}>
            ⚠ {fetchErr}
          </div>
        )}

        {/* ── Global Library — Grand Hall ── */}
        {globalRoom && (
          <motion.section
            initial={{ opacity:0, y:16 }}
            animate={{ opacity:1, y:0 }}
            transition={{ delay:0.15, duration:0.32 }}
            style={{ marginBottom:40 }}
          >
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
              <span className="label-chip">Grand Hall</span>
              <div style={{
                flex:1, height:1,
                background:'linear-gradient(90deg, rgba(245,158,11,0.3), transparent)',
              }} />
            </div>

            {/* Featured card */}
            <div style={{
              position:'relative',
              background:'linear-gradient(135deg, rgba(30,18,4,0.95) 0%, rgba(40,26,8,0.9) 100%)',
              border:'1px solid rgba(212,162,62,0.35)',
              borderRadius:12,
              padding:'32px 36px',
              overflow:'hidden',
            }}>
              {/* Corner decorations */}
              <div style={{ position:'absolute', top:-1, left:-1, width:20, height:20, borderTop:'2px solid var(--accent)', borderLeft:'2px solid var(--accent)' }} />
              <div style={{ position:'absolute', bottom:-1, right:-1, width:20, height:20, borderBottom:'2px solid var(--accent)', borderRight:'2px solid var(--accent)' }} />

              {/* Background ambience */}
              <div style={{
                position:'absolute', top:0, right:0, width:300, height:'100%',
                background:'radial-gradient(ellipse at 80% 50%, rgba(245,158,11,0.06) 0%, transparent 70%)',
                pointerEvents:'none',
              }} />

              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:24, flexWrap:'wrap' }}>
                <div style={{ flex:1, minWidth:260 }}>
                  <div style={{ marginBottom:10, display:'flex', alignItems:'center', gap:10 }}>
                    <span className="zone-badge gold">Always Open</span>
                    <span style={{ display:'flex', alignItems:'center', gap:5 }}>
                      <span className="live-dot" style={{ width:7, height:7 }} />
                      <span style={{
                        fontFamily:"'Space Mono',monospace",
                        fontSize:11, color:'var(--accent)', fontWeight:700,
                      }}>
                        {globalRoom.clients} {globalRoom.clients === 1 ? 'scholar' : 'scholars'} studying
                      </span>
                    </span>
                  </div>
                  <h2 style={{
                    fontFamily:'var(--font-cinzel, serif)',
                    fontSize:26, fontWeight:700,
                    color:'var(--text)',
                    marginBottom:8, lineHeight:1.2,
                    letterSpacing:'0.02em',
                  }}>
                    {globalRoom.metadata?.label ?? 'Global Library'}
                  </h2>
                  <p style={{ fontSize:13, color:'var(--muted)', lineHeight:1.7, maxWidth:440 }}>
                    The main study hall — open to every aspirant, around the clock.
                    Drop in, claim a desk, and focus.
                  </p>
                </div>

                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:10, flexShrink:0 }}>
                  <button
                    className="btn-enter"
                    onClick={() => enterRoom(globalRoom.roomId)}
                  >
                    ENTER THE HALL
                    <span style={{ fontSize:16 }}>→</span>
                  </button>
                  <span style={{
                    fontFamily:"'Space Mono',monospace",
                    fontSize:9, letterSpacing:'0.16em', color:'var(--dim)',
                  }}>
                    Room ID: {globalRoom.roomId.slice(0,8)}
                  </span>
                </div>
              </div>
            </div>
          </motion.section>
        )}

        {/* ── Community Chambers ── */}
        <section>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
            <span className="label-chip">Study Chambers</span>
            <div style={{
              flex:1, height:1,
              background:'linear-gradient(90deg, rgba(167,139,250,0.3), transparent)',
            }} />
            <button
              className="btn-neon"
              style={{ fontSize:10, padding:'6px 14px' }}
              onClick={() => gate(() => setShowCreate(true))}
            >
              + OPEN NEW
            </button>
          </div>

          {loading && (
            <div style={{ display:'grid', gap:12, gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))' }}>
              {[1,2].map(i => (
                <div key={i} className="game-card" style={{ padding:'20px 22px', opacity:0.35 }}>
                  <div style={{ height:12, background:'var(--border)', borderRadius:3, marginBottom:10, width:'55%' }} />
                  <div style={{ height:10, background:'var(--border)', borderRadius:3, width:'38%' }} />
                </div>
              ))}
            </div>
          )}

          {!loading && communityRooms.length === 0 && !fetchErr && (
            <motion.div
              className="game-card"
              initial={{ opacity:0 }}
              animate={{ opacity:1 }}
              whileHover={{ borderColor:'rgba(212,162,62,0.38)' }}
              onClick={() => gate(() => setShowCreate(true))}
              style={{
                padding:'44px 28px',
                borderStyle:'dashed', cursor:'pointer',
                display:'flex', flexDirection:'column', alignItems:'center', gap:10, textAlign:'center',
              }}
            >
              <span style={{
                fontFamily:'var(--font-cinzel, serif)',
                fontSize:32, color:'var(--accent)', lineHeight:1,
                animation:'float 3s ease-in-out infinite',
              }}>⬡</span>
              <div style={{ fontFamily:"'Space Mono',monospace", fontSize:11, color:'var(--muted)', letterSpacing:'0.12em' }}>
                NO CHAMBERS OPEN
              </div>
              <div style={{ fontSize:12, color:'var(--dim)' }}>
                Be the first — start your own study library
              </div>
              <button className="btn-neon" style={{ marginTop:8, fontSize:10 }}
                onClick={e => { e.stopPropagation(); gate(() => setShowCreate(true)); }}>
                + OPEN A CHAMBER
              </button>
            </motion.div>
          )}

          {!loading && communityRooms.length > 0 && (
            <div style={{
              display:'grid', gap:12,
              gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))',
            }}>
              <AnimatePresence>
                {communityRooms.map((room, i) => (
                  <ChamberCard key={room.roomId} room={room} onJoin={enterRoom} index={i} />
                ))}
              </AnimatePresence>

              {/* Create new tile */}
              <motion.div
                className="game-card"
                initial={{ opacity:0 }}
                animate={{ opacity:1 }}
                whileHover={{ borderColor:'rgba(212,162,62,0.38)' }}
                onClick={() => gate(() => setShowCreate(true))}
                style={{
                  padding:'20px 22px', borderStyle:'dashed', cursor:'pointer',
                  display:'flex', flexDirection:'column', alignItems:'center',
                  justifyContent:'center', gap:7, minHeight:100,
                }}
              >
                <span style={{ fontSize:22, color:'var(--accent)', lineHeight:1 }}>+</span>
                <span style={{
                  fontFamily:"'Space Mono',monospace",
                  fontSize:9, letterSpacing:'0.18em', color:'var(--dim)', textTransform:'uppercase',
                }}>
                  Open New Chamber
                </span>
              </motion.div>
            </div>
          )}
        </section>
      </main>

      {/* ── Create modal ── */}
      <AnimatePresence>
        {showCreate && <CreateModal onClose={() => setShowCreate(false)} />}
      </AnimatePresence>
    </>
  );
}

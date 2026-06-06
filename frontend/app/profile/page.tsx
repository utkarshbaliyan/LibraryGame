'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import GameNav from '@/components/GameNav';
import { fetchProfile, updateProfile, type ProfileData } from '@/lib/api';

function fmtTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m`;
  return m > 0 ? `${m}m` : '0m';
}

export default function ProfilePage() {
  const [myUsername, setMyUsername] = useState('');
  const [data, setData]         = useState<ProfileData | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [goal, setGoal]         = useState('');
  const [bio, setBio]           = useState('');
  const [nameErr, setNameErr]   = useState('');
  const [busy, setBusy]         = useState(false);
  const [toast, setToast]       = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    const n = localStorage.getItem('sl_name');
    const d = localStorage.getItem('sl_display');
    if (!n || !d) { window.location.href = '/join'; return; }
    setMyUsername(n);
  }, []);

  useEffect(() => {
    if (!myUsername) return;
    fetchProfile(myUsername).then(d => {
      setData(d);
      setDisplayName(d.displayName ?? localStorage.getItem('sl_display') ?? '');
      setGoal(d.goal ?? '');
      setBio(d.bio ?? '');
    }).catch(() => {
      setDisplayName(localStorage.getItem('sl_display') ?? myUsername);
    });
  }, [myUsername]);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2800);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (trimmed.length < 1 || trimmed.length > 30) {
      setNameErr('Display name must be 1–30 characters.');
      return;
    }
    setBusy(true);
    setNameErr('');
    try {
      const updated = await updateProfile(myUsername, trimmed, bio.trim(), goal.trim());
      setData(updated);
      setDisplayName(updated.displayName);
      localStorage.setItem('sl_display', updated.displayName);
      showToast('✓ Profile saved');
    } catch {
      showToast('⚠ Save failed — is the server running?');
    } finally {
      setBusy(false);
    }
  }

  const initial = (displayName.trim()[0] ?? '?').toUpperCase();

  return (
    <>
      <GameNav />
      <main className="page-wrap" style={{ maxWidth:880 }}>

        <motion.div
          initial={{ opacity:0, y:14 }}
          animate={{ opacity:1, y:0 }}
          transition={{ duration:0.3 }}
          style={{ marginBottom:32 }}
        >
          <div className="label-chip" style={{ marginBottom:10 }}>Scholar</div>
          <h1 className="fantasy-h1" style={{ fontSize:26 }}>
            Your Profile
          </h1>
        </motion.div>

        <div style={{
          display:'grid',
          gridTemplateColumns:'1fr 1fr',
          gap:20,
          alignItems:'start',
        }}>

          {/* ── Left: Edit form ── */}
          <motion.div
            initial={{ opacity:0, x:-14 }}
            animate={{ opacity:1, x:0 }}
            transition={{ duration:0.3, delay:0.06 }}
            className="game-card"
            style={{ padding:'28px 26px' }}
          >
            <div className="label-chip" style={{ marginBottom:18 }}>Identity</div>

            {/* Avatar */}
            <div style={{
              width:56, height:56, borderRadius:'50%',
              background:'rgba(245,158,11,0.1)',
              border:'2px solid rgba(245,158,11,0.22)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontFamily:"'Space Mono',monospace",
              fontSize:22, fontWeight:700, color:'var(--accent)',
              marginBottom:22,
              boxShadow:'0 0 20px rgba(245,158,11,0.14)',
            }}>
              [{initial}]
            </div>

            <form onSubmit={save}>
              {/* Username — read-only */}
              <div style={{ marginBottom:18 }}>
                <label style={{
                  display:'block',
                  fontFamily:"'Space Mono',monospace",
                  fontSize:11, color:'var(--muted)', letterSpacing:'0.06em', marginBottom:6,
                }}>
                  USERNAME <span style={{ color:'var(--dim)', fontWeight:400 }}>(cannot be changed)</span>
                </label>
                <div style={{
                  display:'flex', alignItems:'center',
                  background:'rgba(22,12,2,0.5)',
                  border:'1px solid var(--border)',
                  borderRadius:6, padding:'11px 14px',
                  fontFamily:"'Space Mono',monospace",
                  fontSize:14,
                }}>
                  <span style={{ color:'var(--accent)', marginRight:4 }}>@</span>
                  <span style={{ color:'var(--dim)' }}>{myUsername}</span>
                </div>
              </div>

              {/* Display Name */}
              <div style={{ marginBottom:18 }}>
                <label style={{
                  display:'block',
                  fontFamily:"'Space Mono',monospace",
                  fontSize:11, color:'var(--muted)', letterSpacing:'0.06em', marginBottom:6,
                }}>
                  DISPLAY NAME
                </label>
                <input
                  className={`game-input${nameErr ? ' error' : ''}`}
                  value={displayName}
                  onChange={e => { setDisplayName(e.target.value); setNameErr(''); }}
                  maxLength={30}
                  autoComplete="off"
                  spellCheck={false}
                />
                <div style={{ display:'flex', justifyContent:'space-between', marginTop:5, fontSize:11, color:'var(--dim)' }}>
                  {nameErr
                    ? <span style={{ color:'var(--red)' }}>{nameErr}</span>
                    : <span>1–30 characters</span>
                  }
                  <span>{displayName.length}/30</span>
                </div>
              </div>

              {/* Goal */}
              <div style={{ marginBottom:18 }}>
                <label style={{
                  display:'block',
                  fontFamily:"'Space Mono',monospace",
                  fontSize:11, color:'var(--muted)', letterSpacing:'0.06em', marginBottom:6,
                }}>
                  MY GOAL
                </label>
                <textarea
                  className="game-input"
                  value={goal}
                  onChange={e => setGoal(e.target.value)}
                  placeholder="What are you working toward?"
                  maxLength={200}
                  rows={3}
                  style={{ resize:'vertical', minHeight:72 }}
                />
                <div style={{ textAlign:'right', marginTop:4, fontSize:11, color:'var(--dim)' }}>
                  {goal.length}/200
                </div>
              </div>

              {/* Bio */}
              <div style={{ marginBottom:22 }}>
                <label style={{
                  display:'block',
                  fontFamily:"'Space Mono',monospace",
                  fontSize:11, color:'var(--muted)', letterSpacing:'0.06em', marginBottom:6,
                }}>
                  ABOUT ME
                </label>
                <textarea
                  className="game-input"
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  placeholder="Your prep stage, city, motivation…"
                  maxLength={300}
                  rows={3}
                  style={{ resize:'vertical', minHeight:72 }}
                />
                <div style={{ textAlign:'right', marginTop:4, fontSize:11, color:'var(--dim)' }}>
                  {bio.length}/300
                </div>
              </div>

              <button type="submit" className="btn-neon" style={{ width:'100%', justifyContent:'center' }} disabled={busy}>
                {busy ? 'SAVING…' : 'SAVE CHANGES'}
              </button>

              {data?.created_at && (
                <div style={{
                  marginTop:14,
                  fontFamily:"'Space Mono',monospace",
                  fontSize:10, color:'var(--dim)', letterSpacing:'0.06em',
                  textAlign:'center',
                }}>
                  Member since {new Date(data.created_at * 1000).toLocaleDateString('en-IN', {
                    year:'numeric', month:'long', day:'numeric',
                  })}
                </div>
              )}
            </form>
          </motion.div>

          {/* ── Right: Stats + Goal ── */}
          <motion.div
            initial={{ opacity:0, x:14 }}
            animate={{ opacity:1, x:0 }}
            transition={{ duration:0.3, delay:0.1 }}
            style={{ display:'flex', flexDirection:'column', gap:16 }}
          >
            {/* Stats */}
            <div className="game-card" style={{ padding:'24px 22px' }}>
              <div className="label-chip" style={{ marginBottom:18 }}>Study Stats</div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                <div className="stat-box" style={{ gridColumn:'1/-1' }}>
                  <div style={{
                    fontFamily:"'Space Mono',monospace",
                    fontSize:28, fontWeight:700, color:'var(--accent)',
                    lineHeight:1, marginBottom:6,
                    textShadow:'0 0 18px rgba(245,158,11,0.4)',
                  }}>
                    {data ? fmtTime(data.total_secs) : '—'}
                  </div>
                  <div style={{ fontSize:11, color:'var(--dim)', letterSpacing:'0.08em', textTransform:'uppercase' }}>
                    Total hours studied
                  </div>
                </div>
                <div className="stat-box">
                  <div style={{
                    fontFamily:"'Space Mono',monospace",
                    fontSize:22, fontWeight:700, color:'var(--accent)',
                    lineHeight:1, marginBottom:5,
                  }}>
                    {data ? fmtTime(data.weekly_secs) : '—'}
                  </div>
                  <div style={{ fontSize:10, color:'var(--dim)', letterSpacing:'0.06em', textTransform:'uppercase' }}>
                    This week
                  </div>
                </div>
                <div className="stat-box">
                  <div style={{
                    fontFamily:"'Space Mono',monospace",
                    fontSize:22, fontWeight:700, color:'var(--accent)',
                    lineHeight:1, marginBottom:5,
                  }}>
                    {data ? data.session_count : '—'}
                  </div>
                  <div style={{ fontSize:10, color:'var(--dim)', letterSpacing:'0.06em', textTransform:'uppercase' }}>
                    Sessions
                  </div>
                </div>
              </div>
            </div>

            {/* Goal display */}
            <div className="game-card" style={{ padding:'22px 22px' }}>
              <div className="label-chip" style={{ marginBottom:14 }}>Current Goal</div>
              {goal.trim() ? (
                <div style={{
                  fontSize:14, color:'var(--text)',
                  lineHeight:1.7,
                  fontStyle:'italic',
                  padding:'14px 16px',
                  background:'rgba(245,158,11,0.04)',
                  border:'1px solid rgba(245,158,11,0.11)',
                  borderRadius:6,
                }}>
                  &ldquo;{goal.trim()}&rdquo;
                </div>
              ) : (
                <div style={{
                  fontSize:13, color:'var(--dim)',
                  padding:'14px 16px',
                  background:'rgba(22,12,2,0.5)',
                  border:'1px solid var(--border)',
                  borderRadius:6,
                  fontFamily:"'Space Mono',monospace",
                  letterSpacing:'0.06em',
                }}>
                  No goal set yet.
                </div>
              )}
            </div>

            {/* Bio display */}
            {bio.trim() && (
              <div className="game-card" style={{ padding:'22px 22px' }}>
                <div className="label-chip" style={{ marginBottom:12 }}>About</div>
                <p style={{ fontSize:13, color:'var(--muted)', lineHeight:1.7 }}>
                  {bio.trim()}
                </p>
              </div>
            )}
          </motion.div>
        </div>
      </main>

      {/* Toast */}
      {toast && (
        <motion.div
          initial={{ opacity:0, y:12 }}
          animate={{ opacity:1, y:0 }}
          exit={{ opacity:0 }}
          style={{
            position:'fixed', bottom:28, left:'50%', transform:'translateX(-50%)',
            background:'rgba(245,158,11,0.11)',
            border:'1px solid rgba(245,158,11,0.3)',
            borderRadius:8, padding:'12px 28px',
            fontFamily:"'Space Mono',monospace",
            fontSize:12, color:'var(--accent)',
            letterSpacing:'0.08em', zIndex:300,
          }}
        >
          {toast}
        </motion.div>
      )}
    </>
  );
}

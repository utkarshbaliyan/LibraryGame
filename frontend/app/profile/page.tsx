'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import GameNav from '@/components/GameNav';
import { fetchProfile, updateProfile, type ProfileData } from '@/lib/api';

// ── Color palettes ─────────────────────────────────────────────────────────
const SKIN_TONES  = ['#fde8d0','#f5c5a3','#d4956e','#c07a4a','#8b5e3c','#5c3317'];
const HAIR_COLORS = ['#1a0a00','#3d1f0a','#7a4520','#d4a62a','#8b2500','#c8c8c8','#1e4a8b','#6b21a8'];
const SHIRT_COLORS= ['#f59e0b','#7c3aed','#0891b2','#dc2626','#16a34a','#db2777','#2563eb','#ea580c'];
const PANTS_COLORS= ['#1e2a4a','#1a1a2e','#4a2c0e','#8b7355','#1a3a1a','#3a3a4a'];
const SHOE_COLORS = ['#1a1008','#5c3317','#e8e8e8','#8b0000'];

interface CharApp { gender:string; skin:string; hair:string; shirt:string; pants:string; shoes:string; }

// ── Canvas character preview ───────────────────────────────────────────────
function hexN(h: string): number { return parseInt(h.replace('#',''),16); }
function lig(c: number): number {
  return (Math.min(255,(c>>16&0xff)+55)<<16)|(Math.min(255,(c>>8&0xff)+55)<<8)|Math.min(255,(c&0xff)+55);
}
function hexRgb(n: number, a = 1): string {
  const r=(n>>16)&0xff, g=(n>>8)&0xff, b=n&0xff;
  return a<1 ? 'rgba('+r+','+g+','+b+','+a+')' : 'rgb('+r+','+g+','+b+')';
}

function drawPreview(canvas: HTMLCanvasElement, app: CharApp) {
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const shirt = hexN(app.shirt), hair = hexN(app.hair);
  const skin  = hexN(app.skin),  pants= hexN(app.pants), shoes= hexN(app.shoes);
  const hl = lig(shirt);
  const isFemale = app.gender === 'female';

  ctx.save();
  ctx.translate(W / 2, H * 0.62);
  const S = 2.2; // scale
  ctx.scale(S, S);

  function ellipse(x: number, y: number, w: number, h: number) {
    ctx.beginPath(); ctx.ellipse(x, y, w/2, h/2, 0, 0, Math.PI*2); ctx.fill();
  }
  function circle(x: number, y: number, r: number) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
  }
  function rRect(x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
    ctx.quadraticCurveTo(x+w,y,x+w,y+r);
    ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
    ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath(); ctx.fill();
  }

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ellipse(0, 20, 26, 8);
  // Legs
  ctx.fillStyle = hexRgb(pants); ellipse(-6,13,10,14); ellipse(6,13,10,14);
  // Shoes
  ctx.fillStyle = hexRgb(shoes); ellipse(-6,20,10,6); ellipse(6,20,10,6);
  // Arms
  ctx.fillStyle = hexRgb(shirt); ellipse(-14,-1,9,16); ellipse(14,-1,9,16);
  // Body
  ctx.fillStyle = hexRgb(shirt); rRect(-10,-10,20,20,5);
  ctx.fillStyle = hexRgb(hl,0.2); rRect(-8,-8,8,9,3);
  // Neck
  ctx.fillStyle = hexRgb(skin); ellipse(0,-12,8,6);
  // Head
  ctx.fillStyle = hexRgb(skin); circle(0,-22,11);
  // Hair
  ctx.fillStyle = hexRgb(hair);
  if (isFemale) {
    ellipse(0,-30,24,13); ellipse(-12,-22,12,22); ellipse(12,-22,12,22);
    ellipse(-8,-12,8,10); ellipse(8,-12,8,10);
  } else {
    ellipse(0,-30,20,11); ellipse(-9,-24,7,12); ellipse(9,-24,7,12);
  }
  // Eyes
  ctx.fillStyle = 'rgb(26,10,0)'; circle(-4,-22,2.2); circle(4,-22,2.2);
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; circle(-3,-23,1); circle(5,-23,1);

  ctx.restore();
}

// ── Swatch row component ───────────────────────────────────────────────────
function Swatches({ colors, value, onChange }: { colors: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
      {colors.map(c => (
        <button key={c} onClick={() => onChange(c)} style={{
          width:28, height:28, borderRadius:'50%',
          background:c, border:'none', cursor:'pointer', padding:0,
          outline: value === c ? '2px solid #f5c842' : '2px solid transparent',
          outlineOffset:2,
          boxShadow: value === c ? '0 0 8px rgba(245,200,66,0.6)' : 'none',
          transition:'outline 0.12s, box-shadow 0.12s',
        }} />
      ))}
    </div>
  );
}

// ── Label ──────────────────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily:"'Space Mono',monospace", fontSize:10,
      color:'var(--muted)', letterSpacing:'0.08em', marginBottom:7, marginTop:14,
    }}>
      {children}
    </div>
  );
}

function fmtTime(secs: number): string {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m`;
  return m > 0 ? `${m}m` : '0m';
}

// ── Page ───────────────────────────────────────────────────────────────────
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
  const canvasRef  = useRef<HTMLCanvasElement>(null);

  // Character appearance
  const [app, setApp] = useState<CharApp>({
    gender: 'male',
    skin:   '#f5c5a3',
    hair:   '#1a0a00',
    shirt:  '#f59e0b',
    pants:  '#1e2a4a',
    shoes:  '#1a1008',
  });

  // Load from localStorage on mount
  useEffect(() => {
    const n = localStorage.getItem('sl_name');
    const d = localStorage.getItem('sl_display');
    if (!n || !d) { window.location.href = '/join'; return; }
    setMyUsername(n);
    setApp({
      gender: localStorage.getItem('sl_gender') || 'male',
      skin:   localStorage.getItem('sl_skin')   || '#f5c5a3',
      hair:   localStorage.getItem('sl_hair')   || '#1a0a00',
      shirt:  localStorage.getItem('sl_shirt')  || '#f59e0b',
      pants:  localStorage.getItem('sl_pants')  || '#1e2a4a',
      shoes:  localStorage.getItem('sl_shoes')  || '#1a1008',
    });
  }, []);

  // Fetch profile
  useEffect(() => {
    if (!myUsername) return;
    fetchProfile(myUsername).then(d => {
      setData(d);
      setDisplayName(d.displayName ?? localStorage.getItem('sl_display') ?? '');
      setGoal(d.goal ?? '');
      setBio(d.bio ?? '');
      // Merge server appearance (server is authoritative across devices)
      if (d.gender) {
        const serverApp: CharApp = {
          gender: d.gender,
          skin:   d.skinColor  || '#f5c5a3',
          hair:   d.hairColor  || '#1a0a00',
          shirt:  d.shirtColor || '#f59e0b',
          pants:  d.pantsColor || '#1e2a4a',
          shoes:  d.shoesColor || '#1a1008',
        };
        setApp(serverApp);
        persistApp(serverApp);
      }
    }).catch(() => {
      setDisplayName(localStorage.getItem('sl_display') ?? myUsername);
    });
  }, [myUsername]);

  // Redraw canvas when appearance changes
  useEffect(() => {
    if (canvasRef.current) drawPreview(canvasRef.current, app);
  }, [app]);

  function persistApp(a: CharApp) {
    localStorage.setItem('sl_gender', a.gender);
    localStorage.setItem('sl_skin',   a.skin);
    localStorage.setItem('sl_hair',   a.hair);
    localStorage.setItem('sl_shirt',  a.shirt);
    localStorage.setItem('sl_pants',  a.pants);
    localStorage.setItem('sl_shoes',  a.shoes);
  }

  const setField = useCallback((field: keyof CharApp, val: string) => {
    setApp(prev => { const next = {...prev, [field]: val}; persistApp(next); return next; });
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2800);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (trimmed.length < 1 || trimmed.length > 30) { setNameErr('Display name must be 1–30 characters.'); return; }
    setBusy(true); setNameErr('');
    try {
      const updated = await updateProfile(myUsername, trimmed, bio.trim(), goal.trim(), {
        gender: app.gender, skinColor: app.skin, hairColor: app.hair,
        shirtColor: app.shirt, pantsColor: app.pants, shoesColor: app.shoes,
      });
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
      <GameNav minimal />
      <main className="page-wrap" style={{ maxWidth:960 }}>

        <motion.div initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.3 }} style={{ marginBottom:32 }}>
          <div className="label-chip" style={{ marginBottom:10 }}>Scholar</div>
          <h1 className="fantasy-h1" style={{ fontSize:26 }}>Your Profile</h1>
        </motion.div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, alignItems:'start' }}>

          {/* ── Left col ── */}
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

            {/* Identity form */}
            <motion.div initial={{ opacity:0, x:-14 }} animate={{ opacity:1, x:0 }} transition={{ duration:0.3, delay:0.06 }}
              className="game-card" style={{ padding:'28px 26px' }}>
              <div className="label-chip" style={{ marginBottom:18 }}>Identity</div>

              <div style={{
                width:56, height:56, borderRadius:'50%',
                background:'rgba(245,158,11,0.1)', border:'2px solid rgba(245,158,11,0.22)',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontFamily:"'Space Mono',monospace", fontSize:22, fontWeight:700, color:'var(--accent)',
                marginBottom:22, boxShadow:'0 0 20px rgba(245,158,11,0.14)',
              }}>
                [{initial}]
              </div>

              <form onSubmit={save}>
                <div style={{ marginBottom:18 }}>
                  <label style={{ display:'block', fontFamily:"'Space Mono',monospace", fontSize:11, color:'var(--muted)', letterSpacing:'0.06em', marginBottom:6 }}>
                    USERNAME <span style={{ color:'var(--dim)', fontWeight:400 }}>(cannot be changed)</span>
                  </label>
                  <div style={{ display:'flex', alignItems:'center', background:'rgba(22,12,2,0.5)', border:'1px solid var(--border)', borderRadius:6, padding:'11px 14px', fontFamily:"'Space Mono',monospace", fontSize:14 }}>
                    <span style={{ color:'var(--accent)', marginRight:4 }}>@</span>
                    <span style={{ color:'var(--dim)' }}>{myUsername}</span>
                  </div>
                </div>

                <div style={{ marginBottom:18 }}>
                  <label style={{ display:'block', fontFamily:"'Space Mono',monospace", fontSize:11, color:'var(--muted)', letterSpacing:'0.06em', marginBottom:6 }}>DISPLAY NAME</label>
                  <input className={`game-input${nameErr ? ' error' : ''}`} value={displayName}
                    onChange={e => { setDisplayName(e.target.value); setNameErr(''); }} maxLength={30} autoComplete="off" spellCheck={false} />
                  <div style={{ display:'flex', justifyContent:'space-between', marginTop:5, fontSize:11, color:'var(--dim)' }}>
                    {nameErr ? <span style={{ color:'var(--red)' }}>{nameErr}</span> : <span>1–30 characters</span>}
                    <span>{displayName.length}/30</span>
                  </div>
                </div>

                <div style={{ marginBottom:18 }}>
                  <label style={{ display:'block', fontFamily:"'Space Mono',monospace", fontSize:11, color:'var(--muted)', letterSpacing:'0.06em', marginBottom:6 }}>MY GOAL</label>
                  <textarea className="game-input" value={goal} onChange={e => setGoal(e.target.value)}
                    placeholder="What are you working toward?" maxLength={200} rows={3} style={{ resize:'vertical', minHeight:72 }} />
                  <div style={{ textAlign:'right', marginTop:4, fontSize:11, color:'var(--dim)' }}>{goal.length}/200</div>
                </div>

                <div style={{ marginBottom:22 }}>
                  <label style={{ display:'block', fontFamily:"'Space Mono',monospace", fontSize:11, color:'var(--muted)', letterSpacing:'0.06em', marginBottom:6 }}>ABOUT ME</label>
                  <textarea className="game-input" value={bio} onChange={e => setBio(e.target.value)}
                    placeholder="Your prep stage, city, motivation…" maxLength={300} rows={3} style={{ resize:'vertical', minHeight:72 }} />
                  <div style={{ textAlign:'right', marginTop:4, fontSize:11, color:'var(--dim)' }}>{bio.length}/300</div>
                </div>

                <button type="submit" className="btn-neon" style={{ width:'100%', justifyContent:'center' }} disabled={busy}>
                  {busy ? 'SAVING…' : 'SAVE CHANGES'}
                </button>

                {data?.created_at && (
                  <div style={{ marginTop:14, fontFamily:"'Space Mono',monospace", fontSize:10, color:'var(--dim)', letterSpacing:'0.06em', textAlign:'center' }}>
                    Member since {new Date(data.created_at * 1000).toLocaleDateString('en-IN', { year:'numeric', month:'long', day:'numeric' })}
                  </div>
                )}
              </form>
            </motion.div>

            {/* Character customization */}
            <motion.div initial={{ opacity:0, x:-14 }} animate={{ opacity:1, x:0 }} transition={{ duration:0.3, delay:0.12 }}
              className="game-card" style={{ padding:'24px 26px' }}>
              <div className="label-chip" style={{ marginBottom:18 }}>Character</div>

              <div style={{ display:'flex', gap:24, alignItems:'flex-start' }}>
                {/* Preview canvas */}
                <div style={{
                  flexShrink:0, background:'rgba(10,6,2,0.8)',
                  border:'1px solid var(--border)', borderRadius:8,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  width:110, height:150,
                }}>
                  <canvas ref={canvasRef} width={110} height={150} style={{ display:'block' }} />
                </div>

                {/* Controls */}
                <div style={{ flex:1, minWidth:0 }}>

                  {/* Gender */}
                  <Label>GENDER</Label>
                  <div style={{ display:'flex', gap:8, marginBottom:4 }}>
                    {(['male','female'] as const).map(g => (
                      <button key={g} onClick={() => setField('gender', g)} style={{
                        flex:1, padding:'7px 0', borderRadius:6, cursor:'pointer',
                        fontFamily:"'Space Mono',monospace", fontSize:10, letterSpacing:'0.06em',
                        background: app.gender === g ? 'rgba(245,200,66,0.15)' : 'rgba(255,255,255,0.04)',
                        border: app.gender === g ? '1px solid #f5c842' : '1px solid var(--border)',
                        color: app.gender === g ? '#f5c842' : 'var(--dim)',
                        transition:'all 0.15s',
                      }}>
                        {g === 'male' ? '♂ MALE' : '♀ FEMALE'}
                      </button>
                    ))}
                  </div>

                  <Label>SKIN TONE</Label>
                  <Swatches colors={SKIN_TONES}  value={app.skin}  onChange={c => setField('skin', c)} />

                  <Label>HAIR</Label>
                  <Swatches colors={HAIR_COLORS} value={app.hair}  onChange={c => setField('hair', c)} />

                  <Label>CLOTHING</Label>
                  <Swatches colors={SHIRT_COLORS} value={app.shirt} onChange={c => setField('shirt', c)} />

                  <Label>PANTS</Label>
                  <Swatches colors={PANTS_COLORS} value={app.pants} onChange={c => setField('pants', c)} />

                  <Label>SHOES</Label>
                  <Swatches colors={SHOE_COLORS}  value={app.shoes} onChange={c => setField('shoes', c)} />

                </div>
              </div>
            </motion.div>
          </div>

          {/* ── Right col ── */}
          <motion.div initial={{ opacity:0, x:14 }} animate={{ opacity:1, x:0 }} transition={{ duration:0.3, delay:0.1 }}
            style={{ display:'flex', flexDirection:'column', gap:16 }}>

            <div className="game-card" style={{ padding:'24px 22px' }}>
              <div className="label-chip" style={{ marginBottom:18 }}>Study Stats</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                <div className="stat-box" style={{ gridColumn:'1/-1' }}>
                  <div style={{ fontFamily:"'Space Mono',monospace", fontSize:28, fontWeight:700, color:'var(--accent)', lineHeight:1, marginBottom:6, textShadow:'0 0 18px rgba(245,158,11,0.4)' }}>
                    {data ? fmtTime(data.total_secs) : '—'}
                  </div>
                  <div style={{ fontSize:11, color:'var(--dim)', letterSpacing:'0.08em', textTransform:'uppercase' }}>Total hours studied</div>
                </div>
                <div className="stat-box">
                  <div style={{ fontFamily:"'Space Mono',monospace", fontSize:22, fontWeight:700, color:'var(--accent)', lineHeight:1, marginBottom:5 }}>
                    {data ? fmtTime(data.weekly_secs) : '—'}
                  </div>
                  <div style={{ fontSize:10, color:'var(--dim)', letterSpacing:'0.06em', textTransform:'uppercase' }}>This week</div>
                </div>
                <div className="stat-box">
                  <div style={{ fontFamily:"'Space Mono',monospace", fontSize:22, fontWeight:700, color:'var(--accent)', lineHeight:1, marginBottom:5 }}>
                    {data ? data.session_count : '—'}
                  </div>
                  <div style={{ fontSize:10, color:'var(--dim)', letterSpacing:'0.06em', textTransform:'uppercase' }}>Sessions</div>
                </div>
              </div>
            </div>

            {goal.trim() && (
              <div className="game-card" style={{ padding:'22px 22px' }}>
                <div className="label-chip" style={{ marginBottom:14 }}>Current Goal</div>
                <div style={{ fontSize:14, color:'var(--text)', lineHeight:1.7, fontStyle:'italic', padding:'14px 16px', background:'rgba(245,158,11,0.04)', border:'1px solid rgba(245,158,11,0.11)', borderRadius:6 }}>
                  &ldquo;{goal.trim()}&rdquo;
                </div>
              </div>
            )}

            {bio.trim() && (
              <div className="game-card" style={{ padding:'22px 22px' }}>
                <div className="label-chip" style={{ marginBottom:12 }}>About</div>
                <p style={{ fontSize:13, color:'var(--muted)', lineHeight:1.7 }}>{bio.trim()}</p>
              </div>
            )}
          </motion.div>
        </div>
      </main>

      {toast && (
        <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }} style={{
          position:'fixed', bottom:28, left:'50%', transform:'translateX(-50%)',
          background:'rgba(245,158,11,0.11)', border:'1px solid rgba(245,158,11,0.3)',
          borderRadius:8, padding:'12px 28px', fontFamily:"'Space Mono',monospace",
          fontSize:12, color:'var(--accent)', letterSpacing:'0.08em', zIndex:300,
        }}>
          {toast}
        </motion.div>
      )}
    </>
  );
}

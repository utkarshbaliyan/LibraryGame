'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { checkUsername } from '@/lib/api';

const COLORS = [
  { hex: '#4ade80', label: 'JADE' },
  { hex: '#818cf8', label: 'IRIS' },
  { hex: '#f59e0b', label: 'AMBER' },
  { hex: '#f87171', label: 'RUBY' },
  { hex: '#38bdf8', label: 'AQUA' },
  { hex: '#e879f9', label: 'NEON' },
  { hex: '#fb923c', label: 'EMBER' },
  { hex: '#a3e635', label: 'LIME' },
];

type Step = 'username' | 'identity';

export default function JoinPage() {
  const router = useRouter();
  const [step, setStep]           = useState<Step>('username');
  const [username, setUsername]   = useState('');
  const [displayName, setDisplayName] = useState('');
  const [color, setColor]         = useState(COLORS[0].hex);
  const [usernameErr, setUsernameErr] = useState('');
  const [checking, setChecking]   = useState(false);
  const [displayErr, setDisplayErr] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    // If already set up, go home
    if (localStorage.getItem('sl_name') && localStorage.getItem('sl_display')) {
      router.replace('/');
    }
    const savedColor = localStorage.getItem('sl_color');
    if (savedColor) setColor(savedColor);
  }, [router]);

  // Debounced username availability check
  useEffect(() => {
    if (step !== 'username') return;
    const u = username.toLowerCase().trim();
    if (u.length < 3) { setUsernameErr(''); setChecking(false); return; }
    if (!/^[a-z0-9_]+$/.test(u)) {
      setUsernameErr('Only letters, numbers and _ allowed');
      setChecking(false);
      return;
    }
    setChecking(true);
    setUsernameErr('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const { available, error } = await checkUsername(u);
        if (!available) setUsernameErr(error ?? 'Username taken');
        else setUsernameErr('');
      } catch {
        setUsernameErr('');
      } finally {
        setChecking(false);
      }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [username, step]);

  function submitUsername(e: React.FormEvent) {
    e.preventDefault();
    const u = username.toLowerCase().trim();
    if (u.length < 3 || u.length > 20) { setUsernameErr('3–20 characters required'); return; }
    if (!/^[a-z0-9_]+$/.test(u)) { setUsernameErr('Only letters, numbers and _ allowed'); return; }
    if (usernameErr || checking) return;
    setDisplayName(u); // pre-fill display name with username
    setStep('identity');
  }

  function submitIdentity(e: React.FormEvent) {
    e.preventDefault();
    const dn = displayName.trim();
    if (dn.length < 1 || dn.length > 30) { setDisplayErr('1–30 characters required'); return; }
    const u = username.toLowerCase().trim();
    localStorage.setItem('sl_name', u);       // username (unique handle)
    localStorage.setItem('sl_display', dn);   // display name
    localStorage.setItem('sl_color', color);
    router.push('/');
  }

  const usernameOk = username.length >= 3 && !usernameErr && !checking;

  return (
    <div style={{
      minHeight:'100vh', display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center', padding:24,
    }}>
      {/* Logo */}
      <motion.div
        initial={{ opacity:0, y:-12 }} animate={{ opacity:1, y:0 }}
        transition={{ duration:0.3 }}
        style={{ marginBottom:36, textAlign:'center' }}
      >
        <Link href="/" style={{ textDecoration:'none' }}>
          <div style={{
            fontFamily:"var(--font-cinzel, serif)", fontSize:22, fontWeight:700,
            letterSpacing:'0.14em', color:'var(--accent)',
            textShadow:'0 0 28px rgba(245,158,11,0.55)', marginBottom:6,
          }}>
            ◆ FOCUS LIBRARY
          </div>
        </Link>
        <div style={{
          fontFamily:"'Space Mono',monospace", fontSize:9,
          letterSpacing:'0.28em', color:'var(--dim)', textTransform:'uppercase',
        }}>
          Scholar Registration
        </div>
      </motion.div>

      {/* Step indicator */}
      <div style={{
        display:'flex', alignItems:'center', gap:8, marginBottom:28,
      }}>
        {(['username','identity'] as Step[]).map((s, i) => (
          <div key={s} style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{
              width:28, height:28, borderRadius:'50%',
              background: step === s ? 'var(--accent)' : (
                (s === 'username' && step === 'identity') ? 'rgba(245,158,11,0.22)' : 'rgba(255,255,255,0.05)'
              ),
              border: step === s ? '2px solid var(--accent)' : '2px solid var(--border)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontFamily:"'Space Mono',monospace", fontSize:11, fontWeight:700,
              color: step === s ? '#0b0600' : 'var(--dim)',
              transition:'all 0.2s',
            }}>
              {s === 'username' && step === 'identity' ? '✓' : i+1}
            </div>
            <span style={{
              fontFamily:"'Space Mono',monospace", fontSize:10,
              color: step === s ? 'var(--accent)' : 'var(--dim)',
              letterSpacing:'0.1em', textTransform:'uppercase',
            }}>
              {s === 'username' ? 'Username' : 'Identity'}
            </span>
            {i < 1 && (
              <div style={{ width:32, height:1, background:'var(--border)', marginLeft:4, marginRight:4 }} />
            )}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 'username' ? (
          <motion.div
            key="username"
            className="modal-panel"
            initial={{ opacity:0, x:-20 }}
            animate={{ opacity:1, x:0 }}
            exit={{ opacity:0, x:-20 }}
            transition={{ duration:0.22 }}
            style={{ maxWidth:440 }}
          >
            <div className="label-chip" style={{ marginBottom:12 }}>Step 1 of 2</div>
            <h1 style={{
              fontFamily:"'Space Mono',monospace", fontSize:19, fontWeight:700,
              marginBottom:6, letterSpacing:'-0.01em',
            }}>
              Choose your username
            </h1>
            <p style={{ fontSize:13, color:'var(--muted)', marginBottom:24, lineHeight:1.6 }}>
              This is your <strong style={{ color:'var(--text)' }}>unique handle</strong> — used by others to find and add you as a friend.
              It cannot be changed later.
            </p>

            <form onSubmit={submitUsername}>
              <div style={{ marginBottom:22 }}>
                <label style={{
                  display:'block', fontFamily:"'Space Mono',monospace",
                  fontSize:11, color:'var(--muted)', letterSpacing:'0.08em', marginBottom:7,
                }}>
                  USERNAME
                </label>

                {/* Prefixed input */}
                <div style={{
                  display:'flex', alignItems:'center',
                  background:'rgba(22,12,2,0.9)',
                  border:`1px solid ${usernameErr ? 'var(--red)' : usernameOk ? 'rgba(212,162,62,0.5)' : 'var(--border)'}`,
                  borderRadius:6,
                  transition:'border-color 0.18s, box-shadow 0.18s',
                  boxShadow: usernameOk ? '0 0 0 3px rgba(245,158,11,0.07)' : 'none',
                }}>
                  <span style={{
                    fontFamily:"'Space Mono',monospace", fontSize:14,
                    color:'var(--accent)', padding:'11px 8px 11px 14px', flexShrink:0,
                  }}>@</span>
                  <input
                    style={{
                      flex:1, background:'transparent', border:'none', outline:'none',
                      fontFamily:"'Space Mono',monospace", fontSize:14,
                      color:'var(--text)', padding:'11px 14px 11px 0',
                    }}
                    value={username}
                    onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,''))}
                    placeholder="your_handle"
                    maxLength={20}
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <span style={{ padding:'0 12px', flexShrink:0, fontSize:11, color:'var(--dim)' }}>
                    {checking ? '…' : usernameOk ? '✓' : ''}
                  </span>
                </div>

                <div style={{ display:'flex', justifyContent:'space-between', marginTop:5, fontSize:11 }}>
                  {usernameErr ? (
                    <span style={{ color:'var(--red)' }}>{usernameErr}</span>
                  ) : usernameOk ? (
                    <span style={{ color:'var(--accent)' }}>Available!</span>
                  ) : (
                    <span style={{ color:'var(--dim)' }}>3–20 chars, letters/numbers/_ only</span>
                  )}
                  <span style={{ color:'var(--dim)' }}>{username.length}/20</span>
                </div>
              </div>

              <button
                type="submit"
                className="btn-neon"
                style={{ width:'100%', justifyContent:'center' }}
                disabled={!usernameOk || checking}
              >
                CONTINUE →
              </button>
            </form>
          </motion.div>
        ) : (
          <motion.div
            key="identity"
            className="modal-panel"
            initial={{ opacity:0, x:20 }}
            animate={{ opacity:1, x:0 }}
            exit={{ opacity:0, x:20 }}
            transition={{ duration:0.22 }}
            style={{ maxWidth:440 }}
          >
            <div className="label-chip" style={{ marginBottom:12 }}>Step 2 of 2</div>
            <h1 style={{
              fontFamily:"'Space Mono',monospace", fontSize:19, fontWeight:700,
              marginBottom:6, letterSpacing:'-0.01em',
            }}>
              Customize your identity
            </h1>
            <p style={{ fontSize:13, color:'var(--muted)', marginBottom:24, lineHeight:1.6 }}>
              Your <strong style={{ color:'var(--text)' }}>display name</strong> appears on your avatar in the library. Choose your color too.
            </p>

            <form onSubmit={submitIdentity}>
              {/* Display name */}
              <div style={{ marginBottom:22 }}>
                <label style={{
                  display:'block', fontFamily:"'Space Mono',monospace",
                  fontSize:11, color:'var(--muted)', letterSpacing:'0.08em', marginBottom:7,
                }}>
                  DISPLAY NAME
                </label>
                <input
                  className={`game-input${displayErr ? ' error' : ''}`}
                  value={displayName}
                  onChange={e => { setDisplayName(e.target.value); setDisplayErr(''); }}
                  placeholder="How you appear in the library"
                  maxLength={30}
                  autoFocus
                  autoComplete="off"
                />
                <div style={{ display:'flex', justifyContent:'space-between', marginTop:5, fontSize:11, color:'var(--dim)' }}>
                  {displayErr ? <span style={{ color:'var(--red)' }}>{displayErr}</span> : <span>1–30 characters</span>}
                  <span>{displayName.length}/30</span>
                </div>
              </div>

              {/* Color */}
              <div style={{ marginBottom:24 }}>
                <label style={{
                  display:'block', fontFamily:"'Space Mono',monospace",
                  fontSize:11, color:'var(--muted)', letterSpacing:'0.08em', marginBottom:10,
                }}>
                  AVATAR COLOR — <span style={{ color }}>{COLORS.find(c=>c.hex===color)?.label}</span>
                </label>
                <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                  {COLORS.map(c => (
                    <button
                      key={c.hex} type="button" onClick={() => setColor(c.hex)} title={c.label}
                      style={{
                        width:36, height:36, borderRadius:'50%', background:c.hex, cursor:'pointer',
                        border: color===c.hex ? '3px solid white' : '3px solid transparent',
                        outline: color===c.hex ? `2px solid ${c.hex}` : 'none',
                        outlineOffset:2,
                        transform: color===c.hex ? 'scale(1.18)' : 'scale(1)',
                        boxShadow: color===c.hex ? `0 0 14px ${c.hex}88` : 'none',
                        transition:'transform 0.15s, box-shadow 0.15s',
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div style={{
                display:'flex', alignItems:'center', gap:14, padding:'14px 16px',
                background:'rgba(22,12,2,0.9)', border:'1px solid var(--border)',
                borderRadius:8, marginBottom:22,
              }}>
                <div style={{
                  width:34, height:34, borderRadius:'50%', background:color,
                  boxShadow:`0 0 16px ${color}66`, flexShrink:0,
                }} />
                <div>
                  <div style={{ fontFamily:"'Space Mono',monospace", fontSize:13, fontWeight:700 }}>
                    {displayName.trim() || username}
                  </div>
                  <div style={{ fontSize:11, color:'var(--dim)', marginTop:2 }}>
                    @{username}
                  </div>
                </div>
              </div>

              <div style={{ display:'flex', gap:10 }}>
                <button type="button" className="btn-ghost" onClick={() => setStep('username')}>
                  ← BACK
                </button>
                <button type="submit" className="btn-neon" style={{ flex:1, justifyContent:'center' }}>
                  ENTER LOBBY →
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

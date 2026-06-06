'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import GameNav from '@/components/GameNav';
import {
  fetchFriends, sendFriendRequest, acceptFriendRequest,
  removeFriend, blockUser, unblockUser, inviteFriend,
  searchUsers, type FriendEntry, type FriendList,
} from '@/lib/api';

// ── Small components ───────────────────────────────────────────────────────

function OnlineBadge({ online, roomLabel }: { online?: boolean; roomLabel?: string | null }) {
  if (!online) return (
    <span style={{ fontFamily:"'Space Mono',monospace", fontSize:9, color:'var(--dim)', letterSpacing:'0.08em' }}>
      offline
    </span>
  );
  return (
    <span style={{ display:'flex', alignItems:'center', gap:5 }}>
      <span className="live-dot" style={{ width:6, height:6 }} />
      <span style={{ fontFamily:"'Space Mono',monospace", fontSize:9, color:'var(--accent)', letterSpacing:'0.06em' }}>
        {roomLabel ? `in ${roomLabel}` : 'online'}
      </span>
    </span>
  );
}

function AvatarChip({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div style={{
      width:size, height:size, borderRadius:'50%',
      background:'rgba(245,158,11,0.1)',
      border:'1px solid rgba(245,158,11,0.18)',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontFamily:"'Space Mono',monospace", fontSize:size*0.35,
      fontWeight:700, color:'var(--accent)', flexShrink:0,
    }}>
      {name.slice(0,1).toUpperCase()}
    </div>
  );
}

interface FriendRowProps {
  entry: FriendEntry;
  myUsername: string;
  onRemove: (u: string) => void;
  onBlock:  (u: string) => void;
  onInvite: (u: string) => void;
  onChat:   (u: string, display: string) => void;
  unread?: number;
}

function FriendRow({ entry, myUsername, onRemove, onBlock, onInvite, onChat, unread = 0 }: FriendRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  return (
    <motion.div
      initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
      style={{
        display:'flex', alignItems:'center', gap:12,
        padding:'12px 16px',
        borderBottom:'1px solid var(--border)',
      }}
    >
      <AvatarChip name={entry.displayName} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>
          {entry.displayName}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:2 }}>
          <span style={{
            fontFamily:"'Space Mono',monospace", fontSize:10, color:'var(--dim)',
          }}>
            @{entry.username}
          </span>
          <OnlineBadge online={entry.online} roomLabel={entry.roomLabel} />
        </div>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        <button
          className="btn-ghost"
          style={{ fontSize:9, padding:'5px 12px', position:'relative' }}
          onClick={() => onChat(entry.username, entry.displayName)}
        >
          CHAT
          {unread > 0 && (
            <span style={{
              position:'absolute', top:-5, right:-5,
              background:'var(--red)', color:'#fff',
              borderRadius:99, fontSize:8, fontWeight:700,
              padding:'1px 4px', lineHeight:'13px',
            }}>{unread > 9 ? '9+' : unread}</span>
          )}
        </button>
        {entry.online && entry.roomId && (
          <button
            className="btn-neon"
            style={{ fontSize:9, padding:'5px 12px' }}
            onClick={() => onInvite(entry.username)}
          >
            INVITE
          </button>
        )}

        {/* Kebab menu */}
        <div style={{ position:'relative' }} ref={menuRef}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            style={{
              background:'none', border:'1px solid var(--border)',
              borderRadius:4, cursor:'pointer',
              padding:'5px 10px', color:'var(--dim)',
              fontFamily:"'Space Mono',monospace", fontSize:14,
              lineHeight:1, transition:'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => {e.currentTarget.style.borderColor='var(--border-hi)';e.currentTarget.style.color='var(--muted)';}}
            onMouseLeave={e => {e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.color='var(--dim)';}}
          >
            ⋮
          </button>
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity:0, y:-4 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                style={{
                  position:'absolute', right:0, top:'calc(100% + 4px)',
                  background:'var(--card)', border:'1px solid var(--border)',
                  borderRadius:6, zIndex:50, minWidth:140,
                  boxShadow:'0 8px 24px rgba(0,0,0,0.4)',
                  overflow:'hidden',
                }}
              >
                {[
                  { label:'Remove friend', action:() => { onRemove(entry.username); setMenuOpen(false); }, color:'var(--muted)' },
                  { label:'Block user',    action:() => { onBlock(entry.username);  setMenuOpen(false); }, color:'var(--red)' },
                ].map(item => (
                  <button
                    key={item.label}
                    onClick={item.action}
                    style={{
                      display:'block', width:'100%', padding:'10px 14px',
                      background:'none', border:'none', cursor:'pointer',
                      fontFamily:"'Space Mono',monospace", fontSize:11,
                      color:item.color, textAlign:'left', letterSpacing:'0.06em',
                      transition:'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background='none'}
                  >
                    {item.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

// ── Section header ─────────────────────────────────────────────────────────
function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:10,
      padding:'12px 16px 8px',
      borderBottom:'1px solid var(--border)',
    }}>
      <span className="label-chip" style={{ fontSize:9 }}>{label}</span>
      {count > 0 && (
        <span style={{
          fontFamily:"'Space Mono',monospace", fontSize:10,
          background:'rgba(245,158,11,0.11)', color:'var(--accent)',
          padding:'1px 7px', borderRadius:10,
        }}>
          {count}
        </span>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
interface ChatMsg { id: number; from: string; fromDisplay?: string; to: string; body: string; createdAt: number; }

export default function FriendsPage() {
  const router = useRouter();
  const [myUsername, setMyUsername] = useState('');
  const [myRoomId, setMyRoomId]     = useState<string | null>(null);
  const [friends, setFriends]       = useState<FriendList>({ friends:[], sent:[], received:[], blocked:[] });
  const [searchQ, setSearchQ]       = useState('');
  const [searchResults, setSearchResults] = useState<FriendEntry[]>([]);
  const [searchBusy, setSearchBusy]  = useState(false);
  const [tab, setTab]                = useState<'friends'|'search'|'blocked'|'chat'>('friends');
  const [toast, setToast]            = useState('');
  const [loading, setLoading]        = useState(true);
  // ── Chat state ──────────────────────────────────────────────────────────
  const [chatFriend, setChatFriend]         = useState<string|null>(null);
  const [chatFriendDisplay, setChatFriendDisplay] = useState('');
  const [chatMessages, setChatMessages]     = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput]           = useState('');
  const [unread, setUnread]                 = useState<Record<string,number>>({});
  const chatBottomRef                       = useRef<HTMLDivElement>(null);
  const toastRef = useRef<ReturnType<typeof setTimeout>>(null);
  const searchRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    const u = localStorage.getItem('sl_name');
    if (!u) { router.push('/join'); return; }
    setMyUsername(u);
    setMyRoomId(localStorage.getItem('sl_roomId'));
  }, [router]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(''), 2800);
  }, []);

  const loadFriends = useCallback(async () => {
    if (!myUsername) return;
    try {
      const data = await fetchFriends(myUsername);
      setFriends(data);
    } catch { /* non-critical */ }
    finally { setLoading(false); }
  }, [myUsername]);

  useEffect(() => { loadFriends(); }, [loadFriends]);
  useEffect(() => {
    const iv = setInterval(loadFriends, 10000);
    return () => clearInterval(iv);
  }, [loadFriends]);

  // Unread counts
  useEffect(() => {
    if (!myUsername) return;
    const poll = () => fetch(`http://localhost:2567/chat/unread/${myUsername}`)
      .then(r => r.json()).then(d => setUnread(d)).catch(() => {});
    poll();
    const iv = setInterval(poll, 12000);
    return () => clearInterval(iv);
  }, [myUsername]);

  // Poll history when conversation open
  useEffect(() => {
    if (!chatFriend || !myUsername) return;
    const poll = () => fetch(`http://localhost:2567/chat/history/${myUsername}/${chatFriend}`)
      .then(r => r.json()).then(msgs => {
        setChatMessages(msgs);
        setUnread(prev => { const n = { ...prev }; delete n[chatFriend!]; return n; });
      }).catch(() => {});
    poll();
    const iv = setInterval(poll, 5000);
    return () => clearInterval(iv);
  }, [chatFriend, myUsername]);

  // Auto-scroll
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior:'smooth' });
  }, [chatMessages]);

  const openChat = useCallback((username: string, display: string) => {
    setChatFriend(username);
    setChatFriendDisplay(display);
    setChatMessages([]);
    setTab('chat');
    setUnread(prev => { const n = { ...prev }; delete n[username]; return n; });
  }, []);

  const sendChat = useCallback(async () => {
    const body = chatInput.trim();
    if (!body || !chatFriend || !myUsername) return;
    setChatInput('');
    try {
      const r = await fetch('http://localhost:2567/chat/send', {
        method:'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ from: myUsername, to: chatFriend, body }),
      });
      const saved = await r.json();
      if (saved.ok) {
        const msg: ChatMsg = { id: saved.id, from: myUsername, to: chatFriend, body, createdAt: saved.createdAt };
        setChatMessages(prev => [...prev, msg]);
      }
    } catch { /* best effort */ }
  }, [chatInput, chatFriend, myUsername]);

  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);

  // Debounced search
  useEffect(() => {
    const q = searchQ.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    if (searchRef.current) clearTimeout(searchRef.current);
    setSearchBusy(true);
    searchRef.current = setTimeout(async () => {
      try {
        const results = await searchUsers(q, myUsername);
        setSearchResults(results);
      } catch { setSearchResults([]); }
      finally { setSearchBusy(false); }
    }, 350);
    return () => { if (searchRef.current) clearTimeout(searchRef.current); };
  }, [searchQ, myUsername]);

  async function handleSendRequest(toUsername: string) {
    try {
      await sendFriendRequest(myUsername, toUsername);
      showToast(`Friend request sent to @${toUsername}`);
      loadFriends();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to send request');
    }
  }

  async function handleAccept(fromUsername: string) {
    try {
      await acceptFriendRequest(myUsername, fromUsername);
      showToast(`Now friends with @${fromUsername}!`);
      loadFriends();
    } catch { showToast('Failed to accept'); }
  }

  async function handleReject(fromUsername: string) {
    await removeFriend(myUsername, fromUsername);
    showToast(`Request from @${fromUsername} removed`);
    loadFriends();
  }

  async function handleRemove(u: string) {
    if (!confirm(`Remove @${u} from friends?`)) return;
    await removeFriend(myUsername, u);
    showToast(`Removed @${u}`);
    loadFriends();
  }

  async function handleBlock(u: string) {
    if (!confirm(`Block @${u}? They won't be able to send you requests.`)) return;
    await blockUser(myUsername, u);
    showToast(`Blocked @${u}`);
    loadFriends();
  }

  async function handleUnblock(u: string) {
    await unblockUser(myUsername, u);
    showToast(`Unblocked @${u}`);
    loadFriends();
  }

  async function handleInvite(toUsername: string) {
    if (!myRoomId) { showToast('You must be in a library to invite'); return; }
    try {
      await inviteFriend(myUsername, toUsername, myRoomId);
      showToast(`Invite sent to @${toUsername}!`);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to send invite');
    }
  }

  // Figure out relationship with a search result
  function getRelation(username: string): 'none'|'friend'|'sent'|'received'|'blocked' {
    if (friends.friends.some(f => f.username === username))  return 'friend';
    if (friends.sent.some(f => f.username === username))     return 'sent';
    if (friends.received.some(f => f.username === username)) return 'received';
    if (friends.blocked.some(f => f.username === username))  return 'blocked';
    return 'none';
  }

  const pendingCount = friends.received.length;

  return (
    <>
      <GameNav />
      <main className="page-wrap" style={{ maxWidth:800 }}>

        {/* Header */}
        <motion.div
          initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }}
          transition={{ duration:0.3 }} style={{ marginBottom:28 }}
        >
          <div className="label-chip" style={{ marginBottom:10 }}>Companions</div>
          <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
            <div>
              <h1 className="fantasy-h1" style={{ fontSize:24, marginBottom:4 }}>
                Friends
              </h1>
              <div style={{ fontSize:12, color:'var(--dim)' }}>
                @{myUsername}
                {friends.friends.filter(f => f.online).length > 0 && (
                  <span style={{ marginLeft:10, color:'var(--accent)' }}>
                    · {friends.friends.filter(f => f.online).length} online
                  </span>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:4, marginBottom:20, flexWrap:'wrap' }}>
          {([
            { key:'friends', label:'Friends',     count: friends.friends.length },
            { key:'chat',    label:'Chat',         count: totalUnread },
            { key:'search',  label:'Find People',  count: 0 },
            { key:'blocked', label:'Blocked',      count: friends.blocked.length },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                fontFamily:"'Space Mono',monospace",
                fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase',
                padding:'7px 14px', borderRadius:4, cursor:'pointer', border:'none',
                background: tab === t.key ? 'var(--accent)' : 'rgba(255,255,255,0.04)',
                color: tab === t.key ? '#030308' : 'var(--dim)',
                transition:'background 0.15s, color 0.15s',
                display:'flex', alignItems:'center', gap:7,
              }}
            >
              {t.label}
              {t.count > 0 && (
                <span style={{
                  fontSize:9,
                  background: tab === t.key ? 'rgba(0,0,0,0.2)' : 'rgba(245,158,11,0.14)',
                  color: tab === t.key ? '#030308' : 'var(--accent)',
                  padding:'1px 5px', borderRadius:8,
                }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Friends tab ── */}
        {tab === 'friends' && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

            {/* Pending received requests */}
            {pendingCount > 0 && (
              <motion.div
                initial={{ opacity:0 }} animate={{ opacity:1 }}
                className="game-card"
                style={{
                  overflow:'hidden',
                  borderColor:'rgba(245,158,11,0.22)',
                  boxShadow:'0 0 20px rgba(245,158,11,0.05)',
                }}
              >
                <SectionHeader label={`Requests — ${pendingCount} pending`} count={pendingCount} />
                {friends.received.map(f => (
                  <motion.div
                    key={f.username}
                    initial={{ opacity:0 }} animate={{ opacity:1 }}
                    style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom:'1px solid var(--border)' }}
                  >
                    <AvatarChip name={f.displayName} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:600 }}>{f.displayName}</div>
                      <div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:'var(--dim)', marginTop:2 }}>
                        @{f.username}
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:7 }}>
                      <button
                        className="btn-neon" style={{ fontSize:9, padding:'5px 12px' }}
                        onClick={() => handleAccept(f.username)}
                      >
                        ACCEPT
                      </button>
                      <button
                        className="btn-ghost" style={{ fontSize:9, padding:'5px 12px' }}
                        onClick={() => handleReject(f.username)}
                      >
                        DECLINE
                      </button>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}

            {/* Sent requests */}
            {friends.sent.length > 0 && (
              <div className="game-card" style={{ overflow:'hidden' }}>
                <SectionHeader label="Sent requests" count={friends.sent.length} />
                {friends.sent.map(f => (
                  <div key={f.username} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom:'1px solid var(--border)' }}>
                    <AvatarChip name={f.displayName} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:600 }}>{f.displayName}</div>
                      <div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:'var(--dim)', marginTop:2 }}>@{f.username}</div>
                    </div>
                    <span style={{ fontFamily:"'Space Mono',monospace", fontSize:9, color:'var(--amber)', letterSpacing:'0.1em' }}>PENDING</span>
                    <button
                      className="btn-ghost" style={{ fontSize:9, padding:'4px 10px' }}
                      onClick={() => { handleReject(f.username); }}
                    >
                      CANCEL
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Friends list */}
            <div className="game-card" style={{ overflow:'hidden' }}>
              <SectionHeader label="Your friends" count={friends.friends.length} />
              {loading ? (
                <div style={{ padding:'32px 16px', textAlign:'center', fontFamily:"'Space Mono',monospace", fontSize:11, color:'var(--dim)' }}>
                  Loading…
                </div>
              ) : friends.friends.length === 0 ? (
                <div style={{ padding:'40px 24px', textAlign:'center' }}>
                  <div style={{ fontFamily:"'Space Mono',monospace", fontSize:11, color:'var(--dim)', letterSpacing:'0.1em', lineHeight:2 }}>
                    NO FRIENDS YET<br />
                    <span style={{ fontSize:10, opacity:0.6 }}>Search for people to add them.</span>
                  </div>
                  <button
                    className="btn-neon" style={{ marginTop:16, fontSize:10 }}
                    onClick={() => setTab('search')}
                  >
                    FIND PEOPLE
                  </button>
                </div>
              ) : (
                <AnimatePresence>
                  {friends.friends.map(f => (
                    <FriendRow
                      key={f.username}
                      entry={f}
                      myUsername={myUsername}
                      onRemove={handleRemove}
                      onBlock={handleBlock}
                      onInvite={handleInvite}
                      onChat={openChat}
                      unread={unread[f.username] ?? 0}
                    />
                  ))}
                </AnimatePresence>
              )}
            </div>
          </div>
        )}

        {/* ── Search tab ── */}
        {tab === 'search' && (
          <div>
            <div style={{ marginBottom:16 }}>
              <div style={{
                display:'flex', alignItems:'center',
                background:'rgba(22,12,2,0.9)',
                border:'1px solid var(--border)', borderRadius:6,
                transition:'border-color 0.18s',
              }}>
                <span style={{ padding:'11px 14px', color:'var(--dim)', fontSize:16 }}>⌕</span>
                <input
                  style={{
                    flex:1, background:'transparent', border:'none', outline:'none',
                    fontFamily:"'Space Mono',monospace", fontSize:13,
                    color:'var(--text)', padding:'11px 14px 11px 0',
                  }}
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  placeholder="Search by @username…"
                  autoFocus
                />
                {searchBusy && (
                  <span style={{ padding:'0 14px', fontFamily:"'Space Mono',monospace", fontSize:11, color:'var(--dim)' }}>…</span>
                )}
              </div>
              <div style={{ marginTop:6, fontSize:11, color:'var(--dim)', fontFamily:"'Space Mono',monospace" }}>
                Type at least 2 characters to search
              </div>
            </div>

            <AnimatePresence>
              {searchResults.length > 0 && (
                <motion.div
                  initial={{ opacity:0 }} animate={{ opacity:1 }}
                  className="game-card" style={{ overflow:'hidden' }}
                >
                  <SectionHeader label={`Results — ${searchResults.length} found`} count={searchResults.length} />
                  {searchResults.map(u => {
                    const rel = getRelation(u.username);
                    return (
                      <motion.div
                        key={u.username}
                        initial={{ opacity:0 }} animate={{ opacity:1 }}
                        style={{
                          display:'flex', alignItems:'center', gap:12,
                          padding:'12px 16px', borderBottom:'1px solid var(--border)',
                        }}
                      >
                        <AvatarChip name={u.displayName} />
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:14, fontWeight:600 }}>{u.displayName}</div>
                          <div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:'var(--dim)', marginTop:2 }}>
                            @{u.username}
                          </div>
                        </div>

                        {rel === 'none' && (
                          <button
                            className="btn-neon" style={{ fontSize:9, padding:'5px 12px' }}
                            onClick={() => handleSendRequest(u.username)}
                          >
                            + ADD
                          </button>
                        )}
                        {rel === 'friend' && (
                          <span style={{ fontFamily:"'Space Mono',monospace", fontSize:9, color:'var(--accent)', letterSpacing:'0.1em' }}>
                            FRIENDS
                          </span>
                        )}
                        {rel === 'sent' && (
                          <span style={{ fontFamily:"'Space Mono',monospace", fontSize:9, color:'var(--amber)', letterSpacing:'0.1em' }}>
                            PENDING
                          </span>
                        )}
                        {rel === 'received' && (
                          <button
                            className="btn-neon" style={{ fontSize:9, padding:'5px 12px' }}
                            onClick={() => handleAccept(u.username)}
                          >
                            ACCEPT
                          </button>
                        )}
                        {rel === 'blocked' && (
                          <span style={{ fontFamily:"'Space Mono',monospace", fontSize:9, color:'var(--red)', letterSpacing:'0.1em' }}>
                            BLOCKED
                          </span>
                        )}
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>

            {searchQ.length >= 2 && !searchBusy && searchResults.length === 0 && (
              <div style={{
                textAlign:'center', padding:'40px 24px',
                fontFamily:"'Space Mono',monospace", fontSize:11,
                color:'var(--dim)', letterSpacing:'0.1em', lineHeight:2,
              }}>
                NO USERS FOUND<br />
                <span style={{ fontSize:10, opacity:0.6 }}>Make sure you&apos;re searching by exact username.</span>
              </div>
            )}
          </div>
        )}

        {/* ── Chat tab ── */}
        {tab === 'chat' && (
          <div className="game-card" style={{ overflow:'hidden', minHeight:480, display:'flex', flexDirection:'column' }}>
            {!chatFriend ? (
              /* Friend list */
              <>
                <SectionHeader label="Messages" count={friends.friends.length} />
                {friends.friends.length === 0 ? (
                  <div style={{ padding:'40px 24px', textAlign:'center',
                    fontFamily:"'Space Mono',monospace", fontSize:11,
                    color:'var(--dim)', letterSpacing:'0.1em' }}>
                    NO FRIENDS TO CHAT WITH
                  </div>
                ) : friends.friends.map(f => (
                  <button key={f.username}
                    onClick={() => openChat(f.username, f.displayName)}
                    style={{
                      width:'100%', background:'none', border:'none', cursor:'pointer',
                      display:'flex', alignItems:'center', gap:12,
                      padding:'13px 16px', borderBottom:'1px solid var(--border)',
                      transition:'background 0.12s', textAlign:'left',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.03)'}
                    onMouseLeave={e => e.currentTarget.style.background='none'}
                  >
                    <AvatarChip name={f.displayName} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{f.displayName}</div>
                      <div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:'var(--dim)', marginTop:2 }}>
                        @{f.username}
                      </div>
                    </div>
                    <OnlineBadge online={f.online} roomLabel={f.roomLabel} />
                    {(unread[f.username] ?? 0) > 0 && (
                      <span style={{
                        background:'var(--red)', color:'#fff',
                        borderRadius:99, fontSize:9, fontWeight:700, padding:'2px 7px',
                      }}>{unread[f.username]}</span>
                    )}
                  </button>
                ))}
              </>
            ) : (
              /* Conversation */
              <>
                {/* Header */}
                <div style={{
                  display:'flex', alignItems:'center', gap:10,
                  padding:'12px 16px', borderBottom:'1px solid var(--border)',
                  flexShrink:0,
                }}>
                  <button onClick={() => { setChatFriend(null); setChatMessages([]); }}
                    style={{ background:'none', border:'none', cursor:'pointer',
                      color:'var(--muted)', fontSize:18, lineHeight:1, padding:'2px 6px' }}>
                    ←
                  </button>
                  <AvatarChip name={chatFriendDisplay} size={28} />
                  <span style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{chatFriendDisplay}</span>
                </div>

                {/* Messages */}
                <div style={{ flex:1, overflowY:'auto', padding:'16px',
                  display:'flex', flexDirection:'column', gap:8, minHeight:300 }}>
                  {chatMessages.length === 0 && (
                    <div style={{ textAlign:'center', padding:'40px 0',
                      fontFamily:"'Space Mono',monospace", fontSize:10,
                      color:'var(--dim)', letterSpacing:'0.1em' }}>
                      NO MESSAGES YET
                    </div>
                  )}
                  {chatMessages.map(msg => {
                    const isMe = msg.from === myUsername;
                    return (
                      <div key={msg.id} style={{ display:'flex', flexDirection:'column',
                        alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                        <div style={{
                          background: isMe ? 'rgba(167,139,250,0.16)' : 'rgba(255,255,255,0.06)',
                          border: isMe ? '1px solid rgba(167,139,250,0.28)' : '1px solid rgba(255,255,255,0.08)',
                          borderRadius: isMe ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
                          padding:'9px 14px', maxWidth:'68%',
                          fontSize:13, color:'var(--text)', lineHeight:1.55,
                          wordBreak:'break-word',
                        }}>
                          {msg.body}
                        </div>
                        <span style={{ fontSize:10, color:'var(--dim)', marginTop:3 }}>
                          {new Date(msg.createdAt * 1000).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}
                        </span>
                      </div>
                    );
                  })}
                  <div ref={chatBottomRef} />
                </div>

                {/* Input */}
                <div style={{ display:'flex', gap:8, padding:'12px 16px',
                  borderTop:'1px solid var(--border)', flexShrink:0 }}>
                  <input
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                    placeholder={`Message ${chatFriendDisplay}…`}
                    maxLength={500}
                    autoFocus
                    style={{
                      flex:1, background:'rgba(255,255,255,0.04)',
                      border:'1px solid var(--border)', borderRadius:8,
                      padding:'10px 14px', fontSize:13, color:'var(--text)',
                      outline:'none', fontFamily:'inherit',
                    }}
                    onFocus={e => e.target.style.borderColor='var(--border-hi)'}
                    onBlur={e => e.target.style.borderColor='var(--border)'}
                  />
                  <button onClick={sendChat} disabled={!chatInput.trim()}
                    className={chatInput.trim() ? 'btn-neon' : 'btn-ghost'}
                    style={{ fontSize:13, padding:'0 18px', fontWeight:700 }}>
                    →
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Blocked tab ── */}
        {tab === 'blocked' && (
          <div className="game-card" style={{ overflow:'hidden' }}>
            <SectionHeader label="Blocked users" count={friends.blocked.length} />
            {friends.blocked.length === 0 ? (
              <div style={{
                padding:'40px 24px', textAlign:'center',
                fontFamily:"'Space Mono',monospace", fontSize:11,
                color:'var(--dim)', letterSpacing:'0.1em',
              }}>
                NO BLOCKED USERS
              </div>
            ) : (
              friends.blocked.map(f => (
                <div key={f.username} style={{
                  display:'flex', alignItems:'center', gap:12,
                  padding:'12px 16px', borderBottom:'1px solid var(--border)',
                }}>
                  <AvatarChip name={f.displayName} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--muted)' }}>{f.displayName}</div>
                    <div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:'var(--dim)', marginTop:2 }}>
                      @{f.username}
                    </div>
                  </div>
                  <button
                    className="btn-ghost" style={{ fontSize:9, padding:'5px 12px' }}
                    onClick={() => handleUnblock(f.username)}
                  >
                    UNBLOCK
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
            style={{
              position:'fixed', bottom:28, left:'50%', transform:'translateX(-50%)',
              background:'rgba(245,158,11,0.11)', border:'1px solid rgba(245,158,11,0.3)',
              borderRadius:8, padding:'11px 24px',
              fontFamily:"'Space Mono',monospace", fontSize:12,
              color:'var(--accent)', letterSpacing:'0.06em', zIndex:300,
              whiteSpace:'nowrap',
            }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

'use client';
import { useEffect, useState } from 'react';

interface InviteEntry {
  from: string;
  fromDisplay: string;
  roomId: string;
  roomLabel: string;
  at: number;
}

export default function InviteBanner() {
  const [invites, setInvites] = useState<InviteEntry[]>([]);

  useEffect(() => {
    const username = localStorage.getItem('sl_name');
    if (!username) return;

    const poll = async () => {
      try {
        const res = await fetch(`http://localhost:2567/invites/${encodeURIComponent(username)}`);
        if (!res.ok) return;
        const data: InviteEntry[] = await res.json();
        if (data.length > 0) {
          setInvites(prev => {
            const existing = new Set(prev.map(i => i.from + '|' + i.roomId));
            const fresh = data.filter(i => !existing.has(i.from + '|' + i.roomId));
            return fresh.length > 0 ? [...prev, ...fresh] : prev;
          });
        }
      } catch { /* server may be down */ }
    };

    poll();
    const iv = setInterval(poll, 8000);
    return () => clearInterval(iv);
  }, []);

  if (invites.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', top: 16, right: 16, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 8,
      maxWidth: 300,
    }}>
      {invites.map((inv, i) => (
        <div key={inv.from + inv.roomId + i} style={{
          background: '#1e1b2e',
          border: '1px solid rgba(167,139,250,0.4)',
          borderRadius: 10,
          padding: '12px 14px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
          color: '#e2d9f3',
          fontFamily: 'var(--font-grotesk, system-ui, sans-serif)',
        }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            <span style={{ color: '#a78bfa', fontWeight: 700 }}>{inv.fromDisplay}</span>
            {' '}invited you to{' '}
            <span style={{ color: '#fde68a' }}>{inv.roomLabel}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => {
                localStorage.setItem('sl_roomId', inv.roomId);
                window.location.href = '/game';
              }}
              style={{
                flex: 1, padding: '6px 0', borderRadius: 6,
                background: 'rgba(167,139,250,0.25)',
                border: '1px solid rgba(167,139,250,0.5)',
                color: '#c4b5fd', fontWeight: 700, fontSize: 13,
                cursor: 'pointer',
              }}
            >
              JOIN →
            </button>
            <button
              onClick={() => setInvites(prev => prev.filter((_, j) => j !== i))}
              style={{
                padding: '6px 10px', borderRadius: 6,
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#888', fontSize: 13,
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

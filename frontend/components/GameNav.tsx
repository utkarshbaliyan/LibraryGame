'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

interface GameNavProps {
  right?: React.ReactNode;
  minimal?: boolean;
}

const LINKS = [
  { href: '/friends',     label: 'FRIENDS' },
  { href: '/leaderboard', label: 'RANKINGS' },
  { href: '/profile',     label: 'PROFILE' },
];

export default function GameNav({ right, minimal }: GameNavProps) {
  const path = usePathname();
  const router = useRouter();

  if (minimal) {
    return (
      <nav style={{
        height: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        borderBottom: '1px solid rgba(178,126,40,0.15)',
        background: 'rgba(10,6,0,0.97)',
        backdropFilter: 'blur(18px)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <Link href="/" style={{
          fontFamily: "var(--font-cinzel,'Cinzel',serif)",
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: '0.18em',
          color: '#f59e0b',
          textDecoration: 'none',
          textShadow: '0 0 20px rgba(245,158,11,0.5)',
        }}>
          ◆ FOCUS LIBRARY
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {right && <span style={{ marginRight: 8 }}>{right}</span>}
          <button onClick={() => router.back()} style={{
            fontFamily: "'Space Mono',monospace",
            fontSize: 10,
            letterSpacing: '0.12em',
            padding: '5px 14px',
            borderRadius: 4,
            border: '1px solid rgba(178,126,40,0.25)',
            color: 'rgba(185,148,82,0.55)',
            background: 'transparent',
            cursor: 'pointer',
            transition: 'border-color 0.15s, color 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(212,162,62,0.5)'; e.currentTarget.style.color = '#f59e0b'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(178,126,40,0.25)'; e.currentTarget.style.color = 'rgba(185,148,82,0.55)'; }}
          >
            ← BACK
          </button>
          <Link href="/" style={{
            fontFamily: "'Space Mono',monospace",
            fontSize: 10,
            letterSpacing: '0.12em',
            padding: '5px 14px',
            borderRadius: 4,
            border: '1px solid rgba(245,158,11,0.25)',
            color: 'rgba(245,158,11,0.7)',
            textDecoration: 'none',
            transition: 'all 0.15s',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f59e0b'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(245,158,11,0.5)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(245,158,11,0.7)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(245,158,11,0.25)'; }}
          >
            LOBBY
          </Link>
        </div>
      </nav>
    );
  }

  return (
    <nav className="game-nav">
      <Link href="/" className="nav-logo">
        ◆ FOCUS LIBRARY
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {LINKS.map(l => (
          <Link
            key={l.href}
            href={l.href}
            className={`nav-link${path === l.href ? ' active' : ''}`}
          >
            {l.label}
          </Link>
        ))}
        {right && <span style={{ marginLeft: 8 }}>{right}</span>}
      </div>
    </nav>
  );
}

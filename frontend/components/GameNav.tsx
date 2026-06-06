'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface GameNavProps {
  right?: React.ReactNode;
}

const LINKS = [
  { href: '/',            label: 'LOBBY' },
  { href: '/friends',     label: 'FRIENDS' },
  { href: '/leaderboard', label: 'RANKINGS' },
  { href: '/profile',     label: 'PROFILE' },
];

export default function GameNav({ right }: GameNavProps) {
  const path = usePathname();
  return (
    <nav className="game-nav">
      <Link href="/" className="nav-logo">
        ◆ FOCUS LIBRARY
      </Link>
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        {LINKS.map(l => (
          <Link
            key={l.href}
            href={l.href}
            className={`nav-link${path === l.href ? ' active' : ''}`}
          >
            {l.label}
          </Link>
        ))}
        {right && <span style={{ marginLeft:8 }}>{right}</span>}
      </div>
    </nav>
  );
}

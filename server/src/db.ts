import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DATA_DIR = path.join(__dirname, "../../data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "library.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    name        TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT '',
    bio         TEXT NOT NULL DEFAULT '',
    goal        TEXT NOT NULL DEFAULT '',
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_name        TEXT    NOT NULL,
    room_id          TEXT    NOT NULL,
    duration_seconds INTEGER NOT NULL,
    week             TEXT    NOT NULL,
    ended_at         INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS friendships (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    requester  TEXT    NOT NULL,
    addressee  TEXT    NOT NULL,
    status     TEXT    NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(requester, addressee)
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_week      ON sessions(week);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_week ON sessions(user_name, week);
  CREATE INDEX IF NOT EXISTS idx_friends_req        ON friendships(requester);
  CREATE INDEX IF NOT EXISTS idx_friends_addr       ON friendships(addressee);
`);

// Migrate: add display_name if missing (old DB without it)
try {
  db.exec("ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT ''");
} catch { /* column already exists */ }

// ── ISO week key "YYYY-WNN" ────────────────────────────────────────────────
function isoWeek(): string {
  const now = new Date();
  const d   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const w = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(w).padStart(2, "0")}`;
}

// ── User identity ──────────────────────────────────────────────────────────
export function ensureUser(username: string, displayName?: string) {
  const u  = username.toLowerCase().trim();
  const dn = displayName?.trim() || u;
  db.prepare(
    "INSERT INTO users (name, display_name) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET display_name = CASE WHEN excluded.display_name != '' THEN excluded.display_name ELSE display_name END"
  ).run(u, dn);
}

export function isUsernameTaken(username: string): boolean {
  const u = username.toLowerCase().trim();
  return !!db.prepare("SELECT 1 FROM users WHERE name = ? COLLATE NOCASE").get(u);
}

export function getDisplayName(username: string): string {
  const u   = username.toLowerCase().trim();
  const row = db.prepare("SELECT display_name FROM users WHERE name = ? COLLATE NOCASE").get(u) as any;
  return row?.display_name || u;
}

// ── User search ────────────────────────────────────────────────────────────
export function searchUsers(q: string, me: string): { username: string; displayName: string }[] {
  const lq = q.toLowerCase().trim();
  const lm = me.toLowerCase().trim();
  return (db.prepare(`
    SELECT name AS username, CASE WHEN display_name = '' THEN name ELSE display_name END AS displayName
    FROM users
    WHERE name LIKE ? AND name != ? COLLATE NOCASE
      AND name NOT IN (SELECT addressee FROM friendships WHERE requester = ? COLLATE NOCASE AND status = 'blocked')
      AND name NOT IN (SELECT requester FROM friendships WHERE addressee = ? COLLATE NOCASE AND status = 'blocked')
    ORDER BY name LIMIT 20
  `).all(lq + "%", lm, lm, lm) as any[]);
}

// ── Friends ────────────────────────────────────────────────────────────────
export function getFriendList(username: string) {
  const u = username.toLowerCase().trim();
  const rows = db.prepare(`
    SELECT LOWER(f.requester) AS requester, LOWER(f.addressee) AS addressee, f.status,
      CASE WHEN u1.display_name = '' THEN u1.name ELSE u1.display_name END AS req_display,
      CASE WHEN u2.display_name = '' THEN u2.name ELSE u2.display_name END AS addr_display
    FROM friendships f
    LEFT JOIN users u1 ON LOWER(u1.name) = LOWER(f.requester)
    LEFT JOIN users u2 ON LOWER(u2.name) = LOWER(f.addressee)
    WHERE LOWER(f.requester) = ? OR LOWER(f.addressee) = ?
  `).all(u, u) as any[];

  const friends: { username: string; displayName: string }[]  = [];
  const sent:    { username: string; displayName: string }[]  = [];
  const received:{ username: string; displayName: string }[]  = [];
  const blocked: { username: string; displayName: string }[]  = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const iAmRequester = row.requester === u;
    const other        = iAmRequester ? row.addressee   : row.requester;
    const otherDisplay = (iAmRequester ? row.addr_display : row.req_display) ?? other;
    const key = `${row.status}:${other}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (row.status === "accepted") {
      friends.push({ username: other, displayName: otherDisplay });
    } else if (row.status === "pending") {
      if (iAmRequester) sent.push({ username: other, displayName: otherDisplay });
      else              received.push({ username: other, displayName: otherDisplay });
    } else if (row.status === "blocked" && iAmRequester) {
      blocked.push({ username: other, displayName: otherDisplay });
    }
  }

  return { friends, sent, received, blocked };
}

export function areFriends(a: string, b: string): boolean {
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();
  const row = db.prepare(`
    SELECT 1 FROM friendships
    WHERE ((LOWER(requester) = ? AND LOWER(addressee) = ?) OR (LOWER(requester) = ? AND LOWER(addressee) = ?))
      AND status = 'accepted'
  `).get(la, lb, lb, la);
  return !!row;
}

export function sendFriendRequest(from: string, to: string): { ok: boolean; error?: string } {
  const lf = from.toLowerCase().trim();
  const lt = to.toLowerCase().trim();
  if (lf === lt) return { ok: false, error: "Cannot add yourself" };
  const existing = db.prepare(`
    SELECT status FROM friendships
    WHERE (LOWER(requester) = ? AND LOWER(addressee) = ?) OR (LOWER(requester) = ? AND LOWER(addressee) = ?)
  `).get(lf, lt, lt, lf) as any;

  if (existing) {
    if (existing.status === "accepted") return { ok: false, error: "Already friends" };
    if (existing.status === "blocked")  return { ok: false, error: "Cannot send request" };
    if (existing.status === "pending")  return { ok: false, error: "Request already pending" };
  }

  db.prepare("INSERT INTO friendships (requester, addressee, status) VALUES (?, ?, 'pending')").run(lf, lt);
  return { ok: true };
}

export function acceptFriendRequest(user: string, from: string): { ok: boolean; error?: string } {
  const lu = user.toLowerCase().trim();
  const lf = from.toLowerCase().trim();
  const r  = db.prepare(
    "UPDATE friendships SET status = 'accepted' WHERE LOWER(requester) = ? AND LOWER(addressee) = ? AND status = 'pending'"
  ).run(lf, lu);
  return r.changes > 0 ? { ok: true } : { ok: false, error: "Request not found" };
}

export function removeFriendOrRequest(user: string, other: string) {
  const lu = user.toLowerCase().trim();
  const lo = other.toLowerCase().trim();
  db.prepare(
    "DELETE FROM friendships WHERE (LOWER(requester) = ? AND LOWER(addressee) = ?) OR (LOWER(requester) = ? AND LOWER(addressee) = ?)"
  ).run(lu, lo, lo, lu);
  return { ok: true };
}

export function blockUser(user: string, target: string) {
  const lu = user.toLowerCase().trim();
  const lt = target.toLowerCase().trim();
  db.prepare(
    "DELETE FROM friendships WHERE (LOWER(requester) = ? AND LOWER(addressee) = ?) OR (LOWER(requester) = ? AND LOWER(addressee) = ?)"
  ).run(lu, lt, lt, lu);
  db.prepare("INSERT INTO friendships (requester, addressee, status) VALUES (?, ?, 'blocked')").run(lu, lt);
  return { ok: true };
}

export function unblockUser(user: string, target: string) {
  const lu = user.toLowerCase().trim();
  const lt = target.toLowerCase().trim();
  db.prepare("DELETE FROM friendships WHERE LOWER(requester) = ? AND LOWER(addressee) = ? AND status = 'blocked'").run(lu, lt);
  return { ok: true };
}

// ── Sessions / leaderboard / profile (unchanged) ──────────────────────────
export function saveSession(userName: string, roomId: string, durationSeconds: number) {
  if (durationSeconds < 60) return;
  ensureUser(userName);
  db.prepare(
    "INSERT INTO sessions (user_name, room_id, duration_seconds, week) VALUES (?, ?, ?, ?)"
  ).run(userName, roomId, durationSeconds, isoWeek());
}

export function getLeaderboard() {
  const week = isoWeek();
  return db.prepare(`
    SELECT
      s.user_name AS name,
      SUM(s.duration_seconds) AS weekly_secs,
      u.goal,
      CASE WHEN u.display_name = '' THEN s.user_name ELSE u.display_name END AS displayName
    FROM sessions s
    LEFT JOIN users u ON u.name = s.user_name
    WHERE s.week = ?
    GROUP BY s.user_name
    ORDER BY weekly_secs DESC
    LIMIT 100
  `).all(week);
}

export function getProfile(username: string) {
  const week = isoWeek();
  const user = db.prepare("SELECT name, display_name, bio, goal, created_at FROM users WHERE name = ?").get(username) as any;
  const stats = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN week = ? THEN duration_seconds ELSE 0 END), 0) AS weekly_secs,
      COALESCE(SUM(duration_seconds), 0)                                     AS total_secs,
      COUNT(*)                                                                AS session_count
    FROM sessions WHERE user_name = ?
  `).get(week, username) as any;

  return {
    username:      username,
    displayName:   user?.display_name || username,
    bio:           user?.bio           ?? "",
    goal:          user?.goal          ?? "",
    created_at:    user?.created_at    ?? null,
    weekly_secs:   stats?.weekly_secs  ?? 0,
    total_secs:    stats?.total_secs   ?? 0,
    session_count: stats?.session_count ?? 0,
  };
}

export function updateProfile(
  username: string,
  displayName: string,
  bio: string,
  goal: string,
): { ok: boolean; error?: string } {
  ensureUser(username);
  db.prepare("UPDATE users SET display_name = ?, bio = ?, goal = ? WHERE name = ?")
    .run(displayName.trim().slice(0, 30) || username, bio, goal, username);
  return { ok: true };
}

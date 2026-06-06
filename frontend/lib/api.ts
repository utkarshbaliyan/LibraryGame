import { SERVER_HTTP } from './constants';

export interface RoomInfo {
  roomId: string;
  clients: number;
  metadata: { label: string; isGlobal: boolean; createdBy: string | null; };
}

export interface LeaderboardEntry {
  name: string;
  displayName: string;
  weekly_secs: number;
  goal: string;
}

export interface ProfileData {
  username: string;
  displayName: string;
  bio: string;
  goal: string;
  created_at: number;
  total_secs: number;
  weekly_secs: number;
  session_count: number;
  gender: string;
  skinColor: string;
  hairColor: string;
  shirtColor: string;
  pantsColor: string;
  shoesColor: string;
}

export interface FriendEntry {
  username: string;
  displayName: string;
  online?: boolean;
  roomId?: string | null;
  roomLabel?: string | null;
}

export interface FriendList {
  friends:  FriendEntry[];
  sent:     FriendEntry[];
  received: FriendEntry[];
  blocked:  FriendEntry[];
}

export interface InviteEntry {
  from: string;
  fromDisplay: string;
  roomId: string;
  roomLabel: string;
}

// ── Rooms ──────────────────────────────────────────────────────────────────
export async function fetchRooms(): Promise<RoomInfo[]> {
  const res = await fetch(`${SERVER_HTTP}/rooms`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch rooms');
  return res.json();
}

export async function createRoom(label: string, createdBy: string): Promise<{ roomId: string }> {
  const res = await fetch(`${SERVER_HTTP}/rooms/create`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, createdBy }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to create room');
  return data;
}

// ── Leaderboard ────────────────────────────────────────────────────────────
export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${SERVER_HTTP}/leaderboard`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch leaderboard');
  return res.json();
}

// ── Profile ────────────────────────────────────────────────────────────────
export async function fetchProfile(username: string): Promise<ProfileData> {
  const res = await fetch(`${SERVER_HTTP}/profile/${encodeURIComponent(username)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch profile');
  return res.json();
}

export interface CharAppearance {
  gender: string; skinColor: string; hairColor: string;
  shirtColor: string; pantsColor: string; shoesColor: string;
}

export async function updateProfile(
  username: string, displayName: string, bio: string, goal: string,
  appearance?: CharAppearance,
): Promise<ProfileData> {
  const res = await fetch(`${SERVER_HTTP}/profile`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, displayName, bio, goal, ...appearance }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to update profile');
  return data;
}

// ── Users ──────────────────────────────────────────────────────────────────
export async function checkUsername(username: string): Promise<{ available: boolean; error?: string }> {
  const res = await fetch(`${SERVER_HTTP}/users/check/${encodeURIComponent(username)}`);
  return res.json();
}

export async function searchUsers(q: string, me: string): Promise<FriendEntry[]> {
  const res = await fetch(`${SERVER_HTTP}/users/search?q=${encodeURIComponent(q)}&me=${encodeURIComponent(me)}`);
  if (!res.ok) return [];
  return res.json();
}

// ── Friends ────────────────────────────────────────────────────────────────
export async function fetchFriends(username: string): Promise<FriendList> {
  const res = await fetch(`${SERVER_HTTP}/friends/${encodeURIComponent(username)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch friends');
  return res.json();
}

export async function sendFriendRequest(from: string, to: string): Promise<void> {
  const res = await fetch(`${SERVER_HTTP}/friends/request`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to }),
  });
  if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
}

export async function acceptFriendRequest(user: string, from: string): Promise<void> {
  const res = await fetch(`${SERVER_HTTP}/friends/accept`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user, from }),
  });
  if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
}

export async function removeFriend(user: string, other: string): Promise<void> {
  await fetch(`${SERVER_HTTP}/friends/${encodeURIComponent(user)}/${encodeURIComponent(other)}`, { method: 'DELETE' });
}

export async function blockUser(user: string, target: string): Promise<void> {
  await fetch(`${SERVER_HTTP}/friends/block`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user, target }),
  });
}

export async function unblockUser(user: string, target: string): Promise<void> {
  await fetch(`${SERVER_HTTP}/friends/unblock`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user, target }),
  });
}

export async function inviteFriend(from: string, to: string, roomId: string): Promise<void> {
  const res = await fetch(`${SERVER_HTTP}/friends/invite`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, roomId }),
  });
  if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
}

export async function fetchInvites(username: string): Promise<InviteEntry[]> {
  const res = await fetch(`${SERVER_HTTP}/invites/${encodeURIComponent(username)}`, { cache: 'no-store' });
  if (!res.ok) return [];
  return res.json();
}

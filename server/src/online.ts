// In-memory presence + invite store — no DB needed for ephemeral state

export interface OnlineEntry {
  username: string;
  displayName: string;
  roomId: string;
  roomLabel: string;
}

export const onlineUsers = new Map<string, OnlineEntry>();

export interface InviteEntry {
  from: string;
  fromDisplay: string;
  roomId: string;
  roomLabel: string;
  at: number;  // unix seconds
}

const pendingInvites = new Map<string, InviteEntry[]>();

export function pushInvite(to: string, invite: InviteEntry) {
  const now = Date.now() / 1000;
  const list = (pendingInvites.get(to) ?? [])
    .filter(i => i.from !== invite.from && now - i.at < 300);
  list.push(invite);
  pendingInvites.set(to, list);
}

export function popInvites(username: string): InviteEntry[] {
  const now = Date.now() / 1000;
  const list = (pendingInvites.get(username) ?? []).filter(i => now - i.at < 300);
  pendingInvites.delete(username);
  return list;
}

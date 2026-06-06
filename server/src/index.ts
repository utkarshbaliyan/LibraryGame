import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { LibraryRoom } from "./rooms/LibraryRoom";
import {
  getLeaderboard, getProfile, updateProfile,
  isUsernameTaken, searchUsers,
  getFriendList, sendFriendRequest, acceptFriendRequest,
  removeFriendOrRequest, blockUser, unblockUser,
  areFriends, saveMessage, getMessages, markRead, getUnreadCounts,
} from "./db";
import { onlineUsers, pushInvite, popInvites } from "./online";
import { chatSessions } from "./chatSessions";

const PORT = 2567;
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

const app = express();
app.use(cors());
app.use(express.json());

// ── Rooms ──────────────────────────────────────────────────────────────────
app.get("/rooms", async (_req, res) => {
  try { res.json(await matchMaker.query({ name: "library" })); }
  catch { res.status(500).json({ error: "query failed" }); }
});

app.post("/rooms/create", async (req, res) => {
  const { label, createdBy } = req.body ?? {};
  if (typeof label !== "string" || label.trim().length < 2 || label.trim().length > 50) {
    res.status(400).json({ error: "label must be 2–50 characters" }); return;
  }
  try {
    const room = await matchMaker.createRoom("library", {
      label: label.trim(), isGlobal: false,
      createdBy: typeof createdBy === "string" ? createdBy.slice(0, 20) : "Anonymous",
    });
    res.json({ roomId: room.roomId });
  } catch { res.status(500).json({ error: "could not create room" }); }
});

// ── Leaderboard ────────────────────────────────────────────────────────────
app.get("/leaderboard", (_req, res) => {
  try { res.json(getLeaderboard()); }
  catch { res.status(500).json({ error: "query failed" }); }
});

// ── Profile ────────────────────────────────────────────────────────────────
app.get("/profile/:username", (req, res) => {
  try { res.json(getProfile(req.params.username)); }
  catch { res.status(500).json({ error: "query failed" }); }
});

app.put("/profile", (req, res) => {
  const { username, displayName, bio, goal, gender, skinColor, hairColor, shirtColor, pantsColor, shoesColor } = req.body ?? {};
  if (typeof username !== "string" || !username.trim()) {
    res.status(400).json({ error: "invalid username" }); return;
  }
  const dn = typeof displayName === "string" ? displayName.trim().slice(0, 30) : username;
  const result = updateProfile(
    username.trim(), dn,
    typeof bio  === "string" ? bio.trim().slice(0, 300)  : "",
    typeof goal === "string" ? goal.trim().slice(0, 200) : "",
    typeof gender     === "string" ? gender     : undefined,
    typeof skinColor  === "string" ? skinColor  : undefined,
    typeof hairColor  === "string" ? hairColor  : undefined,
    typeof shirtColor === "string" ? shirtColor : undefined,
    typeof pantsColor === "string" ? pantsColor : undefined,
    typeof shoesColor === "string" ? shoesColor : undefined,
  );
  if (!result.ok) { res.status(409).json({ error: result.error }); return; }
  res.json(getProfile(username.trim()));
});

// ── Username availability check ────────────────────────────────────────────
app.get("/users/check/:username", (req, res) => {
  const u = req.params.username.toLowerCase().trim();
  if (!USERNAME_RE.test(u)) {
    res.json({ available: false, error: "3–20 chars, letters/numbers/underscore only" }); return;
  }
  res.json({ available: !isUsernameTaken(u) });
});

// ── User search ────────────────────────────────────────────────────────────
app.get("/users/search", (req, res) => {
  const q  = (req.query.q  as string ?? "").toLowerCase().trim();
  const me = (req.query.me as string ?? "").toLowerCase().trim();
  if (!q || q.length < 2) { res.json([]); return; }
  try { res.json(searchUsers(q, me)); }
  catch { res.status(500).json({ error: "search failed" }); }
});

// ── Online users ───────────────────────────────────────────────────────────
app.get("/users/online", (_req, res) => {
  res.json(Array.from(onlineUsers.values()));
});

// ── Friends ────────────────────────────────────────────────────────────────
app.get("/friends/:username", (req, res) => {
  try {
    const data = getFriendList(req.params.username.toLowerCase().trim());
    // Annotate friends with online status
    const friends = data.friends.map(f => ({
      ...f,
      online: onlineUsers.has(f.username),
      roomId: onlineUsers.get(f.username)?.roomId ?? null,
      roomLabel: onlineUsers.get(f.username)?.roomLabel ?? null,
    }));
    res.json({ ...data, friends });
  } catch { res.status(500).json({ error: "query failed" }); }
});

app.post("/friends/request", (req, res) => {
  const { from, to } = req.body ?? {};
  if (typeof from !== "string" || typeof to !== "string" || !from.trim() || !to.trim()) {
    res.status(400).json({ error: "invalid params" }); return;
  }
  const result = sendFriendRequest(from.trim(), to.trim());
  if (!result.ok) { res.status(400).json({ error: result.error }); return; }
  res.json({ ok: true });
});

app.post("/friends/accept", (req, res) => {
  const { user, from } = req.body ?? {};
  if (typeof user !== "string" || typeof from !== "string") {
    res.status(400).json({ error: "invalid params" }); return;
  }
  const result = acceptFriendRequest(user.trim(), from.trim());
  if (!result.ok) { res.status(400).json({ error: result.error }); return; }
  res.json({ ok: true });
});

app.delete("/friends/:user/:other", (req, res) => {
  removeFriendOrRequest(req.params.user, req.params.other);
  res.json({ ok: true });
});

app.post("/friends/block", (req, res) => {
  const { user, target } = req.body ?? {};
  if (typeof user !== "string" || typeof target !== "string") {
    res.status(400).json({ error: "invalid params" }); return;
  }
  blockUser(user.trim(), target.trim());
  res.json({ ok: true });
});

app.post("/friends/unblock", (req, res) => {
  const { user, target } = req.body ?? {};
  if (typeof user !== "string" || typeof target !== "string") {
    res.status(400).json({ error: "invalid params" }); return;
  }
  unblockUser(user.trim(), target.trim());
  res.json({ ok: true });
});

// ── Invites ────────────────────────────────────────────────────────────────
app.post("/friends/invite", (req, res) => {
  const { from, to, roomId } = req.body ?? {};
  if (typeof from !== "string" || typeof to !== "string" || typeof roomId !== "string") {
    res.status(400).json({ error: "invalid params" }); return;
  }
  const lf = from.trim().toLowerCase();
  const lt = to.trim().toLowerCase();
  if (!areFriends(lf, lt)) {
    res.status(403).json({ error: "Not friends" }); return;
  }
  const sender = onlineUsers.get(lf) ?? onlineUsers.get(from.trim());
  const invite = {
    from:        lf,
    fromDisplay: sender?.displayName ?? from.trim(),
    roomId:      roomId.trim(),
    roomLabel:   sender?.roomLabel ?? "Library",
    at:          Math.floor(Date.now() / 1000),
  };

  // Primary: instant delivery via Colyseus WebSocket
  const destClient = chatSessions.get(lt);
  if (destClient) {
    destClient.send("invite", invite);
  }

  // Fallback: store for HTTP polling (recipient not yet in game)
  pushInvite(lt, invite);

  res.json({ ok: true });
});

app.get("/invites/:username", (req, res) => {
  res.json(popInvites(req.params.username));
});

// ── Chat ───────────────────────────────────────────────────────────────────
app.get("/chat/history/:userA/:friend", (req, res) => {
  const { userA, friend } = req.params;
  if (!areFriends(userA, friend)) { res.status(403).json({ error: "Not friends" }); return; }
  try {
    markRead(userA.toLowerCase(), friend.toLowerCase());
    res.json(getMessages(userA, friend));
  } catch { res.status(500).json({ error: "query failed" }); }
});

app.get("/chat/unread/:username", (req, res) => {
  try { res.json(getUnreadCounts(req.params.username.toLowerCase())); }
  catch { res.status(500).json({ error: "query failed" }); }
});

app.post("/chat/send", (req, res) => {
  const { from, to, body } = req.body ?? {};
  if (typeof from !== "string" || typeof to !== "string" || typeof body !== "string" || !body.trim()) {
    res.status(400).json({ error: "invalid params" }); return;
  }
  if (!areFriends(from.trim(), to.trim())) { res.status(403).json({ error: "Not friends" }); return; }
  try {
    const saved  = saveMessage(from.trim(), to.trim(), body.trim());
    const fromUser = onlineUsers.get(from.trim().toLowerCase());
    const packet = {
      id: saved.id, from: from.trim(), fromDisplay: fromUser?.displayName ?? from.trim(),
      to: to.trim(), body: body.trim(), createdAt: saved.createdAt,
    };
    const dest = chatSessions.get(to.trim().toLowerCase());
    if (dest) dest.send("chatMsg", packet);
    res.json({ ok: true, ...saved });
  } catch { res.status(500).json({ error: "send failed" }); }
});

// ── Server ─────────────────────────────────────────────────────────────────
const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});
gameServer.define("library", LibraryRoom);

httpServer.listen(PORT, async () => {
  console.log(`Server on http://localhost:${PORT}`);
  const global = await matchMaker.createRoom("library", {
    label: "Global Library", isGlobal: true,
  });
  console.log(`  [global] Global Library → ${global.roomId}`);
});

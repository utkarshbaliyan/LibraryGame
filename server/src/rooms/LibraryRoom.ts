import { Room, Client } from "colyseus";
import { LibraryState, Player } from "./schema/LibraryState";
import { saveSession, ensureUser, getDisplayName } from "../db";
import { onlineUsers } from "../online";

interface MoveMessage     { x: number; y: number; dir: string; moving: boolean; }
interface BuyMessage      { minutes: number; }
interface SitDownMessage  { seatId: number; }
interface JoinOptions     { username?: string; displayName?: string; label?: string; isGlobal?: boolean; createdBy?: string; }

const VALID_DURATIONS = new Set([30, 45, 60, 90, 120, 150, 180, 210]);
const IDLE_KICK_SECS  = 60;

// World: 1600×1200. Seat x,y = where the character sits (chair centre).
// Desk top-left is derived from seat: desk.x = seat.x - w/2, desk.y = seat.y - h - 22
export const DESKS = [
  // Grand Reading Hall (seats 0-3)
  { x: 418, y:  98, w: 44, h: 20 },
  { x: 558, y:  98, w: 44, h: 20 },
  { x: 698, y:  98, w: 44, h: 20 },
  { x: 838, y:  98, w: 44, h: 20 },
  // Quiet Zone (seats 4-5)
  { x:1098, y:  88, w: 44, h: 20 },
  { x:1278, y:  88, w: 44, h: 20 },
  // Study Tables (seats 6-7)
  { x: 108, y: 448, w: 44, h: 20 },
  { x: 108, y: 568, w: 44, h: 20 },
];

export const SEATS = DESKS.map((d, id) => ({
  id,
  x: d.x + d.w / 2,   // 440, 580, 720, 860, 1120, 1300, 130, 130
  y: d.y + d.h + 22,  // 140, 140, 140, 140,  130,  130, 490, 610
}));

export class LibraryRoom extends Room<LibraryState> {
  maxClients = 100;
  private takenSeats = new Set<number>();

  onCreate(options: JoinOptions) {
    const isGlobal = options?.isGlobal ?? false;
    this.autoDispose = !isGlobal;
    this.setMetadata({
      label:     options?.label     ?? "Study Hall",
      isGlobal,
      createdBy: options?.createdBy ?? null,
    });
    this.setState(new LibraryState());

    this.onMessage("move", (client: Client, data: MoveMessage) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || p.pstate === "studying") return;
      p.x      = Math.max(20, Math.min(1580, data.x));
      p.y      = Math.max(20, Math.min(1180, data.y));
      p.dir    = data.dir;
      p.moving = data.moving;
    });

    this.onMessage("buySession", (client: Client, data: BuyMessage) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || p.pstate === "studying") return;
      if (!VALID_DURATIONS.has(data.minutes)) return;
      p.sessionMins = data.minutes;
      p.pstate      = "browsing";
    });

    this.onMessage("sitDown", (client: Client, data: SitDownMessage) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || p.pstate !== "browsing") return;
      if (data.seatId < 0 || data.seatId >= SEATS.length) return;

      if (this.takenSeats.has(data.seatId)) {
        client.send("actionError", { message: "That seat is already taken." });
        return;
      }

      const seat = SEATS[data.seatId];
      this.takenSeats.add(data.seatId);
      p.seatId      = data.seatId;
      p.pstate      = "studying";
      p.sessionLeft = p.sessionMins * 60;
      p.idleSince   = 0;
      p.x           = seat.x;
      p.y           = seat.y;
      p.moving      = false;
    });

    this.onMessage("standUp", (client: Client) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || p.pstate !== "studying") return;
      this.releasePlayer(p);
      client.send("sessionEnd", { early: true });
    });

    this.clock.setInterval(() => {
      const nowSec  = Math.floor(Date.now() / 1000);
      const toKick: string[] = [];

      this.state.players.forEach((p, sid) => {
        if (p.pstate === "studying") p.sessionSeconds++;

        if (p.pstate === "studying") {
          p.sessionLeft--;
          if (p.sessionLeft <= 0) {
            this.releasePlayer(p);
            const c = this.clients.find(c => c.sessionId === sid);
            if (c) c.send("sessionEnd", { early: false });
          }
        } else if (p.idleSince > 0 && nowSec - p.idleSince >= IDLE_KICK_SECS) {
          toKick.push(sid);
        }
      });

      for (const sid of toKick) {
        const c = this.clients.find(c => c.sessionId === sid);
        if (c) {
          c.send("kicked", { reason: "idle" });
          setTimeout(() => c.leave(4000), 400);
        }
      }
    }, 1000);
  }

  private releasePlayer(p: Player) {
    const studiedSecs = p.sessionMins * 60 - p.sessionLeft;
    if (studiedSecs >= 60) {
      try { saveSession(p.username || p.name, this.roomId, Math.floor(studiedSecs)); } catch { }
    }
    if (p.seatId >= 0) { this.takenSeats.delete(p.seatId); p.seatId = -1; }
    p.pstate      = "idle";
    p.sessionLeft = 0;
    p.sessionMins = 0;
    p.idleSince   = Math.floor(Date.now() / 1000);
  }

  onJoin(client: Client, options: JoinOptions) {
    const username    = options?.username?.trim() || `guest_${client.sessionId.slice(0, 6)}`;
    const displayName = options?.displayName?.trim() || username;

    const p           = new Player();
    // Spawn in Main Hall (x: 300-1060, y: 380-800)
    p.x               = 450 + Math.random() * 400;
    p.y               = 480 + Math.random() * 240;
    p.username        = username;
    p.name            = displayName;
    p.sessionSeconds  = 0;
    p.pstate          = "idle";
    p.idleSince       = Math.floor(Date.now() / 1000);
    this.state.players.set(client.sessionId, p);

    try { ensureUser(username, displayName); } catch { }

    // Track online presence
    onlineUsers.set(username, {
      username,
      displayName,
      roomId: this.roomId,
      roomLabel: this.metadata?.label ?? "Library",
    });

    console.log(`[+] ${displayName} (@${username}) → ${this.metadata?.label}`);
  }

  onLeave(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (p) {
      if (p.seatId >= 0) this.takenSeats.delete(p.seatId);
      if (p.pstate === "studying" && p.sessionMins > 0) {
        const studiedSecs = p.sessionMins * 60 - p.sessionLeft;
        if (studiedSecs >= 60) {
          try { saveSession(p.username || p.name, this.roomId, Math.floor(studiedSecs)); } catch { }
        }
      }
      onlineUsers.delete(p.username || p.name);
      console.log(`[-] ${p.name} left`);
    }
    this.state.players.delete(client.sessionId);
  }
}

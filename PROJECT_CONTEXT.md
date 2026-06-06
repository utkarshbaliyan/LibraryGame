# Study Library — Master Project Context

> Read this first in every new session. It contains the full design intent, technical decisions, and current state of the project.

---

## What Is This?

**Study Library** is a multiplayer 2D top-down study space for Indian competitive exam aspirants (UPSC, JEE, NEET, CAT, GATE, etc.). The core idea: studying alone is boring, studying with a community visible around you feels motivating. Think Gather.town but purpose-built for Indian students, with gamification (leaderboard, character customization, streaks) layered on top.

The visual and interaction inspiration is **Machiavillain** (Steam) — a top-down 2D hub world where you walk your character through distinct rooms, interact with furniture/kiosks, and the world feels alive with other people in it. Not a UI website. A place you exist in.

---

## Tech Stack (Locked — Do Not Change Without Strong Reason)

| Layer | Tech | Notes |
|---|---|---|
| Frontend framework | Next.js 16 (App Router) | `frontend/` folder |
| 2D game engine | Phaser 3.60.0 | Loaded via CDN in `page.tsx` and `game/page.tsx` |
| Multiplayer | Colyseus | `server/` folder, port 2567 |
| Database | SQLite (`data/library.db`) | Accessed by Colyseus server |
| Auth | Supabase (planned) | Username/display name stored in `localStorage` for now |
| Fonts | Space Mono (mono UI), Cinzel (fantasy headers), Space Grotesk (body) | Loaded via `next/font/google` in `layout.tsx` |
| Animation | Framer Motion | Panels, modals, leaderboard bars |

### Key File Paths
```
frontend/app/page.tsx          — Home world (Phaser hub + React panels)
frontend/app/game/page.tsx     — Library game (Phaser multiplayer study room)
frontend/app/profile/page.tsx  — Profile + character editor
frontend/app/friends/page.tsx  — Friends list, chat, search
frontend/app/leaderboard/page.tsx — Weekly leaderboard
frontend/app/join/page.tsx     — Sign in / registration
frontend/app/layout.tsx        — Root layout, font loading
frontend/app/globals.css       — Full design system (CSS variables, utility classes)
frontend/components/GameNav.tsx — Nav component (supports minimal mode for sub-pages)
frontend/lib/api.ts            — All API helper functions + TypeScript interfaces
frontend/lib/constants.ts      — SERVER_HTTP = 'http://localhost:2567'
server/src/index.ts            — Colyseus server + REST endpoints
server/src/rooms/LibraryRoom.ts — Multiplayer room logic
server/src/db.ts               — SQLite queries
```

### localStorage Keys (used across the app)
```
sl_name        — username (login identifier)
sl_display     — display name
sl_gender      — 'male' | 'female'
sl_skin        — hex colour e.g. '#f5c5a3'
sl_hair        — hex colour
sl_shirt       — hex colour
sl_pants       — hex colour
sl_shoes       — hex colour
sl_roomId      — last joined room ID (cleared to enter global library)
```

---

## Design System

Defined in `frontend/app/globals.css`. Dark warm fantasy aesthetic — think an ancient library lit by candlelight.

### Colour Palette
```css
--bg:         #0b0600   /* page background — near black warm */
--surface:    #150a01
--card:       #1c1003   /* card background */
--text:       #f0e6c8   /* warm parchment */
--muted:      #c5a87c
--dim:        rgba(185,148,82,0.55)
--accent:     #f59e0b   /* gold — primary CTA colour */
--purple:     #a78bfa   /* secondary — leaderboard, profile */
--amber:      #fb923c   /* tertiary */
--red:        #f87171
--cyan:       #22d3ee
--green:      #4ade80   /* friends, online status */
--border:     rgba(178,126,40,0.2)
--border-hi:  rgba(212,162,62,0.48)
```

### CSS Classes Available
- `.game-card` — dark card with gold corner accents, hover glow
- `.btn-neon` — gold filled button with glow on hover
- `.btn-ghost` — bordered ghost button
- `.btn-enter` — large Cinzel CTA button
- `.game-input` — styled input field
- `.fantasy-h1` — Cinzel bold gold heading
- `.label-chip` — small all-caps monospace label with ◆ prefix
- `.live-dot` — animated green/amber/purple pulsing dot
- `.divider-gold` — decorative gradient line with ◆ in center
- `.page-wrap` — max-width 1100px centered container
- `.game-nav` — sticky top nav bar (full mode)

### Fonts
- `var(--font-cinzel)` — fantasy headings, leaderboard numbers, large stats
- `var(--font-mono)` — labels, badges, codes, `'Space Mono', monospace`
- `var(--font-grotesk)` — body text (default body font)

---

## Current Application Structure

### 1. Home World (`/`) — The Hub
A full-screen Phaser 3 game. The player walks a character through a 1280×720 open 4-room map. No walls between rooms — open floor plan divided by decorative gold strips.

**Rooms:**
- Top-left (green tint): **Friends Zone** — tables, chairs, add-friend board
- Top-right (purple tint): **Leaderboard Zone** — trophy cabinet, podium, rank board
- Bottom-left (amber tint): **Home / Wardrobe** — wardrobe furniture, desk, armchair
- Bottom-right (dark): **Library Entrance** — bookshelves, notice board, reception desk + big glowing door

**React panels (slide in from right):**
| Panel key | Opened by | Content |
|---|---|---|
| `library-rooms` | Dock "Library" button or walking to notice-board/reception zones | 2 options: Enter Global Library, Create Library |
| `friends` | Dock "Friends" button or walking to add-friend zone | Friend list, search, requests |
| `ranking-board` | Dock "Leaderboard" button or walking to rank board zone | Medal leaderboard with progress bars |
| `my-stats` | Dock "My Stats" button or walking to my-stats zone | 2×2 metric grid (weekly/total/sessions/avg) |
| `wardrobe` | Dock "Wardrobe" button or walking to wardrobe zone | Character preview + colour swatches |

**HUD structure:**
- Top bar (44px): logo + user chip + Profile link
- Game canvas: `top:44px, bottom:60px, left:0, right:0` (not behind bars)
- Bottom dock (60px): Library / Friends / Leaderboard / Wardrobe / My Stats buttons + WASD hint

**Phaser script injection:**
`GAME_SCRIPT` is a template literal string in `page.tsx` injected as a `<script>` tag at runtime. IMPORTANT constraints inside the script:
- No `${}` template interpolation (would be captured by the outer template literal)
- All JavaScript uses `var`, not `const`/`let` (for compatibility)
- Guard: `window.__homeWorldStarted` prevents double-init on hot reload
- Character events: `sl:interact`, `sl:panelOpened`, `sl:panelClosed`, `sl:appChanged` via `CustomEvent`

### 2. Library Game (`/game`) — The Study Room
Phaser multiplayer room. Players sit at desks and study with a Pomodoro timer. Study time is tracked and synced to server. Uses Colyseus WebSocket for real-time presence.

### 3. Profile (`/profile`)
Character editor (appearance swatches + canvas preview), display name, bio, study goal. Edit saved via `PUT /profile/:username` REST endpoint.

### 4. Friends (`/friends`)
Full-featured page: friend list, friend search, pending requests, DM chat (5-second poll). Also accessible as a panel on the home world.

### 5. Leaderboard (`/leaderboard`)
Weekly study time rankings. Top 3 get medal display. Resets every Monday. Also accessible as a panel on the home world.

---

## API Endpoints (Colyseus server, port 2567)

```
GET  /rooms                         — list open rooms
POST /rooms                         — create a room { label, hostName }
GET  /leaderboard                   — weekly top 20 [{ name, displayName, weekly_secs }]
GET  /profile/:username             — profile data
PUT  /profile/:username             — update profile
GET  /friends/:username             — { friends, sent, received, blocked }
POST /friends/request               — { from, to }
POST /friends/accept                — { user, from }
DELETE /friends/:user/:target       — remove/reject friend
POST /friends/block                 — { user, target }
POST /friends/unblock               — { user, target }
GET  /users/search?q=&exclude=      — search users
POST /friends/invite                — { from, to, roomId }
GET  /chat/history/:user1/:user2    — DM message history
POST /chat/send                     — { from, to, body }
GET  /chat/unread/:username         — unread counts per friend
```

---

## Navigation Architecture

The site has two navigation modes:

**Hub mode (home page `/`):** No nav bar. Everything is panels opened from the dock or by walking to zones in the game world. Only link away is "PROFILE" in the HUD top bar.

**Page mode (sub-pages):** `GameNav` with `minimal` prop — shows just `◆ FOCUS LIBRARY` logo + `← BACK` + `LOBBY` buttons. Sub-pages are `/friends`, `/leaderboard`, `/profile`.

---

## Character System

4-direction top-down humanoid drawn with Phaser Graphics primitives (no sprites/assets).

```
drawCharacter(g, app, dir, lp, isMe)
  g   — Phaser Graphics object
  app — { gender, skin, hair, shirt, pants, shoes } (colours as integers)
  dir — 'up' | 'down' | 'left' | 'right'
  lp  — walk phase (float, incremented each frame while moving)
  isMe — if true, draws gold ring around character
```

The same character drawing logic is duplicated in:
1. `page.tsx` GAME_SCRIPT (home world Phaser)
2. `game/page.tsx` GAME_SCRIPT (library Phaser)
3. `drawPreview()` Canvas 2D function in `page.tsx` and `profile/page.tsx` (React preview)

Colour helper functions used throughout:
- `lig(c)` — lighten a colour (adds 55 to each channel)
- `drk(c)` — darken a colour
- `h2i(hex)` — hex string → integer (for Phaser)
- `hexN(hex)` — hex string → integer (for Canvas)
- `hexRgb(n, alpha)` — integer → CSS rgb/rgba string (for Canvas)

---

## What Still Needs Building (Roadmap)

### High Priority
1. **Real auth** — Replace localStorage username with Supabase Auth (email/password or Google OAuth). Currently anyone can claim any username.
2. **Supabase integration** — Move SQLite to Supabase Postgres for persistence and hosting.
3. **Better home world character** — More polished shape. Among Us bean style was discussed.
4. **Other players visible in home world** — Currently the home world is single-player visually. Add WebSocket presence so friends appear as NPCs walking around.
5. **Study timer UI** — In-library Pomodoro needs a cleaner overlay (current one is functional but plain).

### Medium Priority
6. **Minimap overlay** — Small corner map showing where the player is in the home world.
7. **Room corridors / doorways** — Proper room separation with doorways instead of open floor plan.
8. **Streak system** — Daily study streak tracking, displayed on profile and home world.
9. **Mobile support** — Virtual joystick for touch devices.
10. **Exam categories** — Tag rooms by exam type (UPSC, JEE, etc.) so students can find peers preparing for the same exam.

### Low Priority / Polish
11. **Sound effects** — Soft ambient library sounds, footstep sounds.
12. **Furniture interaction animations** — Character sits when near desk.
13. **Achievement badges** — Unlockable cosmetics for study milestones.
14. **Dark/light mode** — Currently dark only; a sepia "daytime" variant is possible.

---

## Machiavillain Inspiration Notes

Machiavillain (Steam) is a dungeon management game with a top-down 2D view. Key elements we want to replicate in feel:

1. **Room-based layout** — The world is divided into named rooms with distinct floor colours and furniture. Each room has a purpose and "feel".
2. **Walkable hub** — You move your character through the world, not click menus. Discovery happens by walking.
3. **Furniture as interactive objects** — Desks, notice boards, wardrobes are clickable/approachable interaction zones, not just decorations.
4. **Character presence** — Your character is always visible, personalised, and other characters (NPCs or players) are visible in the same space.
5. **Top-down perspective** — Pure top-down (not isometric). Characters are drawn as seen from directly above, with a slight south-facing bias.
6. **Zone labels** — Small floating text above zones tells you what pressing [E] will do.
7. **Atmospheric lighting** — In Machiavillain, rooms have distinct lighting moods. We replicated this with floor colour tinting per room.

The key difference from Gather.town: Gather.town is office/conference-room focused. We are exam-prep focused with Indian cultural context — UPSC/JEE vocabulary, timer-based study, rank boards, etc.

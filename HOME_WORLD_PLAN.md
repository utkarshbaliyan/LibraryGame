# Home World Plan

The home world is the lobby/hub of Study Library. It is a Phaser 3 game embedded in `frontend/app/page.tsx`. The player walks a character through a 2D top-down map inspired by Machiavillain — a warm, atmospheric library hub with distinct rooms and interactive zones.

---

## Current Implementation Status

### World Dimensions
- **Canvas world size:** 1280 × 720 px (16:9)
- **Scale mode:** `Phaser.Scale.FIT` — canvas fits within the game container
- **Game container:** `position:absolute, top:44px, bottom:60px, left:0, right:0`
  (sits between the top HUD bar and the bottom dock, not behind them)
- **Physics:** Arcade, gravity 0, no inner walls — only `setCollideWorldBounds(true)`
- **Camera:** Follows player with 0.1 lerp, bounded to 0,0,1280,720

### Room Layout (4 Quadrants)
```
┌──────────────────────────┬───────────────────────────────┐
│                          │                               │
│   FRIENDS ZONE           │   LEADERBOARD ZONE            │
│   (green tint)           │   (purple tint)               │
│   x:0–620, y:0–340       │   x:640–1280, y:0–340         │
│                          │                               │
├──────────────────────────┼───────────────────────────────┤  ← 20px gold divider strip
│                          │                               │
│   HOME / WARDROBE        │   LIBRARY ENTRANCE            │
│   (amber/warm tint)      │   (dark warm tint)            │
│   x:0–620, y:360–720     │   x:640–1280, y:360–720       │
│                          │                               │
└──────────────────────────┴───────────────────────────────┘
                           ↑ 20px vertical gold divider strip
```

**Divider variables:** `DIV_X=620, DIV_Y=340, DIV=20`

### Room Floor Colours
| Room | Hex | Character |
|---|---|---|
| Friends | `0x16301a` | Dark forest green |
| Leaderboard | `0x1e1230` | Deep purple-navy |
| Home/Wardrobe | `0x281804` | Warm dark amber |
| Library Entrance | `0x1a1004` | Dark warm black |

---

## Interaction Zones (ZONES array)

Each zone has: `id`, `x`, `y` (centre), `r` (proximity radius), `label` (shown above player)

| ID | Position | Radius | Opens |
|---|---|---|---|
| `wardrobe` | (62, DIV_Y+DIV+60) | 62 | Wardrobe panel |
| `notice-board` | (DIV_X+DIV+70, DIV_Y+DIV+82) | 60 | Library panel |
| `reception` | (DIV_X+DIV+208, DIV_Y+DIV+86) | 60 | Library panel |
| `ranking-board` | (DIV_X+DIV+270, 70) | 70 | Leaderboard panel |
| `my-stats` | (62, WH-56) | 56 | My Stats panel |
| `add-friend` | (70, 74) | 56 | Friends panel |
| `big-door` | (WW/2+270, WH-40) | 65 | Navigate to /game |

Player approaches a zone → `[E] label` appears above their head, pulsing.
Press E → fires `CustomEvent('sl:interact', { detail: { type: zone.id } })`
React catches this and opens the matching panel.

---

## Furniture

### Home / Wardrobe Quadrant (bottom-left)
- Wardrobe (tall cabinet with mirror panel + gold handles)
- Mirror (reflective blue-tinted panel)
- Armchair (deep red velvet with arm rests)
- Rug (oval, with decorative gold border rings)
- Desk (brown wood with gold lamp and monitor)
- Chair (office style)
- Plants (2× corner plants)

### Library Entrance (bottom-right)
- 3× Bookshelf rows (top edge, filled with colourful spines)
- Notice board (announcements pinned — opens Library Rooms panel)
- Reception desk (opens New Room / Create Library)
- 2× Tall bookshelves (right wall)
- 2× Plants (corners)

### Friends Zone (top-left)
- Add-friend board (green chalkboard-style, opens Friends panel)
- 3× Round tables with chairs (scattered, social arrangement)
- Couch (long, red)
- Coffee table
- Plant (corner)

### Leaderboard Zone (top-right)
- Trophy cabinet (gold/silver/bronze trophies)
- Rank board (screen showing rankings — opens Leaderboard panel)
- Podium (3-tier gold/silver/bronze)
- Desk + chair (for the leaderboard admin look)
- 2× Plants (corners)

---

## Big Library Door

Located in the Library Entrance quadrant (bottom-right), bottom wall:
- Position: `dx = WW/2+222, dy = WH-24, dw = 96, dh = 64`
- Drawn with wood frame, double doors, gold handles, pointed arch above
- Animated golden glow pulses beneath it every frame
- Sign above reads `▼ ENTER LIBRARY ▼` with opacity pulse
- Walking into the door auto-triggers fade-out → `window.location.href = '/game'`
- Also triggerable by pressing [E] in proximity

---

## Player Character

Spawns at `(180, DIV_Y + DIV + 120)` — centre of the Home quadrant.

Movement: WASD + Arrow keys, speed 130px/s, diagonal normalised with 0.707 factor.
Direction tracking: `sc._dir` ('up'|'down'|'left'|'right')
Walk phase: `sc._lp` — incremented `+= delta * 0.004` while moving

Character drawn by `drawCharacter(g, app, dir, lp, isMe)` on every frame.
Name tag floats above player head.

---

## React Panels (slide in from right, 380px wide)

| Panel | Accent colour | Content |
|---|---|---|
| **Library** | Gold `#f5c842` | 2 big buttons: Enter Global Library + Create Library |
| **Friends** | Green `#4ade80` | 3 tabs: Friends list / Requests / Search |
| **Leaderboard** | Purple `#a78bfa` | Medal top-3, ranked list with animated progress bars |
| **My Stats** | Green `#4ade80` | 2×2 grid: This Week / All Time / Sessions / Avg Session + Goal + Bio |
| **Wardrobe** | Gold `#f5c842` | Canvas character preview + colour swatches for all attributes |

PanelShell component: dark gradient background, accent header line, Cinzel title, ✕ close button.

---

## HUD Overlay

### Top Bar (44px, zIndex 400)
- Left: `◆ FOCUS LIBRARY` logo in Cinzel gold
- Right: User chip (display name + @username) + Profile link button
- If not logged in: `SIGN IN →` button linking to `/join`

### Bottom Dock (60px, zIndex 400)
5 buttons, all open panels:
```
📖 Library  |  👥 Friends  |  🏆 Leaderboard  |  👗 Wardrobe  |  📊 My Stats
```
Right side: `WASD · MOVE | E · INTERACT` hint text

---

## CustomEvent Bridge (Phaser ↔ React)

| Event name | Direction | Payload | Purpose |
|---|---|---|---|
| `sl:interact` | Phaser → React | `{ type: zone.id }` | Open a panel |
| `sl:panelOpened` | React → Phaser | none | (future: pause Phaser input) |
| `sl:panelClosed` | React → Phaser | none | Re-enable keyboard capture |
| `sl:appChanged` | React → Phaser | `{ gender, skin, hair, shirt, pants, shoes }` | Update character appearance live |

---

## Implementation Phases (Completed vs Planned)

### ✅ Phase A — Foundation
- Phaser scene setup, floor tiles, room dividers
- Player movement (WASD + arrow keys)
- Camera follow with world bounds
- Zone proximity detection + E-key interaction
- CustomEvent bridge to React

### ✅ Phase B — Furniture + Visual
- All furniture drawn with Phaser Graphics primitives
- Room name labels (top-left of each quadrant)
- Always-visible zone signs above furniture
- Big library door with glow animation

### ✅ Phase C — Interaction Panels
- All 5 panels (Library, Friends, Leaderboard, Stats, Wardrobe)
- CreateRoom modal
- Panel open/close with Framer Motion slide animation
- Character wardrobe live preview + swatch selectors

### 🔲 Phase D — Friend NPCs (Not Started)
- Other users visible as characters in the home world
- WebSocket presence endpoint: who is in the lobby
- NPC characters walk around or stand near furniture
- Clicking a friend NPC opens quick-chat or invite option

### 🔲 Phase E — Polish (Not Started)
- Soft ambient sound (background music loop, toggleable)
- Character sits/stands animation near desks
- Entry animation (fade in + character walks from door)
- Minimap overlay (small corner map, shows player position)
- Day/night cycle tint based on time of day (India timezone)

---

## Known Constraints + Gotchas

1. **GAME_SCRIPT is a template literal** — Inside it, never use `${}` (would be captured by the outer TS template literal). Use string concatenation instead. Variable arithmetic like `DIV_X+DIV+20` is fine — it's runtime JS.

2. **Script double-init guard** — `window.__homeWorldStarted = true` at the top of the IIFE. Without this, Next.js hot reload would re-inject the script and create two Phaser instances.

3. **Keyboard capture** — `sc.input.keyboard.disableGlobalCapture()` must be called after Phaser init, otherwise WASD gets swallowed when the user types in an input field. The `sl:panelClosed` event re-calls this to re-enable game keyboard after closing a panel.

4. **Panel pointer events** — Panels are rendered in the React layer (above Phaser). The game container has no pointer-events restriction, so clicking outside a panel works normally.

5. **Character colour format** — Phaser uses integers (`0xRRGGBB`), Canvas 2D uses `rgb(r,g,b)` strings. localStorage stores hex strings (`#rrggbb`). Conversion helpers: `h2i()` for Phaser, `hexN()+hexRgb()` for Canvas.

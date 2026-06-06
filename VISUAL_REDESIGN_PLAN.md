# Visual Redesign Plan

This document captures the design vision, aesthetic decisions, and UI guidelines for Study Library. Read alongside `PROJECT_CONTEXT.md`.

---

## Design Philosophy

The app should feel like **a place**, not a dashboard. Every screen should reinforce the feeling that you are inside an ancient, prestigious library — warm candlelight, heavy wood, gold detailing, the smell of old books (metaphorically through visual texture). The opposite of a flat SaaS product.

Machiavillain (Steam) is the key visual reference for the game world. Think:
- Top-down 2D rooms with distinct personalities
- Furniture as story-telling (a wardrobe says "you can become someone here")
- Characters that exist in the space, not just profile picture bubbles
- Colour-coded zones that instantly communicate their purpose

---

## Aesthetic Pillars

### 1. Dark Fantasy Library
Not "dark mode". **Dark fantasy**. Like a wizard's reading room or a Victorian private library.
- Deep brown-black backgrounds (`#0b0600`, `#1c1003`)
- Warm amber/gold accents — think candlelight (`#f59e0b`, `#f5c842`)
- Parchment text (`#f0e6c8`) — never pure white
- Gold borders and decorative corner accents on cards (the `::before/::after` CSS pattern)

### 2. Monospace UI Language
All labels, badges, stats, and navigation use `Space Mono`. This creates a "system readout" feeling — like you're looking at a magic terminal inside the library. Cinzel serif for titles gives the fantasy gravitas.

### 3. Earned Hierarchy
Important information is visually prominent. Numbers that matter (study time, rank) are large and in Cinzel. Context labels are tiny mono in all-caps. Never the other way around.

### 4. Depth Through Layering
Every card has subtle glow, inner shadow, or gradient to suggest depth. The game canvas is "behind" the HUD which is "behind" panels. This layering is architectural.

---

## Colour Roles

| Colour | Role | When to use |
|---|---|---|
| Gold `#f59e0b / #f5c842` | Primary accent | CTAs, player ring, headings, borders on important cards |
| Purple `#a78bfa` | Leaderboard / achievement | Rank numbers, leaderboard panel, achievement badges |
| Green `#4ade80` | Social / online | Friends, online dots, friend-related UI |
| Cyan `#60a5fa / #22d3ee` | Stats / data | Study time charts, session stats |
| Amber `#fb923c` | Notifications / pending | Friend requests, unread counts, pending states |
| Red `#f87171` | Danger / destructive | Block, errors, remove actions |
| Parchment `#e8d5b0` | Library entrance | Bookshelves, wooden furniture tones |

---

## Typography System

```
Headings / Panel titles:  Cinzel, 700 weight
                          Letter spacing: 0.04–0.1em
                          Example: "Leaderboard", "My Stats"

Large numbers / stats:    Cinzel, 700, large size (18–24px)
                          Colour: accent colour of the metric

Labels / badges:          Space Mono, 8–10px
                          All caps, letter spacing 0.12–0.18em
                          Example: "THIS WEEK", "PENDING", "ONLINE"

Body / descriptions:      Space Grotesk (default body font)
                          Example: bio text, room descriptions

Monospace data:           Space Mono, 10–13px
                          Example: @username, time values like "4h 23m"
```

---

## Component Patterns

### Cards (`.game-card`)
- Background: `var(--card)` = `#1c1003`
- Border: `1px solid var(--border)` = `rgba(178,126,40,0.2)`
- Corner decorations: CSS `::before` (top-left) and `::after` (bottom-right) with gold L-shapes
- Hover: border brightens, subtle gold glow, background slightly lighter
- No border-radius (0–8px max) — sharp corners feel more architectural

### Panels (slide-in drawer)
- Width: 380px
- Slides in from right edge
- Dark gradient background: `linear-gradient(180deg, #16080a, #0e0600)`
- Header: accent-coloured gradient tint, Cinzel title, mono subtitle, gold accent line
- Content scrollable; toast notifications appear at bottom of panel

### Buttons
- **`.btn-neon`** (gold filled) — primary actions like "JOIN", "ACCEPT"
- **`.btn-ghost`** (bordered) — secondary actions like "CANCEL", "DECLINE"
- **`.btn-enter`** (large Cinzel) — major CTAs like "ENTER LIBRARY"
- **Dock buttons** — custom in `page.tsx`, each has its own accent colour, transparent background, glow on hover

### Metric Cards (Stats panel)
- 2×2 grid layout
- Each has a 2px accent gradient bar at the top
- Large Cinzel number in accent colour
- Tiny mono label above in faded accent colour
- Optional sub-label below in dim colour

---

## Page-by-Page Visual Specification

### Home World (`/`)
**Goal:** Feel like you're inside a 2D top-down library building, not looking at a website.

- No page scroll. Full viewport.
- Phaser canvas occupies the space between HUD (44px) and dock (60px)
- HUD: minimal — just logo and user chip. No navigation links (everything is panels or walking)
- Dock: 5 game-style buttons with individual accent colours. Transparent with blur backdrop.
- Panels: slide in over game world, semi-opaque backdrop

**Room moods (floor colour tints):**
- Friends: dark forest green — social, inviting
- Leaderboard: deep purple — prestigious, competitive
- Home: warm amber — personal, your space
- Library Entrance: near-black warm — gateway, serious

### Friends Page (`/friends`)
**Goal:** Feel like a guild roster, not a social network.

- `GameNav minimal` — just logo + back button (no full nav)
- Header: "Friends" in Cinzel gold, @username below in mono
- Tab navigation: Friends / Requests / Search — mono, dark tab buttons
- Friend rows: avatar initial chip (green), display name in Cinzel, @username in mono dim, online dot
- Chat: message bubbles with gold (received) / purple (sent) colour coding

### Leaderboard (`/leaderboard`)
**Goal:** Feel like a prestigious Hall of Fame board, not a data table.

- `GameNav minimal`
- "Hall of Scholars" heading in Cinzel
- Top 3: Podium-style cards (gold > silver > bronze), staggered heights
- Rest: table with rank badge, Cinzel name, mono time value, progress bar
- Your row highlighted with gold left border
- Countdown to weekly reset in amber mono

### Profile (`/profile`)
**Goal:** Your scholar identity card.

- `GameNav minimal`
- Character preview canvas (large, centred)
- Colour swatch sections for each attribute
- Display name + bio + study goal fields
- Stats summary (weekly/total time)

### Join Page (`/join`)
**Goal:** Simple, atmospheric entry point.

- No nav
- Central card on dark background
- Cinzel heading "◆ FOCUS LIBRARY"
- Username + display name inputs
- Character quick-customise (swatches)
- Large gold enter button

---

## The In-Game Phaser UI

### Character Design
- Top-down humanoid with 4 directions
- Shadow ellipse under feet
- Animated walking (leg swing using sine wave on `lp` phase)
- Gold ring around "self" character
- Name tag floats above head

### Zone Interaction Labels
- Small text above player: `[E] Wardrobe`, `[E] Leaderboard`, etc.
- Pulsing alpha (sine wave on time): draws attention
- Always-visible permanent signs above each zone in the world (so players know what's there without walking close)

### Big Door (Library Entrance)
- Double wooden doors with pointed arch
- Gold handles
- Animated glow beneath (alpha pulses with sin wave)
- `▼ ENTER LIBRARY ▼` sign pulses
- Camera fades to black on entry → navigate to `/game`

---

## What Makes This Different from Generic Dark Mode

1. **Gold corners on cards** — The `::before/::after` L-shape in CSS is a design signature. Every card feels like a framed document.
2. **Phaser world as primary UI** — The map IS the nav. You walk to things. This is unique.
3. **Character as identity** — Your customised character appears everywhere: home world, library, preview in wardrobe. It's yours.
4. **Parchment text, not white** — `#f0e6c8` is warm. It reads like paper, not a screen.
5. **Space Mono everywhere** — The choice of a fixed-width font for all labels creates a consistent "arcane readout" feel, like the library's magical filing system.

---

## Planned Visual Improvements

### Short Term
- [ ] Animated room name plates (subtle shimmer on the room label in the top corner)
- [ ] Better wardrobe panel character preview (full body, not just torso)
- [ ] Leaderboard panel crown/flame above the #1 entry

### Medium Term
- [ ] Among Us bean-style character shape (rounder, cuter, more distinctive at small size)
- [ ] Character has a direction-aware visor/eye instead of drawn face
- [ ] Proper walking animation frames (not just sine-wave leg swing)
- [ ] Room furniture casts soft shadow on floor

### Long Term
- [ ] Day/night lighting in the home world (India IST-based: morning bright amber, evening deep purple, night near-dark)
- [ ] Seasonal decorations (Diwali lights in October, exam season aesthetics in May)
- [ ] Room customisation — students can add personal items to their "desk" in the library

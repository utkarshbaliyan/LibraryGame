export const SERVER_HTTP = 'http://localhost:2567';
export const SERVER_WS   = 'ws://localhost:2567';

export const DESKS = [
  { x:  90, y:  80, w: 110, h: 56 },
  { x: 345, y:  80, w: 110, h: 56 },
  { x: 600, y:  80, w: 110, h: 56 },
  { x:  90, y: 240, w: 110, h: 56 },
  { x: 345, y: 240, w: 110, h: 56 },
  { x: 600, y: 240, w: 110, h: 56 },
  { x:  90, y: 400, w: 110, h: 56 },
  { x: 345, y: 400, w: 110, h: 56 },
  { x: 600, y: 400, w: 110, h: 56 },
] as const;

export const SEATS = DESKS.map((d, id) => ({
  id,
  x: d.x + d.w / 2,
  y: d.y + d.h + 22,
}));

export const KIOSK = { x: 300, y: 516, w: 200, h: 48, cx: 400, cy: 540 };

export const VALID_DURATIONS = [30, 45, 60, 90, 120, 150, 180, 210] as const;

export const DURATION_LABELS: Record<number, string> = {
  30:  'SPRINT',
  45:  'FOCUSED',
  60:  'DEEP WORK',
  90:  'POWER',
  120: 'MARATHON',
  150: 'EXTENDED',
  180: 'FULL',
  210: 'ULTRA',
};

export function fmtDuration(mins: number): string {
  if (mins < 60) return mins + 'm';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? h + 'h' : h + 'h' + m;
}

export function fmtHMS(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0
    ? h + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0')
    : String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}

export function fmtStudyTime(secs: number): string {
  if (secs < 60) return secs + 's';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return h + 'h ' + String(m).padStart(2,'0') + 'm';
  const s = secs % 60;
  return m + 'm ' + String(s).padStart(2,'0') + 's';
}

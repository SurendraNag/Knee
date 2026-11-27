// Finger-friendly tapping on the 3D canvas, shared by every page.
// A fingertip covers far more than a mouse pointer and wobbles a little while it is down, so on touch screens a tap
// may move further before it counts as a drag, and when the exact point misses (a thin ligament, nerve or disc) the
// points around it are tried, nearest first.

const SLOP = { touch: 14, mouse: 6 };
const TAP_MS = 700;

// Call on pointerdown; keep the result until pointerup.
export function tapStart(e) {
  return { x: e.clientX, y: e.clientY, t: e.timeStamp, touch: e.pointerType !== 'mouse' };
}

// True when the pointer went up close to where it went down, soon enough to be a tap rather than a drag or a hold.
// Event time stamps are used (not the time the handler runs), so a slow frame does not turn a quick tap into a hold.
export function isTap(down, e, ms = TAP_MS) {
  if (!down) return false;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  return moved <= (down.touch ? SLOP.touch : SLOP.mouse) && e.timeStamp - down.t <= ms;
}

// Points to try around a touch: the exact point, then three rings (7, 14 and 22 px) of 8 points each.
const AROUND = [[0, 0]];
for (const [r, turn] of [[7, 0], [14, Math.PI / 8], [22, 0]]) {
  for (let k = 0; k < 8; k++) AROUND.push([r * Math.cos(turn + (k * Math.PI) / 4), r * Math.sin(turn + (k * Math.PI) / 4)]);
}

// cast(x, y) returns something truthy when there is a part at that screen point. For a mouse only the exact point is
// tried; for a finger the nearest point around it that hits wins. Returns { hit, x, y } or null.
export function fingerPick(x, y, touch, cast) {
  for (const [dx, dy] of touch ? AROUND : AROUND.slice(0, 1)) {
    const hit = cast(x + dx, y + dy);
    if (hit) return { hit, x: x + dx, y: y + dy };
  }
  return null;
}

// iPhone Safari ignores user-scalable=no, so a pinch on a panel or a quick double tap on a button zooms the whole page
// and leaves the buttons and model out of place. The 3D view has its own pinch zoom, and the AA button makes text larger.
export function lockPageZoom() {
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, (e) => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 && !e.target.closest?.('canvas')) e.preventDefault(); }, { passive: false });
}

// Share codes and named cases. A "case" is the view plus the injuries shown: no patient details.
// Share code: JSON -> deflate -> base64url, carried in the link's #c= part (never sent to the server).
const r3 = (v) => Math.round(v * 1000) / 1000;

export function snapshot({ state, camera, controls, injuries }) {
  return {
    v: 1,
    m: state.mode === 'injury' ? 1 : 0,
    p: state.peel, x: state.xray ? 1 : 0, s: r3(state.spread), ve: state.vessels ? 1 : 0, l: state.labels ? 1 : 0,
    c: [...camera.position.toArray(), ...controls.target.toArray()].map(r3),
    sel: state.mode === 'explore' ? state.selected || undefined : undefined,
    i: (injuries ? injuries.list : []).map((j) => [j.id, j.type, j.seed, j.anchor.p.map(r3), j.anchor.n.map(r3), j.anchor.u === undefined ? null : r3(j.anchor.u)]),
  };
}

export function injuryList(snap) {
  return (snap.i || []).map(([id, type, seed, p, n, u]) => ({ id, type, seed, anchor: u === null || u === undefined ? { p, n } : { u, p, n } }));
}

const b64u = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (str) => { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };

export async function encode(snap) {
  const raw = new TextEncoder().encode(JSON.stringify(snap));
  const z = await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
  return b64u(new Uint8Array(z));
}
export async function decode(code) {
  const z = unb64u(code);
  const raw = await new Response(new Blob([z]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
  const snap = JSON.parse(new TextDecoder().decode(raw));
  if (snap.v !== 1) throw new Error('unknown code version');
  return snap;
}

// Named cases live only in this browser (localStorage). Storage can be blocked (private windows), so every access is guarded.
const KEY = 'leg-explainer-cases-v1';
export function listCases() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
function writeCases(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; } }
export function saveCase(name, snap) {
  const list = listCases().filter((c) => c.name !== name);
  list.unshift({ name, at: new Date().toISOString(), snap });
  return writeCases(list);
}
export function deleteCase(name) { return writeCases(listCases().filter((c) => c.name !== name)); }
export function renameCase(from, to) { const list = listCases(); const c = list.find((x) => x.name === from); if (!c || list.some((x) => x.name === to)) return false; c.name = to; return writeCases(list); }

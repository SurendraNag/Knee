// Spine Movement page (spine-move.html): the spine from the first neck vertebra (C1) to the tailbone, with the discs,
// spinal cord and nerve roots. The spine bends forward and back, leans and turns: every vertebra is a rigid bone that
// turns about a point in the back half of the disc below it, by a share of a typical adult range of motion; the discs,
// cord, roots and ligaments follow by blending the two nearest vertebrae (linear blend skinning). A disc can be pushed
// out (bulge, protrusion, extrusion); its soft centre (nucleus, modelled) moves with it, and nerves in the way are
// pushed aside and marked, with the root that is usually affected at that level and in that direction.
// Data: public/spine-move/ (a subset of public/spine/, see scripts/build-spine-move.mjs). Frame: cm, origin in front
// of L5, +X toward the body's left, +Y up, +Z front.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { makeMaterials } from './materials.js';
import { fade } from './spine-structures.js';
import { APP_VERSION } from './version.js';
import { tapStart, isTap, fingerPick, lockPageZoom } from './touch.js';
lockPageZoom();
import './style.css';
import './spine-move.css';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const D = Math.PI / 180;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
$('#version').textContent = `v${APP_VERSION}`;

// ---------- the spine as a chain, from the sacrum (fixed) up to C1 ----------
const V = ['sacrum', 'l5', 'l4', 'l3', 'l2', 'l1', ...[12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => `t${n}`), ...[7, 6, 5, 4, 3, 2, 1].map((n) => `c${n}`)];
const NAME = (v) => (v === 'sacrum' ? 'Sacrum' : v.toUpperCase());
const S1 = (v) => (v === 'sacrum' ? 's1' : v);
// segment k joins V[k] (below) and V[k+1] (above); its disc is named upper_lower
const SEGS = V.slice(0, -1).map((lo, k) => {
  const up = V[k + 1];
  const disc = up === 'c1' ? null : `disc_${up}_${S1(lo)}`;
  return { k, lo, up, disc, label: `${NAME(up)}-${lo === 'sacrum' ? 'S1' : NAME(lo)}`, region: up[0] === 'c' ? 'neck' : up[0] === 't' ? 'mid' : 'low' };
});
// typical adult range of motion per level, degrees: flexion + extension together, side bend to one side, turn to one
// side (rounded from published in-vitro and in-vivo studies; simplified, for illustration)
const ROM = {
  'C1-C2': [15, 2, 38], 'C2-C3': [10, 10, 3], 'C3-C4': [15, 11, 7], 'C4-C5': [20, 11, 7], 'C5-C6': [20, 8, 7], 'C6-C7': [17, 7, 6], 'C7-T1': [9, 4, 2],
  'T1-T2': [4, 5, 9], 'T2-T3': [4, 6, 8], 'T3-T4': [4, 5, 8], 'T4-T5': [4, 6, 8], 'T5-T6': [5, 6, 8], 'T6-T7': [5, 6, 7], 'T7-T8': [6, 6, 6],
  'T8-T9': [6, 6, 6], 'T9-T10': [6, 6, 4], 'T10-T11': [9, 7, 2], 'T11-T12': [12, 8, 2], 'T12-L1': [12, 8, 2],
  'L1-L2': [12, 6, 2], 'L2-L3': [14, 6, 2], 'L3-L4': [15, 8, 2], 'L4-L5': [16, 6, 2], 'L5-S1': [17, 3, 1],
};
const FLEX_SHARE = { neck: 0.45, mid: 0.55, low: 0.65 }; // of flexion + extension, how much is forward
// the per-level side bend and turn figures are measured on single levels; in a living spine the levels do not all reach
// their end at once, so the whole-spine totals are scaled down to typical active ranges
const LIVE = { lat: 0.55, rot: 0.7 };

// ---------- renderer / scene ----------
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.82;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.localClippingEnabled = true;
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.32;
const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 600);
const rig = new THREE.Group(); camera.add(rig); scene.add(camera);
const key = new THREE.DirectionalLight(0xfff1e0, 2.0); key.position.set(-12, 14, 10); rig.add(key); rig.add(key.target);
const fill = new THREE.DirectionalLight(0xdbe8ff, 0.5); fill.position.set(14, 2, 8); rig.add(fill); rig.add(fill.target);
const rimL = new THREE.DirectionalLight(0xcfe0ff, 1.5); rimL.position.set(4, 10, -16); rig.add(rimL); rig.add(rimL.target);
for (const l of [key, fill, rimL]) l.target.position.set(0, 0, -60);
scene.add(new THREE.HemisphereLight(0x9fb4cc, 0x2a2018, 0.25));
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.minDistance = 5; controls.maxDistance = 320;
controls.screenSpacePanning = true; controls.zoomToCursor = true;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6), clipLow = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e6); // "Look from above": keep a slice at the disc, like a scan; cut away what is above the disc

// ---------- state ----------
const state = { flex: 0, lat: 0, rot: 0, where: 'all', sel: null, top: false, xray: false, nerves: true, ligs: false, pelvis: true, labels: true, play: false, tab: 'bend' };
const herni = {}; // disc id -> { a: direction (radians, atan2 along side/front axes; PI = straight back), m: 0..1 }
const meshes = {};
const M = V.map(() => new THREE.Matrix4()); // current pose of each vertebra
const segAngles = SEGS.map(() => ({ flex: 0, lat: 0, rot: 0 }));

// ---------- load ----------
async function load() {
  const base = import.meta.env.BASE_URL;
  const [man, data] = await Promise.all([fetch(`${base}spine-move/manifest.json`).then((r) => r.json()), fetch(`${base}spine-move/anatomy.dat`).then((r) => r.arrayBuffer())]);
  let bin = data; const u8 = new Uint8Array(data, 0, 2);
  if (u8[0] === 0x1f && u8[1] === 0x8b) bin = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const unplanar = (off, n, T) => { const w = T.BYTES_PER_ELEMENT, src = new Uint8Array(bin, off, n * w), out = new T(n), dst = new Uint8Array(out.buffer); for (let b = 0; b < w; b++) { const o = b * n; for (let i = 0; i < n; i++) dst[i * w + b] = src[o + i]; } return out; };
  const out = {};
  for (const m of man.meshes) {
    const n = m.count;
    const q = unplanar(m.pos, n * 3, Uint16Array); for (let i = 3; i < q.length; i++) q[i] += q[i - 3];
    const qn = new Int8Array(bin, m.nrm, n * 3), ao = new Uint8Array(bin, m.ao, n);
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      for (let a = 0; a < 3; a++) { pos[i * 3 + a] = m.min[a] + (q[i * 3 + a] / 65535) * (m.max[a] - m.min[a]); nrm[i * 3 + a] = qn[i * 3 + a] / 127; }
      const f = fade(pos[i * 3], pos[i * 3 + 1]); const o = (ao[i] / 255) * (0.15 + 0.85 * f);
      col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = o; col[i * 4 + 3] = ss(0, 0.45, f);
    }
    let uv = null;
    if (m.uv !== undefined) { const uq = unplanar(m.uv, n * 2, Uint16Array); uv = new Float32Array(n * 2); for (let i = 0; i < n * 2; i++) { const a = i & 1; uv[i] = m.uvMin[a] + (uq[i] / 65535) * (m.uvMax[a] - m.uvMin[a]); } }
    const zz = unplanar(m.idx, m.icount, Uint32Array), idx = new Uint32Array(m.icount); let p = 0;
    for (let k = 0; k < m.icount; k++) { const z = zz[k]; p += (z >>> 1) ^ -(z & 1); idx[k] = p; }
    out[m.id] = { pos, nrm, col, uv, idx };
  }
  return out;
}
function geom({ pos, nrm, col, uv, idx }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  if (uv) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(pos.length / 3 < 65536 ? Uint16Array.from(idx) : idx, 1));
  g.computeBoundingSphere(); g.computeBoundsTree();
  return g;
}
// split the scanned sacrum at the sacrococcygeal joint (its narrowest point, about 11 cm below the top): BodyParts3D's
// "Sacrum" includes the tailbone
function splitTailbone(d, yCut = -10.8) {
  const P = d.pos, I = d.idx, a = [], b = [];
  for (let t = 0; t < I.length; t += 3) { const y = (P[I[t] * 3 + 1] + P[I[t + 1] * 3 + 1] + P[I[t + 2] * 3 + 1]) / 3; (y < yCut ? b : a).push(I[t], I[t + 1], I[t + 2]); }
  const pack = (list) => {
    const map = new Map(), pos = [], nrm = [], col = [], idx = [];
    for (const v of list) { if (!map.has(v)) { map.set(v, pos.length / 3); for (let k = 0; k < 3; k++) { pos.push(P[v * 3 + k]); nrm.push(d.nrm[v * 3 + k]); } for (let k = 0; k < 4; k++) col.push(d.col[v * 4 + k]); } idx.push(map.get(v)); }
    return { pos: Float32Array.from(pos), nrm: Float32Array.from(nrm), col: Float32Array.from(col), uv: null, idx: Uint32Array.from(idx) };
  };
  return [pack(a), pack(b)];
}

// ---------- local frames ----------
function pcaNormal(P) {
  const c = [0, 0, 0], n = P.length / 3; for (let i = 0; i < P.length; i += 3) for (let a = 0; a < 3; a++) c[a] += P[i + a] / n;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < P.length; i += 3) { const d = [P[i] - c[0], P[i + 1] - c[1], P[i + 2] - c[2]]; for (let r = 0; r < 3; r++) for (let s = 0; s < 3; s++) C[r][s] += d[r] * d[s]; }
  // smallest eigenvector: power iteration on (tr*I - C)
  const tr = C[0][0] + C[1][1] + C[2][2]; let v = [0.1, 1, 0.2];
  for (let it = 0; it < 200; it++) { const w = [0, 1, 2].map((r) => tr * v[r] - (C[r][0] * v[0] + C[r][1] * v[1] + C[r][2] * v[2])); const l = Math.hypot(...w); v = w.map((x) => x / l); }
  const nv = new THREE.Vector3(...v); if (nv.y < 0) nv.negate();
  return { c: new THREE.Vector3(...c), n: nv };
}
const DISC = {}; // id -> frame + radius profile + per-vertex local coordinates
const NB = 72;
function discFrame(id, P) {
  const { c, n } = pcaNormal(P);
  const f = new THREE.Vector3(0, 0, 1).addScaledVector(n, -n.z).normalize(), s = new THREE.Vector3().crossVectors(n, f).normalize();
  const cnt = P.length / 3, A = new Float32Array(cnt), Rr = new Float32Array(cnt), Tt = new Float32Array(cnt), R = new Float32Array(NB);
  const d = new THREE.Vector3();
  for (let i = 0; i < cnt; i++) { d.set(P[i * 3] - c.x, P[i * 3 + 1] - c.y, P[i * 3 + 2] - c.z); const x = d.dot(f), y = d.dot(s); A[i] = Math.atan2(y, x); Rr[i] = Math.hypot(x, y); Tt[i] = d.dot(n); const b = ((Math.round((A[i] / (2 * Math.PI)) * NB) % NB) + NB) % NB; R[b] = Math.max(R[b], Rr[i]); }
  for (let k = 0; k < NB; k++) if (!R[k]) R[k] = Math.max(R[(k + NB - 1) % NB], R[(k + 1) % NB]);
  for (let it = 0; it < 3; it++) { const o = R.slice(); for (let k = 0; k < NB; k++) R[k] = 0.25 * o[(k + NB - 1) % NB] + 0.5 * o[k] + 0.25 * o[(k + 1) % NB]; }
  let hh = 0; const rmin = Math.min(...R); for (let i = 0; i < cnt; i++) if (Rr[i] < rmin * 0.6) hh = Math.max(hh, Math.abs(Tt[i]));
  const rAt = (a) => { const x = ((a / (2 * Math.PI)) * NB + NB) % NB, k = Math.floor(x) % NB, u = x - Math.floor(x); return R[k] * (1 - u) + R[(k + 1) % NB] * u; };
  DISC[id] = { c, n, f, s, R, rAt, hh: Math.max(hh, 0.2), A, Rr, Tt, rMean: R.reduce((a, b) => a + b, 0) / NB };
}

// ---------- build the scene ----------
let nodes = [], pivots = [], axes = [], skinned = [], rootComps = [], travComps = [], nucleus = {}, cores = {};
const mats = makeMaterials();
const pickable = [];
function addMesh(id, data, kind) {
  const mat = mats[kind](); mat.clippingPlanes = [clipPlane, clipLow]; if (kind === 'nerve') mat.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geom(data), mat); mesh.name = id; mesh.userData = { id, kind }; meshes[id] = mesh; scene.add(mesh); return mesh;
}
function build(data) {
  const [sac, coc] = splitTailbone(data.sacrum);
  addMesh('sacrum', sac, 'bone'); addMesh('coccyx', coc, 'bone');
  for (const v of V.slice(1)) { const m = addMesh(v, data[v], 'bone'); m.matrixAutoUpdate = false; }
  for (const h of ['right_hip_bone', 'left_hip_bone']) addMesh(h, data[h], 'bone');
  for (const sg of SEGS) if (sg.disc) { discFrame(sg.disc, data[sg.disc].pos); addMesh(sg.disc, data[sg.disc], 'spinaldisc'); }
  for (const id of ['spinal_cord', 'nerve_roots']) addMesh(id, data[id], 'nerve');
  for (const id of ['anterior_longitudinal_ligament', 'posterior_longitudinal_ligament']) addMesh(id, data[id], 'ligament');
  for (const id of [...V, 'coccyx', 'right_hip_bone', 'left_hip_bone', ...SEGS.map((s) => s.disc).filter(Boolean), 'spinal_cord', 'nerve_roots']) pickable.push(meshes[id]);

  // centre of each vertebral body (from the discs above and below it) and the turning point of each segment
  const dc = (id) => DISC[id];
  nodes = V.map((v, k) => {
    const below = SEGS[k - 1]?.disc, above = SEGS[k]?.disc;
    if (v === 'sacrum') return dc(SEGS[0].disc).c.clone().addScaledVector(dc(SEGS[0].disc).n, -1.8);
    if (v === 'c1') { meshes.c1.geometry.computeBoundingBox(); return meshes.c1.geometry.boundingBox.getCenter(new THREE.Vector3()); }
    if (!above) return dc(below).c.clone().addScaledVector(dc(below).n, 1.3);
    return dc(below).c.clone().add(dc(above).c).multiplyScalar(0.5);
  });
  // C1 turns on C2 around the peg (dens): just below the top of C2
  const P2 = meshes.c2.geometry.attributes.position.array; let top = 0; for (let i = 0; i < P2.length; i += 3) if (P2[i + 1] > P2[top * 3 + 1] && Math.abs(P2[i]) < 0.8) top = i / 3;
  const dens = new THREE.Vector3(P2[top * 3], P2[top * 3 + 1] - 0.7, P2[top * 3 + 2]);
  SEGS.forEach((sg, k) => {
    const d = dc(sg.disc || SEGS[k - 1].disc);
    axes[k] = { n: d.n, f: d.f, s: d.s };
    pivots[k] = sg.disc ? d.c.clone().addScaledVector(d.f, -0.25 * d.rAt(Math.PI)).addScaledVector(d.n, -0.35 * d.hh) : dens;
  });

  // nerve roots: one piece per root; which level and side each one is
  {
    const g = meshes.nerve_roots.geometry, P = g.attributes.position.array, I = g.index.array, n = P.length / 3, par = new Int32Array(n).map((_, i) => i);
    const f = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    for (let t = 0; t < I.length; t += 3) { const a = f(I[t]); par[f(I[t + 1])] = a; par[f(I[t + 2])] = a; }
    const comp = new Int32Array(n), roots = new Map();
    for (let i = 0; i < n; i++) { const r = f(i); if (!roots.has(r)) roots.set(r, { id: roots.size, inner: i }); const o = roots.get(r); comp[i] = o.id; if (Math.abs(P[i * 3]) < Math.abs(P[o.inner * 3])) o.inner = i; }
    rootComps = [...roots.values()].map((o) => { const y = P[o.inner * 3 + 1]; const sg = SEGS.filter((s) => s.disc).reduce((a, s) => (Math.abs(DISC[s.disc].c.y - y) < Math.abs(DISC[a.disc].c.y - y) ? s : a)); return { seg: sg.k, side: P[o.inner * 3] > 0 ? 1 : -1, inner: new THREE.Vector3().fromArray(P, o.inner * 3) }; });
    meshes.nerve_roots.userData.comp = comp;
  }
  // traversing roots of the low back (modelled): in the canal each root runs down behind the disc above its own opening,
  // so a disc pushed out at the back and to one side (L4-L5) usually presses on the next root (L5), not the one leaving
  {
    const C = meshes.spinal_cord.geometry.attributes.position.array, parts = [], comps = [];
    for (const sg of SEGS) if (sg.disc && sg.region === 'low' && sg.up !== 't12') {
      const d = DISC[sg.disc], yA = d.c.y + 1.7, cA = new THREE.Vector3(); let cnt = 0, rc = 0;
      for (let i = 0; i < C.length; i += 3) if (Math.abs(C[i + 1] - yA) < 0.4) { cA.x += C[i]; cA.y += C[i + 1]; cA.z += C[i + 2]; cnt++; }
      cA.divideScalar(cnt); for (let i = 0; i < C.length; i += 3) if (Math.abs(C[i + 1] - yA) < 0.4) rc = Math.max(rc, Math.hypot(C[i] - cA.x, C[i + 2] - cA.z));
      for (const side of [1, -1]) {
        const a = side > 0 ? Math.PI - 0.5 : -(Math.PI - 0.5), u = d.f.clone().multiplyScalar(Math.cos(a)).addScaledVector(d.s, Math.sin(a));
        const start = cA.clone().add(new THREE.Vector3(side * 0.5 * rc, 0, 0)), mid = d.c.clone().addScaledVector(u, d.rAt(a) + 0.3);
        const next = rootComps.find((r) => r.seg === sg.k - 1 && r.side === side);
        const end = sg.lo !== 'sacrum' && next ? next.inner.clone() : mid.clone().add(new THREE.Vector3(side * 0.5, -2.6, -0.5));
        const curve = new THREE.CatmullRomCurve3([start, start.clone().lerp(mid, 0.5).add(new THREE.Vector3(side * 0.15, 0, 0)), mid, mid.clone().lerp(end, 0.5), end], false, 'centripetal');
        const tube = new THREE.TubeGeometry(curve, 28, 0.21, 10, false);
        comps.push({ seg: sg.k, side, n: tube.attributes.position.count }); parts.push(tube);
      }
    }
    let n = 0; for (const t of parts) n += t.attributes.position.count;
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 4).fill(1).map((v, i) => ((i & 3) === 3 ? 1 : 0.92)), comp = new Int32Array(n), idx = [];
    let o = 0;
    parts.forEach((t, ci) => { const c = t.attributes.position.count; pos.set(t.attributes.position.array, o * 3); nrm.set(t.attributes.normal.array, o * 3); uv.set(t.attributes.uv.array, o * 2); comp.fill(ci, o, o + c); for (const v of t.index.array) idx.push(v + o); o += c; });
    travComps = comps;
    addMesh('traversing_roots', { pos, nrm, col, uv: uv.map((v, i) => (i & 1 ? v : v * 8)), idx: Uint32Array.from(idx) }, 'nerve').userData.comp = comp;
  }
  // skinning weights: discs blend the vertebra below and above by height; the cord, roots and ligaments by where they
  // project on the line through the vertebral bodies
  for (const sg of SEGS) if (sg.disc) {
    const d = DISC[sg.disc], mesh = meshes[sg.disc], n = d.A.length, w = new Float32Array(n), k = new Uint8Array(n).fill(sg.k);
    for (let i = 0; i < n; i++) w[i] = ss(-1.05, 1.05, d.Tt[i] / d.hh);
    skinned.push({ mesh, rest: Float32Array.from(mesh.geometry.attributes.position.array), base: Float32Array.from(mesh.geometry.attributes.position.array), restN: Float32Array.from(mesh.geometry.attributes.normal.array), k, w, disc: sg.disc });
  }
  for (const id of ['spinal_cord', 'nerve_roots', 'traversing_roots', 'anterior_longitudinal_ligament', 'posterior_longitudinal_ligament']) {
    const mesh = meshes[id], P = mesh.geometry.attributes.position.array, n = P.length / 3, w = new Float32Array(n), k = new Uint8Array(n);
    const p = new THREE.Vector3(), ab = new THREE.Vector3(), ap = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      p.fromArray(P, i * 3); let best = 1e9, bk = 0, bt = 0;
      for (let j = 0; j < nodes.length - 1; j++) { ab.subVectors(nodes[j + 1], nodes[j]); ap.subVectors(p, nodes[j]); const t = clamp(ap.dot(ab) / ab.lengthSq(), 0, 1); const dd = ap.addScaledVector(ab, -t).lengthSq(); if (dd < best) { best = dd; bk = j; bt = t; } }
      k[i] = bk; w[i] = bt;
    }
    skinned.push({ mesh, rest: Float32Array.from(P), restN: Float32Array.from(mesh.geometry.attributes.normal.array), k, w, nerve: /spinal_cord|roots/.test(id), lig: /ligament/.test(id), baseCol: Float32Array.from(mesh.geometry.attributes.color.array) });
  }
  // soft centre (nucleus) of each disc, shown when the disc is picked or pushed out
  const nm = new THREE.MeshPhysicalMaterial({ color: 0xf4e3b0, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.2, sheen: 0.6, sheenColor: 0xfff2cc, clippingPlanes: [clipPlane, clipLow] });
  const sph = new THREE.SphereGeometry(1, 28, 18);
  for (const sg of SEGS) if (sg.disc) { const m = new THREE.Mesh(sph, nm); m.matrixAutoUpdate = false; m.visible = false; m.userData = { id: sg.disc, nucleus: true }; nucleus[sg.disc] = m; scene.add(m); }
  // the middle of each disc ring is open in the model: fill it with gel-coloured core
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 24, 1);
  for (const sg of SEGS) if (sg.disc) { const d = DISC[sg.disc], m = new THREE.Mesh(cyl, nm); m.matrixAutoUpdate = false; m.userData = { id: sg.disc, core: true }; cores[sg.disc] = m; scene.add(m); m.userData.B = new THREE.Matrix4().makeBasis(d.f.clone().multiplyScalar(d.rMean * 0.3), d.n.clone().multiplyScalar(d.hh * 1.5), d.s.clone().multiplyScalar(d.rMean * 0.3)).setPosition(d.c); }
}

// ---------- pose ----------
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion(), R4 = new THREE.Matrix4(), T4 = new THREE.Matrix4();
function computeAngles() {
  SEGS.forEach((sg, k) => {
    const [fe, lb, ar] = ROM[sg.label]; const on = state.where === 'all' || state.where === sg.region;
    const share = FLEX_SHARE[sg.region];
    segAngles[k] = on ? { flex: state.flex >= 0 ? state.flex * fe * share : state.flex * fe * (1 - share), lat: state.lat * lb * LIVE.lat, rot: state.rot * ar * LIVE.rot } : { flex: 0, lat: 0, rot: 0 };
  });
}
function pose() {
  computeAngles();
  M[0].identity();
  for (let k = 0; k < SEGS.length; k++) {
    const a = segAngles[k], ax = axes[k];
    qa.setFromAxisAngle(ax.s, a.flex * D); qb.setFromAxisAngle(ax.f, -a.lat * D); qc.setFromAxisAngle(ax.n, a.rot * D);
    R4.makeRotationFromQuaternion(qa.multiply(qb).multiply(qc));
    const p = pivots[k];
    M[k + 1].copy(M[k]).multiply(T4.makeTranslation(p.x, p.y, p.z)).multiply(R4).multiply(T4.makeTranslation(-p.x, -p.y, -p.z));
  }
  V.forEach((v, k) => { if (k) { meshes[v].matrix.copy(M[k]); meshes[v].matrixWorldNeedsUpdate = true; } });
  skinAll();
}
function skinOne(o) {
  const g = o.mesh.geometry, P = g.attributes.position.array, N = g.attributes.normal.array, R = o.rest, RN = o.restN, n = R.length / 3;
  const E = M.map((m) => m.elements);
  for (let i = 0; i < n; i++) {
    const a = E[o.k[i]], b = E[o.k[i] + 1], w = o.w[i], u = 1 - w, x = R[i * 3], y = R[i * 3 + 1], z = R[i * 3 + 2];
    const e = (j) => u * a[j] + w * b[j];
    P[i * 3] = e(0) * x + e(4) * y + e(8) * z + e(12); P[i * 3 + 1] = e(1) * x + e(5) * y + e(9) * z + e(13); P[i * 3 + 2] = e(2) * x + e(6) * y + e(10) * z + e(14);
    const nx = RN[i * 3], ny = RN[i * 3 + 1], nz = RN[i * 3 + 2];
    N[i * 3] = e(0) * nx + e(4) * ny + e(8) * nz; N[i * 3 + 1] = e(1) * nx + e(5) * ny + e(9) * nz; N[i * 3 + 2] = e(2) * nx + e(6) * ny + e(10) * nz;
  }
  g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true;
  o.dirty = true;
}
function skinAll() {
  for (const o of skinned) if (!o.nerve && !o.lig) skinOne(o);
  updateNuclei();
  for (const o of skinned) if (o.nerve || o.lig) skinOne(o);
  pressNerves();
  for (const o of skinned) if (o.disc && o.bulged) o.mesh.geometry.computeVertexNormals();
  schedule();
}
const midM = (k, t = 0.5) => { const m = new THREE.Matrix4(), a = M[k].elements, b = M[k + 1].elements; for (let j = 0; j < 16; j++) m.elements[j] = a[j] * (1 - t) + b[j] * t; return m; };

// ---------- discs pushed out ----------
const segOf = (disc) => SEGS.find((s) => s.disc === disc);
// with bending, the soft centre drifts away from the side that closes: back when bending forward, to the right when
// leaning left (simplified)
function bendShift(disc) {
  const sg = segOf(disc), a = segAngles[sg.k], [fe, lb] = ROM[sg.label];
  return { f: -clamp(a.flex / Math.max(1, fe * FLEX_SHARE[sg.region]), -1, 1), s: -clamp(a.lat / Math.max(1, lb * LIVE.lat), -1, 1) };
}
function effective(disc) {
  const h = herni[disc] || { a: Math.PI, m: 0 };
  if (h.m < 0.02) return { a: h.a, m: 0 };
  const b = bendShift(disc), proj = b.f * Math.cos(h.a) + b.s * Math.sin(h.a);
  return { a: h.a, m: clamp(h.m + 0.15 * proj, 0, 1) };
}
const unitAt = (d, a) => d.f.clone().multiplyScalar(Math.cos(a)).addScaledVector(d.s, Math.sin(a));
// How far the pushed-out part reaches beyond the disc's edge (cm). It is scaled to the room between this disc and the
// nerve it would meet, so that it touches at about half way (a protrusion) and presses on it as an extrusion; the outer
// ring holds up to 65 % and the soft centre goes on alone after that. Sizes are illustrative.
const gapCache = new Map();
function room(disc, a) {
  const key = `${disc}:${Math.round(a / (5 * D))}`; if (gapCache.has(key)) return gapCache.get(key);
  const d = DISC[disc], tg = { ...target(disc, a), seg: segOf(disc).k }, u = unitAt(d, a), E = d.c.clone().addScaledVector(u, d.rAt(a)), p = new THREE.Vector3();
  // the reach at which the bulge (about a sphere at the tip, radius rA, wider when the nerve lies a little to the side)
  // first meets a vertex of that nerve
  const rA0 = Math.max(d.hh * 0.95, 0.5); let best = 1e9, rs = rA0;
  for (const o of skinned) if (o.nerve) for (let i = 0, n = o.rest.length / 3; i < n; i++) {
    if (!isTarget(o, i, tg)) continue;
    p.fromArray(o.rest, i * 3).sub(E); const t = p.dot(u), l = Math.sqrt(Math.max(0, p.lengthSq() - t * t));
    if (t < -0.3 || l > 1.05) continue;
    const R = Math.max(rA0, l + 0.05), need = t + R - Math.sqrt(R * R - l * l);
    if (need < best) { best = need; rs = R; }
  }
  const r = best > 1e8 ? { T: 0.6, rA: rA0, none: true } : { T: clamp(best, 0.12, 1.4), rA: rs };
  gapCache.set(key, r); return r;
}
function reach(disc, a, m) { const T = room(disc, a).T; return m <= 0.5 ? T * (m / 0.5) : T + 0.5 * (m - 0.5) / 0.5; }
function reshapeDisc(disc) {
  const o = skinned.find((x) => x.disc === disc), d = DISC[disc], { a, m } = effective(disc);
  const ring = m ? Math.min(reach(disc, a, m), reach(disc, a, 0.65)) : 0, broad = 0.05 * ss(0, 0.3, m);
  const B = o.base, R = o.rest, n = d.A.length, col = o.mesh.geometry.attributes.color.array;
  o.baseCol ||= Float32Array.from(col);
  const sb = 0.9, sf = mix(0.55, 0.42, m), tear = ss(0.6, 0.8, m);
  for (let i = 0; i < n; i++) {
    const dl = wrap(d.A[i] - a), r = d.rAt(d.A[i]), q = Math.min(1.2, d.Rr[i] / r), t = d.Tt[i] / d.hh;
    const amt = m ? (r * broad * Math.exp(-(dl * dl) / (2 * sb * sb)) + ring * Math.exp(-(dl * dl) / (2 * sf * sf))) * Math.max(0, 1 - 0.55 * t * t) * q * q : 0;
    const ca = Math.cos(d.A[i]), sa = Math.sin(d.A[i]);
    for (let k = 0; k < 3; k++) R[i * 3 + k] = B[i * 3 + k] + (ca * d.f.getComponent(k) + sa * d.s.getComponent(k)) * amt;
    // a torn outer ring shows red where the centre breaks through
    const red = tear * Math.exp(-(dl * dl) / (2 * 0.3 * 0.3)) * ss(0.55, 0.9, q);
    col[i * 4] = o.baseCol[i * 4] * (1 + 0.25 * red); col[i * 4 + 1] = o.baseCol[i * 4 + 1] * (1 - 0.55 * red); col[i * 4 + 2] = o.baseCol[i * 4 + 2] * (1 - 0.6 * red);
  }
  o.mesh.geometry.attributes.color.needsUpdate = true;
  o.bulged = m > 0;
}
function mix(a, b, t) { return a + (b - a) * t; }
// the soft centre: in the middle of the disc, drifting with bending, moving out with the push and, as an extrusion,
// through the ring until its tip is at the reach
function nucleusAt(disc) {
  const d = DISC[disc], { a, m } = effective(disc), b = bendShift(disc), r = d.rAt(a), u = unitAt(d, a);
  const rx = 0.33 * d.rMean, ry = d.hh * 0.6;
  const inside = r * 0.1 + (r + reach(disc, a, 0.65) - rx - r * 0.1 - 0.15) * (m / 0.65);
  const off = !m ? 0 : m <= 0.65 ? inside : r + reach(disc, a, m) - rx * 0.95;
  const c = d.c.clone().addScaledVector(u, off).addScaledVector(d.f, b.f * 0.12 * d.rMean).addScaledVector(d.s, b.s * 0.12 * d.rMean);
  return { c, rx, ry, u };
}
// where the pushed-out part is, in the disc's own frame, as spheres: the bulging ring and, as an extrusion, the centre
function blobs(disc) {
  const d = DISC[disc], { a, m } = effective(disc), r = d.rAt(a), u = unitAt(d, a);
  const rA = room(disc, a).rA, ring = Math.min(reach(disc, a, m), reach(disc, a, 0.65));
  const list = [{ c: d.c.clone().addScaledVector(u, r + ring - rA), r: rA }];
  if (m > 0.65) { const nu = nucleusAt(disc), rn = Math.min(nu.rx, d.hh * 1.2); list.push({ c: nu.c.clone().addScaledVector(u, nu.rx * 0.95 - rn), r: rn }); }
  return { u, list, m, a };
}
function updateNuclei() {
  for (const sg of SEGS) if (sg.disc) {
    const disc = sg.disc, nm = nucleus[disc], { m } = effective(disc);
    const core = cores[disc]; core.visible = disc !== state.sel; core.matrix.copy(midM(sg.k)).multiply(core.userData.B); core.matrixWorldNeedsUpdate = true;
    nm.visible = disc === state.sel || m > 0.65;
    if (!nm.visible) continue;
    const d = DISC[disc], nu = nucleusAt(disc), B = new THREE.Matrix4().makeBasis(d.f.clone().multiplyScalar(nu.rx), d.n.clone().multiplyScalar(nu.ry), d.s.clone().multiplyScalar(nu.rx * 1.15)).setPosition(nu.c);
    nm.matrix.copy(midM(sg.k)).multiply(B); nm.matrixWorldNeedsUpdate = true;
  }
}

// ---------- nerves in the way: pushed aside, and marked when they are the one usually affected ----------
const contact = {}; // disc -> { gapT: distance from the pushed-out part to the nerve usually affected (cm), tg }
function zoneOf(a) {
  const phi = Math.abs(wrap(Math.PI - a)) / D, side = Math.sin(a) >= 0 ? 'left' : 'right';
  const zone = phi < 12 ? 'central' : phi < 38 ? 'paracentral' : phi < 75 ? 'foraminal' : phi < 105 ? 'far lateral' : 'front';
  return { zone, side, phi };
}
function rootNames(sg) {
  const up = sg.up, lo = sg.lo, n = +up.slice(1);
  if (up[0] === 'c') return { exit: `C${n + 1}`, run: `C${n + 1}` }; // neck roots leave above their vertebra: C5-C6 -> C6, C7-T1 -> C8
  if (up[0] === 't') return { exit: `T${n}`, run: up === 't12' ? 'L1' : `T${n + 1}` };
  return { exit: `L${n}`, run: lo === 'sacrum' ? 'S1' : `L${n + 1}` };
}
const CAUDA = ['l2', 'l3', 'l4', 'l5'];
// what is usually pressed on, for this level, direction and side (common teaching; for doctor review)
function target(disc, a) {
  const sg = segOf(disc), { zone, side } = zoneOf(a), r = rootNames(sg), neck = sg.region === 'neck', low = sg.region === 'low';
  const sgn = side === 'left' ? 1 : -1;
  if (zone === 'front') return { zone, side, name: null };
  if (zone === 'central') return { zone, side, cord: true, cordSide: 0, name: CAUDA.includes(sg.up) ? 'the cauda equina (the bundle of nerve roots in the canal)' : sg.up === 'l1' || sg.up === 't12' ? 'the end of the spinal cord (conus) and the cauda equina' : 'the spinal cord', short: CAUDA.includes(sg.up) ? 'Cauda equina' : 'Spinal cord' };
  if (zone === 'paracentral') {
    if (neck) return { zone, side, cord: true, cordSide: sgn, root: { seg: sg.k, side: sgn }, name: `the ${side} ${r.exit} nerve root and the edge of the spinal cord`, rootName: r.exit, short: `${r.exit} root` };
    if (low) return { zone, side, trav: { seg: sg.k, side: sgn }, name: `the ${side} ${r.run} nerve root, on its way down the canal to the next opening`, rootName: r.run, short: `${r.run} root` };
    return { zone, side, cord: true, cordSide: 0, name: sg.up === 't12' ? 'the end of the spinal cord (conus)' : 'the spinal cord', short: 'Spinal cord' };
  }
  return { zone, side, root: { seg: sg.k, side: sgn }, name: `the ${side} ${r.exit} nerve root, where it leaves the spine`, rootName: r.exit, short: `${r.exit} root` };
}
function isTarget(o, i, tg) {
  const id = o.mesh.name;
  if (id === 'spinal_cord') { if (!tg.cord) return false; const y = o.k[i] + o.w[i]; return Math.abs(y - (tg.seg + 0.5)) < 1.2 && (tg.cordSide === 0 || o.rest[i * 3] * tg.cordSide > -0.15); }
  if (id === 'nerve_roots' && tg.root) { const rc = rootComps[o.mesh.userData.comp[i]]; return rc.seg === tg.root.seg && rc.side === tg.root.side; }
  if (id === 'traversing_roots' && tg.trav) { const rc = travComps[o.mesh.userData.comp[i]]; return rc.seg === tg.trav.seg && rc.side === tg.trav.side; }
  return false;
}
const AREA = {
  C3: 'the neck', C4: 'the neck and top of the shoulder', C5: 'the shoulder and outer upper arm', C6: 'the thumb side of the forearm and hand', C7: 'the back of the arm and the middle finger', C8: 'the little finger side of the hand',
  L1: 'the groin', L2: 'the front of the upper thigh', L3: 'the front of the thigh down to the knee', L4: 'the front of the knee and the inside of the shin', L5: 'the outside of the shin, the top of the foot and the big toe', S1: 'the calf, the sole and the outside of the foot',
};
function pressNerves() {
  for (const k of Object.keys(contact)) delete contact[k];
  for (const o of skinned) if ((o.nerve || o.lig) && o.marked) { o.mesh.geometry.attributes.color.array.set(o.baseCol); o.mesh.geometry.attributes.color.needsUpdate = true; o.marked = false; }
  const list = Object.keys(herni).filter((d) => effective(d).m > 0.02);
  const p = new THREE.Vector3(), dv = new THREE.Vector3();
  for (const disc of list) {
    const sg = segOf(disc), MM = midM(sg.k), b = blobs(disc), tg = { ...target(disc, b.a), seg: sg.k };
    const W = b.list.map((x) => ({ c: x.c.clone().applyMatrix4(MM), r: x.r }));
    let gapT = 1e9;
    for (const o of skinned) if (o.nerve || o.lig) {
      const g = o.mesh.geometry, P = g.attributes.position.array, C = g.attributes.color.array, n = P.length / 3;
      const F = 0.5, gap = 0.04;
      for (let i = 0; i < n; i++) {
        if (Math.abs(o.k[i] + o.w[i] - (sg.k + 0.5)) > 1.8) continue;
        p.fromArray(P, i * 3);
        const tgt = o.nerve && isTarget(o, i, tg);
        let mark = 0;
        for (const s of W) {
          dv.subVectors(p, s.c); const d = dv.length() || 1e-6, R0 = s.r + gap, x = R0 + F - d;
          if (tgt) { gapT = Math.min(gapT, d - s.r); mark = Math.max(mark, ss(R0 + F * 1.6, R0 + 0.05, d)); }
          if (x > 0) { const disp = x < 2 * F ? (x * x) / (4 * F) : x - F; p.addScaledVector(dv, disp / d); }
        }
        P[i * 3] = p.x; P[i * 3 + 1] = p.y; P[i * 3 + 2] = p.z;
        if (mark > 0.01 && b.m > 0.3) { C[i * 4] = o.baseCol[i * 4] * (1 + 0.15 * mark); C[i * 4 + 1] = o.baseCol[i * 4 + 1] * (1 - 0.62 * mark); C[i * 4 + 2] = o.baseCol[i * 4 + 2] * (1 - 0.75 * mark); o.marked = true; }
      }
      g.attributes.position.needsUpdate = true; if (o.marked) g.attributes.color.needsUpdate = true;
    }
    contact[disc] = { gapT, tg };
  }
}

// ---------- visibility ----------
function applyVisibility() {
  const sel = state.sel, xr = state.xray;
  for (const [id, mesh] of Object.entries(meshes)) {
    const k = mesh.userData.kind; let vis = true;
    if (k === 'nerve') vis = state.nerves;
    if (k === 'ligament') vis = state.ligs;
    if (/hip_bone/.test(id)) vis = state.pelvis;
    mesh.visible = vis;
    const m = mesh.material; let op = 1;
    if (k === 'bone' && xr) op = /hip_bone|sacrum|coccyx/.test(id) ? 0.12 : 0.2;
    if (k === 'spinaldisc' && id === sel) op = 0.55;
    if (op < 1) { m.alphaHash = false; m.transparent = true; m.depthWrite = false; m.opacity = op; } else { m.alphaHash = true; m.transparent = false; m.depthWrite = true; m.opacity = 1; }
    m.needsUpdate = true;
  }
  updateClip();
}
function updateClip() {
  if (state.top && state.sel) {
    const sg = segOf(state.sel), d = DISC[state.sel], MM = midM(sg.k);
    const c = d.c.clone().addScaledVector(d.n, d.hh * 1.25).applyMatrix4(MM), n = d.n.clone().transformDirection(MM);
    clipPlane.setFromNormalAndCoplanarPoint(n.clone().negate(), c);
    clipLow.setFromNormalAndCoplanarPoint(n, d.c.clone().addScaledVector(d.n, -d.hh - 2.6).applyMatrix4(MM));
  } else { clipPlane.set(new THREE.Vector3(0, -1, 0), 1e6); clipLow.set(new THREE.Vector3(0, 1, 0), 1e6); }
}

// ---------- camera ----------
const HOME = { target: new THREE.Vector3(0, 22, 1), dist: 150 };
const VIEWS = { side: [-1, 0.06, 0.02], back: [0, 0.08, -1], front: [0, 0.08, 1], oblique: [-0.75, 0.32, -0.75] };
let fly = null;
// narrow (portrait) screens need the camera further away to fit the same width
const widthFit = () => clamp(0.95 / Math.max(0.3, camera.aspect), 1, 2.2);
// distance at which a part `h` cm tall fits the free part of the screen
function fitDist(h) { const r = $('#panel').getBoundingClientRect(), H = window.innerHeight, free = window.innerWidth < 760 ? Math.max(0.3, (H - r.height - 96) / H) : 0.86; return (h / 2) / Math.tan((camera.fov * D) / 2) / free; }
function flyTo(target, dir, dist, ms = 700, up = new THREE.Vector3(0, 1, 0)) {
  const d = new THREE.Vector3(...(Array.isArray(dir) ? dir : dir.toArray())).normalize();
  fly = { t0: performance.now(), ms, fromT: controls.target.clone(), fromP: camera.position.clone(), toT: target.clone(), toP: target.clone().addScaledVector(d, dist), fromU: camera.up.clone(), toU: up.clone() };
  schedule();
}
function stepFly(now) {
  if (!fly) return;
  const t = ss(0, 1, (now - fly.t0) / fly.ms);
  controls.target.lerpVectors(fly.fromT, fly.toT, t);
  // move along an arc around the target so the view turns rather than cutting through the model
  const a = fly.fromP.clone().sub(fly.fromT), b = fly.toP.clone().sub(fly.toT), la = a.length(), lb = b.length();
  const dir = a.normalize().lerp(b.normalize(), t); if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  camera.position.copy(controls.target).addScaledVector(dir.normalize(), la + (lb - la) * t);
  camera.up.lerpVectors(fly.fromU, fly.toU, t).normalize();
  if (t >= 1) fly = null;
}
function focus(which) {
  if (which === 'neck') flyTo(new THREE.Vector3(0, 48, 1.5).applyMatrix4(M[V.indexOf('c5')]), VIEWS.side, fitDist(20));
  else if (which === 'low') flyTo(new THREE.Vector3(0, -1.5, 0), VIEWS.side, fitDist(30));
  else flyTo(HOME.target, VIEWS.side, fitDist(78));
}
function discWorld(disc) { const sg = segOf(disc), MM = midM(sg.k), d = DISC[disc]; return { c: d.c.clone().applyMatrix4(MM), n: d.n.clone().transformDirection(MM), f: d.f.clone().transformDirection(MM), s: d.s.clone().transformDirection(MM) }; }
function lookAtDisc(disc) {
  const w = discWorld(disc), d = DISC[disc], h = herni[disc], side = h && h.m > 0.02 ? Math.sign(Math.sin(h.a)) || 1 : 1;
  if (state.top) flyTo(w.c, w.n.clone().addScaledVector(w.f, -0.02), (12 + d.rMean * 5.5) * widthFit(), 700, w.f.clone());
  // from behind, above and on the side the disc is pushed toward, where the nerve it meets is
  else flyTo(w.c, w.f.clone().multiplyScalar(-0.8).addScaledVector(w.s, side * 0.62).addScaledVector(w.n, 0.42), (16 + d.rMean * 7) * widthFit());
}

// ---------- UI ----------
const discPick = $('#disc-pick');
discPick.innerHTML = '<option value="">Pick a disc…</option>' + ['neck', 'mid', 'low'].map((r) => `<optgroup label="${{ neck: 'Neck', mid: 'Mid back', low: 'Low back' }[r]}">${SEGS.filter((s) => s.disc && s.region === r).slice().reverse().map((s) => `<option value="${s.disc}">${s.label} disc</option>`).join('')}</optgroup>`).join('');
function setTab(t) {
  state.tab = t;
  $$('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  $$('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== t; });
  setFold(false); layout();
}
$$('[data-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
function setFold(f) { $('#panel').classList.toggle('folded', f); $('#fold').setAttribute('aria-expanded', String(!f)); $('#fold').textContent = f ? '▴' : '▾'; layout(); }
$('#fold').addEventListener('click', () => setFold(!$('#panel').classList.contains('folded')));
for (const id of ['flex', 'lat', 'rot']) $(`#${id}`).addEventListener('input', (e) => { state[id] = +e.target.value; stopPlay(); onPose(); });
$$('[data-where]').forEach((b) => b.addEventListener('click', () => { state.where = b.dataset.where; $$('[data-where]').forEach((x) => x.classList.toggle('on', x === b)); onPose(); }));
$('#straight').addEventListener('click', () => { stopPlay(); state.flex = state.lat = state.rot = 0; syncSliders(); onPose(); });
$('#play').addEventListener('click', () => { if (state.play) stopPlay(); else { state.play = true; state.playT0 = performance.now(); $('#play').setAttribute('aria-pressed', 'true'); $('#play').textContent = 'Stop'; schedule(); } });
function stopPlay() { if (!state.play) return; state.play = false; $('#play').setAttribute('aria-pressed', 'false'); $('#play').textContent = 'Play bending'; saveHash(); }
function syncSliders() {
  for (const id of ['flex', 'lat', 'rot']) $(`#${id}`).value = state[id];
  const sum = (key) => segAngles.reduce((a, x) => a + x[key], 0);
  computeAngles();
  const f = sum('flex'), l = sum('lat'), r = sum('rot');
  $('#flex-o').textContent = Math.abs(f) < 0.5 ? 'straight' : `${Math.round(Math.abs(f))}° ${f > 0 ? 'forward' : 'back'}`;
  $('#lat-o').textContent = Math.abs(l) < 0.5 ? 'straight' : `${Math.round(Math.abs(l))}° ${l > 0 ? 'left' : 'right'}`;
  $('#rot-o').textContent = Math.abs(r) < 0.5 ? 'straight' : `${Math.round(Math.abs(r))}° ${r > 0 ? 'left' : 'right'}`;
}
function onPose() { for (const d of Object.keys(herni)) reshapeDisc(d); pose(); syncSliders(); updateClip(); discStatus(); saveHash(); }

function selectDisc(disc, { fly: doFly = true } = {}) {
  const prev = state.sel; state.sel = disc || null;
  discPick.value = disc || '';
  $('#disc-none').hidden = !!disc; $('#disc-on').hidden = !disc;
  if (disc && !prev && !state.xray) setXray(true);
  if (!disc && state.top) setTop(false);
  applyVisibility(); updateNuclei();
  if (disc) { setTab('disc'); if (doFly) lookAtDisc(disc); }
  syncDisc(); saveHash(); schedule();
}
discPick.addEventListener('change', () => selectDisc(discPick.value || null));
function syncDisc() {
  const h = state.sel ? herni[state.sel] || { a: Math.PI, m: 0 } : { m: 0 };
  $('#amount').value = h.m; $('#amount-o').textContent = `${Math.round(h.m * 100)}%`;
  discStatus();
}
const DIRS = { back: Math.PI, 'back-left': Math.PI - 0.55, 'back-right': -(Math.PI - 0.55), 'side-left': Math.PI - 1.0, 'side-right': -(Math.PI - 1.0) };
$$('[data-dir]').forEach((b) => b.addEventListener('click', () => { if (!state.sel) return; const h = (herni[state.sel] ||= { a: Math.PI, m: 0 }); h.a = DIRS[b.dataset.dir]; if (h.m < 0.2) h.m = 0.55; changeDisc(); }));
$('#amount').addEventListener('input', (e) => { if (!state.sel) return; const h = (herni[state.sel] ||= { a: Math.PI, m: 0 }); h.m = +e.target.value; changeDisc(); });
$('#disc-reset').addEventListener('click', () => { if (!state.sel) return; herni[state.sel] = { a: Math.PI, m: 0 }; changeDisc(); delete herni[state.sel]; });
function changeDisc() { reshapeDisc(state.sel); skinAll(); syncDisc(); saveHash(); }
function setTop(on) { state.top = on; $('#disc-top').setAttribute('aria-pressed', String(on)); updateClip(); if (state.sel) lookAtDisc(state.sel); schedule(); saveHash(); }
$('#disc-top').addEventListener('click', () => { if (!state.sel) { toast('Pick a disc first'); return; } setTop(!state.top); });

function discStatus() {
  const el = $('#disc-status'); if (!state.sel) { el.innerHTML = ''; return; }
  const disc = state.sel, sg = segOf(disc), { a, m } = effective(disc), raw = (herni[disc] || { m: 0 }).m;
  if (raw < 0.02) { el.innerHTML = `<b>${sg.label} disc</b>: in place. Drag it, or tap a direction above.`; return; }
  const stage = m < 0.3 ? ['Bulge', 'the disc spreads out a little on this side.'] : m < 0.65 ? ['Protrusion', 'the soft centre pushes the outer ring out in one place; the ring still holds.'] : ['Extrusion', 'the soft centre breaks through the outer ring.'];
  const z = zoneOf(a), c = contact[disc], tg = target(disc, a);
  const dirTxt = z.zone === 'front' ? 'toward the front' : z.zone === 'central' ? 'straight back' : `${z.zone}, to the ${z.side}`;
  let nerve;
  if (z.zone === 'front') nerve = 'This side has no nerves in the way, so it often causes no nerve symptoms.';
  else if (!c || c.gapT > 0.12) nerve = room(disc, a).none ? 'Not touching a nerve.' : m < 0.5 ? `Not touching a nerve yet. Pushed further it would reach ${tg.name}.` : 'Not touching a nerve.';
  else {
    const press = c.gapT < -0.15 ? 'Pressing on' : 'Touching';
    nerve = `<span class="hit">${press} ${tg.name}.</span>`;
    if (tg.rootName && AREA[tg.rootName]) nerve += ` Pain, tingling or weakness from this root is usually felt in ${AREA[tg.rootName]}.`;
    if (z.zone === 'central' && ['l2', 'l3', 'l4', 'l5'].includes(sg.up)) nerve += ' A large central disc here can affect the bladder, bowel and feeling between the legs: an emergency.';
    else if (tg.cord && sg.region === 'neck') nerve += ' Pressure on the spinal cord can affect the hands, walking and balance.';
  }
  const bend = (Math.abs(state.flex) > 0.05 || Math.abs(state.lat) > 0.05) && Math.abs(m - raw) > 0.01 ? `<p class="small">Bending changes it: the soft centre moves away from the side that closes. In this position the disc sticks out ${m > raw ? 'more' : 'less'} than when standing straight.</p>` : '';
  el.innerHTML = `<b>${sg.label} disc: ${stage[0]}</b>, ${dirTxt}: ${stage[1]}<p>${nerve}</p>${bend}<p class="review">For doctor review: which root is shown and the bending effect follow common teaching; sizes are illustrative.</p>`;
}

function setXray(on) { state.xray = on; $('#t-xray').setAttribute('aria-pressed', String(on)); applyVisibility(); schedule(); }
const TOG = { 't-nerves': 'nerves', 't-ligs': 'ligs', 't-pelvis': 'pelvis', 't-labels': 'labels' };
for (const [id, k] of Object.entries(TOG)) $(`#${id}`).addEventListener('click', () => { state[k] = !state[k]; $(`#${id}`).setAttribute('aria-pressed', String(state[k])); applyVisibility(); schedule(); saveHash(); });
$('#t-xray').addEventListener('click', () => { setXray(!state.xray); saveHash(); });
$$('[data-view]').forEach((b) => b.addEventListener('click', () => { if (state.top) setTop(false); const t = state.sel ? discWorld(state.sel).c : controls.target.clone(); const dist = camera.position.distanceTo(controls.target); flyTo(t, VIEWS[b.dataset.view], state.sel ? dist : Math.max(dist, 40)); }));
$$('[data-focus]').forEach((b) => b.addEventListener('click', () => { if (state.top) setTop(false); selectDisc(null, { fly: false }); focus(b.dataset.focus); }));
$('#share').addEventListener('click', async () => { saveHash(true); try { await navigator.clipboard.writeText(location.href); toast('Link copied: it opens this pose and disc'); } catch { toast('Copy the address bar to share this view'); } });
$('#snap').addEventListener('click', () => { render(); canvas.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `spine-${state.sel ? segOf(state.sel).label : 'movement'}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }); });
let toastT = 0;
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2600); }

// ---------- picking and dragging a disc ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function hitAt(x, y) {
  const r = canvas.getBoundingClientRect(); ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  for (const o of skinned) if (o.dirty && o.disc) { o.mesh.geometry.boundsTree.refit(); o.mesh.geometry.computeBoundingSphere(); o.dirty = false; }
  const list = pickable.filter((m) => m.visible && !(m.userData.kind === 'nerve'));
  const hits = ray.intersectObjects(list, false).filter((h) => !state.top || clipPlane.distanceToPoint(h.point) > 0);
  if (!hits.length) return null;
  const first = hits[0], disc = hits.find((h) => h.object.userData.kind === 'spinaldisc');
  if (first.object.userData.kind === 'bone' && disc && (state.xray || disc.distance - first.distance < 1.5)) return disc;
  return first;
}
let drag = null, down = null;
canvas.addEventListener('pointerdown', (e) => {
  down = { ...tapStart(e), id: e.pointerId };
  if (!state.sel || e.button > 0) return;
  // a finger near the selected disc grabs it (it is thin when seen from the side)
  const h = fingerPick(e.clientX, e.clientY, down.touch, (x, y) => { const k = hitAt(x, y); return k && k.object.userData.id === state.sel ? k : null; })?.hit;
  if (h) {
    controls.enabled = false; canvas.setPointerCapture(e.pointerId);
    const w = discWorld(state.sel), proj = (v) => { const p = v.clone().project(camera); return new THREE.Vector2(p.x * canvas.clientWidth / 2, -p.y * canvas.clientHeight / 2); };
    const c0 = proj(w.c), ef = proj(w.c.clone().add(w.f)).sub(c0), es = proj(w.c.clone().add(w.s)).sub(c0);
    const hh = herni[state.sel] || { a: Math.PI, m: 0 };
    drag = { x: e.clientX, y: e.clientY, ef, es, h0: [Math.cos(hh.a) * hh.m, Math.sin(hh.a) * hh.m], moved: false };
    e.stopImmediatePropagation();
  }
}, { capture: true });
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.hypot(dx, dy) > 3) drag.moved = true;
  // screen movement -> movement in the disc's plane (least squares, steadied when the disc is seen edge-on)
  const { ef, es } = drag, a11 = ef.dot(ef), a12 = ef.dot(es), a22 = es.dot(es), lam = 0.08 * Math.max(a11, a22), b1 = ef.x * dx + ef.y * dy, b2 = es.x * dx + es.y * dy;
  const det = (a11 + lam) * (a22 + lam) - a12 * a12, u = ((a22 + lam) * b1 - a12 * b2) / det, v = ((a11 + lam) * b2 - a12 * b1) / det;
  const d = DISC[state.sel], k = 1 / (d.rMean * 1.1);
  const hx = drag.h0[0] + u * k, hy = drag.h0[1] + v * k, m = Math.min(1, Math.hypot(hx, hy));
  const h = (herni[state.sel] ||= { a: Math.PI, m: 0 }); if (m > 0.01) h.a = Math.atan2(hy, hx); h.m = m;
  changeDisc();
});
const endDrag = (e) => { if (drag) { controls.enabled = true; try { canvas.releasePointerCapture(e.pointerId); } catch { /* already released */ } const moved = drag.moved; drag = null; if (!moved) down = { ...down, wasDisc: true }; } };
canvas.addEventListener('pointerup', (e) => {
  endDrag(e);
  if (!isTap(down, e)) return;
  // discs are thin: on touch screens the nearest part around the tap counts
  const h = fingerPick(e.clientX, e.clientY, down.touch, hitAt)?.hit;
  if (!h) { if (!down.wasDisc) selectDisc(null, { fly: false }); return; }
  const { id, kind } = h.object.userData;
  if (kind === 'spinaldisc') { if (id !== state.sel) selectDisc(id); }
  else if (kind === 'bone') toast(id === 'coccyx' ? 'Tailbone (coccyx)' : /hip_bone/.test(id) ? `${id.startsWith('right') ? 'Right' : 'Left'} hip bone` : id === 'sacrum' ? 'Sacrum' : `${NAME(id)} vertebra`);
});
canvas.addEventListener('pointercancel', endDrag);

// ---------- labels ----------
const labelEl = $('#labels');
const LBL = [...V.map((v, k) => ({ text: NAME(v), k, v })), { text: 'Tailbone', k: 0, v: 'coccyx' }];
labelEl.innerHTML = LBL.map((l) => `<span class="lb">${l.text}</span>`).join('') + '<span class="lb sel"></span><span class="lb nerve"></span><span class="lb dir" data-d="front">Front</span><span class="lb dir" data-d="back">Back</span><span class="lb dir" data-d="left">Left</span><span class="lb dir" data-d="right">Right</span>';
const lbEls = [...labelEl.children];
const tailTip = new THREE.Vector3(0, -12.5, -2.5);
const viewsEl = document.querySelector('.mv-views');
function placeLabels() {
  const W = canvas.clientWidth, H = canvas.clientHeight, show = state.labels && !state.top, topLimit = viewsEl.getBoundingClientRect().bottom + 4;
  const at = (p, el, on = true) => { if (!on) { el.style.display = 'none'; return null; } const q = p.clone().project(camera); if (q.z > 1 || Math.abs(q.x) > 1.05 || Math.abs(q.y) > 1.05) { el.style.display = 'none'; return null; } const x = (q.x + 1) * W / 2, y = (1 - q.y) * H / 2; if (y < topLimit) { el.style.display = 'none'; return null; } el.style.display = ''; el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`; return { x, y }; };
  // vertebra labels in front of each body; skip those that would overlap
  const dirFront = new THREE.Vector3(0, 0, 1);
  let last = []; const placed = [];
  LBL.forEach((l, i) => {
    const el = lbEls[i];
    let p;
    if (l.v === 'coccyx') p = tailTip.clone().add(new THREE.Vector3(0, 0, 3.5));
    else { const sg = SEGS[Math.max(0, l.k - 1)]; const d = DISC[sg.disc || SEGS[l.k - 2]?.disc || SEGS[0].disc]; p = nodes[l.k].clone().addScaledVector(dirFront, (d ? d.rAt(0) : 2) + 2.2).applyMatrix4(M[l.k]); }
    const s = at(p, el, show);
    if (s) { if (placed.some((o) => Math.abs(o.x - s.x) < 40 && Math.abs(o.y - s.y) < 13)) el.style.display = 'none'; else placed.push(s); }
  });
  const nL = LBL.length, selEl = lbEls[nL], nerveEl = lbEls[nL + 1];
  if (state.sel) {
    const w = discWorld(state.sel), d = DISC[state.sel], sg = segOf(state.sel);
    selEl.textContent = `${sg.label} disc`;
    at(w.c.clone().addScaledVector(w.f, d.rAt(0) + (state.top ? 1.4 : 4)).addScaledVector(w.n, state.top ? 0 : 0.6), selEl, !state.top);
    const c = contact[state.sel];
    if (c && c.gapT <= 0.12 && c.tg.name && effective(state.sel).m > 0.02) {
      const b = blobs(state.sel), tip = b.list[b.list.length - 1].c.clone().applyMatrix4(midM(sg.k));
      nerveEl.textContent = c.tg.rootName ? `${c.tg.rootName} root` : c.tg.cord ? (['l2', 'l3', 'l4', 'l5'].includes(sg.up) ? 'Cauda equina' : 'Spinal cord') : '';
      at(tip.addScaledVector(b.u.clone().transformDirection(midM(sg.k)), 1.6), nerveEl, !!nerveEl.textContent);
    } else at(w.c, nerveEl, false);
    for (const el of lbEls.slice(nL + 2)) {
      const dd = el.dataset.d, r = d.rMean + 1.6;
      const v = dd === 'front' ? w.f : dd === 'back' ? w.f.clone().negate() : dd === 'left' ? w.s : w.s.clone().negate();
      const s2 = at(w.c.clone().addScaledVector(v, dd === 'front' || dd === 'back' ? r : r + 1.2), el, state.top);
      if (s2) { const x = clamp(s2.x, 34, W - 34); el.style.transform = `translate(${x.toFixed(1)}px, ${s2.y.toFixed(1)}px) translate(-50%, -50%)`; }
    }
  } else for (const el of lbEls.slice(nL)) el.style.display = 'none';
}

// ---------- share state in the address (#…) ----------
let hashT = 0;
function saveHash(now) {
  const f = () => {
    const q = new URLSearchParams();
    for (const k of ['flex', 'lat', 'rot']) if (Math.abs(state[k]) > 0.001) q.set(k[0], state[k].toFixed(2));
    if (state.where !== 'all') q.set('w', state.where);
    const hs = Object.entries(herni).filter(([, h]) => h.m > 0.01).map(([d, h]) => `${d.replace('disc_', '')}:${h.a.toFixed(2)}:${h.m.toFixed(2)}`);
    if (hs.length) q.set('h', hs.join(','));
    if (state.sel) q.set('d', state.sel.replace('disc_', ''));
    if (state.top) q.set('top', '1');
    if (state.xray) q.set('x', '1');
    if (state.ligs) q.set('lig', '1');
    if (!state.pelvis) q.set('pel', '0');
    if (!state.nerves) q.set('nrv', '0');
    if (!state.labels) q.set('lab', '0');
    const s = q.toString(); history.replaceState(null, '', s ? `#${s}` : location.pathname + location.search);
  };
  clearTimeout(hashT); if (now) f(); else hashT = setTimeout(f, 250);
}
function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  state.flex = clamp(+q.get('f') || 0, -1, 1); state.lat = clamp(+q.get('l') || 0, -1, 1); state.rot = clamp(+q.get('r') || 0, -1, 1);
  if (['neck', 'mid', 'low'].includes(q.get('w'))) state.where = q.get('w');
  for (const part of (q.get('h') || '').split(',').filter(Boolean)) { const [d, a, m] = part.split(':'); if (DISC[`disc_${d}`]) herni[`disc_${d}`] = { a: +a || Math.PI, m: clamp(+m || 0, 0, 1) }; }
  state.xray = q.get('x') === '1'; state.ligs = q.get('lig') === '1'; state.pelvis = q.get('pel') !== '0'; state.nerves = q.get('nrv') !== '0'; state.labels = q.get('lab') !== '0';
  return { sel: q.get('d') && DISC[`disc_${q.get('d')}`] ? `disc_${q.get('d')}` : null, top: q.get('top') === '1' };
}

// ---------- layout and render loop ----------
function layout() {
  const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h;
  // the panel covers part of the screen: centre the picture in the space beside (wide screens) or above it (narrow)
  const r = $('#panel').getBoundingClientRect();
  if (w < 760) camera.setViewOffset(w, h, 0, (r.height - document.querySelector('.mv-views').getBoundingClientRect().bottom) / 2, w, h);
  else camera.setViewOffset(w, h, -(r.right) / 2 + 8, 0, w, h);
  camera.updateProjectionMatrix(); schedule();
}
window.addEventListener('resize', layout);
new ResizeObserver(() => layout()).observe($('#panel'));
let raf = 0;
function schedule() { if (!raf) raf = requestAnimationFrame(frame); }
function render() { renderer.render(scene, camera); }
function frame(now) {
  raf = 0;
  if (state.play) {
    const t = (now - state.playT0) / 1000; state.flex = Math.sin(t * 1.1) * (Math.sin(t * 1.1) > 0 ? 0.85 : 0.7);
    $('#flex').value = state.flex; for (const d of Object.keys(herni)) reshapeDisc(d); pose(); syncSliders(); discStatus();
  }
  stepFly(now);
  const moving = controls.update();
  render(); if (nodes.length) placeLabels();
  if (fly || state.play || moving || drag) schedule();
}
controls.addEventListener('change', schedule);

// ---------- start ----------
(async () => {
  try {
    const data = await load();
    build(data);
    const h = readHash();
    for (const [id, k] of Object.entries(TOG)) $(`#${id}`).setAttribute('aria-pressed', String(state[k]));
    $('#t-xray').setAttribute('aria-pressed', String(state.xray));
    $$('[data-where]').forEach((x) => x.classList.toggle('on', x.dataset.where === state.where));
    for (const d of Object.keys(herni)) reshapeDisc(d);
    pose(); syncSliders(); applyVisibility();
    layout();
    camera.position.copy(HOME.target).addScaledVector(new THREE.Vector3(...VIEWS.side).normalize(), fitDist(78)); controls.target.copy(HOME.target);
    if (h.sel) { state.top = h.top; $('#disc-top').setAttribute('aria-pressed', String(state.top)); const x = state.xray; selectDisc(h.sel, { fly: false }); if (!x && !new URLSearchParams(location.hash.slice(1)).has('x')) { /* keep see-through on for a picked disc */ } lookAtDisc(h.sel); fly.ms = 1; }
    $('#loading').classList.add('done');
    window.__spine = { state, herni, contact, selectDisc, setTop, onPose, changeDisc, focus, flyTo, VIEWS, discWorld, camera, controls, setTab, setXray, syncSliders, M };
    schedule();
  } catch (err) {
    console.error(err); $('#loading').textContent = 'Could not load the spine. Please reload the page.';
  }
})();

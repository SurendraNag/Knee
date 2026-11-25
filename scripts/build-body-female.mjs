// Female body for the whole-body explorer (public/body-female/, same format as public/body/, see build-body.mjs).
// BodyParts3D is a male body, and the open female fits we found (open-anatomy-3d 0.1.0) distort the pelvis and hands,
// so the female body is made here from the full-detail BodyParts3D body:
//   - the pelvis is reshaped toward typical female proportions (wider low down, wider pubic arch, broader sacrum),
//     with the soft tissue and skin around it;
//   - the male reproductive organs and male urethra are removed; the uterus, ovaries, fallopian tubes, vagina and breast
//     (mammary gland) tissue come from the Human Reference Atlas 3D reference organs (HuBMAP, CC BY 4.0) as packaged in
//     open-anatomy-3d (CC BY 4.0), placed by the bladder (pelvic organs) and the chest wall (breasts); a short female
//     urethra is modelled;
//   - the skin is the BodyParts3D skin with the male genitals smoothed away, the chest raised over the breast tissue and
//     the hips following the pelvis.
//   - the pelvis, hip, knee, ankle and rear-foot bones, joint cartilage, knee ligaments and hip and leg muscles are the
//     Visible Human Female's (data/visible-human-female, CC BY 4.0), fitted to this body by vhf-place.mjs (NOVHF=1 skips);
// Not changed: overall height and build, the face, and the muscles of the trunk, arms and head (the reference body's).
//   node scripts/build-body-female.mjs <anatomy-model/model> <open-anatomy-3d/models>
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { readGLB } from './glb-read.mjs';

const [SRC, OA] = process.argv.slice(2);
if (!SRC || !OA) throw new Error('usage: node scripts/build-body-female.mjs <anatomy-model/model> <open-anatomy-3d/models>');
const OUT = path.resolve('public/body-female');
fs.mkdirSync(OUT, { recursive: true });
const T0 = Date.now(); const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);

const atlas = JSON.parse(fs.readFileSync(path.join(SRC, 'atlas.json'), 'utf8'));
const chunks = atlas.chunks.map((c) => zlib.gunzipSync(fs.readFileSync(path.join(SRC, path.basename(c.gzip)))));
const M = await readGLB(path.join(OA, 'anatomy-male.glb')), F = await readGLB(path.join(OA, 'anatomy-female.glb'));
const FM = Object.fromEntries(F.meshes.map((m) => [m.name, m]));

const bvhOf = (m) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3)); g.setIndex(new THREE.BufferAttribute(m.indices, 1)); return new MeshBVH(g); };
const tgt = new THREE.Vector3(), hit = {};
const bboxOf = (P) => { const mn = [9, 9, 9], mx = [-9, -9, -9]; for (let i = 0; i < P.length; i += 3) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], P[i + a]); mx[a] = Math.max(mx[a], P[i + a]); } return [mn, mx]; };
const centroid = (P) => { const c = [0, 0, 0]; for (let i = 0; i < P.length; i += 3) for (let a = 0; a < 3; a++) c[a] += P[i + a]; return c.map((v) => v / (P.length / 3)); };

// ---------- 2. pelvis toward typical female proportions ----------
// The fit leaves a male-shaped pelvis (it follows the female body's outline, not its bones). A female pelvis is wider
// low down: the ischial tuberosities sit further apart, the angle under the pubic arch is wider (about 80-90 degrees
// against 50-60), the inlet is rounder and wider and the sacrum is broader; the iliac crests change little.
// Points beside the midline are pushed outward by a fraction k(y) of their distance from it: most at the ischia,
// less at the hip joints and inlet, a little at the crests, none above. Beside and below the hip joints the push is
// capped at the hip joint's own shift, so the legs move out as a whole and the shift fades out by the knees.
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const FEM = JSON.parse(process.env.FEM || '{}');
const GAIN = FEM.gain ?? 1;
let L = null; // landmarks, from the fitted bones
function landmarks() {
  const get = (name) => parts.find((q) => q.name === name).positions;
  const H = get('Left hip bone'), Fm = get('Left femur');
  let ymin = 9, ymax = -9; for (let i = 1; i < H.length; i += 3) { ymin = Math.min(ymin, H[i]); ymax = Math.max(ymax, H[i]); }
  // femoral head: the innermost part of the top of the femur
  let top = -9; for (let i = 1; i < Fm.length; i += 3) top = Math.max(top, Fm[i]);
  let fx = 9; for (let i = 0; i < Fm.length; i += 3) if (Fm[i + 1] > top - 0.08) fx = Math.min(fx, Fm[i]);
  let c = [0, 0, 0], n = 0; for (let i = 0; i < Fm.length; i += 3) if (Fm[i + 1] > top - 0.08 && Fm[i] < fx + 0.035) { c[0] += Fm[i]; c[1] += Fm[i + 1]; c[2] += Fm[i + 2]; n++; }
  c = c.map((v) => v / n);
  let kneeY = 9; for (let i = 1; i < Fm.length; i += 3) kneeY = Math.min(kneeY, Fm[i]);
  return { isch: ymin, crest: ymax, hipX: c[0], hipY: c[1], knee: kneeY + 0.03 };
}
// fraction of the distance from the midline, by height (points: ischia 32%, hip joints 16%, inlet 9%, crests 3%)
function kOf(y) {
  const P = [[L.isch, 0.32], [L.hipY, 0.16], [(L.hipY + L.crest) / 2 + 0.01, 0.09], [L.crest, 0.03], [L.crest + 0.04, 0]];
  if (y <= P[0][0]) return P[0][1];
  for (let i = 1; i < P.length; i++) if (y <= P[i][0]) { const t = ss(P[i - 1][0], P[i][0], y); return (P[i - 1][1] + (P[i][1] - P[i - 1][1]) * t); }
  return 0;
}
function feminise(p) {
  if (!GAIN) return;
  const x = p[0], y = p[1], ax = Math.abs(x), cap = L.hipX * kOf(L.hipY);
  let dx;
  if (y >= L.isch) {
    const free = ss(L.hipY + 0.02, L.hipY + 0.07, y); // the iliac wings above the hip joints scale freely
    dx = Math.min(ax * kOf(y), cap) * (1 - free) + ax * kOf(y) * free;
  } else dx = Math.min(ax * kOf(L.isch), cap) * ss(L.knee, L.isch, y); // perineum and legs, fading out by the knees
  p[0] = x + Math.sign(x) * dx * GAIN;
}

// ---------- 3. parts ----------
const MALE_ONLY = /penis|testis|testic|scrot|prostat|seminal|deferent duct|ductus deferens|vas deferens|epididym|spermatic|bulbourethral|pubic hair|hair of head|cremaster|^urethra$/i;
const kept = atlas.parts.filter((p) => !MALE_ONLY.test(p.name));
log('dropped', atlas.parts.length - kept.length, ':', atlas.parts.filter((p) => MALE_ONLY.test(p.name)).map((p) => p.name).join(', '));
const parts = [];
for (const p of kept) {
  if (process.env.QUICK && p.system !== 'skeletal') continue;
  const buf = chunks[p.chunk];
  const P = new Float32Array(buf.buffer.slice(buf.byteOffset + p.positions, buf.byteOffset + p.positions + p.vertexCount * 12));
  const I = new Uint32Array(buf.buffer.slice(buf.byteOffset + p.indices, buf.byteOffset + p.indices + p.indexCount * 4));
  parts.push({ id: p.id, name: p.name, system: p.system, positions: Float32Array.from(P), indices: I });
}
const byName = (n) => parts.find((q) => q.name === n);
L = landmarks(); log('pelvis landmarks', JSON.stringify(L, (k, v) => (typeof v === 'number' ? +v.toFixed(3) : v)));
// female organs, still in the male frame: pelvic organs placed by the bladder, breasts by the chest wall (before reshaping)
const MM = Object.fromEntries(M.meshes.map((m) => [m.name, m]));
const S = 1.72 / 1.62; // the female fit is a shorter body
const add = (id, name, src, xf, system = 'reproductive') => { const Q = new Float32Array(src.positions.length); for (let i = 0; i < Q.length; i += 3) { const q = xf([src.positions[i], src.positions[i + 1], src.positions[i + 2]]); Q[i] = q[0]; Q[i + 1] = q[1]; Q[i + 2] = q[2]; } parts.push({ id, name, system, positions: Q, indices: src.indices, female: true }); return Q; };
{
  const cf = centroid(FM.bladder.positions), cm = centroid(byName('Urinary bladder').positions);
  const xf = (p) => [0, 1, 2].map((a) => cm[a] + (p[a] - cf[a]) * S);
  for (const [k, id, name] of [['uterus', 'F_UTERUS', 'Uterus'], ['ovary_l', 'F_OVARY_L', 'Left ovary'], ['ovary_r', 'F_OVARY_R', 'Right ovary'], ['fallopian_tubes', 'F_TUBES', 'Fallopian (uterine) tubes'], ['vagina', 'F_VAGINA', 'Vagina']]) {
    const Q = add(id, name, FM[k], xf); const [mn, mx] = bboxOf(Q); log(name, mn.map((v) => v.toFixed(3)).join(','), '..', mx.map((v) => v.toFixed(3)).join(','));
  }
}
{
  // breast tissue: the atlas's right breast, sized with the body and set on the right pectoralis at the 4th rib level;
  // the left breast is its mirror image (the atlas's left breast does not sit on the left side of this fit)
  const src = FM.breast_r, c = centroid(src.positions);
  const pect = bvhOf(parts.filter((q) => /pectoralis major/i.test(q.name)).reduce((acc, q) => { const off = acc.positions.length / 3; acc.positions = Float32Array.from([...acc.positions, ...q.positions]); acc.indices = Uint32Array.from([...acc.indices, ...Array.from(q.indices, (v) => v + off)]); return acc; }, { positions: new Float32Array(0), indices: new Uint32Array(0) }));
  const target = [-0.095, 1.262]; // x, y of the breast centre (midclavicular line, about the 4th rib)
  const ray = new THREE.Ray(new THREE.Vector3(target[0], target[1], 0.5), new THREE.Vector3(0, 0, -1));
  const h = pect.raycastFirst(ray, THREE.DoubleSide); const wallZ = h ? h.point.z : 0.11;
  const tmp = (p) => [target[0] + (p[0] - c[0]) * S, target[1] + (p[1] - c[1]) * S, (p[2] - c[2]) * S];
  let back = 9; for (let i = 0; i < src.positions.length; i += 3) back = Math.min(back, tmp([src.positions[i], src.positions[i + 1], src.positions[i + 2]])[2]);
  const dz = wallZ - back - 0.004;
  add('F_BREAST_R', 'Right breast (mammary gland)', src, (p) => { const q = tmp(p); q[2] += dz; return q; });
  const R = parts[parts.length - 1];
  const mirror = { id: 'F_BREAST_L', name: 'Left breast (mammary gland)', system: 'reproductive', female: true, positions: Float32Array.from(R.positions), indices: Uint32Array.from(R.indices) };
  for (let i = 0; i < mirror.positions.length; i += 3) mirror.positions[i] *= -1;
  for (let t = 0; t < mirror.indices.length; t += 3) { const k = mirror.indices[t + 1]; mirror.indices[t + 1] = mirror.indices[t + 2]; mirror.indices[t + 2] = k; }
  parts.push(mirror);
  log('breasts: chest wall z', wallZ.toFixed(3), 'shift', dz.toFixed(3));
}
// skin: smooth away the male genitals (flatten them onto a pubic mound and perineum) and raise the chest over the breasts
{
  const sk = byName('Skin'), P = sk.positions;
  // mound profile from the skin just beside the genitals
  const prof = (y) => { let z = -9; for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i]) > 0.05 && Math.abs(P[i]) < 0.07 && Math.abs(P[i + 1] - y) < 0.006 && P[i + 2] > -0.02) z = Math.max(z, P[i + 2]); return z; };
  const Z = {}; for (let y = 0.74; y <= 0.92; y += 0.005) Z[y.toFixed(3)] = prof(y);
  const zAt = (y) => { const k = (Math.round(y / 0.005) * 0.005).toFixed(3); return Z[k] ?? -9; };
  let moved = 0;
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i], y = P[i + 1], z = P[i + 2];
    if (Math.abs(x) > 0.055 || y < 0.74 || y > 0.9 || z < -0.03) continue;
    const zm = zAt(Math.max(y, 0.79)) - 0.004 * (1 - Math.abs(x) / 0.055);
    if (zm > -0.5 && z > zm) { P[i + 2] = zm; moved++; }
    if (P[i + 1] < 0.79 && Math.abs(x) < 0.03) { P[i + 1] = 0.79 + (P[i + 1] - 0.79) * 0.15; moved++; }
  }
  // chest over the breasts: a height field of the breasts' front surface, padded and smoothed
  const B = parts.filter((q) => /breast/i.test(q.name)), G = 0.004, H = new Map();
  for (const b of B) for (let i = 0; i < b.positions.length; i += 3) { const k = `${Math.round(b.positions[i] / G)},${Math.round(b.positions[i + 1] / G)}`; H.set(k, Math.max(H.get(k) ?? -9, b.positions[i + 2])); }
  const hz = (x, y) => { let best = -9; for (let dx = -8; dx <= 8; dx++) for (let dy = -8; dy <= 8; dy++) { const v = H.get(`${Math.round(x / G) + dx},${Math.round(y / G) + dy}`); if (v !== undefined) best = Math.max(best, v - 0.0006 * (dx * dx + dy * dy)); } return best; };
  let raised = 0;
  for (let i = 0; i < P.length; i += 3) { if (P[i + 2] < 0.05 || P[i + 1] < 1.12 || P[i + 1] > 1.4) continue; const t = hz(P[i], P[i + 1]) + 0.014; if (t > P[i + 2]) { P[i + 2] = t; raised++; } }
  log('skin: genital vertices smoothed', moved, ', chest vertices raised', raised);
}
// reshape the pelvis (everything, including the new organs and the skin)
for (const p of parts) for (let i = 0; i < p.positions.length; i += 3) { const q = [p.positions[i], p.positions[i + 1], p.positions[i + 2]]; feminise(q); p.positions[i] = q[0]; }
// Visible Human Female pelvis and lower limbs (real female anatomy) in place of the reference body's: see vhf-place.mjs
if (!process.env.NOVHF) { const { placeVHF } = await import('./vhf-place.mjs'); placeVHF(parts, path.resolve('data/visible-human-female/vhf-lower-limb.bin.gz'), log); if (process.env.VHFCHECK) (await import('./vhf-place.mjs')).checkVHF(parts, log); }
if (process.env.VHFONLY) process.exit(0);
if (process.env.QUICK) process.exit(0);
// Female urethra (modelled): a short tube from the neck of the bladder, down and forward along the front wall of the
// vagina, opening just in front of it. (The male urethra runs through the penis and is dropped above.)
{
  const B = byName('Urinary bladder').positions, V = parts.find((q) => q.id === 'F_VAGINA').positions;
  log('bladder verts', B.length / 3);
  let neck = null; for (let i = 0; i < B.length; i += 3) if (Math.abs(B[i]) < 0.015 && (!neck || B[i + 1] < neck[1])) neck = [B[i], B[i + 1], B[i + 2]];
  let low = null; for (let i = 0; i < V.length; i += 3) if (!low || V[i + 1] < low[1]) low = [V[i], V[i + 1], V[i + 2]];
  let front = -9; for (let i = 0; i < V.length; i += 3) if (V[i + 1] < low[1] + 0.012) front = Math.max(front, V[i + 2]);
  const end = [0, low[1] + 0.004, front + 0.012], mid = [0, (neck[1] + end[1]) / 2, Math.max(neck[2], end[2]) + 0.004];
  const pts = []; for (let k = 0; k <= 20; k++) { const t = k / 20, a = (1 - t) ** 2, b = 2 * t * (1 - t), c = t * t; pts.push([0, 1, 2].map((j) => a * neck[j] + b * mid[j] + c * end[j])); }
  const R = 0.0032, M = 14, P = [], I = [];
  for (let k = 0; k < pts.length; k++) {
    const t = pts[Math.min(k + 1, pts.length - 1)].map((v, j) => v - pts[Math.max(k - 1, 0)][j]); const tl = Math.hypot(...t); const T = t.map((v) => v / tl);
    const u = [1, 0, 0], w = [T[1] * u[2] - T[2] * u[1], T[2] * u[0] - T[0] * u[2], T[0] * u[1] - T[1] * u[0]]; const wl = Math.hypot(...w);
    for (let j = 0; j < M; j++) { const a = (j / M) * Math.PI * 2; for (let c = 0; c < 3; c++) P.push(pts[k][c] + R * (Math.cos(a) * u[c] + Math.sin(a) * w[c] / wl)); }
  }
  for (let k = 0; k < pts.length - 1; k++) for (let j = 0; j < M; j++) { const a = k * M + j, b = k * M + (j + 1) % M, c = a + M, d = b + M; I.push(a, c, b, b, c, d); }
  parts.push({ id: 'F_URETHRA', name: 'Urethra (female)', system: 'urinary', positions: Float32Array.from(P), indices: Uint32Array.from(I), female: true });
  log('female urethra', neck.map((v) => v.toFixed(3)).join(','), '->', end.map((v) => v.toFixed(3)).join(','));
}

// ---------- 4. normals + packs (same layout as build-body.mjs) ----------
function vnormals(P, I) {
  const N = new Float32Array(P.length);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const o of [a, b, c]) { N[o] += nx; N[o + 1] += ny; N[o + 2] += nz; }
  }
  for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
  return N;
}
const PACKS = [
  { id: 'skin', label: 'Skin', systems: ['integumentary'] },
  { id: 'muscles', label: 'Muscles', systems: ['muscular'] },
  { id: 'skeleton', label: 'Skeleton', systems: ['skeletal'] },
  { id: 'joints', label: 'Ligaments and tendons', systems: ['connective'] },
  { id: 'nerves', label: 'Brain and nerves', systems: ['nervous'] },
  { id: 'arteries', label: 'Arteries', systems: ['arterial'] },
  { id: 'veins', label: 'Veins', systems: ['venous'] },
  { id: 'organs', label: 'Organs', systems: ['cardiac', 'respiratory', 'digestive', 'urinary', 'reproductive', 'endocrine', 'lymphatic'] },
  { id: 'senses', label: 'Eyes and ears', systems: ['sensory'] },
];
const manifest = {
  version: 1, units: 'm', sex: 'female', source: atlas.version,
  credit: 'BodyParts3D, © The Database Center for Life Science (CC BY 4.0); female organs: Human Reference Atlas 3D Reference Organs, HuBMAP (CC BY 4.0), via open-anatomy-3d (CC BY 4.0); pelvis and lower limbs: Visible Human Female musculoskeletal geometries, Center for Orthopaedic Biomechanics, University of Denver (Andreassen et al., Sci Data 2023; CC BY 4.0); placement and skin adapted by this project',
  packs: [],
};
let total = 0;
for (const pack of PACKS) {
  // big parts (the female skin and breasts) are split into 16-bit pieces
  const list0 = parts.filter((p) => pack.systems.includes(p.system));
  const list = [];
  for (const p of list0) {
    const n = p.positions.length / 3;
    if (n <= 65535) { list.push(p); continue; }
    let piece = 0;
    for (let t0 = 0; t0 < p.indices.length;) {
      const map = new Map(), P = [], I = [];
      while (t0 < p.indices.length && map.size < 65000) { for (let c = 0; c < 3; c++) { const v = p.indices[t0 + c]; if (!map.has(v)) { map.set(v, map.size); P.push(p.positions[v * 3], p.positions[v * 3 + 1], p.positions[v * 3 + 2]); } I.push(map.get(v)); } t0 += 3; }
      list.push({ ...p, positions: Float32Array.from(P), indices: Uint32Array.from(I), piece: piece++ });
    }
  }
  let nv = 0, nt = 0;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of list) { nv += p.positions.length / 3; nt += p.indices.length / 3; for (let i = 0; i < p.positions.length; i += 3) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], p.positions[i + a]); max[a] = Math.max(max[a], p.positions[i + a]); } }
  const pos = new Uint16Array(nv * 3), nrm = new Int8Array(nv * 3 + ((4 - ((nv * 3) % 4)) % 4)), pid = new Uint16Array(nv + (nv % 2)), idx = new Uint16Array(nt * 3);
  const out = []; let v0 = 0, t0 = 0;
  // pieces of one part share one part index
  const ids = []; list.forEach((p) => { if (!ids.includes(p.id)) ids.push(p.id); });
  list.forEach((p) => {
    const k = ids.indexOf(p.id), n = p.positions.length / 3, N = vnormals(p.positions, p.indices);
    for (let i = 0; i < n; i++) { for (let a = 0; a < 3; a++) { pos[(v0 + i) * 3 + a] = Math.round(((p.positions[i * 3 + a] - min[a]) / (max[a] - min[a])) * 65535); nrm[(v0 + i) * 3 + a] = Math.round(N[i * 3 + a] * 127); } pid[v0 + i] = k; }
    for (let i = 0; i < p.indices.length; i++) idx[t0 * 3 + i] = p.indices[i];
    out.push({ p, v0, vc: n, t0, tc: p.indices.length / 3 });
    v0 += n; t0 += p.indices.length / 3;
  });
  // manifest: one entry per part; a split part lists its pieces as [v0, vc, t0, tc]
  const entries = ids.map((id) => {
    const ps = out.filter((o) => o.p.id === id), p = ps[0].p;
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const o of ps) for (let i = 0; i < o.p.positions.length; i += 3) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], o.p.positions[i + a]); mx[a] = Math.max(mx[a], o.p.positions[i + a]); }
    const c = [0, 1, 2].map((a) => +((mn[a] + mx[a]) / 2).toFixed(4)), r = +(Math.hypot(...[0, 1, 2].map((a) => mx[a] - mn[a])) / 2).toFixed(4);
    const e = { id, name: p.name, system: p.system, v0: ps[0].v0, vc: ps[0].vc, t0: ps[0].t0, tc: ps[0].tc, c, r };
    if (ps.length > 1) e.pieces = ps.map((o) => [o.v0, o.vc, o.t0, o.tc]);
    if (p.female) e.female = 1;
    if (p.vhf) e.vhf = 1;
    return e;
  });
  const raw = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(nrm.buffer), Buffer.from(pid.buffer), Buffer.from(idx.buffer)]);
  const gz = zlib.gzipSync(raw, { level: 9 });
  fs.writeFileSync(path.join(OUT, `${pack.id}.dat`), gz); total += gz.length;
  manifest.packs.push({ id: pack.id, label: pack.label, file: `${pack.id}.dat`, bytes: gz.length, nv, nt, min, max,
    layout: { pos: 0, nrm: pos.byteLength, pid: pos.byteLength + nrm.byteLength, idx: pos.byteLength + nrm.byteLength + pid.byteLength }, parts: entries });
  log(`${pack.id}: ${entries.length} parts, ${nv} verts, ${(gz.length / 1e6).toFixed(2)} MB`);
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest));
log(`total ${(total / 1e6).toFixed(1)} MB`);
// landmarks for checking the pelvis (after reshaping)
{
  const bb = (name) => { const p = parts.find((q) => q.name === name); const mn = [9, 9, 9], mx = [-9, -9, -9]; for (let i = 0; i < p.positions.length; i += 3) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], p.positions[i + a]); mx[a] = Math.max(mx[a], p.positions[i + a]); } return [mn.map((v) => +v.toFixed(3)), mx.map((v) => +v.toFixed(3))]; };
  for (const n of ['Left hip bone', 'Right hip bone', 'Sacrum', 'Left femur', 'Pubic symphysis']) { try { log(n, JSON.stringify(bb(n))); } catch { log('no', n); } }
}

// Builds the spine, ribcage and pelvis into public/spine/ (same format as public/anatomy/, see build-lib.mjs).
// Scanned parts (BodyParts3D 4.0 via @dagno/anatomy-model, see extract-region.mjs, region "trunk"). The scanned discs are
// rebuilt as ring sweeps that follow their outline, so they can show tears and herniations. Modelled: the spinal cord and
// cauda equina, nerve roots, the anterior and posterior longitudinal ligaments and the sacroiliac ligaments.
// Frame: cm, origin in front of L5, +X toward the body's left, +Y up, +Z front.
import * as THREE from 'three';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { mix, smoothstep } from './sdf.mjs';
import { loopSubdivide, normals, bvhOf, merge } from './meshops.mjs';
import { normalAt, v3, sweep, ellipseProfile, lensProfile, hintFrame, hug, relax, mergeSweeps, withFibres, clearOf, cropBy, largestPiece, writeAnatomy } from './build-lib.mjs';
import { STRUCTURES, VERTEBRAE, DISCS, fade } from '../src/spine-structures.js';

const OUT = path.resolve('public/spine');
fs.mkdirSync(OUT, { recursive: true });
const T0 = Date.now(); const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);
const IDX = JSON.parse(fs.readFileSync('data/bodyparts3d/trunk-extra.json', 'utf8'));
const BIN = zlib.gunzipSync(fs.readFileSync('data/bodyparts3d/trunk-extra.bin'));
function part(fj) {
  const e = IDX.find((x) => x.id === fj); if (!e) throw new Error('missing ' + fj);
  return { positions: new Float32Array(BIN.buffer.slice(BIN.byteOffset + e.pos, BIN.byteOffset + e.pos + e.vc * 12)),
    indices: new Uint32Array(BIN.buffer.slice(BIN.byteOffset + e.idx, BIN.byteOffset + e.idx + e.ic * 4)) };
}
const ids = (re) => { const l = IDX.filter((e) => re.test(e.name)).map((e) => e.id); if (!l.length) throw new Error('nothing matches ' + re); return l; };
const src = (list) => merge(list.map(part));
const keep = (g) => cropBy(g, (x, y, z) => fade(x, y, z) > 0.01);
const pts = (g) => { const P = g.positions, o = []; for (let i = 0; i < P.length; i += 3) o.push(v3([P[i], P[i + 1], P[i + 2]])); return o; };
const mean = (l) => l.reduce((a, p) => a.add(p), v3([0, 0, 0])).divideScalar(l.length);
const fv = (p) => p.toArray().map((v) => v.toFixed(1)).join(',');
const smooth = (g, target) => { g = loopSubdivide(g); if (g.positions.length / 3 < target) g = loopSubdivide(g); return normals(g); };

// ---------- Bones ----------
const bones = {};
for (const [id, name] of VERTEBRAE) bones[id] = smooth(src(ids(new RegExp(`^${name}$`))), 3000);
bones.sacrum = smooth(src(ids(/^Sacrum$/)), 8000);
bones.right_hip_bone = smooth(keep(src(ids(/^Right hip bone$/))), 12000);
bones.left_hip_bone = smooth(keep(src(ids(/^Left hip bone$/))), 12000);
bones.ribs = normals(loopSubdivide(src(ids(/ rib$/))));
bones.sternum = smooth(src(ids(/^Body of sternum$|^Manubrium$|^Xiphoid process$/)), 8000);
const cart = { costal_cartilage: normals(loopSubdivide(src(ids(/costal cartilage$/)))) };
log('bones', Object.values(bones).reduce((a, g) => a + g.positions.length / 3, 0), 'verts');

// ---------- Discs: rebuilt as rings that follow each scanned disc's outline ----------
function pca(P) { // returns [e0 (largest), e1, e2 (smallest)] by power iteration with deflation
  const c = mean(P); const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of P) { const d = p.clone().sub(c).toArray(); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; }
  const out = []; const M = C.map((r) => r.slice());
  for (let k = 0; k < 3; k++) {
    let v = [1, 0.3 + k, 0.2 - k]; let lam = 0;
    for (let it = 0; it < 200; it++) { const w = M.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]); lam = Math.hypot(...w); v = w.map((x) => x / (lam || 1)); }
    out.push(v3(v)); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i][j] -= lam * v[i] * v[j];
  }
  return { c, axes: out };
}
const discs = {}, discInfo = {};
for (const [id, name] of DISCS) {
  const P = pts(normals(src(ids(new RegExp(`^${name}$`)))));
  const { c, axes } = pca(P); let n = axes[2].clone(); if (n.y < 0) n.negate();
  let f = v3([0, 0, 1]).addScaledVector(n, -n.z).normalize(); const sideAx = new THREE.Vector3().crossVectors(n, f).normalize();
  const N = 72, R = new Array(N).fill(0), H = new Array(N).fill(0);
  for (const p of P) { const d = p.clone().sub(c); const a = Math.atan2(d.dot(sideAx), d.dot(f)); const k = Math.round(((a / (Math.PI * 2)) * N + N)) % N; R[k] = Math.max(R[k], Math.hypot(d.dot(sideAx), d.dot(f))); }
  for (let k = 0; k < N; k++) if (!R[k]) R[k] = Math.max(R[(k + N - 1) % N], R[(k + 1) % N]);
  for (let it = 0; it < 3; it++) for (let k = 0; k < N; k++) R[k] = 0.25 * R[(k + N - 1) % N] + 0.5 * R[k] + 0.25 * R[(k + 1) % N];
  let hMin = 1e9, hMax = -1e9; for (const p of P) { const d = p.clone().sub(c); if (Math.hypot(d.dot(sideAx), d.dot(f)) < Math.min(...R) * 0.6) { hMin = Math.min(hMin, d.dot(n)); hMax = Math.max(hMax, d.dot(n)); } }
  const h = Math.max(0.35, (hMax - hMin) * 0.9), mid = (hMax + hMin) / 2;
  const ring = R.map((r, k) => { const a = (k / N) * Math.PI * 2; return c.clone().addScaledVector(n, mid).addScaledVector(f, Math.cos(a) * r * 0.56).addScaledVector(sideAx, Math.sin(a) * r * 0.56).toArray(); });
  const rAt = (t) => { const x = t * N, k = Math.floor(x) % N, u = x - Math.floor(x); return R[k] * (1 - u) + R[(k + 1) % N] * u; };
  discs[id] = sweep({ points: ring, n: 120, m: 20, closedCurve: true, caps: false, curveType: 'catmullrom',
    frame: hintFrame(() => n.toArray()), profile: (t) => ellipseProfile(rAt(t) * 0.86, h, 20, 0, 0.75) });
  // a profile's "side" points outward-ish; sweep's side = T x up: make sure the ring's inner edge is toward the disc centre (no action needed: symmetric)
  discInfo[id] = { c: c.clone().addScaledVector(n, mid), n, f, rBack: R[N / 2], rFront: R[0], h };
}
log('discs', Object.keys(discs).length, Object.entries(discInfo).filter(([k]) => /l4|l5|c5/.test(k)).map(([k, d]) => `${k} c=${fv(d.c)} h=${d.h.toFixed(2)} rF=${d.rFront.toFixed(1)} rB=${d.rBack.toFixed(1)}`).join(' | '));

// ---------- Spinal canal: one centre per vertebra, the point inside the bony ring farthest from the bone ----------
const ray = new THREE.Ray();
const canal = [];
const BODY = {}; // vertebral body centre for each vertebra from its discs
const discList = DISCS.map(([id]) => id);
VERTEBRAE.forEach(([vid], i) => {
  const above = i >= 2 ? discList[i - 2] : null, below = i >= 1 ? discList[i - 1] : null; // c1 has no discs, c2 only the one below
  const ds = [above, below].filter((d) => d && discInfo[d]).map((d) => discInfo[d].c);
  BODY[vid] = ds.length ? mean(ds.map((p) => p.clone())) : null;
});
for (const [vid] of VERTEBRAE) {
  const g = bones[vid], bvh = bvhOf([g]); const P = pts(g);
  const yc = BODY[vid] ? BODY[vid].y : mean(P).y;
  // start just behind the vertebral body (back edge of the nearest disc), so the search stays in the canal
  const nd = Object.values(discInfo).reduce((a, d) => (Math.abs(d.c.y - yc) < Math.abs(a.c.y - yc) ? d : a));
  const zFront = BODY[vid] ? nd.c.z - nd.rBack * 0.95 + 0.5 : Math.max(...P.map((p) => p.z));
  let best = null;
  if (BODY[vid]) { // walk backward in the midline from behind the body until the bony arch (lamina) is hit
    const o = v3([0, yc, nd.c.z - nd.rBack - 0.1]);
    for (let k = 0; k < 6; k++) {
      ray.origin.copy(o); ray.direction.set(0, 0, -1); const h = bvh.raycastFirst(ray, THREE.DoubleSide);
      if (!h) break;
      if (h.distance < 0.35) { o.z = h.point.z - 0.05; continue; }
      if (h.distance < 4.5) best = { d: h.distance / 2, p: o.clone().add(v3([0, 0, -h.distance / 2])) };
      break;
    }
  } else best = { d: 1, p: (() => { const m = mean(P); return v3([0, m.y, m.z]); })() };
  canal.push(best ? { vid, p: best.p, r: best.d, zBack: BODY[vid] ? nd.c.z - nd.rBack : null, y: yc } : { vid, p: null, zBack: nd.c.z - nd.rBack, y: yc });
}
{ // levels where the midline ray missed the arch: same depth behind the body as the levels found nearby
  for (const c of canal) if (!c.p) { const near = canal.filter((o) => o.p && o.zBack !== null).sort((a, b) => Math.abs(a.y - c.y) - Math.abs(b.y - c.y)).slice(0, 2); const off = near.reduce((a, o) => a + (o.zBack - o.p.z), 0) / near.length; c.p = v3([0, c.y, c.zBack - off]); c.r = 0; }
}
log('canal missing', VERTEBRAE.map(([v]) => v).filter((v) => !canal.find((c) => c.vid === v)).join(','));
log('canal', canal.length, 'levels; sample', canal.filter((c, i) => i % 6 === 0).map((c) => `${c.vid} ${fv(c.p)} r${c.r.toFixed(2)}`).join(' | '));

// ---------- Spinal cord, cauda equina and nerve roots (modelled) ----------
const allBones = bvhOf(Object.values(bones));
const nerves = {};
{
  const cp = canal.map((c) => c.p.clone());
  const top = cp[0].clone().add(v3([0, 3, 0.3])); // continues up into the skull
  const sac = mean(pts(bones.sacrum)); const sacTop = pts(bones.sacrum).reduce((a, p) => (p.y > a.y ? p : a));
  const tail = [sacTop.clone().add(v3([0, -1.5, -2.2])), sac.clone().add(v3([0, -1, -1.6]))];
  const path = relax([top, ...cp, ...tail].map((p) => p.toArray()), 2);
  const l1 = canal.find((c) => c.vid === 'l2').p.y; const len = path.length;
  const yTop = path[0][1], yEnd = path[len - 1][1];
  // radius: cord about 1.0 x 0.8 cm with the neck enlargement, cone at L1-L2, then a thinner bundle (cauda equina)
  const wAt = (y) => (y > l1 + 2 ? mix(0.85, 1.25, smoothstep(30, 48, y) * (1 - smoothstep(52, 58, y))) : mix(0.55, 0.85, smoothstep(l1 - 2, l1 + 2, y)));
  const g = sweep({ points: path, n: 260, m: 16, frame: hintFrame(() => [0, 0, 1]), profile: (t) => { const y = mix(yTop, yEnd, t); const w = wAt(y); return ellipseProfile(w * 1.2, w, 16, 0, 0.1); } });
  nerves.spinal_cord = g;
  // nerve roots: a pair at every disc level, out through the foramen just behind the disc, heading down and out
  const roots = [];
  for (const [id] of DISCS) {
    const d = discInfo[id]; const cc = canal.reduce((a, c) => (Math.abs(c.p.y - d.c.y) < Math.abs(a.p.y - d.c.y) ? c : a)).p.clone(); cc.y = d.c.y;
    const lumbar = /disc_l|disc_t12/.test(id), neck = /disc_c/.test(id);
    const drop = lumbar ? 2.2 : neck ? 0.4 : 1.0, out = lumbar ? 5.5 : neck ? 4.0 : 4.5, w = lumbar ? 0.5 : 0.38;
    for (const s of [-1, 1]) {
      const p0 = cc.clone().add(v3([s * 0.6, 0.6, 0.1]));
      const p1 = v3([s * (d.rBack * 0.5 + 0.9), d.c.y - 0.1, d.c.z - d.rBack * 0.9]);
      const p2 = v3([s * (d.rBack * 0.6 + 2.4), d.c.y - drop * 0.5, d.c.z - d.rBack * 0.5]);
      const p3 = v3([s * (d.rBack * 0.6 + out), d.c.y - drop, d.c.z - d.rBack * 0.2 + (lumbar ? 0.8 : 0.4)]);
      let q = relax([p0, p1, p2, p3].map((p) => p.toArray()), 1); q = clearOf(q, allBones, w * 0.6 + 0.1);
      roots.push(sweep({ points: q, n: 24, m: 10, frame: hintFrame(() => [0, 1, 0]), profile: (t) => ellipseProfile(mix(w, w * 0.8, t) * 1.2, mix(w, w * 0.8, t), 10, 0, 0.1) }));
    }
  }
  nerves.nerve_roots = mergeSweeps(roots, 0.01);
}
log('nerves', Object.entries(nerves).map(([k, g]) => `${k} ${g.positions.length / 3}`).join(' '));

// ---------- Ligaments (modelled) ----------
const sweeps = {};
{
  const order = DISCS.map(([id]) => discInfo[id]);
  const allB = bvhOf([...VERTEBRAE.map(([v]) => bones[v]), ...Object.values(discs)]);
  // anterior longitudinal ligament: down the front of the discs and bodies
  let A = order.map((d) => d.c.clone().addScaledVector(d.f, d.rFront * 1.0)).map((p) => p.toArray());
  A = hug(relax(A, 2), 0.12, allB); A = hug(relax(A, 2), 0.12, allB);
  sweeps.anterior_longitudinal_ligament = sweep({ points: A, n: 220, m: 14, frame: hintFrame(() => [0, 0, 1]), profile: (t) => lensProfile(mix(1.0, 2.2, t), 0.22, 14) });
  // posterior longitudinal ligament: down the back of the bodies, inside the canal
  let B = order.map((d) => d.c.clone().addScaledVector(d.f, -d.rBack * 1.0)).map((p) => p.toArray());
  B = hug(relax(B, 2), 0.1, allB); B = hug(relax(B, 2), 0.1, allB);
  sweeps.posterior_longitudinal_ligament = sweep({ points: B, n: 220, m: 14, frame: hintFrame(() => [0, 0, -1]), profile: (t) => lensProfile(mix(0.8, 1.2, t), 0.18, 14) });
  // posterior sacroiliac ligaments: from the back of the sacrum out to the back of each ilium
  const SP = pts(bones.sacrum);
  const list = [];
  for (const s of [-1, 1]) {
    const hip = s < 0 ? bones.right_hip_bone : bones.left_hip_bone;
    const psis = pts(hip).filter((p) => p.y > -6 && p.y < 2 && Math.abs(p.x) < 7).reduce((a, p) => (p.z < a.z ? p : a));
    for (const dy of [0, -2.2]) {
      const a = SP.filter((p) => Math.abs(p.y - (psis.y - 1.5 + dy)) < 0.6 && Math.sign(p.x) === s).reduce((m, p) => (p.z - Math.abs(p.x) * 0.2 < m.z - Math.abs(m.x) * 0.2 ? p : m));
      const b = psis.clone().add(v3([0, dy * 0.6, 0]));
      let q = [a, a.clone().lerp(b, 0.5).add(v3([0, 0, -0.5])), b].map((p) => p.toArray());
      q = hug(q, 0.15, bvhOf([bones.sacrum, hip]));
      list.push(sweep({ points: relax(q, 1), n: 20, m: 14, frame: hintFrame(() => [0, 0, -1]), profile: () => lensProfile(1.3, 0.35, 14) }));
    }
  }
  sweeps.sacroiliac_ligaments = mergeSweeps(list, 20);
}

// ---------- Muscles (scanned, both sides) ----------
const MUSCLES = [
  ['erector_spinae', /iliocostalis|longissimus (thoracis|cervicis)|spinalis($| thoracis)/i, 'y'],
  ['deep_back_muscles', /semispinalis (thoracis|cervicis)|rotator|intertransvers|interspinal|levatores costarum/i, 'y'],
  ['neck_back_muscles', /splenius|semispinalis capitis|longissimus capitis|obliquus capitis|rectus capitis posterior/i, 'y'],
  ['sternocleidomastoid', /sternocleidomastoid/i, 'y'], ['scalenes', /scalen/i, 'y'],
  ['prevertebral_muscles', /longus colli|longus capitis|rectus capitis (anterior|lateralis)/i, 'y'],
  ['trapezius', /trapezius/i, 'pca'], ['rhomboids', /rhomboid/i, 'pca'], ['serratus_posterior', /serratus posterior/i, 'pca'],
  ['psoas', /psoas/i, 'y'], ['iliacus', /iliacus$/i, 'y'], ['piriformis', /piriformis/i, 'pca'],
  ['pelvic_floor', /coccygeus|iliococcygeus|pubococcygeus/i, 'pca'], ['external_oblique', /external oblique/i, 'pca'],
  ['intercostals', /external intercostal/i, 'pca'], ['transversus_thoracis', /transversus thoracis/i, 'pca'],
];
const muscles = {}; const usedM = new Set();
for (const [id, re, kind] of MUSCLES) {
  const list = IDX.filter((e) => e.system === 'muscular' && !usedM.has(e.id) && re.test(e.name)); list.forEach((e) => usedM.add(e.id));
  if (!list.length) { log('no muscle for', id); continue; }
  let g = keep(merge(list.map((e) => { let p = part(e.id); if (p.positions.length / 3 < 1200) p = loopSubdivide(p); return p; })));
  muscles[id] = withFibres(normals(g), kind, id === 'intercostals' ? 0.6 : 2);
  log(id, list.length, 'parts', muscles[id].positions.length / 3, 'verts');
}
log('unused muscles:', IDX.filter((e) => e.system === 'muscular' && !usedM.has(e.id)).map((e) => e.name).join(', '));

// ---------- Vessels ----------
const VG = [
  ['aorta', (e) => e.system === 'arterial' && /aorta|iliac artery|median sacral/i.test(e.name)],
  ['vertebral_arteries', (e) => e.system === 'arterial' && /vertebral artery/i.test(e.name)],
  ['segmental_arteries', (e) => e.system === 'arterial'],
  ['vena_cava', (e) => e.system === 'venous' && /vena cava|iliac vein/i.test(e.name)],
  ['trunk_veins', (e) => e.system === 'venous'],
];
const vessels = {}, used = new Set();
for (const [id, test] of VG) {
  const list = IDX.filter((e) => !used.has(e.id) && test(e)); list.forEach((e) => used.add(e.id));
  if (!list.length) continue;
  vessels[id] = normals(keep(merge(list.map((e) => { let p = part(e.id); if (p.positions.length / 3 < 2000) p = loopSubdivide(p); return p; }))));
  log(id, list.length, 'parts', vessels[id].positions.length / 3, 'verts');
}

// ---------- Skin ----------
let skin = largestPiece(keep(part(IDX.find((e) => e.name === 'Skin').id)));
skin = normals(loopSubdivide(skin));
{ // outward check against the axis of the trunk (x = 0, z = -3)
  const P = skin.positions, N = skin.normals; let dot = 0;
  for (let i = 0; i < P.length; i += 3) dot += P[i] * N[i] + (P[i + 2] + 3) * N[i + 2];
  log('skin outward check', dot.toFixed(0));
  if (dot < 0) { const I = skin.indices; for (let t = 0; t < I.length; t += 3) { const k = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = k; } skin = normals(skin); }
  for (let i = 0; i < P.length; i++) skin.positions[i] += skin.normals[i] * 0.25; skin = normals(skin);
}
log('skin', skin.positions.length / 3, 'verts');
if (process.env.NOWRITE) process.exit(0);

// ---------- Write ----------
const meshes = [];
for (const [id, g] of Object.entries({ ...bones, ...cart, ...muscles, ...vessels })) meshes.push({ id, ...g });
for (const [id, g] of Object.entries({ ...discs, ...sweeps, ...nerves })) meshes.push({ id, positions: g.positions, normals: g.normals, uvs: g.uvs, indices: g.indices });
meshes.push({ id: 'skin', ...skin });
for (const m of meshes) if (!STRUCTURES[m.id]) throw new Error('no structure entry for ' + m.id);
writeAnatomy(meshes, STRUCTURES, OUT, log);

// Builds the right-leg anatomy (hip to toes) into public/anatomy/{anatomy.dat,manifest.json}.
// Bones and muscles: BodyParts3D 4.0 scan meshes (data/bodyparts3d, CC BY 4.0), cropped and smoothed.
// Cartilage: shells generated on the scanned joint surfaces. Ligaments, menisci, tendons, IT band: swept
// shapes fitted to the scanned bones (BodyParts3D has no geometry for them).
// Run: node scripts/build-anatomy.mjs
// Coordinates: 1 unit = 1 cm. Y up, +Z anterior, +X medial, -X lateral (right knee). Joint line ~ y=0.
import * as THREE from 'three';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { clamp, mix, smoothstep, surfaceNets } from './sdf.mjs';
import { readGlb, toApp } from './bp3d.mjs';
import { STRUCTURES } from '../src/structures.js';
import { crop, translate, loopSubdivide, normals, shell, bvhOf, bakeAO, thickness, smoothScalar, cylinderUV, skinAround, merge, principalAxis, weld } from './meshops.mjs';

const OUT = path.resolve('public/anatomy');
fs.mkdirSync(OUT, { recursive: true });
const D = Math.PI / 180;
const Y0 = -50, Y1 = 61; // kept window: sole of the foot to the top of the hip bone (top fades out in the app)
const T0 = Date.now(); const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);

// ---------- BodyParts3D ----------
const SRC = ['knee', 'hip-pelvis', 'ankle-foot', 'supplement-knee-muscle', 'supplement-ankle-foot-muscle', 'supplement-hip-pelvis-muscle', 'supplement-ankle-foot-connective']
  .flatMap((f) => readGlb(`data/bodyparts3d/${f}.glb`));
// Extra right-leg parts (small muscles, vessels, skin) from the whole-body package, already in app cm (see extract-leg-extra.mjs).
const EXTRA_IDX = JSON.parse(fs.readFileSync('data/bodyparts3d/leg-extra.json', 'utf8'));
const EXTRA_BIN = zlib.gunzipSync(fs.readFileSync('data/bodyparts3d/leg-extra.bin'));
function extraPart(fj) {
  const e = EXTRA_IDX.find((x) => x.id === fj); if (!e) throw new Error('missing extra ' + fj);
  const positions = new Float32Array(EXTRA_BIN.buffer.slice(EXTRA_BIN.byteOffset + e.pos, EXTRA_BIN.byteOffset + e.pos + e.vc * 12));
  const indices = new Uint32Array(EXTRA_BIN.buffer.slice(EXTRA_BIN.byteOffset + e.idx, EXTRA_BIN.byteOffset + e.idx + e.ic * 4));
  return { positions, indices };
}
const srcOne = (fj) => { const m = SRC.find((x) => x.fj === fj); return m ? { positions: toApp(m.positions), indices: m.indices } : extraPart(fj); };
const src = (...fjs) => merge(fjs.map(srcOne));
// The scan has the femur resting on the tibia with no room for cartilage and menisci: open the joint 3 mm.
const TIB_SHIFT = [0, -0.3, 0];
const PAT_SHIFT = [0, 0, 0]; // the scan's patella height is normal (tendon/patella length ~1.2)
// Soft tissue follows the same opening smoothly across the knee.
const softShift = (g) => { const P = g.positions; for (let i = 1; i < P.length; i += 3) P[i] += TIB_SHIFT[1] * smoothstep(1.0, -2.0, P[i]); return g; };

const BONES = [
  ['hip_bone', ['FJ3152'], null, 2], ['femur', ['FJ3365'], null, 2], ['patella', ['FJ3381'], PAT_SHIFT, 2],
  ['tibia', ['FJ3387'], TIB_SHIFT, 2], ['fibula', ['FJ3366'], TIB_SHIFT, 2],
  ['talus', ['FJ3385'], TIB_SHIFT, 2], ['calcaneus', ['FJ3360'], TIB_SHIFT, 2], ['navicular', ['FJ3308'], TIB_SHIFT, 1], ['cuboid', ['FJ3364'], TIB_SHIFT, 1],
  ['cuneiforms', ['FJ3377', 'FJ3370', 'FJ3373'], TIB_SHIFT, 1],
  ['metatarsal_1', ['FJ3351'], TIB_SHIFT, 1], ['metatarsal_2', ['FJ3353'], TIB_SHIFT, 1], ['metatarsal_3', ['FJ3355'], TIB_SHIFT, 1],
  ['metatarsal_4', ['FJ3357'], TIB_SHIFT, 1], ['metatarsal_5', ['FJ3359'], TIB_SHIFT, 1],
  ['toe_bones', ['FJ3310', 'FJ3319', 'FJ3320', 'FJ3321', 'FJ3324', 'FJ3300', 'FJ3301', 'FJ3302', 'FJ3305', 'FJ3192', 'FJ3189', 'FJ3190', 'FJ3191', 'FJ3195', 'FJ3372', 'FJ3376'], TIB_SHIFT, 1],
];
const bones = {};
for (const [id, fjs, shift, levels] of BONES) {
  let g = src(...fjs); if (shift) translate(g, shift);
  g = crop(g, Y0, Y1);
  for (let i = 0; i < levels; i++) g = loopSubdivide(g);
  bones[id] = normals(g);
}
log('bones', Object.values(bones).reduce((a, g) => a + g.positions.length / 3, 0), 'verts');

// ---------- Cartilage shells on the scanned joint surfaces ----------
// Femoral cartilage covers what the tibial plateau and the patella touch as the knee bends 0-130 degrees:
// sweep their joint surfaces around the flexion axis and mark femur points they come close to.
const FLEX_P = new THREE.Vector3(0, 1.9, -0.9), FLEX_D = new THREE.Vector3(1, 0.05, -0.08).normalize();
const pick = (g, f) => { const out = [], P = g.positions, N = g.normals; for (let i = 0; i < P.length; i += 3) if (f(P[i], P[i + 1], P[i + 2], N[i], N[i + 1], N[i + 2])) out.push(new THREE.Vector3(P[i], P[i + 1], P[i + 2])); return out; };
const plateauMask = (x, y, z, nx, ny, nz) => ny > 0.5 && y > -1.9 && !(x > -0.75 && x < 0.95);
const patBackMask = (x, y, z, nx, ny, nz) => nz < -0.35 && y > -0.55 + PAT_SHIFT[1];
function contactField(target, movers, maxAngle, dist) {
  const cell = dist, grid = new Map(), key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  const q = new THREE.Quaternion(), v = new THREE.Vector3();
  for (let a = 0; a <= maxAngle; a += 4) {
    q.setFromAxisAngle(FLEX_D, a * D);
    for (const p of movers) { v.copy(p).sub(FLEX_P).applyQuaternion(q).add(FLEX_P); const k = key(v.x, v.y, v.z); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(v.x, v.y, v.z); }
  }
  const P = target.positions, out = new Float32Array(P.length / 3);
  for (let i = 0; i < out.length; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    let best = Infinity;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const l = grid.get(`${cx + a},${cy + b},${cz + c}`); if (!l) continue;
      for (let j = 0; j < l.length; j += 3) { const d = (l[j] - x) ** 2 + (l[j + 1] - y) ** 2 + (l[j + 2] - z) ** 2; if (d < best) best = d; }
    }
    out[i] = 1 - smoothstep(dist * 0.7, dist, Math.sqrt(best));
  }
  return out;
}
const cart = {};
{
  // Condyles: measured around the flexion axis. phi = 0 straight down, +90 straight back.
  const ss = smoothstep;
  const fem = (x, y, z, nx, ny, nz) => {
    const dy = y - FLEX_P.y, dz = z - FLEX_P.z, r = Math.hypot(dy, dz) || 1;
    const phi = Math.atan2(-dz, -dy) / D; // 0 down, 90 back, -90 front
    const radial = (nx * 0) + (ny * dy + nz * dz) / r; // normal pointing away from the axis
    const lat = ss(-3.75, -3.35, x) * (1 - ss(-1.25, -0.95, x)), med = ss(0.85, 1.15, x) * (1 - ss(3.5, 3.95, x));
    const along = ss(-85, -65, phi) * (1 - ss(150, 168, phi));
    const condyles = Math.max(lat, med) * along * ss(0.35, 0.6, radial);
    // Trochlea: front of the femur between its ridges, up to ~4.3 cm above the joint line.
    const top = 4.2 - 0.1 * (x + 0.9) ** 2 + 0.25 * ss(0, -2, x);
    const troch = ss(-0.15, 0.25, nz) * (1 - ss(top - 0.4, top + 0.1, y)) * ss(-3.3, -2.9, x) * (1 - ss(1.6, 2.0, x)) * ss(0.4, 1.2, z);
    return Math.max(condyles, troch);
  };
  cart.femoral_cartilage = shell(bones.femur, fem, { thick: 0.24, inset: 0.05, smooth: 25, edge: [0.5, 0.95] });
}
{
  const ell = (x, z, cx, cz, rx, rz) => 1 - smoothstep(0.85, 1.0, Math.hypot((x - cx) / rx, (z - cz) / rz));
  const tib = (x, y, z, nx, ny, nz) => smoothstep(0.25, 0.45, ny) * smoothstep(-2.3, -2.0, y) * Math.max(ell(x, z, 2.15, -0.25, 1.4, 2.0), ell(x, z, -2.15, -0.3, 1.45, 1.75));
  cart.tibial_cartilage = shell(bones.tibia, tib, { thick: 0.2, inset: 0.05, smooth: 10 });
}
cart.patellar_cartilage = shell(bones.patella, (...a) => (patBackMask(...a) ? 1 : 0), { thick: 0.3, inset: 0.05, smooth: 25, edge: [0.5, 0.95] });
for (const [k, g] of Object.entries(cart)) log(k, g.positions.length / 3, 'verts');

const boneBVH = bvhOf([bones.femur, bones.tibia, bones.fibula]);
const tibBVH = bvhOf([bones.tibia, cart.tibial_cartilage]);
const _ray = new THREE.Ray();
const topAt = (x, z) => { _ray.origin.set(x, 2.5, z); _ray.direction.set(0, -1, 0); const h = tibBVH.raycastFirst(_ray, THREE.DoubleSide); return h ? h.point.y : -0.6; };
// ---------- Sweeps (ligaments, tendons, menisci) ----------
function sweep({ points, n = 64, m = 24, frame, profile, caps = true, closedCurve = false, curveType = 'centripetal' }) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closedCurve, curveType);
  const len = curve.getLength();
  const P = [], N = [], UV = [], I = [];
  const pts = curve.getSpacedPoints(n);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = pts[i];
    const T = curve.getTangentAt(t).normalize();
    const { side, up } = frame(t, p, T);
    const prof = profile(t); // array of [a,b] closed, m points
    let cx = 0, cy = 0; for (const [a, b] of prof) { cx += a; cy += b; } cx /= prof.length; cy /= prof.length;
    for (let j = 0; j <= m; j++) {
      const jj = j % m;
      const [a, b] = prof[jj];
      const [a0, b0] = prof[(jj + m - 1) % m];
      const [a1, b1] = prof[(jj + 1) % m];
      let na = b1 - b0, nb = -(a1 - a0);
      if (na * (a - cx) + nb * (b - cy) < 0) { na = -na; nb = -nb; }
      const nl = Math.hypot(na, nb) || 1; na /= nl; nb /= nl;
      P.push(p.x + side.x * a + up.x * b, p.y + side.y * a + up.y * b, p.z + side.z * a + up.z * b);
      N.push(side.x * na + up.x * nb, side.y * na + up.y * nb, side.z * na + up.z * nb);
      UV.push(t * len, j / m);
    }
  }
  const row = m + 1;
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const a = i * row + j, b = (i + 1) * row + j, c = (i + 1) * row + j + 1, d = i * row + j + 1;
    I.push(a, b, c, a, c, d);
  }
  if (caps) {
    for (const end of [0, n]) {
      const T = curve.getTangentAt(end / n).normalize().multiplyScalar(end === 0 ? -1 : 1);
      let cx = 0, cy = 0, cz = 0;
      for (let j = 0; j < m; j++) { const k = (end * row + j) * 3; cx += P[k]; cy += P[k + 1]; cz += P[k + 2]; }
      const base = P.length / 3;
      P.push(cx / m, cy / m, cz / m); N.push(T.x, T.y, T.z); UV.push(end === 0 ? 0 : len, 0.5);
      for (let j = 0; j < m; j++) {
        const k = (end * row + j) * 3; P.push(P[k], P[k + 1], P[k + 2]); N.push(T.x, T.y, T.z); UV.push(end === 0 ? 0 : len, j / m);
      }
      for (let j = 0; j < m; j++) I.push(base, base + 1 + j, base + 1 + ((j + 1) % m));
    }
  }
  const positions = new Float32Array(P), normals = new Float32Array(N), indices = new Uint32Array(I);
  // winding: make faces agree with normals
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const nx = normals[a] + normals[b] + normals[c], ny = normals[a + 1] + normals[b + 1] + normals[c + 1], nz = normals[a + 2] + normals[b + 2] + normals[c + 2];
    if (fx * nx + fy * ny + fz * nz < 0) { const tmp = indices[t + 1]; indices[t + 1] = indices[t + 2]; indices[t + 2] = tmp; }
  }
  return { positions, normals, uvs: new Float32Array(UV), indices, length: len, curve };
}

function ellipseProfile(w, h, m, twist = 0, squareness = 0.35) {
  const out = [];
  for (let j = 0; j < m; j++) {
    const a = (j / m) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    // superellipse for a flatter band
    const e = 2 / (2 + squareness * 4);
    const x = Math.sign(c) * Math.abs(c) ** e * w / 2, y = Math.sign(s) * Math.abs(s) ** e * h / 2;
    out.push([x * Math.cos(twist) - y * Math.sin(twist), x * Math.sin(twist) + y * Math.cos(twist)]);
  }
  return out;
}

// Flat underside, domed top, edges thinning to a blade: a band lying on a surface (b = 0 is the underside).
function lensProfile(w, h, m) {
  const out = [];
  for (let j = 0; j < m; j++) {
    const a = (j / m) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    out.push([c * w / 2, s > 0 ? h * Math.pow(s, 0.8) : 0.12 * h * s]);
  }
  return out;
}
const v3 = (a) => new THREE.Vector3(...a);
function hintFrame(hintFn) {
  return (t, p, T) => {
    const h = v3(hintFn(t, p));
    const up = h.sub(T.clone().multiplyScalar(h.dot(T))).normalize();
    const side = new THREE.Vector3().crossVectors(T, up).normalize();
    return { side, up };
  };
}
// Put centre-line points `off` above the nearest surface in `bvh` (outside, along the face normal).
function hug(points, off, bvh = boneBVH) {
  const tri = new THREE.Triangle(), n = new THREE.Vector3(), pos = bvh.geometry.attributes.position, idx = bvh.geometry.index;
  return points.map((p, i) => {
    const r = bvh.closestPointToPoint(v3(p), {}); if (!r) return p;
    const f = r.faceIndex * 3;
    tri.setFromAttributeAndIndices(pos, idx.getX(f), idx.getX(f + 1), idx.getX(f + 2)); tri.getNormal(n);
    const o = typeof off === 'function' ? off(i / (points.length - 1)) : off;
    return r.point.clone().addScaledVector(n, o).toArray();
  });
}
const _tri = new THREE.Triangle();
function normalAt(bvh, p) {
  const r = bvh.closestPointToPoint(p instanceof THREE.Vector3 ? p : v3(p), {}); const n = new THREE.Vector3(0, 1, 0); if (!r) return n;
  const pos = bvh.geometry.attributes.position, idx = bvh.geometry.index, f = r.faceIndex * 3;
  _tri.setFromAttributeAndIndices(pos, idx.getX(f), idx.getX(f + 1), idx.getX(f + 2)); _tri.getNormal(n); return n;
}
const relax = (pts, it = 3) => { for (let k = 0; k < it; k++) pts = pts.map((p, i) => (i === 0 || i === pts.length - 1) ? p : p.map((v, a) => 0.25 * pts[i - 1][a] + 0.5 * v + 0.25 * pts[i + 1][a])); return pts; };

const sweeps = {};
function mergeSweeps(list) {
  let P = [], N = [], U = [], I = [], base = 0;
  list.forEach((g, k) => {
    P.push(...g.positions); N.push(...g.normals);
    for (let i = 0; i < g.uvs.length; i += 2) U.push(g.uvs[i] + k * 0.01, g.uvs[i + 1]);
    for (const ix of g.indices) I.push(ix + base);
    base += g.positions.length / 3;
  });
  return { positions: new Float32Array(P), normals: new Float32Array(N), uvs: new Float32Array(U), indices: new Uint32Array(I), length: list[0].length, curve: list[0].curve };
}

// ACL: back of the inner wall of the lateral femoral condyle -> anterior intercondylar area of the tibia. Two bundles.
{
  const tA = topAt(0.25, 1.05), tP = topAt(-0.05, 0.6);
  const am = sweep({
    points: [[-0.98, 1.95, -1.15], [-0.6, 1.2, -0.5], [-0.1, 0.35, 0.4], [0.25, tA + 0.05, 1.05]],
    n: 44, m: 22, frame: hintFrame(() => [1, 0, 0.3]),
    profile: (t) => ellipseProfile(mix(0.7, 0.9, smoothstep(0.65, 1, t)), 0.55, 22, mix(-0.5, 0.6, t), 0.1),
  });
  const pl = sweep({
    points: [[-1.02, 1.25, -1.55], [-0.75, 0.75, -0.9], [-0.35, 0.15, -0.1], [-0.05, tP + 0.05, 0.6]],
    n: 44, m: 22, frame: hintFrame(() => [1, 0, 0.3]),
    profile: (t) => ellipseProfile(mix(0.62, 0.82, smoothstep(0.65, 1, t)), 0.5, 22, mix(0.4, -0.5, t), 0.1),
  });
  sweeps.acl = mergeSweeps([am, pl]);
}
// PCL: outer wall of the medial femoral condyle (front of the notch) -> back of the tibia below the plateau.
sweeps.pcl = sweep({
  points: [[0.82, 1.95, -0.3], [0.68, 1.3, -1.0], [0.5, 0.3, -1.75], [0.38, -0.8, -2.2], [0.32, -1.55, -2.35]],
  n: 48, m: 28, frame: hintFrame(() => [1, 0, 0]),
  profile: (t) => ellipseProfile(mix(1.7, 1.3, smoothstep(0, 0.5, t)), 0.85, 28, mix(1.2, 0.2, t), 0.2),
});

// Menisci: wedge-shaped C sweeps sitting on the rim of each tibial plateau.
function meniscus({ cx, cz, rx, rz, side, from, to, width, height }) {
  const N = 90, pts = [];
  for (let i = 0; i <= N; i++) {
    const phi = mix(from, to, i / N);
    const x = cx + side * rx * Math.cos(phi), z = cz + rz * Math.sin(phi);
    pts.push([x, 0, z]);
  }
  // rest on the plateau: sample the surface a little inside the rim
  for (const p of pts) { const y = Math.max(topAt(p[0], p[2]), topAt(mix(p[0], cx, 0.2), mix(p[2], cz, 0.2))); p[1] = y + 0.03; }
  let ys = pts.map((p) => p[1]); for (let k = 0; k < 6; k++) ys = ys.map((y, i) => (i === 0 || i === ys.length - 1) ? y : 0.25 * ys[i - 1] + 0.5 * y + 0.25 * ys[i + 1]);
  pts.forEach((p, i) => { p[1] = ys[i]; });
  return sweep({
    points: pts, n: 120, m: 26, curveType: 'catmullrom',
    frame: (t, p, T) => {
      const up = new THREE.Vector3(0, 1, 0); up.sub(T.clone().multiplyScalar(up.dot(T))).normalize();
      const s = new THREE.Vector3().crossVectors(T, up).normalize();
      const radial = new THREE.Vector3((p.x - cx) / (rx * rx), 0, (p.z - cz) / (rz * rz));
      if (s.dot(radial) < 0) s.negate();
      return { side: s, up };
    },
    profile: (t) => {
      const horn = smoothstep(0, 0.14, t) * smoothstep(1, 0.86, t);
      const w = width(t), h = height(t) * mix(0.35, 1, horn);
      const poly = [[0.0, 0.0], [0.03, h * 0.7], [-0.04, h * 0.96], [-0.16, h], [-w * 0.35, h * 0.66], [-w * 0.7, h * 0.28], [-w, 0.035], [-w * 0.97, 0.0], [-w * 0.6, -0.01], [-w * 0.25, -0.01]];
      const c = new THREE.CatmullRomCurve3(poly.map(([a, b]) => new THREE.Vector3(a, b, 0)), true, 'centripetal', 0.5);
      return c.getSpacedPoints(26).slice(0, 26).map((v) => [v.x, v.y]);
    },
  });
}
sweeps.medial_meniscus = meniscus({
  cx: 2.1, cz: -0.25, rx: 1.42, rz: 2.05, side: 1, from: -140 * D, to: 135 * D,
  width: (t) => mix(1.3, 0.8, smoothstep(0.1, 0.85, t)), height: () => 0.55,
});
sweeps.lateral_meniscus = meniscus({
  cx: -2.16, cz: -0.3, rx: 1.42, rz: 1.8, side: -1, from: -155 * D, to: 155 * D,
  width: () => 1.0, height: () => 0.52,
});
const menBVH = bvhOf([bones.femur, bones.tibia, bones.fibula, sweeps.medial_meniscus]);

// MCL (superficial): medial epicondyle -> medial tibia ~5-6 cm below the joint line. Broad flat band over bone and meniscus.
{
  let pts = hug([[4.0, 3.1, -0.95], [4.25, 1.7, -0.75], [4.2, 0.0, -0.5], [3.9, -1.8, -0.2], [3.4, -3.8, 0.2], [2.9, -5.8, 0.5]], 0.16, menBVH);
  pts = hug(relax(pts, 4), 0.16, menBVH); pts = relax(pts, 2);
  sweeps.mcl = sweep({
    points: pts, n: 72, m: 28,
    frame: hintFrame((t, p) => { const n = normalAt(menBVH, p); return [n.x + 0.6, n.y * 0.3, n.z * 0.6]; }),
    profile: (t) => ellipseProfile(mix(1.1, 1.9, smoothstep(0, 0.45, t)) * mix(1, 0.75, smoothstep(0.6, 1, t)), 0.22, 28, 0, 0.7),
  });
}
// LCL: lateral epicondyle -> lateral fibular head. Cord, stands off the joint.
{
  const end = hug([[-4.4, -2.15, -1.95]], 0.12)[0];
  const start = hug([[-4.15, 2.6, -0.4]], 0.15)[0];
  sweeps.lcl = sweep({
    points: [start, [-4.55, 1.2, -0.8], [-4.7, -0.2, -1.2], [-4.62, -1.3, -1.6], end],
    n: 56, m: 20, frame: hintFrame(() => [-1, 0, 0]),
    profile: (t) => ellipseProfile(mix(0.72, 0.6, t), 0.46, 20, 0, 0.1),
  });
}
// Patellar tendon: apex of the patella -> lower part of the tibial tuberosity.
{
  const end = hug([[-1.15, -5.0, 3.3]], 0.12)[0];
  sweeps.patellar_tendon = sweep({
    points: [[-1.25, -0.45, 3.2], [-1.25, -1.8, 3.5], [-1.2, -3.3, 3.6], end],
    n: 56, m: 28, frame: hintFrame(() => [0, 0.05, 1]),
    profile: (t) => ellipseProfile(mix(2.9, 2.1, t) * mix(0.75, 1, smoothstep(0, 0.12, t)) * mix(1, 0.8, smoothstep(0.85, 1, t)), mix(0.55, 0.42, t) * mix(0.5, 1, smoothstep(0, 0.15, t)) * mix(1, 0.6, smoothstep(0.85, 1, t)), 28, 0, 0.18),
  });
}
// ---------- Hip joint ----------
// Femoral head: sphere fitted to the scan (centre and radius in cm). The cup (acetabulum) opens down, out and forward.
const HIP_C = v3([-1.53, 44.04, -0.11]), HIP_R = 2.28;
const CUP = v3([-0.82, -0.46, 0.33]).normalize(); // direction the socket faces
const NECK = v3([-0.76, -0.63, -0.15]).normalize(); // from the head centre toward the neck
const FOVEA = v3([0.8, 0.45, 0.0]).normalize();
const hipBVH = bvhOf([bones.hip_bone]), femBVH = bvhOf([bones.femur]);
{
  const ss = smoothstep;
  cart.femoral_head_cartilage = shell(bones.femur, (x, y, z, nx, ny, nz) => {
    const d = v3([x, y, z]).sub(HIP_C), r = d.length(); d.divideScalar(r);
    const radial = d.x * nx + d.y * ny + d.z * nz;
    return (1 - ss(HIP_R + 0.25, HIP_R + 0.45, r)) * ss(0.7, 0.85, radial) * (1 - ss(-0.05, 0.12, d.dot(NECK))) * (1 - ss(0.955, 0.975, d.dot(FOVEA)));
  }, { thick: 0.16, inset: 0.08, smooth: 12, edge: [0.5, 0.9] });
  // Acetabulum: the horseshoe (lunate) surface where the cup meets the head; the deeper fossa stays bare.
  cart.acetabular_cartilage = shell(bones.hip_bone, (x, y, z, nx, ny, nz) => {
    const d = v3([x, y, z]).sub(HIP_C), r = d.length(); d.divideScalar(r);
    const facing = -(d.x * nx + d.y * ny + d.z * nz);
    return (1 - ss(HIP_R + 0.4, HIP_R + 0.6, r)) * ss(0.55, 0.75, facing);
  }, { thick: 0.16, inset: 0.08, smooth: 8, edge: [0.5, 0.9] });
}
// Labrum: a ring of fibrocartilage on the rim of the socket. Find the rim by casting rays out from the head centre.
{
  const ref = Math.abs(CUP.y) < 0.9 ? v3([0, 1, 0]) : v3([1, 0, 0]);
  const e1 = new THREE.Vector3().crossVectors(CUP, ref).normalize(), e2 = new THREE.Vector3().crossVectors(CUP, e1).normalize();
  const ray = new THREE.Ray(), rim = [];
  const N = 48;
  for (let k = 0; k < N; k++) {
    const phi = (k / N) * Math.PI * 2; const side = e1.clone().multiplyScalar(Math.cos(phi)).addScaledVector(e2, Math.sin(phi));
    let last = 20;
    for (let a = 20; a <= 120; a += 1) { // a: angle from the deepest point of the socket
      const dir = CUP.clone().negate().multiplyScalar(Math.cos(a * D)).addScaledVector(side, Math.sin(a * D)).normalize();
      ray.origin.copy(HIP_C); ray.direction.copy(dir);
      const h = hipBVH.raycastFirst(ray, THREE.DoubleSide);
      if (h && h.distance < HIP_R + 1.3) last = a; else if (a - last > 6) break;
    }
    rim.push({ a: last, side });
  }
  // smooth the rim angle around the ring, then sit the labrum just past it
  const A = rim.map((r) => r.a); for (let it = 0; it < 4; it++) for (let k = 0; k < N; k++) A[k] = 0.25 * A[(k + N - 1) % N] + 0.5 * A[k] + 0.25 * A[(k + 1) % N];
  const pts = rim.map((r, k) => { const a = (A[k] + 3) * D; return HIP_C.clone().addScaledVector(CUP.clone().negate().multiplyScalar(Math.cos(a)).addScaledVector(r.side, Math.sin(a)).normalize(), HIP_R + 0.32).toArray(); });
  log('labrum rim angle', Math.min(...A).toFixed(0), '-', Math.max(...A).toFixed(0), 'deg');
  sweeps.labrum = sweep({ points: pts, n: 160, m: 18, closedCurve: true, caps: false,
    frame: hintFrame((t, p) => v3(p).sub(HIP_C).toArray()),
    profile: () => { const out = []; const m = 18; for (let j = 0; j < m; j++) { const a = (j / m) * Math.PI * 2; const c = Math.cos(a), s = Math.sin(a); out.push([0.36 * c * (s > 0 ? 1 - 0.55 * s : 1), 0.3 * s + 0.05]); } return out; } });
}
// Hip capsule: a sleeve from the socket rim to the base of the neck. The three hip ligaments are thickened
// bands within it, so they are laid along the same sleeve.
const hipFemBVH = bvhOf([bones.hip_bone, bones.femur, cart.femoral_head_cartilage, cart.acetabular_cartilage]);
const capsule = (() => {
  const ax = NECK.clone();
  let f1 = v3([0, 1, 0]).addScaledVector(ax, -ax.y).normalize(); // superior
  let f2 = new THREE.Vector3().crossVectors(ax, f1).normalize(); if (f2.z < 0) f2.negate(); // anterior
  const dirAt = (phi) => f1.clone().multiplyScalar(Math.cos(phi)).addScaledVector(f2, Math.sin(phi));
  const NP = 72, NT = 22, ray = new THREE.Ray();
  const rimG = [], baseS = 4.3, baseR = [];
  for (let k = 0; k < NP; k++) {
    const side = dirAt((k / NP) * Math.PI * 2);
    let rim = 150;
    for (let g = 160; g >= 40; g -= 1) { // angle from the neck axis; 180 = deep in the socket
      const d = ax.clone().multiplyScalar(Math.cos(g * D)).addScaledVector(side, Math.sin(g * D));
      ray.origin.copy(HIP_C); ray.direction.copy(d); const h = hipBVH.raycastFirst(ray, THREE.DoubleSide);
      if (h && h.distance < HIP_R + 1.4) rim = g; else if (rim - g > 5) break;
    }
    rimG.push(rim);
    const o = HIP_C.clone().addScaledVector(ax, baseS);
    ray.origin.copy(o.clone().addScaledVector(side, 6)); ray.direction.copy(side.clone().negate());
    const h = femBVH.raycastFirst(ray, THREE.DoubleSide); baseR.push(h ? 6 - h.distance : 1.8);
  }
  const sm = (A, it) => { for (let i = 0; i < it; i++) for (let k = 0; k < NP; k++) A[k] = 0.25 * A[(k + NP - 1) % NP] + 0.5 * A[k] + 0.25 * A[(k + 1) % NP]; return A; };
  sm(rimG, 6); sm(baseR, 4);
  const pointAt = (phi, t, lift = 0) => { // t: 0 at the rim, 1 at the neck base
    const kf = ((phi / (Math.PI * 2)) * NP + NP) % NP, k0 = Math.floor(kf), k1 = (k0 + 1) % NP, u = kf - k0;
    const g = (rimG[k0] * (1 - u) + rimG[k1] * u - 4) * D, br = baseR[k0] * (1 - u) + baseR[k1] * u;
    const side = dirAt(phi);
    const A = HIP_C.clone().addScaledVector(ax, Math.cos(g) * (HIP_R + 0.75)).addScaledVector(side, Math.sin(g) * (HIP_R + 0.75));
    const sA = A.clone().sub(HIP_C).dot(ax), rA = A.clone().sub(HIP_C).addScaledVector(ax, -sA).length();
    const s = mix(sA, baseS, t), rr = mix(rA, br + 0.22, smoothstep(0, 1, t));
    const p = HIP_C.clone().addScaledVector(ax, s).addScaledVector(side, rr);
    const d = p.clone().sub(HIP_C), r = d.length();
    if (r < HIP_R + 0.62) p.copy(HIP_C).addScaledVector(d.normalize(), HIP_R + 0.62);
    if (lift) p.addScaledVector(side, lift);
    return p;
  };
  const P = [], N = [], U = [], I = [];
  for (let k = 0; k <= NP; k++) for (let j = 0; j <= NT; j++) {
    const phi = (k / NP) * Math.PI * 2, t = j / NT, p = pointAt(phi, t);
    P.push(p.x, p.y, p.z); U.push(t * 4, k / NP);
  }
  const row = NT + 1;
  for (let k = 0; k < NP; k++) for (let j = 0; j < NT; j++) { const a = k * row + j, b = (k + 1) * row + j; I.push(a, b, b + 1, a, b + 1, a + 1); }
  let m = normals({ positions: new Float32Array(P), indices: new Uint32Array(I) });
  m.uvs = new Float32Array(U);
  // outward normals: flip the winding if they point at the neck axis
  let dot = 0; for (let i = 0; i < m.positions.length; i += 3) { const d = v3([m.positions[i], m.positions[i + 1], m.positions[i + 2]]).sub(HIP_C); d.addScaledVector(ax, -d.dot(ax)); dot += d.x * m.normals[i] + d.y * m.normals[i + 1] + d.z * m.normals[i + 2]; }
  if (dot < 0) { for (let t = 0; t < m.indices.length; t += 3) { const q = m.indices[t + 1]; m.indices[t + 1] = m.indices[t + 2]; m.indices[t + 2] = q; } const uv = m.uvs; m = normals(m); m.uvs = uv; }
  return { mesh: m, pointAt };
})();
sweeps.hip_capsule = { ...capsule.mesh, length: 4 };
{
  const band = (phi0, phi1, w0, w1, th, lift = 0.03) => {
    // The ligaments are thickenings of the capsule, not separate straps: the centre line sits on the capsule,
    // the cross-section is a flat-bottomed lens (thin edges), and the ends thin out where they blend into bone.
    const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(capsule.pointAt(mix(phi0, phi1, t) * D, mix(0.0, 0.97, t), lift).toArray()); }
    return sweep({ points: pts, n: 48, m: 24, frame: hintFrame((t, p) => { const d = v3(p).sub(HIP_C); return d.addScaledVector(NECK, -d.dot(NECK)).toArray(); }),
      profile: (t) => { const env = smoothstep(0, 0.14, t) * (1 - smoothstep(0.86, 1, t)); return lensProfile(mix(w0, w1, t) * mix(0.85, 1, env), th * mix(0.3, 1, env), 24); } });
  };
  // inverted Y on the front: both limbs start together at the rim below the AIIS
  sweeps.iliofemoral_ligament = mergeSweeps([band(55, 25, 1.3, 1.8, 0.4), band(70, 112, 1.2, 1.5, 0.36)]);
  sweeps.pubofemoral_ligament = band(150, 125, 1.3, 1.1, 0.28);
  sweeps.ischiofemoral_ligament = band(235, 300, 1.6, 1.1, 0.3);
}
// Ligamentum teres (ligament of the head of the femur): a flat band inside the joint from the pit on the femoral head (fovea)
// across the bare fossa of the socket to the acetabular notch at the bottom of the socket.
{
  const down = v3([0, -1, 0]); down.addScaledVector(CUP, -down.dot(CUP)).normalize();
  const notch = CUP.clone().negate().multiplyScalar(Math.cos(62 * D)).addScaledVector(down, Math.sin(62 * D)).normalize();
  const pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16;
    const d = FOVEA.clone().lerp(notch, t).normalize(); pts.push(HIP_C.clone().addScaledVector(d, HIP_R + 0.1 + 0.25 * smoothstep(0.3, 1, t)).toArray()); }
  sweeps.ligamentum_teres = sweep({ points: pts, n: 40, m: 20, frame: hintFrame((t, p) => v3(p).sub(HIP_C).toArray()),
    profile: (t) => lensProfile(mix(0.45, 0.8, t), 0.16, 20) });
  log('ligamentum teres from', pts[0].map((v) => v.toFixed(1)).join(','), 'to', pts[16].map((v) => v.toFixed(1)).join(','));
}

// ---------- Ankle and foot joints ----------
// Cartilage wherever two foot bones meet (the scan's joint gaps are about 0.1 cm).
function contactShell(bone, others, { dist = 0.45, thick = 0.12, inset = 0.06, smooth = 6, region } = {}) {
  const bvh = bvhOf(others); const tmp = v3([0, 0, 0]);
  return shell(bone, (x, y, z) => {
    if (region && !region(x, y, z)) return 0;
    const r = bvh.closestPointToPoint(tmp.set(x, y, z), {}); return r ? 1 - smoothstep(dist * 0.6, dist, r.distance) : 0;
  }, { thick, inset, smooth, edge: [0.5, 0.9] });
}
cart.ankle_cartilage = merge([
  contactShell(bones.talus, [bones.tibia, bones.fibula], { dist: 0.55, thick: 0.14 }),
  contactShell(bones.tibia, [bones.talus], { dist: 0.55, thick: 0.14, region: (x, y) => y < -34 }),
  contactShell(bones.fibula, [bones.talus], { dist: 0.6, thick: 0.1, region: (x, y) => y < -34 }),
].map((g) => ({ positions: g.positions, indices: g.indices })));
normals(cart.ankle_cartilage);
cart.foot_cartilage = merge([
  contactShell(bones.talus, [bones.calcaneus, bones.navicular]), contactShell(bones.calcaneus, [bones.talus, bones.cuboid]),
  contactShell(bones.navicular, [bones.talus, bones.cuneiforms]), contactShell(bones.cuboid, [bones.calcaneus, bones.metatarsal_4, bones.metatarsal_5]),
  contactShell(bones.cuneiforms, [bones.navicular, bones.metatarsal_1, bones.metatarsal_2, bones.metatarsal_3]),
].map((g) => ({ positions: g.positions, indices: g.indices })));
normals(cart.foot_cartilage);
for (const k of ['femoral_head_cartilage', 'acetabular_cartilage', 'ankle_cartilage', 'foot_cartilage']) log(k, cart[k].positions.length / 3, 'verts');

// Ankle ligaments: short flat bands between the malleoli and the talus / heel bone.
const ankBVH = bvhOf([bones.tibia, bones.fibula, bones.talus, bones.calcaneus, bones.navicular, cart.ankle_cartilage]);
{
  const S = (p) => [p[0], p[1] + TIB_SHIFT[1], p[2]];
  const lig = (pts, w, th, hint, { off = 0.18, n = 36 } = {}) => {
    let P = hug(pts.map(S), off, ankBVH); P = hug(relax(P, 2), off, ankBVH);
    return sweep({ points: P, n, m: 20, frame: hintFrame((t, p) => (hint ? hint : normalAt(ankBVH, p).toArray())), profile: (t) => ellipseProfile(typeof w === 'function' ? w(t) : w, th, 20, 0, 0.6) });
  };
  sweeps.atfl = lig([[-2.45, -37.9, -0.4], [-2.2, -38.1, 0.5], [-1.75, -38.25, 1.35]], 0.85, 0.22);
  sweeps.cfl = lig([[-2.6, -39.4, -2.4], [-2.75, -40.3, -2.2], [-2.55, -41.2, -1.9]], 0.6, 0.28);
  sweeps.ptfl = lig([[-2.5, -38.6, -2.9], [-1.4, -38.9, -3.25], [0.1, -39.0, -3.2]], 0.7, 0.3);
  sweeps.aitfl = lig([[-1.95, -35.5, 0.75], [-2.35, -36.2, 0.15], [-2.55, -36.9, -0.45]], 0.9, 0.22);
  sweeps.deltoid_ligament = mergeSweeps([
    lig([[1.5, -37.0, 1.1], [1.9, -38.0, 1.9], [1.6, -39.1, 2.6]], (t) => mix(0.9, 0.7, t), 0.24), // to the navicular
    lig([[1.65, -37.5, 0.4], [2.0, -38.6, 0.0], [1.9, -39.5, -0.4]], (t) => mix(1.0, 1.2, t), 0.28), // to the heel bone (sustentaculum)
    lig([[1.4, -37.4, -0.6], [1.6, -38.4, -1.3], [1.2, -39.1, -2.2]], (t) => mix(0.9, 0.8, t), 0.3), // to the back of the talus
  ]);
}
// ---------- Muscles (BodyParts3D) ----------
// [id, FJ ids, fibre axis]: 'y' = follow the centre-line slab by slab (long vertical muscles), 'pca' = main axis.
const MUSCLES = [
  // thigh
  ['rectus_femoris', ['FJ1433'], 'y'], ['vastus_lateralis', ['FJ1442'], 'y'], ['vastus_medialis', ['FJ1443'], 'y'], ['vastus_intermedius', ['FJ1441'], 'y'],
  ['sartorius', ['FJ1434'], 'y'], ['gracilis', ['FJ1421'], 'y'], ['semitendinosus', ['FJ1436'], 'y'], ['semimembranosus', ['FJ1435'], 'y'],
  ['biceps_femoris', ['FJ1395', 'FJ1444'], 'y'], ['adductor_magnus', ['FJ1403', 'FJ1404'], 'y'], ['adductor_longus', ['FJ1402'], 'y'], ['adductor_brevis', ['FJ1401'], 'y'],
  ['pectineus', ['FJ1427'], 'pca'],
  // hip
  ['gluteus_maximus', ['FJ1418'], 'pca'], ['gluteus_medius', ['FJ1419'], 'y'], ['gluteus_minimus', ['FJ1420'], 'y'], ['tensor_fasciae_latae', ['FJ1438'], 'y'],
  ['iliopsoas', ['FJ1431', 'FJ1422'], 'y'], ['piriformis', ['FJ1428'], 'pca'], ['obturator_internus', ['FJ1426'], 'pca'], ['obturator_externus', ['FJ1425'], 'pca'],
  ['gemelli', ['FJ1417', 'FJ1416'], 'pca'], ['quadratus_femoris', ['FJ1432'], 'pca'],
  // calf and shin
  ['gastrocnemius_medial', ['FJ1397'], 'y'], ['gastrocnemius_lateral', ['FJ1394'], 'y'], ['plantaris', ['FJ1429'], 'y'], ['soleus', ['FJ1437'], 'y'],
  ['popliteus', ['FJ1430'], 'pop'], ['tibialis_anterior', ['FJ1439'], 'y'], ['tibialis_posterior', ['FJ1440'], 'y'],
  ['fibularis_longus', ['FJ1410'], 'y'], ['fibularis_brevis', ['FJ1409'], 'y'], ['fibularis_tertius', ['FJ1411'], 'y'],
  ['extensor_digitorum_longus', ['FJ1406'], 'y'], ['extensor_hallucis_longus', ['FJ1408'], 'y'],
  ['flexor_digitorum_longus', ['FJ1414'], 'y'], ['flexor_hallucis_longus', ['FJ1415'], 'y'],
  // foot
  ['extensor_hallucis_brevis', ['FJ1407'], 'pca'], ['flexor_digitorum_brevis', ['FJ1413'], 'pca'], ['abductor_hallucis', ['FJ1400'], 'pca'], ['abductor_digiti_minimi', ['FJ1390'], 'pca'],
  ['foot_deep_muscles', ['FJ1383', 'FJ1384', 'FJ1385', 'FJ1386', 'FJ1387', 'FJ1388', 'FJ1389', 'FJ1391', 'FJ1393', 'FJ1396', 'FJ1398', 'FJ1399', 'FJ1412', 'FJ1445'], 'pca'],
];
const muscles = {};
const fibreKind = {};
for (const [id, fjs, kind] of MUSCLES) {
  let g = softShift(src(...fjs));
  g = crop(g, Y0, Y1);
  if (g.positions.length / 3 < 2500) g = loopSubdivide(g);
  muscles[id] = normals(g); fibreKind[id] = kind;
}
// fibre direction: follow the muscle's centre-line (1 cm slabs along Y), or its main axis for oblique ones
function fibreFrame(g, id) {
  const P = g.positions, n = P.length / 3;
  if (fibreKind[id] === 'pop' || fibreKind[id] === 'pca') {
    const { c, axis: pa } = principalAxis(P);
    const axis = fibreKind[id] === 'pop' ? new THREE.Vector3(1, -0.85, -0.25).normalize().toArray() : pa;
    const ref = Math.abs(axis[2]) > 0.8 ? [0, 1, 0] : [0, 0, 1];
    return (x, y, z) => ({ c, axis, ref });
  }
  const sl = new Map();
  for (let i = 0; i < n; i++) { const k = Math.floor(P[i * 3 + 1]); const s = sl.get(k) || [0, 0, 0, 0]; s[0] += P[i * 3]; s[1] += P[i * 3 + 1]; s[2] += P[i * 3 + 2]; s[3]++; sl.set(k, s); }
  const cen = (k) => { const s = sl.get(k); return s ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : null; };
  return (x, y, z) => {
    const k = Math.floor(y); const c = cen(k) || [x, y, z];
    const a = cen(k + 1) || c, b = cen(k - 1) || c;
    let ax = [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; const l = Math.hypot(...ax);
    ax = l > 0.3 ? ax.map((v) => v / l) : [0, 1, 0];
    return { c, axis: ax, ref: [0, 0, 1], u: y };
  };
}
function withFibres(g, id, thickMax = 2.5) {
  const bvh = bvhOf([g]);
  const th = smoothScalar(g, thickness(g, bvh, thickMax), 6);
  const withUV = cylinderUV(g, fibreFrame(g, id));
  const n = withUV.positions.length / 3, tint = new Uint8Array(n);
  const inv = new Map(); for (const [a, b] of withUV.dupOf) inv.set(b, a);
  for (let i = 0; i < n; i++) {
    const src_ = i < th.length ? i : inv.get(i);
    tint[i] = Math.round((1 - smoothstep(0.38, 0.85, th[src_])) * 255);
  }
  withUV.tint = tint;
  return withUV;
}
for (const [id, g] of Object.entries(muscles)) {
  muscles[id] = withFibres(g, id, ['foot_deep_muscles', 'extensor_hallucis_brevis', 'flexor_digitorum_brevis', 'abductor_hallucis', 'abductor_digiti_minimi', 'gemelli', 'piriformis'].includes(id) ? 1.2 : 2.5);
  log(id, muscles[id].positions.length / 3, 'verts');
}
const muscleBVH = bvhOf(Object.values(muscles));
// Plantar fascia: a broad band under the sole from the heel bone to the bases of the toes, just under the short toe flexor.
{
  const soleBVH = bvhOf([bones.calcaneus, muscles.flexor_digitorum_brevis, muscles.abductor_hallucis, muscles.abductor_digiti_minimi]);
  let pts = [[0.9, -44.5, -3.6], [0.5, -44.7, -1.2], [-0.3, -44.7, 2], [-1.2, -44.6, 5], [-2.2, -44.5, 8], [-2.9, -44.4, 10.3]].map((p) => [p[0], p[1] + TIB_SHIFT[1], p[2]]);
  pts = hug(pts, 0.1, soleBVH); pts = hug(relax(pts, 2), 0.1, soleBVH);
  sweeps.plantar_fascia = sweep({ points: pts, n: 60, m: 24, frame: hintFrame(() => [0, -1, 0]),
    profile: (t) => ellipseProfile(mix(2.2, 6.2, smoothstep(0.05, 0.85, t)) * mix(0.75, 1, smoothstep(0, 0.1, t)), mix(0.3, 0.16, t), 24, 0, 0.7) });
}


// Quadriceps tendon: base of the patella -> up the front of the thigh, where the quadriceps muscles join it.
{
  sweeps.quad_tendon = sweep({
    points: [[-1.0, 2.4, 3.6], [-1.0, 3.5, 3.85], [-1.05, 4.7, 3.95], [-1.2, 6.0, 4.05], [-1.4, 7.4, 4.1]], n: 56, m: 28, frame: hintFrame(() => [0, 0, 1]),
    profile: (t) => ellipseProfile(mix(4.2, 2.4, smoothstep(0, 0.9, t)) * mix(0.8, 1, smoothstep(0, 0.1, t)), mix(0.55, 0.45, t) * mix(0.6, 1, smoothstep(0, 0.12, t)) * mix(1, 0.45, smoothstep(0.8, 1, t)), 28, 0, 0.18),
  });
}
// IT band: the scanned iliotibial tract, from the hip (where TFL and gluteus maximus join it) down to Gerdy's tubercle.
const soft = {};
{
  let g = crop(softShift(src('FJ1423')), Y0, Y1); g = normals(loopSubdivide(g));
  soft.it_band = cylinderUV(g, fibreFrame(g, 'it_band'));
  soft.it_band.tint = new Uint8Array(soft.it_band.positions.length / 3).fill(255);
}
// Slab-by-slab centre line and size of a scanned tube-like part (for sweeps that follow the data).
function slabs(g, step = 1, axis = 1) {
  const P = g.positions, sl = new Map();
  for (let i = 0; i < P.length; i += 3) {
    const k = Math.round(P[i + axis] / step); const s = sl.get(k) || { c: [0, 0, 0], n: 0, mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] };
    for (let a = 0; a < 3; a++) { s.c[a] += P[i + a]; s.mn[a] = Math.min(s.mn[a], P[i + a]); s.mx[a] = Math.max(s.mx[a], P[i + a]); } s.n++; sl.set(k, s);
  }
  return [...sl.entries()].sort((a, b) => b[0] - a[0]).map(([, s]) => ({ c: s.c.map((v) => v / s.n), size: s.mx.map((v, a) => v - s.mn[a]) }));
}
const lerpArr = (arr, t) => { const f = t * (arr.length - 1), i = Math.min(Math.floor(f), arr.length - 2), u = f - i; return arr[i] * (1 - u) + arr[i + 1] * u; };
// Achilles tendon: swept along the scanned calcaneal tendon, from the calf muscles to the back of the heel bone.
{
  const s = slabs(softShift(src('FJ1405')), 1.5).filter((r, i, a) => i > 0 && i < a.length - 1);
  const pts = relax(s.map((r) => r.c), 2);
  const W = s.map((r) => Math.min(r.size[0], 3.4) * 0.92), H = s.map((r) => Math.min(r.size[2], 1.6) * 0.85);
  sweeps.achilles_tendon = sweep({
    points: pts, n: 80, m: 28, frame: hintFrame(() => [0, 0, -1]),
    profile: (t) => ellipseProfile(lerpArr(W, t), Math.max(0.55, lerpArr(H, t)), 28, 0, 0.35),
  });
}
for (const [id, s] of Object.entries(sweeps)) log(id, s.positions.length / 3, 'verts', s.length.toFixed(2), 'cm');

// ---------- Blood vessels (BodyParts3D), grouped the way they are taught ----------
const VESSELS = [
  ['femoral_artery', ['FJ3567', 'FJ2143', 'FJ2158', 'FJ2057', 'FJ2127', 'FJ2203', 'FJ2195', 'FJ2137']],
  ['popliteal_artery', ['FJ2170', 'FJ2150', 'FJ2152', 'FJ2162', 'FJ2166', 'FJ2167', 'FJ2131']],
  ['leg_arteries', ['FJ2130', 'FJ2172', 'FJ2197']],
  ['foot_arteries', ['FJ2055', 'FJ2058', 'FJ2133', 'FJ2136', 'FJ2141', 'FJ2159', 'FJ2163', 'FJ2164', 'FJ2169', 'FJ2179', 'FJ2196', 'FJ2204', 'FJ2205', 'FJ2206']],
  ['femoral_vein', ['FJ3568', 'FJ2144', 'FJ2135', 'FJ2201', 'FJ2202', 'FJ2192']],
  ['great_saphenous_vein', ['FJ2145']],
  ['small_saphenous_vein', ['FJ2176']],
  ['popliteal_vein', ['FJ2171', 'FJ2151', 'FJ2153', 'FJ2181', 'FJ2182', 'FJ2132']],
  ['leg_veins', ['FJ2193', 'FJ2173', 'FJ2200', 'FJ2194']],
  ['foot_veins', ['FJ2061', 'FJ2062', 'FJ2129', 'FJ2138', 'FJ2160', 'FJ2165', 'FJ2174', 'FJ2175', 'FJ2198', 'FJ2207']],
];
const vessels = {};
for (const [id, fjs] of VESSELS) {
  let g = crop(softShift(merge(fjs.map((f) => { let p = srcOne(f); if (p.positions.length / 3 < 300) p = loopSubdivide(p); return p; }))), Y0, Y1);
  vessels[id] = normals(g);
  log(id, g.positions.length / 3, 'verts');
}

// ---------- Nerves (modelled: BodyParts3D has no leg nerves) ----------
// Paths are placed between the scanned muscles and alongside the scanned vessels, then kept clear of bone.
const allBoneBVH = bvhOf(Object.values(bones));
const shiftPt = (p) => [p[0], p[1] + TIB_SHIFT[1] * smoothstep(1.0, -2.0, p[1]), p[2]];
function clearOf(points, bvh, min) {
  return points.map((p) => {
    const v = v3(p), r = bvh.closestPointToPoint(v, {}); if (!r) return p;
    const n = normalAt(bvh, r.point), d = v.clone().sub(r.point), inside = d.dot(n) < 0;
    if (inside || r.distance < min) return r.point.clone().addScaledVector(n, min).toArray();
    return p;
  });
}
function along(fj, ys, off = [0, 0, 0]) {
  const P = srcOne(fj).positions;
  return ys.map((y) => {
    for (let w = 0.7; ; w *= 1.6) { let c = [0, 0, 0], k = 0; for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i + 1] - y) < w) { c[0] += P[i]; c[2] += P[i + 2]; k++; } if (k >= 3) return [c[0] / k + off[0], y + off[1], c[2] / k + off[2]]; }
  });
}
function nerve(points, w0, w1, { flat = 1, n = 0, m = 14, clear = 0.35 } = {}) {
  let pts = clearOf(relax(points.map(shiftPt), 2), allBoneBVH, clear + w0 / 2);
  const len = pts.reduce((a, p, i) => i ? a + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]) : 0, 0);
  return sweep({ points: pts, n: n || Math.max(16, Math.round(len * 2.2)), m, frame: hintFrame((t, p) => [0, 0, 1]), caps: true,
    profile: (t) => ellipseProfile(mix(w0, w1, t) * flat, mix(w0, w1, t), m, 0, 0.1) });
}
const nerves = {};
{
  const split = [-1.3, 7, -2.2];
  nerves.sciatic_nerve = nerve([[0.8, 47.5, -4.6], [-0.2, 44.5, -5.0], [-1.4, 41.5, -4.6], [-1.8, 38, -3.6], [-1.8, 35, -2.7], [-1.0, 30, -1.9], [-1.0, 25, -1.6], [-1.2, 20, -1.5], [-1.0, 15, -1.4], [-1.0, 10, -1.6], split], 1.0, 0.85, { flat: 1.5 });
  const plantarStart = [1.9, -40.6, -1.2];
  nerves.tibial_nerve = mergeSweeps([
    nerve([split, [-0.9, 3, -2.8], [-1.0, 0, -2.9], [-1.4, -3, -2.7], [-1.3, -8, -2.9], [-0.1, -12, -2.7], [0.8, -18, -2.1], [1.0, -24, -2.2], [1.6, -30, -3.0], [1.6, -35, -2.8], [1.7, -38, -2.5], plantarStart], 0.62, 0.42),
    nerve([plantarStart, [0.9, -41.6, 0.6], [0.3, -42.3, 4.2], [-0.3, -42.8, 8.2]], 0.32, 0.2),
    nerve([plantarStart, [0.2, -42.0, 0.4], [-2.4, -42.6, 2.0], [-4.3, -43.1, 5.4]], 0.28, 0.18),
  ]);
  const neck = [-3.9, -7.0, 0.0];
  nerves.common_fibular_nerve = mergeSweeps([
    nerve([split, [-2.4, 4, -2.6], [-3.6, 0, -2.9], [-4.4, -3, -2.5], [-4.9, -4.6, -1.8], [-4.4, -6.0, -0.9], neck], 0.5, 0.42),
    // deep fibular nerve: with the anterior tibial artery to the top of the foot
    nerve([neck, [-3.3, -8.5, 0.3], [-2.4, -12, 1.2], [-2.5, -18, 1.5], [-2.1, -24, 1.2], [-1.5, -30, 1.3], [-0.5, -35, 1.6], [-0.7, -37.5, 2.9], [-1.2, -39.2, 5.6], [-1.6, -40.5, 7.8]], 0.28, 0.16),
    // superficial fibular nerve: down the outer leg, then over the front of the ankle
    nerve([neck, [-4.1, -9, -0.2], [-4.0, -12, -0.4], [-3.6, -18, -0.6], [-3.3, -24, -0.4], [-3.0, -30, 0.4], [-2.4, -35, 2.2], [-2.8, -38.5, 5.0], [-4.0, -40.4, 8.0]], 0.28, 0.16),
  ]);
  const fa = along('FJ2143', [40, 35, 30, 25, 20, 15, 12], [-0.5, 0, 0.3]);
  const gsv = along('FJ2145', [-2, -8, -15, -22, -29, -35, -38], [-0.35, 0, -0.25]);
  nerves.femoral_nerve = mergeSweeps([
    nerve([[0.6, 54, 1.8], [0.3, 50, 3.2], [0.9, 46, 4.4], [0.9, 42.5, 5.3], [0.4, 39.5, 5.8], [-0.6, 37.5, 6.0]], 0.75, 0.55, { flat: 1.4 }),
    // saphenous nerve: through the adductor canal with the femoral artery, then beside the great saphenous vein
    nerve([[0.9, 42.5, 5.3], ...fa, [3.2, 6, 0.8], [3.9, 1, -0.6], ...gsv], 0.22, 0.15, { clear: 0.2 }),
  ]);
}
for (const [id, s] of Object.entries(nerves)) log(id, s.positions.length / 3, 'verts', s.length.toFixed(1), 'cm');

// ---------- Skin: the scanned body surface, right leg and right half of the hip ----------
function cropBy({ positions: P, indices: I }, keep) {
  const out = [];
  for (let t = 0; t < I.length; t += 3) {
    let cx = 0, cy = 0, cz = 0; for (let k = 0; k < 3; k++) { cx += P[I[t + k] * 3] / 3; cy += P[I[t + k] * 3 + 1] / 3; cz += P[I[t + k] * 3 + 2] / 3; }
    if (keep(cx, cy, cz)) out.push(I[t], I[t + 1], I[t + 2]);
  }
  return weld(P, out);
}
// keep the largest connected piece: drops the hanging arm and hand that the crop cuts free
function largestPiece({ positions, indices: I }) {
  const n = positions.length / 3, par = new Int32Array(n).map((_, i) => i);
  const f = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (let t = 0; t < I.length; t += 3) { const a = f(I[t]), b = f(I[t + 1]), c = f(I[t + 2]); par[b] = a; par[f(c)] = a; }
  const cnt = new Map(); for (let i = 0; i < n; i++) { const r = f(i); cnt.set(r, (cnt.get(r) || 0) + 1); }
  const best = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const out = []; for (let t = 0; t < I.length; t += 3) if (f(I[t]) === best) out.push(I[t], I[t + 1], I[t + 2]);
  return weld(positions, out);
}
let skin = largestPiece(cropBy(srcOne('FJ2810'), (x, y, z) => x < 6.6 && y > Y0 && y < Y1));
skin = softShift(skin);
skin = loopSubdivide(loopSubdivide(skin));
skin = normals(skin);
{ // make sure the skin faces outward (compare normals with the direction from each slab's centre)
  const P = skin.positions, N = skin.normals, sl = slabs(skin, 2); let dot = 0;
  const cy = new Map(); for (const r of sl) cy.set(Math.round(r.c[1] / 2), r.c);
  for (let i = 0; i < P.length; i += 3) { const c = cy.get(Math.round(P[i + 1] / 2)); if (c) dot += (P[i] - c[0]) * N[i] + (P[i + 2] - c[2]) * N[i + 2]; }
  log('skin outward check', dot.toFixed(0));
  if (dot < 0) { const I = skin.indices; for (let t = 0; t < I.length; t += 3) { const k = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = k; } skin = normals(skin); }
}
log('skin', skin.positions.length / 3, 'verts');

// ---------- Mesh list ----------
const meshes = [];
for (const [id, g] of Object.entries(bones)) meshes.push({ id, ...g });
for (const [id, g] of Object.entries(cart)) meshes.push({ id, ...g });
for (const [id, g] of Object.entries(muscles)) meshes.push({ id, ...g });
for (const [id, g] of Object.entries(soft)) meshes.push({ id, ...g });
for (const [id, g] of Object.entries(vessels)) meshes.push({ id, ...g });
for (const [id, s] of Object.entries({ ...sweeps, ...nerves })) meshes.push({ id, positions: s.positions, normals: s.normals, uvs: s.uvs, indices: s.indices });
meshes.push({ id: 'skin', ...skin });

// ---------- Baked ambient occlusion (ray traced) ----------
// Each structure is shaded only by its own layer and deeper ones, so peeled-away layers leave no dark stains.
const layerOf = (id) => STRUCTURES[id].layer;
const occCache = new Map();
for (const m of meshes) {
  const L = layerOf(m.id);
  if (m.id === 'skin') { m.ao = new Uint8Array(m.positions.length / 3).fill(255); continue; }
  if (!occCache.has(L)) occCache.set(L, bvhOf(meshes.filter((o) => o.id !== 'skin' && layerOf(o.id) >= L)));
  m.ao = bakeAO(m, occCache.get(L), { rays: 20, dist: 1.4, strength: 0.8 });
}
log('ao done');
// ---------- Write quantized binary ----------
// Format v2 (smaller after gzip): positions delta-coded, UVs quantised to 16 bits, indices zigzag delta-coded,
// and each multi-byte stream stored byte-planar (all low bytes, then all high bytes). See loadAnatomy() in src/main.js.
const chunks = []; let offset = 0;
const manifest = { version: 2, units: 'cm', meshes: [] };
const planar = (arr) => { const w = arr.BYTES_PER_ELEMENT, src = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength), n = arr.length, o = new Uint8Array(src.length); for (let i = 0; i < n; i++) for (let b = 0; b < w; b++) o[b * n + i] = src[i * w + b]; return o; };
const push = (arr) => {
  const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  const pad = (4 - (buf.length % 4)) % 4;
  chunks.push(buf); if (pad) chunks.push(Buffer.alloc(pad));
  const o = offset; offset += buf.length + pad; return o;
};
for (const m of meshes) {
  const P = m.positions, n = P.length / 3;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], P[i * 3 + a]); max[a] = Math.max(max[a], P[i * 3 + a]); }
  const q = new Uint16Array(P.length);
  for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) q[i * 3 + a] = Math.round(((P[i * 3 + a] - min[a]) / ((max[a] - min[a]) || 1)) * 65535);
  const qd = new Uint16Array(q.length); for (let i = 0; i < q.length; i++) qd[i] = q[i] - (i >= 3 ? q[i - 3] : 0);
  const qn = new Int8Array(P.length);
  for (let i = 0; i < P.length; i++) qn[i] = Math.round(clamp(m.normals[i], -1, 1) * 127);
  const entry = { id: m.id, count: n, min, max };
  entry.pos = push(planar(qd)); entry.nrm = push(qn);
  if (m.uvs) {
    const U = m.uvs, umin = [Infinity, Infinity], umax = [-Infinity, -Infinity];
    for (let i = 0; i < U.length; i++) { umin[i % 2] = Math.min(umin[i % 2], U[i]); umax[i % 2] = Math.max(umax[i % 2], U[i]); }
    const uq = new Uint16Array(U.length); for (let i = 0; i < U.length; i++) uq[i] = Math.round(((U[i] - umin[i % 2]) / ((umax[i % 2] - umin[i % 2]) || 1)) * 65535);
    entry.uv = push(planar(uq)); entry.uvMin = umin; entry.uvMax = umax;
  }
  entry.ao = push(m.ao);
  if (m.tint) entry.tint = push(m.tint);
  const I = m.indices, zz = new Uint32Array(I.length); let prev = 0;
  for (let k = 0; k < I.length; k++) { const d = I[k] - prev; prev = I[k]; zz[k] = ((d << 1) ^ (d >> 31)) >>> 0; }
  entry.idx = push(planar(zz)); entry.idx16 = n < 65536; entry.icount = I.length;
  manifest.meshes.push(entry);
}
const raw = Buffer.concat(chunks);
fs.writeFileSync(path.join(OUT, 'anatomy.dat'), zlib.gzipSync(raw, { level: 9 })); // gzip; the app inflates it
if (fs.existsSync(path.join(OUT, 'anatomy.bin'))) fs.unlinkSync(path.join(OUT, 'anatomy.bin'));
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest));
console.log(`wrote ${(offset / 1e6).toFixed(2)} MB raw, ${(fs.statSync(path.join(OUT, 'anatomy.dat')).size / 1e6).toFixed(2)} MB gzip`);

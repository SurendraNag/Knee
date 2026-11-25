// Builds the right-knee anatomy into public/anatomy/{anatomy.bin,manifest.json}.
// Bones and muscles: BodyParts3D 4.0 scan meshes (data/bodyparts3d, CC BY 4.0), cropped and smoothed.
// Cartilage: shells generated on the scanned joint surfaces. Ligaments, menisci, tendons, IT band: swept
// shapes fitted to the scanned bones (BodyParts3D has no geometry for them).
// Run: node scripts/build-anatomy.mjs
// Coordinates: 1 unit = 1 cm. Y up, +Z anterior, +X medial, -X lateral (right knee). Joint line ~ y=0.
import * as THREE from 'three';
import fs from 'node:fs';
import path from 'node:path';
import { clamp, mix, smoothstep, surfaceNets } from './sdf.mjs';
import { readGlb, toApp } from './bp3d.mjs';
import { STRUCTURES } from '../src/structures.js';
import { crop, translate, loopSubdivide, normals, shell, bvhOf, bakeAO, thickness, smoothScalar, cylinderUV, skinAround, merge } from './meshops.mjs';

const OUT = path.resolve('public/anatomy');
fs.mkdirSync(OUT, { recursive: true });
const D = Math.PI / 180;
const Y0 = -12.5, Y1 = 14; // kept window (ends fade out in the app)
const T0 = Date.now(); const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);

// ---------- BodyParts3D ----------
const SRC = ['knee', 'hip-pelvis', 'supplement-knee-muscle', 'supplement-ankle-foot-muscle'].flatMap((f) => readGlb(`data/bodyparts3d/${f}.glb`));
const src = (...fjs) => merge(fjs.map((fj) => { const m = SRC.find((x) => x.fj === fj); if (!m) throw new Error('missing ' + fj); return { positions: toApp(m.positions), indices: m.indices }; }));
// The scan has the femur resting on the tibia with no room for cartilage and menisci: open the joint 3 mm.
const TIB_SHIFT = [0, -0.3, 0];
const PAT_SHIFT = [0, 0, 0]; // the scan's patella height is normal (tendon/patella length ~1.2)

const bones = {};
for (const [id, fj, shift, levels] of [['femur', 'FJ3365', null, 2], ['tibia', 'FJ3387', TIB_SHIFT, 2], ['fibula', 'FJ3366', TIB_SHIFT, 2], ['patella', 'FJ3381', PAT_SHIFT, 2]]) {
  let g = src(fj); if (shift) translate(g, shift);
  g = crop(g, Y0, Y1);
  for (let i = 0; i < levels; i++) g = loopSubdivide(g);
  bones[id] = normals(g);
  log(id, g.positions.length / 3, 'verts');
}

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
    for (let i = 0; i < g.uvs.length; i += 2) U.push(g.uvs[i] + k * 1e-4, g.uvs[i + 1]);
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
    profile: (t) => ellipseProfile(mix(2.9, 2.1, t) * mix(0.75, 1, smoothstep(0, 0.12, t)) * mix(1, 0.8, smoothstep(0.85, 1, t)), mix(0.55, 0.42, t) * mix(0.6, 1, smoothstep(0, 0.12, t)), 28, 0, 0.45),
  });
}
// ---------- Muscles (BodyParts3D) ----------
const MUSCLES = [
  ['rectus_femoris', ['FJ1433']], ['vastus_lateralis', ['FJ1442']], ['vastus_medialis', ['FJ1443']], ['vastus_intermedius', ['FJ1441']],
  ['sartorius', ['FJ1434']], ['gracilis', ['FJ1421']], ['semitendinosus', ['FJ1436']], ['semimembranosus', ['FJ1435']],
  ['biceps_femoris', ['FJ1395', 'FJ1444']], ['adductor_magnus', ['FJ1403']],
  ['gastrocnemius_medial', ['FJ1397']], ['gastrocnemius_lateral', ['FJ1394']], ['plantaris', ['FJ1429']], ['soleus', ['FJ1437']],
  ['popliteus', ['FJ1430']], ['tibialis_anterior', ['FJ1439']], ['fibularis_longus', ['FJ1410']],
];
const muscles = {};
for (const [id, fjs] of MUSCLES) {
  let g = src(...fjs);
  if (['gastrocnemius_medial', 'gastrocnemius_lateral', 'plantaris', 'soleus', 'popliteus', 'tibialis_anterior', 'fibularis_longus'].includes(id)) translate(g, TIB_SHIFT.map((v) => v * 0.5));
  g = crop(g, Y0, Y1);
  muscles[id] = normals(g);
}
// fibre direction: follow the muscle's centre-line (1 cm slabs along Y), or its main axis for oblique ones (popliteus)
function fibreFrame(g, id) {
  const P = g.positions, n = P.length / 3;
  if (id === 'popliteus') {
    const c = [0, 0, 0]; for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) c[k] += P[i * 3 + k] / n;
    const axis = new THREE.Vector3(1, -0.85, -0.25).normalize().toArray(); const ref = [0, 0, 1];
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
for (const [id, g] of Object.entries(muscles)) {
  const bvh = bvhOf([g]);
  const th = smoothScalar(g, thickness(g, bvh, 2.5), 6);
  const withUV = cylinderUV(g, fibreFrame(g, id));
  const n = withUV.positions.length / 3, tint = new Uint8Array(n);
  const inv = new Map(); for (const [a, b] of withUV.dupOf) inv.set(b, a);
  for (let i = 0; i < n; i++) {
    const src_ = i < th.length ? i : inv.get(i);
    tint[i] = Math.round((1 - smoothstep(0.38, 0.85, th[src_])) * 255);
  }
  withUV.tint = tint;
  muscles[id] = withUV;
  log(id, n, 'verts');
}
const muscleBVH = bvhOf(Object.values(muscles));

// Quadriceps tendon: base of the patella -> up the front of the thigh, where the quadriceps muscles join it.
{
  sweeps.quad_tendon = sweep({
    points: [[-1.0, 2.4, 3.6], [-1.0, 3.5, 3.85], [-1.05, 4.7, 3.95], [-1.2, 6.0, 4.05], [-1.4, 7.4, 4.1]], n: 56, m: 28, frame: hintFrame(() => [0, 0, 1]),
    profile: (t) => ellipseProfile(mix(4.2, 2.4, smoothstep(0, 0.9, t)) * mix(0.8, 1, smoothstep(0, 0.1, t)), mix(0.55, 0.45, t), 28, 0, 0.4),
  });
}
// IT band: flat fascial band on the outer thigh -> Gerdy's tubercle on the front-outer tibia.
{
  const gerdy = hug([[-3.45, -1.85, 1.6]], 0.1)[0];
  let pts = [[-6.0, 13.5, 0.4], [-6.0, 10, 0.5], [-5.7, 6.5, 0.6], [-5.2, 3.5, 0.8], [-4.6, 1.0, 1.1]];
  pts = hug(pts, 0.14, muscleBVH);
  pts = relax([...pts, [-4.1, -0.6, 1.35], gerdy], 2);
  sweeps.it_band = sweep({
    points: pts, n: 90, m: 26, frame: hintFrame((t, p) => [-1, 0, -0.15]),
    profile: (t) => ellipseProfile(mix(2.8, 1.3, smoothstep(0.55, 1, t)), 0.14, 26, 0, 0.45),
  });
}
for (const [id, s] of Object.entries(sweeps)) log(id, s.positions.length / 3, 'verts', s.length.toFixed(2), 'cm');

// ---------- Skin: soft envelope around muscles and bones ----------
const skin = await skinAround([...Object.values(muscles), bones.femur, bones.tibia, bones.fibula, bones.patella, sweeps.patellar_tendon, sweeps.it_band],
  { min: [-9.5, Y0 + 0.2, -8.5], max: [8.5, Y1 - 0.2, 8.0], h: 0.3, off: 0.85, blur: 10 }, surfaceNets);
log('skin', skin.positions.length / 3, 'verts');

// ---------- Mesh list ----------
const meshes = [];
for (const [id, g] of Object.entries(bones)) meshes.push({ id, ...g });
for (const [id, g] of Object.entries(cart)) meshes.push({ id, ...g });
for (const [id, g] of Object.entries(muscles)) meshes.push({ id, ...g });
for (const [id, s] of Object.entries(sweeps)) meshes.push({ id, positions: s.positions, normals: s.normals, uvs: s.uvs, indices: s.indices, tint: id === 'it_band' ? new Uint8Array(s.positions.length / 3).fill(255) : undefined });
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
const chunks = []; let offset = 0;
const manifest = { version: 1, units: 'cm', meshes: [] };
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
  const qn = new Int8Array(P.length);
  for (let i = 0; i < P.length; i++) qn[i] = Math.round(clamp(m.normals[i], -1, 1) * 127);
  const entry = { id: m.id, count: n, min, max };
  entry.pos = push(q); entry.nrm = push(qn);
  if (m.uvs) entry.uv = push(m.uvs);
  entry.ao = push(m.ao);
  if (m.tint) entry.tint = push(m.tint);
  const idx = n < 65536 ? new Uint16Array(m.indices) : m.indices;
  entry.idx = push(idx); entry.idx16 = n < 65536; entry.icount = m.indices.length;
  manifest.meshes.push(entry);
}
fs.writeFileSync(path.join(OUT, 'anatomy.bin'), Buffer.concat(chunks));
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest));
console.log(`wrote ${(offset / 1e6).toFixed(2)} MB`);

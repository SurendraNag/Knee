// Builds the procedural right-knee anatomy into public/anatomy/{anatomy.bin,manifest.json}.
// Run: node scripts/build-anatomy.mjs
// Coordinates: 1 unit = 1 cm. Y up, +Z anterior, +X medial, -X lateral (right knee). Joint line ~ y=0.
import * as THREE from 'three';
import fs from 'node:fs';
import path from 'node:path';
import {
  smin, smax, ssub, sphere, ellipsoid, capsule, taper, ellCyl, clamp, mix, smoothstep, surfaceNets, gradient,
} from './sdf.mjs';

const OUT = path.resolve('public/anatomy');
fs.mkdirSync(OUT, { recursive: true });
const D = Math.PI / 180;

// ---------- Bones ----------
const tibiaTop = (z) => -0.45 + 0.12 * z; // ~7 deg posterior slope

function femur(x, y, z) {
  // shaft and metaphyseal flare
  let d = taper(x, y, z, 0, 5.5, 0.05, 0, 14, 0.45, 2.0, 1.35);
  d = smin(d, ellipsoid(x, y, z, 0, 3.6, -0.4, 3.25, 2.0, 2.15), 1.3);
  // condyles: in side view the distal (weight-bearing) curve is flatter and the posterior curve tighter
  const condyle = (cx, cz, rx, distal, post, rot) => {
    const a = ellipsoid(x, y, z, cx, 0.2 + distal, cz + 0.35, rx, distal, 2.25, rot); // flat distal arc
    const b = ellipsoid(x, y, z, cx, 2.0, cz - 0.85, rx * 0.95, post, post, rot);   // tight posterior arc
    let c = smin(a, b, 0.6);
    return smax(c, Math.abs(x - cx) - rx * 0.92, 0.35); // flattened side walls
  };
  const med = condyle(2.05, -0.55, 1.6, 1.55, 1.55, 7 * D);
  const lat = condyle(-1.95, -0.4, 1.65, 1.6, 1.5, -7 * D);
  d = smin(d, smin(med, lat, 0.4), 0.7);
  // anterior trochlea block, lateral facet more prominent
  d = smin(d, ellipsoid(x, y, z, 0, 2.95, 0.9, 3.0, 2.0, 1.45), 0.6);
  d = smin(d, ellipsoid(x, y, z, -1.35, 3.2, 1.35, 1.25, 1.7, 1.0), 0.5);
  // epicondyles + adductor tubercle
  d = smin(d, sphere(x, y, z, 3.3, 2.75, -0.6, 0.72), 0.7);
  d = smin(d, sphere(x, y, z, -3.25, 2.5, -0.5, 0.62), 0.7);
  d = smin(d, sphere(x, y, z, 2.95, 4.35, -0.95, 0.42), 0.6);
  // trochlear groove (lateral lip higher -> groove axis shifted medially)
  d = ssub(d, capsule(x, y, z, 0.2, 0.0, 3.35, 0.25, 6.5, 3.55, 1.6), 0.35);
  // intercondylar notch, open posteriorly/inferiorly
  d = ssub(d, ellipsoid(x, y, z, 0.0, 0.45, -1.55, 1.0, 2.05, 2.5), 0.25);
  // cut top
  d = smax(d, y - 13.0, 0.3);
  return d;
}

function plateauOutline(x, z) {
  const m = ellCyl(x, z, 1.75, -0.3, 2.05, 2.4);
  const l = ellCyl(x, z, -1.8, -0.25, 2.0, 2.15);
  let d = smin(m, l, 0.8);
  d = ssub(d, ellCyl(x, z, 0, -3.15, 0.95, 0.95), 0.4); // posterior intercondylar notch
  return d;
}

function tibia(x, y, z) {
  const depth = tibiaTop(z) - y;
  const sc = 1 - 0.36 * smoothstep(0.35, 5.0, depth) + 0.02 * smoothstep(0.0, 0.35, depth) * (1 - smoothstep(0.35, 0.9, depth)); // slight rim lip
  let d = smax(plateauOutline(x / sc, (z + 0.3) / sc - 0.3) * sc, -depth, 0.3);
  d = smax(d, -7 - y, 1.0);
  d = smin(d, taper(x, y, z, 0, -3.5, -0.15, 0, -10, 0.25, 2.25, 1.38), 0.9);
  d = smin(d, capsule(x, y, z, 0, -10, 0.25, 0, -14, 0.3, 1.3), 0.5);
  d = smin(d, capsule(x, y, z, -0.1, -3.8, 1.45, 0.05, -14, 1.0, 0.42), 0.9); // anterior crest
  d = smin(d, ellipsoid(x, y, z, -0.35, -3.1, 2.0, 1.05, 1.5, 0.75), 0.8); // tibial tuberosity
  d = smin(d, sphere(x, y, z, -2.5, -1.6, 1.0, 0.4), 0.8); // Gerdy's tubercle
  d = smin(d, sphere(x, y, z, -2.9, -2.25, -1.55, 0.75), 0.5); // fibular facet region
  // medial plateau gently concave
  d = ssub(d, ellipsoid(x, y, z, 1.85, 1.35, -0.35, 1.45, 1.95, 1.85), 0.3);
  // intercondylar eminence (tibial spines)
  d = smin(d, sphere(x, y, z, 0.45, -0.62, -0.25, 0.42), 0.3);
  d = smin(d, sphere(x, y, z, -0.45, -0.66, -0.15, 0.4), 0.3);
  d = smax(d, -12.5 - y, 0.3);
  return d;
}

function fibula(x, y, z) {
  let d = ellipsoid(x, y, z, -3.4, -3.0, -1.8, 1.0, 1.2, 0.95, 0, 0);
  d = smin(d, taper(x, y, z, -3.45, -2.7, -1.95, -3.6, -1.85, -2.2, 0.6, 0.28), 0.4); // apex (styloid)
  d = smin(d, taper(x, y, z, -3.35, -3.7, -1.75, -3.2, -6.0, -1.55, 0.7, 0.58), 0.5); // neck
  d = smin(d, capsule(x, y, z, -3.2, -6.0, -1.55, -3.0, -14, -1.1, 0.58), 0.3);
  d = smax(d, -12.5 - y, 0.2);
  return d;
}

function tri2(px, py, ax, ay, bx, by, cx, cy) { // iq 2D triangle distance
  const e0x = bx - ax, e0y = by - ay, e1x = cx - bx, e1y = cy - by, e2x = ax - cx, e2y = ay - cy;
  const v0x = px - ax, v0y = py - ay, v1x = px - bx, v1y = py - by, v2x = px - cx, v2y = py - cy;
  const c0 = clamp((v0x * e0x + v0y * e0y) / (e0x * e0x + e0y * e0y), 0, 1);
  const c1 = clamp((v1x * e1x + v1y * e1y) / (e1x * e1x + e1y * e1y), 0, 1);
  const c2 = clamp((v2x * e2x + v2y * e2y) / (e2x * e2x + e2y * e2y), 0, 1);
  const q0 = [v0x - e0x * c0, v0y - e0y * c0], q1 = [v1x - e1x * c1, v1y - e1y * c1], q2 = [v2x - e2x * c2, v2y - e2y * c2];
  const sg = Math.sign(e0x * e2y - e0y * e2x);
  const d0 = [q0[0] ** 2 + q0[1] ** 2, sg * (v0x * e0y - v0y * e0x)];
  const d1 = [q1[0] ** 2 + q1[1] ** 2, sg * (v1x * e1y - v1y * e1x)];
  const d2 = [q2[0] ** 2 + q2[1] ** 2, sg * (v2x * e2y - v2y * e2x)];
  const dd = Math.min(d0[0], d1[0], d2[0]), ss = Math.min(d0[1], d1[1], d2[1]);
  return -Math.sqrt(dd) * Math.sign(ss);
}
function patella(x, y, z) {
  // front view: rounded triangle, broad superior base, apex pointing down (about 4.5 x 4.6 cm)
  let o = tri2(x, y, -1.3, 5.45, 1.45, 5.45, 0.12, 2.85) - 0.85;
  o = smin(o, ellipsoid(x, y, 0, 0.08, 5.15, 0, 2.2, 1.05, 1), 0.4); // rounded superior border
  // thickness: convex anterior face, posterior articular surface = two facets meeting at a vertical ridge
  // (ridge slightly medial, lateral facet larger and flatter)
  const zf = 4.65 - 0.11 * x * x - 0.09 * (y - 4.4) ** 2;
  const zb = 2.6 + (x < 0.3 ? 0.17 : 0.27) * Math.abs(x - 0.3) + 0.05 * (y - 4.3) ** 2;
  const slab = Math.max(zb - z, z - zf) * 0.85;
  return smax(o, slab, 0.35);
}

// ---------- Cartilage (solid shells clipped to articular regions) ----------
function femoralCartilage(x, y, z) {
  const ylim = 3.8 + clamp((z + 0.6) / 1.6, 0, 1) * 1.1;
  const notch = Math.max(Math.abs(x) - 1.12, z - 0.45);
  const xlim = 3.05 - clamp((y - 2.6) / 2.0, 0, 1) * 1.0; // trochlear cartilage narrower near the top
  const mask = Math.max(y - ylim, Math.abs(x) - xlim, -notch);
  const t = 0.03 + 0.2 * clamp(-mask / 1.0, 0, 1);
  return smax(femur(x, y, z) - t, mask, 0.05);
}
function tibialCartilage(x, y, z) {
  const mask = Math.max(tibiaTop(z) - 0.55 - y, 0.72 - Math.abs(x), plateauOutline(x, z) + 0.22);
  const t = 0.03 + 0.24 * clamp(-mask / 0.5, 0, 1);
  return smax(tibia(x, y, z) - t, mask, 0.05);
}
function patellarCartilage(x, y, z) {
  // articular area = posterior surface only; thickness fades to zero toward its rim
  const back = z - (2.6 + (x < 0.3 ? 0.17 : 0.27) * Math.abs(x - 0.3) + 0.05 * (y - 4.3) ** 2) - 0.08;
  const mask = Math.max(back, 3.1 - y, y - 6.0, Math.abs(x - 0.1) - 1.95);
  const t = 0.03 + 0.3 * clamp(-mask / 0.9, 0, 1);
  return smax(patella(x, y, z) - t, mask, 0.05);
}

function skin(x, y, z) {
  let d = taper(x, y, z, 0, 15, 0.1, 0, 4, 0.2, 6.6, 5.4);
  d = smin(d, ellipsoid(x, y, z, 0, 1.6, 0.0, 5.3, 4.6, 4.9), 2.0);
  d = smin(d, taper(x, y, z, 0, -1.5, -0.6, 0, -13, -0.9, 5.0, 4.3), 1.5);
  d = smin(d, ellipsoid(x, y, z, 0, -6.0, -2.0, 4.6, 5.5, 4.2), 1.5);
  d = smin(d, ellipsoid(x, y, z, 0.1, 4.0, 4.0, 2.6, 2.8, 1.25), 1.2); // over patella
  d = smin(d, ellipsoid(x, y, z, -0.3, -2.8, 3.0, 1.3, 1.6, 0.8), 1.0); // over tuberosity
  d = smax(d, y - 15, 0.5);
  d = smax(d, -13 - y, 0.5);
  return d;
}

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

const boneField = (x, y, z) => Math.min(femur(x, y, z), tibia(x, y, z), fibula(x, y, z));
const v3 = (a) => new THREE.Vector3(...a);

function hintFrame(hintFn) {
  return (t, p, T) => {
    const h = v3(hintFn(t, p));
    const up = h.sub(T.clone().multiplyScalar(h.dot(T))).normalize();
    const side = new THREE.Vector3().crossVectors(T, up).normalize();
    return { side, up };
  };
}
const outwardFrame = hintFrame((t, p) => gradient(boneField, p.x, p.y, p.z, 0.05));

// Push centerline points so they sit `off` above the bone surface.
function hug(points, offFn, fieldFn = boneField) {
  return points.map((p, i) => {
    let [x, y, z] = p;
    const off = offFn(i / (points.length - 1));
    for (let it = 0; it < 6; it++) {
      const d = fieldFn(x, y, z) - off;
      const g = gradient(fieldFn, x, y, z, 0.05);
      x -= g[0] * d; y -= g[1] * d; z -= g[2] * d;
    }
    return [x, y, z];
  });
}

const sweeps = {};

// ACL: lateral femoral condyle (medial wall, posterior) -> anterior tibial intercondylar area.
// Two bundles: anteromedial (AM, higher on femur, more anterior-medial on tibia) and posterolateral (PL).
function mergeSweeps(list) {
  let P = [], N = [], U = [], I = [], base = 0;
  list.forEach((g, k) => {
    P.push(...g.positions); N.push(...g.normals);
    for (let i = 0; i < g.uvs.length; i += 2) U.push(g.uvs[i] + k * 1e-4, g.uvs[i + 1]); // keep rings distinct per bundle
    for (const ix of g.indices) I.push(ix + base);
    base += g.positions.length / 3;
  });
  return { positions: new Float32Array(P), normals: new Float32Array(N), uvs: new Float32Array(U), indices: new Uint32Array(I), length: list[0].length, curve: list[0].curve };
}
{
  const am = sweep({
    points: [[-0.72, 2.05, -1.3], [-0.45, 1.25, -0.7], [-0.05, 0.4, 0.05], [0.28, -0.38, 0.72]],
    n: 44, m: 22, frame: hintFrame(() => [1, 0, 0.3]),
    profile: (t) => ellipseProfile(mix(0.7, 0.85, smoothstep(0.65, 1, t)), 0.55, 22, mix(-0.5, 0.6, t), 0.1),
  });
  const pl = sweep({
    points: [[-0.82, 1.5, -1.8], [-0.6, 0.9, -1.1], [-0.25, 0.2, -0.3], [0.02, -0.4, 0.3]],
    n: 44, m: 22, frame: hintFrame(() => [1, 0, 0.3]),
    profile: (t) => ellipseProfile(mix(0.62, 0.8, smoothstep(0.65, 1, t)), 0.5, 22, mix(0.4, -0.5, t), 0.1),
  });
  sweeps.acl = mergeSweeps([am, pl]);
}
// PCL: medial femoral condyle (lateral wall, anterior notch) -> posterior tibia below plateau.
sweeps.pcl = sweep({
  points: [[0.78, 1.85, -0.25], [0.6, 1.25, -1.0], [0.35, 0.35, -1.85], [0.05, -0.55, -2.35], [0.0, -1.15, -2.5]],
  n: 48, m: 28,
  frame: hintFrame(() => [1, 0, 0]),
  profile: (t) => ellipseProfile(mix(1.9, 1.35, smoothstep(0, 0.5, t)), 0.88, 28, mix(1.2, 0.2, t), 0.2),
});
// MCL (superficial): medial epicondyle -> medial tibia ~5-6 cm below joint line. Flat broad band.
{
  const raw = [[3.6, 3.05, -0.55], [3.85, 1.7, -0.45], [4.0, 0.2, -0.3], [3.7, -1.6, -0.05], [3.0, -3.6, 0.25], [2.3, -5.8, 0.45]];
  const field = (x, y, z) => smin(boneField(x, y, z), Math.max(ellCyl(x, z, 1.75, -0.3, 2.0, 2.35), Math.abs(y - 0.05) - 0.35), 1.0);
  let pts = hug(raw, () => 0.22, field);
  for (let it = 0; it < 4; it++) pts = pts.map((p, i) => (i === 0 || i === pts.length - 1) ? p : p.map((v, a) => 0.25 * pts[i - 1][a] + 0.5 * v + 0.25 * pts[i + 1][a]));
  pts = hug(pts, () => 0.22, field);
  sweeps.mcl = sweep({
    points: pts, n: 72, m: 28, frame: hintFrame((t, p) => [p.x, 0, (p.z + 0.3) * 0.6]),
    profile: (t) => ellipseProfile(mix(1.9, 2.5, Math.sin(Math.PI * Math.min(1, t * 1.4))) * mix(1, 0.8, t), 0.32, 28, 0, 0.8),
  });
}
// LCL: lateral epicondyle -> lateral fibular head. Cord, stands off the joint.
sweeps.lcl = sweep({
  points: [[-3.65, 2.55, -0.55], [-4.1, 1.0, -0.85], [-4.25, -0.4, -1.15], [-4.15, -1.8, -1.45], [-3.95, -2.75, -1.6]],
  n: 56, m: 20,
  frame: hintFrame(() => [-1, 0, 0]),
  profile: (t) => ellipseProfile(mix(0.75, 0.6, t), 0.48, 20, 0, 0.1),
});
// Patellar tendon: patellar apex -> tibial tuberosity.
sweeps.patellar_tendon = sweep({
  points: [[0.12, 2.6, 3.5], [0.02, 0.6, 3.25], [-0.15, -1.4, 2.95], [-0.3, -2.8, 2.6], [-0.34, -3.6, 2.15]],
  n: 56, m: 28,
  frame: hintFrame(() => [0, 0.15, 1]),
  profile: (t) => ellipseProfile(mix(2.7, 2.15, t), mix(0.5, 0.45, t), 28, 0, 0.6),
});
// Quadriceps tendon: superior pole of patella -> up into the quadriceps.
sweeps.quad_tendon = sweep({
  points: [[0.08, 5.5, 3.75], [0.08, 6.6, 3.7], [0.05, 8.2, 3.25], [0.0, 10.4, 2.8], [0.0, 14.0, 2.35]],
  n: 56, m: 28,
  frame: hintFrame(() => [0, 0, 1]),
  profile: (t) => ellipseProfile(mix(3.3, 3.4, t), mix(0.45, 0.6, t), 28, 0, 0.55),
});

// Menisci: wedge-shaped C sweeps sitting on the plateau rim.
function meniscus({ cx, cz, rx, rz, side, from, to, width, height }) {
  const N = 90;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const phi = mix(from, to, i / N);
    const x = cx + side * rx * Math.cos(phi), z = cz + rz * Math.sin(phi);
    pts.push([x, tibiaTop(z) + 0.14, z]);
  }
  return sweep({
    points: pts, n: 120, m: 26, curveType: 'catmullrom',
    frame: (t, p, T) => {
      let up = new THREE.Vector3(0, 1, 0); up.sub(T.clone().multiplyScalar(up.dot(T))).normalize();
      let s = new THREE.Vector3().crossVectors(T, up).normalize();
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
  cx: 1.75, cz: -0.3, rx: 1.95, rz: 2.28, side: 1, from: -140 * D, to: 135 * D,
  width: (t) => mix(1.45, 0.85, smoothstep(0.1, 0.85, t)), // posterior horn wider
  height: () => 0.56,
});
sweeps.lateral_meniscus = meniscus({
  cx: -1.8, cz: -0.25, rx: 1.9, rz: 2.02, side: -1, from: -155 * D, to: 155 * D,
  width: () => 1.05, height: () => 0.54,
});


// ---------- Muscles and fascia: fusiform sweeps with fibre direction and tendinous ends ----------
// tint per vertex: 0 = red muscle belly, 1 = white tendon. belly = [t0, t1] along the centre-line.
const muscleSweeps = {};
const bell = (t, a, b) => Math.sin(Math.PI * clamp((t - a) / (b - a), 0, 1));
function muscle(id, { points, belly, w, h, tw = 0.6, th = 0.35, hint, n = 90, m = 26, sq = 0.25 }) {
  const [a, b] = belly;
  const g = sweep({
    points, n, m,
    frame: hintFrame(hint || ((t, p) => [p.x, 0, p.z + 0.2])),
    profile: (t) => {
      const k = bell(t, a, b);
      const wt = mix(tw, w(t), Math.sqrt(k)), ht = mix(th, h(t), Math.sqrt(k));
      return ellipseProfile(wt, ht, m, 0, sq);
    },
  });
  const n3 = g.positions.length / 3, tint = new Uint8Array(n3);
  for (let i = 0; i < n3; i++) {
    const t = g.uvs[i * 2] / g.length;
    const inBelly = smoothstep(a - 0.02, a + 0.05, t) * (1 - smoothstep(b - 0.05, b + 0.02, t));
    tint[i] = Math.round((1 - inBelly) * 255);
  }
  g.tint = tint;
  muscleSweeps[id] = g;
}
const cW = (v) => () => v;
muscle('rectus_femoris', { points: [[0, 16.5, 2.7], [0.05, 12, 3.4], [0.05, 8.6, 3.85], [0.08, 6.6, 3.95]], belly: [-0.2, 0.8], w: cW(3.2), h: cW(2.1), tw: 2.6, th: 0.5, hint: () => [0, 0, 1] });
muscle('vastus_lateralis', { points: [[-3.6, 16.5, 0.5], [-4.0, 12, 0.9], [-3.3, 8.4, 2.0], [-1.6, 6.1, 3.45]], belly: [-0.2, 0.86], w: cW(4.4), h: cW(3.0), tw: 1.6, th: 0.4 });
muscle('vastus_medialis', { points: [[2.4, 16.5, -0.1], [3.3, 11, 0.8], [3.4, 7.6, 1.9], [1.6, 5.5, 3.45]], belly: [-0.25, 0.88], w: (t) => mix(3.0, 4.6, smoothstep(0.3, 0.75, t)), h: (t) => mix(2.4, 3.2, smoothstep(0.3, 0.75, t)), tw: 1.6, th: 0.4 });
muscle('sartorius', { points: [[2.4, 16.5, 2.6], [3.9, 10, 0.8], [4.45, 4, -1.0], [4.35, 0.6, -1.35], [3.7, -2.8, -0.2], [2.35, -5.0, 1.0]], belly: [-0.1, 0.62], w: cW(1.8), h: cW(0.6), tw: 1.0, th: 0.25, sq: 0.6 });
muscle('gracilis', { points: [[2.2, 16.5, -1.8], [3.6, 8, -2.2], [4.05, 2.5, -2.0], [3.85, -1.0, -1.1], [2.5, -5.3, 0.85]], belly: [-0.1, 0.52], w: cW(1.4), h: cW(0.8), tw: 0.5, th: 0.3 });
muscle('semitendinosus', { points: [[1.4, 16.5, -3.9], [2.4, 9, -3.9], [3.1, 3.5, -3.2], [3.55, 0, -2.1], [2.8, -3.5, -0.3], [2.2, -5.6, 0.7]], belly: [-0.1, 0.42], w: cW(2.0), h: cW(1.5), tw: 0.5, th: 0.35 });
muscle('semimembranosus', { points: [[2.3, 15.5, -3.0], [2.8, 8, -3.1], [2.95, 3, -2.75], [2.75, -0.4, -2.15], [2.4, -1.3, -1.75]], belly: [-0.15, 0.7], w: cW(2.7), h: cW(2.0), tw: 1.1, th: 0.5 });
muscle('biceps_femoris', { points: [[-2.4, 16.5, -3.3], [-3.3, 9, -3.4], [-3.95, 3.5, -2.6], [-3.95, 0, -2.15], [-3.65, -2.4, -2.05]], belly: [-0.15, 0.68], w: cW(2.9), h: cW(2.1), tw: 0.9, th: 0.45 });
muscle('gastrocnemius_medial', { points: [[1.9, 3.8, -2.3], [2.1, 1.0, -3.4], [2.0, -3.5, -4.45], [1.4, -8, -4.35], [0.6, -12.5, -3.6]], belly: [0.1, 1.25], w: cW(3.2), h: cW(2.1), tw: 1.1, th: 0.4 });
muscle('gastrocnemius_lateral', { points: [[-1.9, 3.6, -2.1], [-2.05, 1.0, -3.2], [-1.95, -3.0, -4.15], [-1.3, -7.5, -4.05], [-0.5, -12, -3.4]], belly: [0.1, 1.25], w: cW(2.7), h: cW(1.9), tw: 1.0, th: 0.4 });
muscle('popliteus', { points: [[-3.35, 1.0, -1.0], [-2.5, -0.6, -2.55], [-0.6, -2.4, -2.9], [1.2, -4.0, -2.45]], belly: [0.25, 1.3], w: (t) => mix(0.8, 3.2, t), h: cW(0.6), tw: 0.45, th: 0.3, sq: 0.6, hint: () => [0, 0, -1] });
muscle('it_band', { points: [[-5.0, 16.5, 0.3], [-4.95, 10, 0.4], [-4.35, 4.5, 0.6], [-3.45, 0.8, 0.95], [-2.65, -1.55, 1.15]], belly: [2, 3], w: cW(3), h: cW(0.3), tw: 2.6, th: 0.22, sq: 0.8, hint: () => [-1, 0, 0] });

// ---------- Mesh list ----------
const meshes = [];
function addSdf(id, f, min, max, h) {
  const t0 = Date.now();
  const g = surfaceNets(f, min, max, h);
  meshes.push({ id, ...g });
  console.log(`${id}: ${g.positions.length / 3} verts, ${g.indices.length / 3} tris, ${Date.now() - t0}ms`);
}
addSdf('femur', femur, [-4.6, -0.6, -3.9], [4.6, 13.5, 3.2], 0.1);
addSdf('tibia', tibia, [-4.5, -12.9, -3.2], [4.5, 0.6, 3.2], 0.1);
addSdf('fibula', fibula, [-4.8, -12.9, -3.3], [-1.8, -1.2, 0.0], 0.08);
addSdf('patella', patella, [-2.6, 1.4, 1.9], [2.8, 7.0, 5.2], 0.06);
addSdf('femoral_cartilage', femoralCartilage, [-3.6, -0.6, -3.9], [3.6, 5.6, 3.0], 0.065);
addSdf('tibial_cartilage', tibialCartilage, [-4.2, -1.4, -3.0], [4.2, 0.3, 2.6], 0.06);
addSdf('patellar_cartilage', patellarCartilage, [-2.6, 2.4, 1.7], [2.8, 6.6, 3.5], 0.05);
addSdf('skin', skin, [-7.5, -13.6, -7.5], [7.5, 15.6, 7.5], 0.22);
for (const [id, s] of Object.entries(muscleSweeps)) meshes.push({ id, positions: s.positions, normals: s.normals, uvs: s.uvs, indices: s.indices, tint: s.tint });
for (const [id, s] of Object.entries(sweeps)) {
  meshes.push({ id, positions: s.positions, normals: s.normals, uvs: s.uvs, indices: s.indices });
  console.log(`${id}: ${s.positions.length / 3} verts, length ${s.length.toFixed(2)} cm`);
}


// ---------- Baked ambient occlusion (SDF based) ----------
function polyField(curve, r) {
  const pts = curve.getSpacedPoints(16).map((v) => [v.x, v.y, v.z]);
  return (x, y, z) => { let d = Infinity; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, capsule(x, y, z, ...pts[i], ...pts[i + 1], r)); return d; };
}
const deepFields = {
  femur: (x, y, z) => femur(x, y, z) - 0.15, tibia: (x, y, z) => tibia(x, y, z) - 0.15, fibula,
  patella: (x, y, z) => patella(x, y, z) - 0.2,
  acl: polyField(sweeps.acl.curve, 0.3), pcl: polyField(sweeps.pcl.curve, 0.32), lcl: polyField(sweeps.lcl.curve, 0.25),
  medial_meniscus: polyField(sweeps.medial_meniscus.curve, 0.3), lateral_meniscus: polyField(sweeps.lateral_meniscus.curve, 0.3),
};
const own = { femoral_cartilage: 'femur', tibial_cartilage: 'tibia', patellar_cartilage: 'patella' };
for (const m of meshes) {
  const n = m.positions.length / 3;
  const ao = new Uint8Array(n);
  if (m.id === 'skin') { ao.fill(255); m.ao = ao; continue; }
  const fs_ = Object.entries(deepFields).filter(([k]) => k !== m.id && k !== own[m.id]).map(([, f]) => f);
  const pre = (x, y, z) => { let d = Infinity; for (const f of fs_) { d = Math.min(d, f(x, y, z)); } return d; };
  const P = m.positions, N = m.normals;
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    const nx = N[i * 3], ny = N[i * 3 + 1], nz = N[i * 3 + 2];
    let occ = 0, w = 1;
    for (let k = 1; k <= 5; k++) {
      const h = 0.14 * k;
      const d = pre(x + nx * h, y + ny * h, z + nz * h);
      occ += w * clamp(h - d, 0, h) / h; w *= 0.7;
    }
    ao[i] = Math.round(clamp(1 - 0.42 * occ, 0.25, 1) * 255);
  }
  m.ao = ao;
}
console.log('ao done');

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

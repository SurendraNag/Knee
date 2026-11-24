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
  let d = taper(x, y, z, 0, 5.0, 0.1, 0, 14, 0.45, 2.3, 1.38);
  d = smin(d, ellipsoid(x, y, z, 0, 3.5, -0.35, 3.35, 2.2, 2.25), 1.2);
  // condyles (medial larger AP and slightly more distal; posterior divergence)
  const med = ellipsoid(x, y, z, 2.05, 2.05, -0.75, 1.55, 1.85, 2.55, 8 * D);
  const lat = ellipsoid(x, y, z, -1.95, 2.1, -0.55, 1.62, 1.85, 2.45, -8 * D);
  d = smin(d, smin(med, lat, 0.4), 0.7);
  // anterior trochlea block
  d = smin(d, ellipsoid(x, y, z, 0, 2.95, 0.9, 3.0, 2.0, 1.45), 0.6);
  // epicondyles + adductor tubercle
  d = smin(d, sphere(x, y, z, 3.3, 2.75, -0.6, 0.72), 0.7);
  d = smin(d, sphere(x, y, z, -3.25, 2.5, -0.5, 0.62), 0.7);
  d = smin(d, sphere(x, y, z, 2.95, 4.35, -0.95, 0.42), 0.6);
  // trochlear groove (lateral lip higher -> groove axis shifted medially)
  d = ssub(d, capsule(x, y, z, 0.2, 0.0, 3.35, 0.25, 6.5, 3.55, 1.6), 0.35);
  // intercondylar notch, open posteriorly/inferiorly
  d = ssub(d, ellipsoid(x, y, z, 0.0, 0.55, -1.45, 1.0, 1.8, 2.45), 0.28);
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
  let slab = smax(plateauOutline(x, z) + Math.max(0, tibiaTop(z) - 0.7 - y) * 0.5, y - tibiaTop(z), 0.35);
  let d = smin(slab, ellipsoid(x, y, z, 0, -2.6, -0.3, 3.45, 2.7, 2.35), 1.6);
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

function patella(x, y, z) {
  let d = ellipsoid(x, y, z, 0.05, 4.6, 3.6, 2.2, 1.7, 1.1); // broad superior base
  d = smin(d, taper(x, y, z, 0.1, 3.9, 3.6, 0.15, 2.25, 3.4, 1.55, 0.35), 0.6); // inferior apex
  d = smax(d, ellipsoid(x, y, z, 0.1, 4.3, 2.0, 2.6, 3.2, 2.85), 0.5); // flatter anterior face
  d = smax(d, 2.78 - z, 0.25); // articular back is flatter
  // median ridge on the articular surface (separates medial and lateral facets)
  d = smin(d, capsule(x, y, z, 0.05, 5.3, 2.95, 0.05, 3.2, 2.95, 0.3), 0.35);
  return d;
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
  const mask = Math.max(z - 3.05, 2.85 - y, y - 5.95, Math.abs(x - 0.05) - 1.95);
  const t = 0.03 + 0.32 * clamp(-mask / 0.5, 0, 1);
  return smax(patella(x, y, z) - t, mask, 0.05);
}

// ---------- Muscles (simplified, guessed shapes) ----------
const muscles = {
  vastus_medialis: (x, y, z) => smax(smin(ellipsoid(x, y, z, 2.9, 9.0, 0.9, 2.2, 4.8, 2.2, 0, 0),
    taper(x, y, z, 3.0, 9.5, 0.9, 1.6, 6.0, 2.9, 2.0, 0.55), 1.0), y - 15, 0.3),
  vastus_lateralis: (x, y, z) => smax(smin(ellipsoid(x, y, z, -3.2, 11.0, 0.5, 2.4, 4.8, 2.4),
    taper(x, y, z, -3.2, 12, 0.6, -1.6, 6.6, 2.9, 2.3, 0.6), 1.0), y - 15, 0.3),
  rectus_femoris: (x, y, z) => smax(smin(taper(x, y, z, 0, 16, 2.3, 0, 10.0, 3.0, 2.0, 1.1),
    ellipsoid(x, y, z, 0, 13.5, 2.4, 2.1, 4.0, 1.6), 0.8), y - 15, 0.3),
  biceps_femoris: (x, y, z) => smin(taper(x, y, z, -2.6, 15, -2.7, -3.6, 3.0, -2.4, 1.7, 0.55),
    taper(x, y, z, -3.6, 3.0, -2.4, -3.55, -2.4, -2.1, 0.55, 0.3), 0.4),
  semimembranosus: (x, y, z) => smin(taper(x, y, z, 2.3, 15, -2.8, 2.9, 2.0, -2.5, 1.75, 0.55),
    taper(x, y, z, 2.9, 2.0, -2.5, 2.55, -1.3, -1.7, 0.55, 0.32), 0.4),
  gastrocnemius_medial: (x, y, z) => smax(smin(taper(x, y, z, 2.0, 3.4, -2.3, 2.0, 0.0, -3.4, 0.55, 1.2),
    ellipsoid(x, y, z, 1.75, -5.5, -3.75, 2.0, 5.5, 1.9), 1.0), -12 - y, 0.3),
  gastrocnemius_lateral: (x, y, z) => smax(smin(taper(x, y, z, -1.95, 3.2, -2.15, -1.9, 0.0, -3.2, 0.5, 1.1),
    ellipsoid(x, y, z, -1.8, -5.0, -3.5, 1.75, 5.0, 1.75), 1.0), -12 - y, 0.3),
};

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

// ACL: lateral femoral condyle (medial wall, posterior) -> anterior tibial intercondylar area. Twisted band.
sweeps.acl = sweep({
  points: [[-0.78, 1.95, -1.6], [-0.5, 1.2, -0.95], [-0.15, 0.35, -0.2], [0.12, -0.35, 0.6]],
  n: 48, m: 28,
  frame: hintFrame(() => [1, 0, 0.3]),
  profile: (t) => ellipseProfile(mix(1.25, 1.45, smoothstep(0.6, 1, t)) * (1 - 0.15 * Math.sin(Math.PI * t)), 0.6, 28, mix(-0.9, 0.7, t), 0.2),
});
// PCL: medial femoral condyle (lateral wall, anterior notch) -> posterior tibia below plateau.
sweeps.pcl = sweep({
  points: [[0.78, 1.85, -0.25], [0.6, 1.25, -1.0], [0.35, 0.35, -1.85], [0.05, -0.55, -2.35], [0.0, -1.15, -2.5]],
  n: 48, m: 28,
  frame: hintFrame(() => [1, 0, 0]),
  profile: (t) => ellipseProfile(mix(1.7, 1.3, smoothstep(0, 0.5, t)), 0.68, 28, mix(1.2, 0.2, t), 0.2),
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
    profile: (t) => ellipseProfile(mix(1.5, 2.0, Math.sin(Math.PI * Math.min(1, t * 1.4))) * mix(1, 0.8, t), 0.3, 28, 0, 0.8),
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
      const poly = [[0.0, 0.0], [0.04, h * 0.55], [-0.06, h * 0.95], [-0.25, h], [-w * 0.55, h * 0.45], [-w, 0.05], [-w * 0.93, 0.0], [-w * 0.5, -0.02]];
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
addSdf('patella', patella, [-2.4, 1.4, 2.1], [2.6, 6.8, 4.9], 0.06);
addSdf('femoral_cartilage', femoralCartilage, [-3.6, -0.6, -3.9], [3.6, 5.6, 3.0], 0.065);
addSdf('tibial_cartilage', tibialCartilage, [-4.2, -1.4, -3.0], [4.2, 0.3, 2.6], 0.06);
addSdf('patellar_cartilage', patellarCartilage, [-2.4, 2.3, 1.8], [2.6, 6.4, 3.4], 0.05);
for (const [id, f] of Object.entries(muscles)) addSdf(id, f, [-6.5, -12.5, -6.5], [6.5, 15.5, 6.0], 0.2);
addSdf('skin', skin, [-7.5, -13.6, -7.5], [7.5, 15.6, 7.5], 0.22);
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
  const isMuscle = m.id in muscles;
  const fs_ = Object.entries(deepFields).filter(([k]) => k !== m.id && k !== own[m.id]).map(([, f]) => f);
  if (isMuscle) for (const [k, f] of Object.entries(muscles)) if (k !== m.id) fs_.push(f);
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
  const idx = n < 65536 ? new Uint16Array(m.indices) : m.indices;
  entry.idx = push(idx); entry.idx16 = n < 65536; entry.icount = m.indices.length;
  manifest.meshes.push(entry);
}
fs.writeFileSync(path.join(OUT, 'anatomy.bin'), Buffer.concat(chunks));
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest));
console.log(`wrote ${(offset / 1e6).toFixed(2)} MB`);

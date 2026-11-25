// Shared helpers for the anatomy builders (copied from build-anatomy.mjs, made independent of its globals).
import * as THREE from 'three';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { clamp, mix, smoothstep } from './sdf.mjs';
import { shell, bvhOf, bakeAO, thickness, smoothScalar, cylinderUV, principalAxis, weld } from './meshops.mjs';
export const v3 = (a) => new THREE.Vector3(...a);
export const D = Math.PI / 180;
export function sweep({ points, n = 64, m = 24, frame, profile, caps = true, closedCurve = false, curveType = 'centripetal' }) {
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

export function ellipseProfile(w, h, m, twist = 0, squareness = 0.35) {
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
export function lensProfile(w, h, m) {
  const out = [];
  for (let j = 0; j < m; j++) {
    const a = (j / m) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    out.push([c * w / 2, s > 0 ? h * Math.pow(s, 0.8) : 0.12 * h * s]);
  }
  return out;
}
export function hintFrame(hintFn) {
  return (t, p, T) => {
    const h = v3(hintFn(t, p));
    const up = h.sub(T.clone().multiplyScalar(h.dot(T))).normalize();
    const side = new THREE.Vector3().crossVectors(T, up).normalize();
    return { side, up };
  };
}
// Put centre-line points `off` above the nearest surface in `bvh` (outside, along the face normal).
export function hug(points, off, bvh) {
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
export function normalAt(bvh, p) {
  const r = bvh.closestPointToPoint(p instanceof THREE.Vector3 ? p : v3(p), {}); const n = new THREE.Vector3(0, 1, 0); if (!r) return n;
  const pos = bvh.geometry.attributes.position, idx = bvh.geometry.index, f = r.faceIndex * 3;
  _tri.setFromAttributeAndIndices(pos, idx.getX(f), idx.getX(f + 1), idx.getX(f + 2)); _tri.getNormal(n); return n;
}
export const relax = (pts, it = 3) => { for (let k = 0; k < it; k++) pts = pts.map((p, i) => (i === 0 || i === pts.length - 1) ? p : p.map((v, a) => 0.25 * pts[i - 1][a] + 0.5 * v + 0.25 * pts[i + 1][a])); return pts; };

export function mergeSweeps(list, gap = 0.01) {
  let P = [], N = [], U = [], I = [], base = 0;
  list.forEach((g, k) => {
    P.push(...g.positions); N.push(...g.normals);
    for (let i = 0; i < g.uvs.length; i += 2) U.push(g.uvs[i] + k * gap, g.uvs[i + 1]);
    for (const ix of g.indices) I.push(ix + base);
    base += g.positions.length / 3;
  });
  return { positions: new Float32Array(P), normals: new Float32Array(N), uvs: new Float32Array(U), indices: new Uint32Array(I), length: list[0].length, curve: list[0].curve };
}

export function contactShell(bone, others, { dist = 0.45, thick = 0.12, inset = 0.06, smooth = 6, region } = {}) {
  const bvh = bvhOf(others); const tmp = v3([0, 0, 0]);
  return shell(bone, (x, y, z) => {
    if (region && !region(x, y, z)) return 0;
    const r = bvh.closestPointToPoint(tmp.set(x, y, z), {}); return r ? 1 - smoothstep(dist * 0.6, dist, r.distance) : 0;
  }, { thick, inset, smooth, edge: [0.5, 0.9] });
}
export function fibreFrame(g, kind) {
  const P = g.positions, n = P.length / 3;
  if (kind === 'pop' || kind === 'pca') {
    const { c, axis: pa } = principalAxis(P);
    const axis = kind === 'pop' ? new THREE.Vector3(1, -0.85, -0.25).normalize().toArray() : pa;
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
export function withFibres(g, kind, thickMax = 2.5) {
  const bvh = bvhOf([g]);
  const th = smoothScalar(g, thickness(g, bvh, thickMax), 6);
  const withUV = cylinderUV(g, fibreFrame(g, kind));
  const n = withUV.positions.length / 3, tint = new Uint8Array(n);
  const inv = new Map(); for (const [a, b] of withUV.dupOf) inv.set(b, a);
  for (let i = 0; i < n; i++) {
    const src_ = i < th.length ? i : inv.get(i);
    tint[i] = Math.round((1 - smoothstep(0.38, 0.85, th[src_])) * 255);
  }
  withUV.tint = tint;
  return withUV;
}
export function slabs(g, step = 1, axis = 1) {
  const P = g.positions, sl = new Map();
  for (let i = 0; i < P.length; i += 3) {
    const k = Math.round(P[i + axis] / step); const s = sl.get(k) || { c: [0, 0, 0], n: 0, mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] };
    for (let a = 0; a < 3; a++) { s.c[a] += P[i + a]; s.mn[a] = Math.min(s.mn[a], P[i + a]); s.mx[a] = Math.max(s.mx[a], P[i + a]); } s.n++; sl.set(k, s);
  }
  return [...sl.entries()].sort((a, b) => b[0] - a[0]).map(([, s]) => ({ c: s.c.map((v) => v / s.n), size: s.mx.map((v, a) => v - s.mn[a]) }));
}
export const lerpArr = (arr, t) => { const f = t * (arr.length - 1), i = Math.min(Math.floor(f), arr.length - 2), u = f - i; return arr[i] * (1 - u) + arr[i + 1] * u; };
export function clearOf(points, bvh, min) {
  return points.map((p) => {
    const v = v3(p), r = bvh.closestPointToPoint(v, {}); if (!r) return p;
    const n = normalAt(bvh, r.point), d = v.clone().sub(r.point), inside = d.dot(n) < 0;
    if (inside || r.distance < min) return r.point.clone().addScaledVector(n, min).toArray();
    return p;
  });
}
export function cropBy({ positions: P, indices: I }, keep) {
  const out = [];
  for (let t = 0; t < I.length; t += 3) {
    let cx = 0, cy = 0, cz = 0; for (let k = 0; k < 3; k++) { cx += P[I[t + k] * 3] / 3; cy += P[I[t + k] * 3 + 1] / 3; cz += P[I[t + k] * 3 + 2] / 3; }
    if (keep(cx, cy, cz)) out.push(I[t], I[t + 1], I[t + 2]);
  }
  return weld(P, out);
}
// keep the largest connected piece: drops the hanging arm and hand that the crop cuts free
export function largestPiece({ positions, indices: I }) {
  const n = positions.length / 3, par = new Int32Array(n).map((_, i) => i);
  const f = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (let t = 0; t < I.length; t += 3) { const a = f(I[t]), b = f(I[t + 1]), c = f(I[t + 2]); par[b] = a; par[f(c)] = a; }
  const cnt = new Map(); for (let i = 0; i < n; i++) { const r = f(i); cnt.set(r, (cnt.get(r) || 0) + 1); }
  const best = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const out = []; for (let t = 0; t < I.length; t += 3) if (f(I[t]) === best) out.push(I[t], I[t + 1], I[t + 2]);
  return weld(positions, out);
}
export function writeAnatomy(meshes, STRUCTURES, OUT, log = console.log) {
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
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest));
console.log(`wrote ${(offset / 1e6).toFixed(2)} MB raw, ${(fs.statSync(path.join(OUT, 'anatomy.dat')).size / 1e6).toFixed(2)} MB gzip`);

}

// Visible Human Female lower limb (Center for Orthopaedic Biomechanics, University of Denver; Andreassen et al.,
// Sci Data 2023; CC BY 4.0). data/visible-human-female/vhf-lower-limb.bin.gz holds the 128 STL models of the dataset
// (pelvis, sacrum, coccyx, leg and foot bones, cartilage, knee ligaments, 38 muscles a side), reduced in size and packed:
//   u32 header length, JSON header {MN (mm), S (mm per unit), meta: [{n: file name, nv, nt}]}, then per model
//   nv*3 u16 positions (mm = q*S + MN) and nt*3 i32 index deltas.
// Scan axes: x toward the body's right, y forward, z up (mm). This file converts them to the body explorer's axes
// (m; x toward the left, y up, z forward) and fits them to the reference body.
import fs from 'node:fs';
import zlib from 'node:zlib';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

export function readVHF(file) {
  const b = zlib.gunzipSync(fs.readFileSync(file));
  const hl = b.readUInt32LE(0);
  const head = JSON.parse(b.subarray(4, 4 + hl).toString());
  let o = 4 + hl; const out = [];
  for (const m of head.meta) {
    const q = new Uint16Array(b.buffer.slice(b.byteOffset + o, b.byteOffset + o + m.nv * 6)); o += m.nv * 6;
    const d = new Int32Array(b.buffer.slice(b.byteOffset + o, b.byteOffset + o + m.nt * 12)); o += m.nt * 12;
    const P = new Float32Array(m.nv * 3);
    for (let i = 0; i < m.nv; i++) {
      const x = (q[i * 3] * head.S + head.MN[0]) / 1000, y = (q[i * 3 + 1] * head.S + head.MN[1]) / 1000, z = (q[i * 3 + 2] * head.S + head.MN[2]) / 1000;
      P[i * 3] = -x; P[i * 3 + 1] = z; P[i * 3 + 2] = y; // to explorer axes (a proper rotation)
    }
    const I = new Uint32Array(m.nt * 3); let prev = 0;
    for (let i = 0; i < I.length; i++) { prev += d[i]; I[i] = prev; }
    const nm = m.n.replace(/^.*\//, '').replace(/_smooth\.stl$/i, '').replace(/^VHF_/, '');
    const [side, kind, ...rest] = nm.split('_');
    out.push({ file: m.n, side, kind, name: rest.join(''), positions: P, indices: I });
  }
  if (o !== b.length) throw new Error(`vhf: size mismatch ${o} ${b.length}`);
  return out;
}

// --- similarity transforms {s, R (3x3 row-major), t}: x' = s R x + t ---
export const apply = (T, P, out = new Float32Array(P.length)) => {
  const { s, R, t } = T;
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i], y = P[i + 1], z = P[i + 2];
    out[i] = s * (R[0] * x + R[1] * y + R[2] * z) + t[0];
    out[i + 1] = s * (R[3] * x + R[4] * y + R[5] * z) + t[1];
    out[i + 2] = s * (R[6] * x + R[7] * y + R[8] * z) + t[2];
  }
  return out;
};
export const compose = (A, B) => { // A after B
  const R = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) R[r * 3 + c] += A.R[r * 3 + k] * B.R[k * 3 + c];
  const t = [0, 1, 2].map((r) => A.s * (A.R[r * 3] * B.t[0] + A.R[r * 3 + 1] * B.t[1] + A.R[r * 3 + 2] * B.t[2]) + A.t[r]);
  return { s: A.s * B.s, R, t };
};
export const IDT = { s: 1, R: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] };

// symmetric 4x4 eigen (Jacobi) for Horn's quaternion method
function eig4(A) {
  const a = A.map((r) => r.slice()), V = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0; for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) off += a[p][q] ** 2;
    if (off < 1e-22) break;
    for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) {
      if (Math.abs(a[p][q]) < 1e-30) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 4; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < 4; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < 4; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  let best = 0; for (let i = 1; i < 4; i++) if (a[i][i] > a[best][best]) best = i;
  return V.map((r) => r[best]);
}

// best similarity (or rigid when fixScale is a number) mapping points X onto Y, weights w
export function fitSim(X, Y, w, fixScale, range) {
  let W = 0; const cx = [0, 0, 0], cy = [0, 0, 0];
  for (let i = 0; i < w.length; i++) { W += w[i]; for (let a = 0; a < 3; a++) { cx[a] += w[i] * X[i * 3 + a]; cy[a] += w[i] * Y[i * 3 + a]; } }
  for (let a = 0; a < 3; a++) { cx[a] /= W; cy[a] /= W; }
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; let vx = 0;
  for (let i = 0; i < w.length; i++) {
    const x = [0, 1, 2].map((a) => X[i * 3 + a] - cx[a]), y = [0, 1, 2].map((a) => Y[i * 3 + a] - cy[a]);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) S[r][c] += w[i] * x[r] * y[c];
    vx += w[i] * (x[0] ** 2 + x[1] ** 2 + x[2] ** 2);
  }
  const [[Sxx, Sxy, Sxz], [Syx, Syy, Syz], [Szx, Szy, Szz]] = S;
  const N = [
    [Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx],
    [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
    [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy],
    [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz],
  ];
  const [q0, qx, qy, qz] = eig4(N);
  const R = [
    q0 * q0 + qx * qx - qy * qy - qz * qz, 2 * (qx * qy - q0 * qz), 2 * (qx * qz + q0 * qy),
    2 * (qy * qx + q0 * qz), q0 * q0 - qx * qx + qy * qy - qz * qz, 2 * (qy * qz - q0 * qx),
    2 * (qz * qx - q0 * qy), 2 * (qz * qy + q0 * qx), q0 * q0 - qx * qx - qy * qy + qz * qz,
  ];
  let s = fixScale;
  if (typeof s !== 'number') {
    let num = 0; // sum w y.(R x)
    for (let i = 0; i < w.length; i++) {
      const x = [0, 1, 2].map((a) => X[i * 3 + a] - cx[a]), y = [0, 1, 2].map((a) => Y[i * 3 + a] - cy[a]);
      for (let r = 0; r < 3; r++) num += w[i] * y[r] * (R[r * 3] * x[0] + R[r * 3 + 1] * x[1] + R[r * 3 + 2] * x[2]);
    }
    s = num / vx;
    if (range) s = Math.min(range[1], Math.max(range[0], s));
  }
  const t = [0, 1, 2].map((r) => cy[r] - s * (R[r * 3] * cx[0] + R[r * 3 + 1] * cx[1] + R[r * 3 + 2] * cx[2]));
  return { s, R, t };
}

export function bvhOf(P, I) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setIndex(new THREE.BufferAttribute(I, 1));
  return new MeshBVH(g);
}

// ICP of point set X (already roughly placed by T0) onto the surfaces in `bvh`, both ways when `Y` (target points)
// and `bvhX` are given, so that a partial overlap does not pull the fit. Returns {T, rms}.
export function icp(X, bvh, T0, { iters = 30, Y = null, bvhOfX = null, fixScale, range, sub = 1, keep = 0.9 } = {}) {
  let T = T0; const tgt = { point: new THREE.Vector3() }, v = new THREE.Vector3();
  let rms = 0;
  for (let it = 0; it < iters; it++) {
    const PX = apply(T, X);
    const src = [], dst = [], d2 = [];
    for (let i = 0; i < PX.length / 3; i += sub) {
      v.set(PX[i * 3], PX[i * 3 + 1], PX[i * 3 + 2]);
      const h = bvh.closestPointToPoint(v, tgt); if (!h) continue;
      src.push(X[i * 3], X[i * 3 + 1], X[i * 3 + 2]); dst.push(h.point.x, h.point.y, h.point.z); d2.push(h.distance ** 2);
    }
    if (Y && bvhOfX) { // target points onto the moved source surface: build pairs in source space via inverse
      const inv = invert(T), PY = apply(inv, Y);
      for (let i = 0; i < PY.length / 3; i += sub) {
        v.set(PY[i * 3], PY[i * 3 + 1], PY[i * 3 + 2]);
        const h = bvhOfX.closestPointToPoint(v, tgt); if (!h) continue;
        src.push(h.point.x, h.point.y, h.point.z); dst.push(Y[i * 3], Y[i * 3 + 1], Y[i * 3 + 2]); d2.push((h.distance * T.s) ** 2);
      }
    }
    // robust weights: drop the worst pairs
    const sorted = d2.slice().sort((a, b) => a - b), cut = sorted[Math.floor((sorted.length - 1) * keep)] * 1.0001 + 1e-12;
    const w = d2.map((d) => (d <= cut ? 1 : 0));
    rms = Math.sqrt(d2.reduce((a, d, i) => a + d * w[i], 0) / w.reduce((a, b) => a + b, 0));
    const Tn = fitSim(Float32Array.from(src), Float32Array.from(dst), w, fixScale, range);
    const moved = Math.abs(Tn.s - T.s) + Tn.t.reduce((a, x, i) => a + Math.abs(x - T.t[i]), 0) + Tn.R.reduce((a, x, i) => a + Math.abs(x - T.R[i]), 0);
    T = Tn;
    if (moved < 1e-6) break;
  }
  return { T, rms };
}
export function invert(T) {
  const Rt = [T.R[0], T.R[3], T.R[6], T.R[1], T.R[4], T.R[7], T.R[2], T.R[5], T.R[8]], s = 1 / T.s;
  const t = [0, 1, 2].map((r) => -s * (Rt[r * 3] * T.t[0] + Rt[r * 3 + 1] * T.t[1] + Rt[r * 3 + 2] * T.t[2]));
  return { s, R: Rt, t };
}

// connected components of an indexed mesh -> [{positions, indices}]
export function components(P, I) {
  const n = P.length / 3, par = new Int32Array(n).map((_, i) => i);
  const f = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (let t = 0; t < I.length; t += 3) { const a = f(I[t]), b = f(I[t + 1]), c = f(I[t + 2]); par[b] = a; par[f(c)] = a; }
  const groups = new Map();
  for (let t = 0; t < I.length; t += 3) { const r = f(I[t]); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(I[t], I[t + 1], I[t + 2]); }
  return [...groups.values()].map((idx) => {
    const map = new Map(), Pn = [], In = [];
    for (const v of idx) { if (!map.has(v)) { map.set(v, map.size); Pn.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); } In.push(map.get(v)); }
    return { positions: Float32Array.from(Pn), indices: Uint32Array.from(In) };
  });
}

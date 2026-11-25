// Mesh utilities for turning BodyParts3D scan meshes into app meshes (build time only).
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { clamp, smoothstep } from './sdf.mjs';

// Keep triangles with at least one vertex inside [ymin, ymax]; drop unused vertices; weld duplicates.
export function crop({ positions, indices }, ymin, ymax) {
  const keepT = [];
  for (let t = 0; t < indices.length; t += 3) {
    let inside = false;
    for (let k = 0; k < 3; k++) { const y = positions[indices[t + k] * 3 + 1]; if (y >= ymin && y <= ymax) inside = true; }
    if (inside) keepT.push(indices[t], indices[t + 1], indices[t + 2]);
  }
  return weld(positions, keepT);
}

export function weld(positions, idx, eps = 1e-4) {
  const map = new Map(), remap = new Int32Array(positions.length / 3).fill(-1), P = [];
  const I = [];
  for (const i of idx) {
    if (remap[i] < 0) {
      const key = `${Math.round(positions[i * 3] / eps)},${Math.round(positions[i * 3 + 1] / eps)},${Math.round(positions[i * 3 + 2] / eps)}`;
      let j = map.get(key);
      if (j === undefined) { j = P.length / 3; P.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]); map.set(key, j); }
      remap[i] = j;
    }
    I.push(remap[i]);
  }
  // drop degenerate triangles
  const J = [];
  for (let t = 0; t < I.length; t += 3) if (I[t] !== I[t + 1] && I[t + 1] !== I[t + 2] && I[t] !== I[t + 2]) J.push(I[t], I[t + 1], I[t + 2]);
  return { positions: new Float32Array(P), indices: new Uint32Array(J) };
}

export function translate(m, d) { for (let i = 0; i < m.positions.length; i += 3) { m.positions[i] += d[0]; m.positions[i + 1] += d[1]; m.positions[i + 2] += d[2]; } return m; }

export function merge(list) {
  const P = [], I = []; let base = 0;
  for (const m of list) { P.push(...m.positions); for (const i of m.indices) I.push(i + base); base += m.positions.length / 3; }
  return { positions: new Float32Array(P), indices: new Uint32Array(I) };
}

const ekey = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a);

// Loop subdivision (boundary aware). Smooths the faceted scan surfaces.
export function loopSubdivide({ positions: P, indices: I }) {
  const nv = P.length / 3;
  const edges = new Map(); // key -> {a,b,opp:[], mid}
  for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = I[t + k], b = I[t + (k + 1) % 3], c = I[t + (k + 2) % 3];
    const key = ekey(a, b); let e = edges.get(key);
    if (!e) { e = { a, b, opp: [] }; edges.set(key, e); }
    e.opp.push(c);
  }
  const nbr = Array.from({ length: nv }, () => new Set()), bnd = Array.from({ length: nv }, () => []);
  for (const e of edges.values()) {
    nbr[e.a].add(e.b); nbr[e.b].add(e.a);
    if (e.opp.length === 1) { bnd[e.a].push(e.b); bnd[e.b].push(e.a); }
  }
  const out = [];
  for (let v = 0; v < nv; v++) {
    const p = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
    if (bnd[v].length >= 2) {
      const [a, b] = bnd[v];
      for (let k = 0; k < 3; k++) out.push(0.75 * p[k] + 0.125 * (P[a * 3 + k] + P[b * 3 + k]));
    } else if (bnd[v].length === 1) { out.push(...p); } else {
      const n = nbr[v].size; const beta = n === 3 ? 3 / 16 : 3 / (8 * n);
      const s = [0, 0, 0]; for (const u of nbr[v]) for (let k = 0; k < 3; k++) s[k] += P[u * 3 + k];
      for (let k = 0; k < 3; k++) out.push((1 - n * beta) * p[k] + beta * s[k]);
    }
  }
  let next = nv;
  for (const e of edges.values()) {
    e.mid = next++;
    if (e.opp.length === 2) {
      for (let k = 0; k < 3; k++) out.push(0.375 * (P[e.a * 3 + k] + P[e.b * 3 + k]) + 0.125 * (P[e.opp[0] * 3 + k] + P[e.opp[1] * 3 + k]));
    } else for (let k = 0; k < 3; k++) out.push(0.5 * (P[e.a * 3 + k] + P[e.b * 3 + k]));
  }
  const J = [];
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    const ab = edges.get(ekey(a, b)).mid, bc = edges.get(ekey(b, c)).mid, ca = edges.get(ekey(c, a)).mid;
    J.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  return { positions: new Float32Array(out), indices: new Uint32Array(J) };
}

// Taubin smoothing (no shrink).
export function taubin(m, iters = 4, lam = 0.5, mu = -0.53) {
  const P = m.positions, I = m.indices, nv = P.length / 3;
  const nbr = Array.from({ length: nv }, () => new Set());
  for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) { nbr[I[t + k]].add(I[t + (k + 1) % 3]); nbr[I[t + k]].add(I[t + (k + 2) % 3]); }
  const step = (f) => {
    const Q = P.slice();
    for (let v = 0; v < nv; v++) {
      const n = nbr[v].size; if (!n) continue;
      for (let k = 0; k < 3; k++) { let s = 0; for (const u of nbr[v]) s += Q[u * 3 + k]; P[v * 3 + k] = Q[v * 3 + k] + f * (s / n - Q[v * 3 + k]); }
    }
  };
  for (let i = 0; i < iters; i++) { step(lam); step(mu); }
  return m;
}

export function normals(m) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  g.computeVertexNormals();
  m.normals = g.attributes.normal.array;
  return m;
}

export function geometryOf(m) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  return g;
}

export function bvhOf(list) {
  const g = geometryOf(merge(list));
  return new MeshBVH(g);
}

// Fibonacci hemisphere directions
function hemiDirs(n) {
  const d = [];
  for (let i = 0; i < n; i++) {
    const y = (i + 0.5) / n; const r = Math.sqrt(1 - y * y); const a = i * 2.399963;
    d.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  return d;
}

// Ray-traced ambient occlusion against everything in `bvh`.
export function bakeAO(m, bvh, { rays = 24, dist = 1.6, strength = 0.75 } = {}) {
  const P = m.positions, N = m.normals, n = P.length / 3, ao = new Uint8Array(n);
  const dirs = hemiDirs(rays), ray = new THREE.Ray(), up = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    up.set(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
    t1.set(Math.abs(up.x) < 0.9 ? 1 : 0, Math.abs(up.x) < 0.9 ? 0 : 1, 0).cross(up).normalize(); t2.crossVectors(up, t1);
    let occ = 0, wsum = 0;
    for (const [a, b, c] of dirs) {
      ray.direction.set(t1.x * a + up.x * b + t2.x * c, t1.y * a + up.y * b + t2.y * c, t1.z * a + up.z * b + t2.z * c);
      ray.origin.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).addScaledVector(up, 0.02);
      const w = b; wsum += w;
      const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0, dist);
      if (hit) occ += w * (1 - hit.distance / dist) ** 0.5;
    }
    ao[i] = Math.round(clamp(1 - strength * occ / wsum, 0.2, 1) * 255);
  }
  return ao;
}

// Local thickness: distance to the opposite surface along -normal (own mesh only).
export function thickness(m, bvh, max = 3) {
  const P = m.positions, N = m.normals, n = P.length / 3, out = new Float32Array(n), ray = new THREE.Ray();
  for (let i = 0; i < n; i++) {
    ray.origin.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    ray.direction.set(-N[i * 3], -N[i * 3 + 1], -N[i * 3 + 2]);
    ray.origin.addScaledVector(ray.direction, 0.01);
    const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0, max);
    out[i] = hit ? hit.distance : max;
  }
  return out;
}

// Smooth a per-vertex scalar over the mesh graph.
export function smoothScalar(m, f, iters = 4) {
  const I = m.indices, n = f.length, nbr = Array.from({ length: n }, () => []);
  for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) nbr[I[t + k]].push(I[t + (k + 1) % 3], I[t + (k + 2) % 3]);
  let a = Float32Array.from(f);
  for (let it = 0; it < iters; it++) {
    const b = new Float32Array(n);
    for (let v = 0; v < n; v++) { let s = a[v], c = 1; for (const u of nbr[v]) { s += a[u]; c++; } b[v] = s / c; }
    a = b;
  }
  return a;
}

// Principal axis (largest variance) of the vertices.
export function principalAxis(P) {
  const n = P.length / 3, c = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) c[k] += P[i * 3 + k] / n;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < n; i++) { const d = [P[i * 3] - c[0], P[i * 3 + 1] - c[1], P[i * 3 + 2] - c[2]]; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a][b] += d[a] * d[b]; }
  let v = [0, 1, 0];
  for (let it = 0; it < 50; it++) { const w = [0, 1, 2].map((a) => C[a][0] * v[0] + C[a][1] * v[1] + C[a][2] * v[2]); const l = Math.hypot(...w); v = w.map((x) => x / l); }
  if (v[1] < 0) v = v.map((x) => -x);
  return { c, axis: v };
}

// Cylindrical UVs around a local axis so fibre textures run along the muscle (u = cm along, v = turn 0..1).
// Duplicates vertices on triangles that straddle the seam.
export function cylinderUV(m, axisFn) {
  const P = m.positions, n = P.length / 3;
  const U = new Float32Array(n), V = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const { c, axis, ref, u } = axisFn(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    const d = [P[i * 3] - c[0], P[i * 3 + 1] - c[1], P[i * 3 + 2] - c[2]];
    const along = d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2];
    const r = [d[0] - axis[0] * along, d[1] - axis[1] * along, d[2] - axis[2] * along];
    const b = [axis[1] * ref[2] - axis[2] * ref[1], axis[2] * ref[0] - axis[0] * ref[2], axis[0] * ref[1] - axis[1] * ref[0]];
    const x = r[0] * ref[0] + r[1] * ref[1] + r[2] * ref[2], y = r[0] * b[0] + r[1] * b[1] + r[2] * b[2];
    U[i] = u !== undefined ? u : along; V[i] = (Math.atan2(y, x) / (2 * Math.PI) + 1) % 1;
  }
  const pos = Array.from(P), nrm = Array.from(m.normals), extra = new Map(), uv = [];
  for (let i = 0; i < n; i++) uv.push(U[i], V[i]);
  const idx = Array.from(m.indices);
  for (let t = 0; t < idx.length; t += 3) {
    const vs = [V[idx[t]], V[idx[t + 1]], V[idx[t + 2]]];
    if (Math.max(...vs) - Math.min(...vs) < 0.5) continue;
    for (let k = 0; k < 3; k++) {
      const i = idx[t + k]; if (V[i] >= 0.5) continue;
      let j = extra.get(i);
      if (j === undefined) { j = pos.length / 3; pos.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); nrm.push(m.normals[i * 3], m.normals[i * 3 + 1], m.normals[i * 3 + 2]); uv.push(U[i], V[i] + 1); extra.set(i, j); }
      idx[t + k] = j;
    }
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nrm), uvs: new Float32Array(uv), indices: new Uint32Array(idx), dupOf: extra };
}

// Ring distance (in edges) from the patch boundary, for tapering shells.
function ringDistance(nv, I, mask) {
  const nbr = Array.from({ length: nv }, () => []);
  for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) nbr[I[t + k]].push(I[t + (k + 1) % 3]);
  const d = new Int32Array(nv).fill(1e6), q = [];
  for (let v = 0; v < nv; v++) if (mask[v] && nbr[v].some((u) => !mask[u])) { d[v] = 0; q.push(v); }
  for (let h = 0; h < q.length; h++) { const v = q[h]; for (const u of nbr[v]) if (mask[u] && d[u] > d[v] + 1) { d[u] = d[v] + 1; q.push(u); } }
  return d;
}

// Cartilage shell over the masked area of a bone. The mask is diffused over the surface and the patch is cut
// exactly along its 0.5 iso-line (clean rim). outer = surface + n * thick (thinning to nothing at the rim),
// inner = surface - n * inset, with a thin side wall along the rim.
export function shell(bone, maskFn, { thick = 0.25, inset = 0.06, smooth = 12, edge = [0.5, 0.9] } = {}) {
  const P = bone.positions, N = bone.normals, I = bone.indices, nv = P.length / 3;
  let f = new Float32Array(nv);
  for (let v = 0; v < nv; v++) f[v] = +maskFn(P[v * 3], P[v * 3 + 1], P[v * 3 + 2], N[v * 3], N[v * 3 + 1], N[v * 3 + 2], v);
  const nbr = Array.from({ length: nv }, () => []);
  for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) nbr[I[t + k]].push(I[t + (k + 1) % 3], I[t + (k + 2) % 3]);
  for (let it = 0; it < smooth; it++) {
    const g = new Float32Array(nv);
    for (let v = 0; v < nv; v++) { let s = f[v], c = 1; for (const u of nbr[v]) { s += f[u]; c++; } g[v] = s / c; }
    f = g;
  }
  const TH = 0.5;
  const VP = [], VN = [], VF = [], map = new Map();
  const vert = (v) => { let j = map.get(v); if (j === undefined) { j = VF.length; map.set(v, j); VP.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); VN.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]); VF.push(f[v]); } return j; };
  const evert = (a, b) => {
    const key = 'e' + ekey(a, b); let j = map.get(key); if (j !== undefined) return j;
    const t = (TH - f[a]) / (f[b] - f[a]); j = VF.length; map.set(key, j);
    for (let k = 0; k < 3; k++) { VP.push(P[a * 3 + k] + (P[b * 3 + k] - P[a * 3 + k]) * t); VN.push(N[a * 3 + k] + (N[b * 3 + k] - N[a * 3 + k]) * t); }
    VF.push(TH); return j;
  };
  const tris = [];
  for (let t = 0; t < I.length; t += 3) {
    const ids = [I[t], I[t + 1], I[t + 2]], ins = ids.map((v) => f[v] >= TH);
    const n = ins.filter(Boolean).length; if (n === 0) continue;
    if (n === 3) { tris.push(vert(ids[0]), vert(ids[1]), vert(ids[2])); continue; }
    const poly = [];
    for (let k = 0; k < 3; k++) {
      const a = ids[k], b = ids[(k + 1) % 3];
      if (ins[k]) poly.push(vert(a));
      if (ins[k] !== ins[(k + 1) % 3]) poly.push(evert(a, b));
    }
    for (let k = 1; k + 1 < poly.length; k++) tris.push(poly[0], poly[k], poly[k + 1]);
  }
  const k = VF.length, out = new Float32Array(k * 6);
  for (let j = 0; j < k; j++) {
    let nx = VN[j * 3], ny = VN[j * 3 + 1], nz = VN[j * 3 + 2]; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const tk = (typeof thick === 'function' ? thick(VP[j * 3], VP[j * 3 + 1], VP[j * 3 + 2]) : thick) * smoothstep(edge[0], edge[1], VF[j]) + 0.008;
    out[j * 3] = VP[j * 3] + nx * tk; out[j * 3 + 1] = VP[j * 3 + 1] + ny * tk; out[j * 3 + 2] = VP[j * 3 + 2] + nz * tk;
    out[(k + j) * 3] = VP[j * 3] - nx * inset; out[(k + j) * 3 + 1] = VP[j * 3 + 1] - ny * inset; out[(k + j) * 3 + 2] = VP[j * 3 + 2] - nz * inset;
  }
  const J = [];
  for (let t = 0; t < tris.length; t += 3) { const a = tris[t], b = tris[t + 1], c = tris[t + 2]; J.push(a, b, c, k + a, k + c, k + b); }
  const ec = new Map();
  for (let t = 0; t < tris.length; t += 3) for (let q = 0; q < 3; q++) {
    const a = tris[t + q], b = tris[t + (q + 1) % 3], key = ekey(a, b);
    const e = ec.get(key); if (e) e.n++; else ec.set(key, { a, b, n: 1 });
  }
  for (const e of ec.values()) if (e.n === 1) J.push(e.b, e.a, k + e.a, e.b, k + e.a, k + e.b);
  return normals({ positions: out, indices: new Uint32Array(J) });
}

// Unsigned-distance skin around a set of meshes: grid, flood-fill outside, surface nets at `off`.
export async function skinAround(list, { min, max, h = 0.3, off = 0.55, blur = 3 }, surfaceNets) {
  const bvh = bvhOf(list);
  const nx = Math.ceil((max[0] - min[0]) / h) + 1, ny = Math.ceil((max[1] - min[1]) / h) + 1, nz = Math.ceil((max[2] - min[2]) / h) + 1;
  const D = new Float32Array(nx * ny * nz), p = new THREE.Vector3(), tgt = {};
  const id = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    p.set(min[0] + i * h, min[1] + j * h, min[2] + k * h);
    const r = bvh.closestPointToPoint(p, tgt, 0, 4);
    D[id(i, j, k)] = r ? r.distance : 4;
  }
  // flood fill outside region (D > off) from the grid boundary on x/z sides
  const outside = new Uint8Array(D.length), q = [];
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if ((i === 0 || k === 0 || i === nx - 1 || k === nz - 1) && D[id(i, j, k)] > off) { outside[id(i, j, k)] = 1; q.push(id(i, j, k)); }
  }
  for (let hd = 0; hd < q.length; hd++) {
    const c = q[hd], i = c % nx, j = Math.floor(c / nx) % ny, k = Math.floor(c / (nx * ny));
    for (const [a, b, d] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const ii = i + a, jj = j + b, kk = k + d; if (ii < 0 || jj < 0 || kk < 0 || ii >= nx || jj >= ny || kk >= nz) continue;
      const n = id(ii, jj, kk); if (!outside[n] && D[n] > off) { outside[n] = 1; q.push(n); }
    }
  }
  // signed field: outside -> D - off ; inside -> -(something)
  let S = new Float32Array(D.length);
  for (let n = 0; n < D.length; n++) S[n] = outside[n] ? D[n] - off : -Math.max(0.05, off - D[n]);
  // blur for a soft skin
  for (let it = 0; it < blur; it++) {
    const T = new Float32Array(S.length);
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      let s = 0, c = 0;
      for (let d = -1; d <= 1; d++) for (const [a, b, e] of [[d, 0, 0], [0, d, 0], [0, 0, d]]) {
        const ii = i + a, jj = j + b, kk = k + e; if (ii < 0 || jj < 0 || kk < 0 || ii >= nx || jj >= ny || kk >= nz) continue; s += S[id(ii, jj, kk)]; c++;
      }
      T[id(i, j, k)] = s / c;
    }
    S = T;
  }
  const f = (x, y, z) => {
    const fi = clamp((x - min[0]) / h, 0, nx - 1.001), fj = clamp((y - min[1]) / h, 0, ny - 1.001), fk = clamp((z - min[2]) / h, 0, nz - 1.001);
    const i = Math.floor(fi), j = Math.floor(fj), k = Math.floor(fk), a = fi - i, b = fj - j, c = fk - k;
    let v = 0;
    for (let dk = 0; dk < 2; dk++) for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) v += S[id(i + di, j + dj, k + dk)] * (di ? a : 1 - a) * (dj ? b : 1 - b) * (dk ? c : 1 - c);
    return v;
  };
  return surfaceNets(f, min, max, h);
}

// Injury rendering: shader-driven tears/breaks on the anatomy meshes plus small extra geometry
// (frayed fibres, bone fragments). Every injury is anchored to a structure-local coordinate so
// it can be serialised (structure id + type + anchor) and restored exactly.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { STRUCTURES, CARTILAGE_OF, CFG } from './limbs.js';

const MAX = 6;
export const T = {
  G1: 1, G2: 2, G3: 3, // ligament / tendon
  SPLIT: 11, BUCKET: 12, FLAP: 13, // meniscus
  BRUISE: 21, STRESS: 22, HAIRLINE: 23, DISPLACED: 24, SHATTERED: 25, // bone
};

export const INJURY_TYPES = {
  ligament: [
    { type: T.G1, label: 'Grade I sprain', sub: 'Stretched', say: (s) => `The ${s} is stretched but not torn; it usually heals with rest and exercises.` },
    { type: T.G2, label: 'Grade II sprain', sub: 'Partial tear, frayed fibres', say: (s) => `The ${s} is partly torn: some of its fibres are frayed and broken, so it is looser and weaker.` },
    { type: T.G3, label: 'Grade III sprain', sub: 'Complete tear', say: (s, i = {}) => `The ${s} is torn all the way through, so its two ends have pulled apart and it no longer holds the ${i.joint || CFG.defaultJoint} steady.` },
  ],
  tendon: [
    { type: T.G2, label: 'Partial tear', sub: 'Frayed fibres', say: (s) => `The ${s} is partly torn: some fibres are frayed and broken.` },
    { type: T.G3, label: 'Complete tear', sub: 'Torn through', say: (s, i = {}) => `The ${s} is torn all the way through, so ${i.tearEffect || CFG.defaultTearEffect}.` },
  ],
  meniscus: [
    { type: T.SPLIT, label: 'Split tear', sub: 'Radial split from the inner edge', say: (s) => `The ${s} has a split running in from its inner edge, like a cut across a rubber ring.` },
    { type: T.BUCKET, label: 'Bucket-handle tear', sub: 'Strip flipped into the joint', say: (s) => `A long strip of the ${s} has torn loose and flipped toward the middle of the knee like a bucket handle, which can lock the knee.` },
    { type: T.FLAP, label: 'Flap tear', sub: 'Loose flap lifted up', say: (s) => `A loose flap of the ${s} has peeled up and can catch in the joint.` },
  ],
  labrum: [
    { type: T.SPLIT, label: 'Labral tear', sub: 'Split at the rim', say: (s, i = {}) => `The ${s} is split where it joins the rim of the socket, so it no longer seals the joint and ${i.labrumEffect || 'can catch, click or cause groin pain'}.` },
    { type: T.FLAP, label: 'Flap tear', sub: 'Loose flap lifted up', say: (s) => `A flap of the ${s} has torn loose and can catch between the ball and the socket.` },
  ],
  disc: [
    { type: T.SPLIT, label: 'Central tear', sub: 'Split through the pad', say: (s) => `The ${s} has a tear through its thin centre, which can cause clicking and pain on the little-finger side of the wrist.` },
    { type: T.FLAP, label: 'Peripheral tear', sub: 'Torn loose at its edge', say: (s) => `The ${s} has torn loose at its edge, so it no longer holds the ends of the forearm bones firmly together.` },
  ],
  bone: [
    { type: T.HAIRLINE, label: 'Hairline crack', sub: 'Thin crack, no shift', say: (s) => `A thin crack runs through the ${s}; the pieces have not moved apart.` },
    { type: T.DISPLACED, label: 'Displaced break', sub: 'Pieces shifted apart', say: (s) => `The ${s} is broken clean through and the pieces have shifted out of line.` },
    { type: T.SHATTERED, label: 'Shattered break', sub: 'Sharp fragments', say: (s) => `The ${s} is broken into several sharp pieces at this spot.` },
    { type: T.BRUISE, label: 'Bone bruise', sub: 'Soft discoloured patch', say: (s) => `The ${s} is bruised inside: bleeding and swelling in the bone, without a break.` },
    { type: T.STRESS, label: 'Stress fracture', sub: 'Faint line, slight swelling', say: (s) => `A small crack in the ${s} from repeated strain, with slight swelling around it.` },
  ],
};
export const injuryKind = (id) => {
  const k = STRUCTURES[id]?.injury || STRUCTURES[id]?.kind;
  return k === 'bone' || k === 'ligament' || k === 'tendon' || k === 'meniscus' || k === 'labrum' || k === 'disc' ? k : null;
};
export const typeInfo = (kind, type) => INJURY_TYPES[kind].find((t) => t.type === type);

// ---------------- GLSL ----------------
const NOISE = /* glsl */ `
float ih(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float inz(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(ih(i), ih(i + vec3(1,0,0)), f.x), mix(ih(i + vec3(0,1,0)), ih(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(ih(i + vec3(0,0,1)), ih(i + vec3(1,0,1)), f.x), mix(ih(i + vec3(0,1,1)), ih(i + vec3(1,1,1)), f.x), f.y), f.z); }
vec3 irot(vec3 v, vec3 axis, float a){ return v * cos(a) + cross(axis, v) * sin(a) + axis * dot(axis, v) * (1.0 - cos(a)); }
`;
const UNI = /* glsl */ `
uniform int uInjN;
uniform vec4 uInjA[${MAX}];
uniform vec4 uInjB[${MAX}];
uniform vec4 uInjC[${MAX}];
uniform vec4 uFlap;
varying vec3 vIP; varying float vIU; varying float vIV; varying float vIR; varying float vSide;
`;

// bone: A = point.xyz, type   B = dir.xyz, seed   C = surface normal.xyz, sideSign
const BONE_VERT_NORMAL = /* glsl */ `
vec3 injPos = position; vSide = 0.0;
for (int i = 0; i < ${MAX}; i++) { if (i >= uInjN) break;
  int ty = int(uInjA[i].w + 0.5); vec3 p = uInjA[i].xyz;
  if (ty == 24) {
    vec3 pn = uInjB[i].xyz; float s = dot(position - p, pn) + (inz(position * 2.2 + uInjB[i].w) - 0.5) * 0.5;
    if (s * uInjC[i].w > 0.0) {
      vec3 shiftDir = normalize(cross(pn, vec3(0.31, 0.0, 0.95)));
      vec3 ax = normalize(cross(pn, shiftDir));
      injPos = p + irot(position - p, ax, 0.16 * uInjC[i].w) + shiftDir * 0.55 + pn * uInjC[i].w * 0.25;
      objectNormal = irot(objectNormal, ax, 0.16 * uInjC[i].w);
      vSide = 1.0;
    }
  }
  if (ty == 22) { float d = length(position - p); injPos += objectNormal * 0.14 * exp(-d * d / 0.35); }
}
`;
const BONE_FRAG = /* glsl */ `
{
  vec3 col = diffuseColor.rgb;
  if (vSide > 0.001 && vSide < 0.999) discard;
  for (int i = 0; i < ${MAX}; i++) { if (i >= uInjN) break;
    int ty = int(uInjA[i].w + 0.5); vec3 p = uInjA[i].xyz; vec3 rel = vIP - p;
    vec3 dir = uInjB[i].xyz; vec3 n0 = uInjC[i].xyz; float seed = uInjB[i].w;
    vec3 perp = normalize(cross(n0, dir));
    float s = dot(rel, dir), q = dot(rel, perp), depth = abs(dot(rel, n0));
    if (ty == 21) {
      float d = length(rel) + (inz(vIP * 3.0 + seed) - 0.5) * 0.5;
      float f = 1.0 - smoothstep(0.3, 1.5, d);
      vec3 bruise = mix(vec3(0.72, 0.62, 0.30), vec3(0.42, 0.16, 0.30), smoothstep(0.2, 0.75, f));
      col = mix(col, bruise, f * 0.85 * (0.75 + 0.25 * inz(vIP * 9.0)));
    }
    if (ty == 22 || ty == 23) {
      float L = ty == 22 ? 0.7 : 1.8; float w = ty == 22 ? 0.03 : 0.04;
      float jit = (inz(vec3(s * 5.0, seed, 1.0)) - 0.5) * 0.16 + (inz(vec3(s * 17.0, seed, 3.0)) - 0.5) * 0.04;
      float line = (1.0 - smoothstep(w * 0.4, w, abs(q - jit))) * (1.0 - smoothstep(L * 0.75, L, abs(s))) * step(depth, 0.9);
      if (ty == 23) { // a short branch
        vec3 bd = normalize(dir + perp * 0.8); float bs = dot(rel - dir * 0.5, bd); float bq = dot(rel - dir * 0.5, normalize(cross(n0, bd)));
        float bj = (inz(vec3(bs * 6.0, seed, 7.0)) - 0.5) * 0.1;
        line = max(line, (1.0 - smoothstep(w * 0.3, w * 0.8, abs(bq - bj))) * step(0.0, bs) * (1.0 - smoothstep(0.35, 0.6, bs)) * step(depth, 0.9));
      }
      col = mix(col, vec3(0.16, 0.08, 0.06), line * (ty == 22 ? 0.55 : 0.92));
      if (ty == 22) col = mix(col, vec3(0.78, 0.45, 0.42), 0.35 * exp(-dot(rel, rel) / 0.3));
    }
    if (ty == 24) {
      float sd = dot(rel, uInjB[i].xyz) + (inz(vIP * 2.2 + seed) - 0.5) * 0.5;
      col = mix(col, vec3(0.35, 0.2, 0.15), (1.0 - smoothstep(0.0, 0.16, abs(sd))) * 0.7);
    }
    if (ty == 25) {
      vec3 flat_ = rel - n0 * dot(rel, n0); float d = length(flat_);
      float ang = atan(q, s);
      float R = 0.85 * (0.75 + 0.5 * inz(vec3(ang * 2.0, seed, 0.0)));
      if (d < R && depth < 1.1) discard;
      float rays = 0.0;
      for (int k = 0; k < 5; k++) {
        float a = float(k) * 1.2566 + seed;
        vec3 rd = dir * cos(a) + perp * sin(a);
        float rs = dot(flat_, rd); float rq = dot(flat_, normalize(cross(n0, rd)));
        float jit = (inz(vec3(rs * 6.0, seed + float(k), 2.0)) - 0.5) * 0.12;
        rays = max(rays, (1.0 - smoothstep(0.006, 0.022, abs(rq - jit))) * step(R * 0.9, rs) * (1.0 - smoothstep(1.4, 2.2, rs)));
      }
      col = mix(col, vec3(0.15, 0.08, 0.06), rays * step(depth, 1.1));
      col = mix(col, vec3(0.45, 0.2, 0.15), (1.0 - smoothstep(R, R + 0.12, d)) * 0.6 * step(depth, 1.1));
    }
  }
  if (!gl_FrontFacing) col = vec3(0.5, 0.17, 0.13) * (0.6 + 0.5 * inz(vIP * 9.0));
  diffuseColor.rgb = col;
}
`;

// sweeps: A = u0, type   B.x = seed
const SWEEP_VERT = /* glsl */ `
vec3 injPos = position; vSide = 0.0;
vec3 cen = aCen; vec3 tg = normalize(aTan);
for (int i = 0; i < ${MAX}; i++) { if (i >= uInjN) break;
  int ty = int(uInjA[i].w + 0.5); float du = uv.x - uInjA[i].x; float ad = abs(du); float sg = du < 0.0 ? -1.0 : 1.0;
  if (ty == 1) { float w = 1.0 - smoothstep(0.0, 0.9, ad); injPos = mix(injPos, cen + (injPos - cen) * 0.8, w); }
  if (ty == 2) { float w = 1.0 - smoothstep(0.0, 0.7, ad); injPos = mix(injPos, cen + (injPos - cen) * 0.62, w);
    injPos += normal * w * (inz(vec3(uv.y * 40.0, uv.x * 4.0, 1.0)) - 0.5) * 0.12; }
  if (ty == 3) { float gap = 0.32, L = 1.0;
    if (ad < gap + L) {
      float k = 1.0 - clamp((ad - gap) / L, 0.0, 1.0); float kk = k * k;
      injPos = cen + (injPos - cen) * mix(1.0, 0.45, k) + tg * sg * k * 0.35;
      vec3 perp = normalize(cross(tg, vec3(0.3, 1.0, 0.2)));
      vec3 perp2 = cross(tg, perp);
      float a = kk * 2.6 * sg;
      injPos += (perp * (1.0 - cos(a)) + perp2 * sin(a) * 0.6) * 0.55 * k;
    }
  }
  if (ty == 11) { float w = 1.0 - smoothstep(0.0, 0.7, ad);
    injPos += tg * sg * 0.22 * w * smoothstep(0.2, 0.7, aRad); }
  if (ty == 12) { float env = 1.0 - smoothstep(0.9, 1.7, ad);
    float inner = step(0.5, aRad);
    injPos += (-aSide * 0.85 + vec3(0.0, 0.22, 0.0)) * env * inner; }
  if (ty == 13) { bool toward = uFlap.w > 0.5;
    if (du > 0.0 && du < 1.1 && (toward || aRad > 0.42)) {
      float lift = (1.0 - du / 1.1); float r = toward ? 1.0 : smoothstep(0.42, 1.0, aRad);
      if (toward) injPos += normalize(uFlap.xyz - cen) * 0.6 * lift + normal * 0.08 * lift;
      else injPos += vec3(0.0, 0.85, 0.0) * lift * r + (-aSide) * 0.35 * lift * r; } }
}
vIU = uv.x; vIV = uv.y; vIR = aRad;
`;
const SWEEP_FRAG = /* glsl */ `
{
  vec3 col = diffuseColor.rgb;
  for (int i = 0; i < ${MAX}; i++) { if (i >= uInjN) break;
    int ty = int(uInjA[i].w + 0.5); float du = vIU - uInjA[i].x; float ad = abs(du);
    if (ty == 1) col = mix(col, col * vec3(1.0, 0.82, 0.8), (1.0 - smoothstep(0.0, 0.9, ad)) * 0.7);
    if (ty == 2) { float w = 1.0 - smoothstep(0.0, 0.55, ad);
      if (w > 0.05 && inz(vec3(vIV * 46.0, 0.0, uInjB[i].x)) > 0.74 - 0.16 * w) discard;
      col = mix(col, vec3(0.72, 0.35, 0.33), w * 0.6); }
    if (ty == 3) { if (ad < 0.32) discard; col = mix(col, vec3(0.7, 0.3, 0.28), (1.0 - smoothstep(0.32, 1.0, ad)) * 0.75); }
    if (ty == 11) { if (ad < 0.09 && vIR > 0.22) discard; col = mix(col, vec3(0.7, 0.45, 0.4), (1.0 - smoothstep(0.0, 0.25, ad)) * 0.35 * step(0.2, vIR)); }
    if (ty == 12) { if (ad < 1.55 && abs(vIR - 0.5) < 0.05) discard; }
    if (ty == 13) { if ((du > 0.0 && du < 1.1 && abs(vIR - 0.42) < 0.04) || (abs(du) < 0.035 && vIR > 0.42)) discard; }
  }
  if (!gl_FrontFacing) col *= vec3(0.75, 0.55, 0.5);
  diffuseColor.rgb = col;
}
`;

function patchMaterial(mat, uniforms, family) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${NOISE}\n${UNI}\n${family === 'sweep' ? 'attribute vec3 aCen; attribute vec3 aTan; attribute vec3 aSide; attribute float aRad;' : ''}`);
    if (family === 'bone') {
      sh.vertexShader = sh.vertexShader
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${BONE_VERT_NORMAL}`)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = injPos; vIP = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${NOISE}\n${UNI}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${BONE_FRAG}`);
    } else {
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${SWEEP_VERT}\ntransformed = injPos; vIP = position;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${NOISE}\n${UNI}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${SWEEP_FRAG}`);
    }
  };
  const prevKey = mat.customProgramCacheKey?.() || '';
  mat.customProgramCacheKey = () => `${prevKey}-inj-${family}`;
  mat.needsUpdate = true;
}

// Ring data for swept meshes (ligaments, tendons, menisci): per-vertex ring centre, tangent,
// outward side direction and normalised radial depth (0 = outer rim, 1 = inner edge).
function addSweepAttributes(geom) {
  const P = geom.attributes.position.array, UV = geom.attributes.uv.array, n = P.length / 3;
  const rings = new Map();
  for (let i = 0; i < n; i++) {
    const u = UV[i * 2];
    if (!rings.has(u)) rings.set(u, []);
    rings.get(u).push(i);
  }
  const keys = [...rings.keys()].sort((a, b) => a - b);
  const centers = keys.map((k) => { const c = new THREE.Vector3(); for (const i of rings.get(k)) c.add(new THREE.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2])); return c.divideScalar(rings.get(k).length); });
  const all = centers.reduce((a, c) => a.add(c), new THREE.Vector3()).divideScalar(centers.length);
  const cen = new Float32Array(n * 3), tan = new Float32Array(n * 3), side = new Float32Array(n * 3), rad = new Float32Array(n);
  const ringInfo = [];
  keys.forEach((k, r) => {
    const t = centers[Math.min(r + 1, keys.length - 1)].clone().sub(centers[Math.max(r - 1, 0)]).normalize();
    const s = new THREE.Vector3(-t.z, 0, t.x).normalize();
    if (s.dot(centers[r].clone().sub(all)) < 0) s.negate();
    const idx = rings.get(k);
    let mn = Infinity, mx = -Infinity, rmax = 0;
    const proj = idx.map((i) => { const v = new THREE.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).sub(centers[r]); rmax = Math.max(rmax, v.length()); const p = v.dot(s); mn = Math.min(mn, p); mx = Math.max(mx, p); return p; });
    idx.forEach((i, j) => {
      cen.set([centers[r].x, centers[r].y, centers[r].z], i * 3); tan.set([t.x, t.y, t.z], i * 3); side.set([s.x, s.y, s.z], i * 3);
      rad[i] = (mx - proj[j]) / ((mx - mn) || 1);
    });
    ringInfo.push({ u: k, center: centers[r], tangent: t, side: s, radius: rmax });
  });
  geom.setAttribute('aCen', new THREE.BufferAttribute(cen, 3));
  geom.setAttribute('aTan', new THREE.BufferAttribute(tan, 3));
  geom.setAttribute('aSide', new THREE.BufferAttribute(side, 3));
  geom.setAttribute('aRad', new THREE.BufferAttribute(rad, 1));
  geom.userData.rings = ringInfo;
}
function ringAt(geom, u) {
  const rings = geom.userData.rings; let best = rings[0];
  for (const r of rings) if (Math.abs(r.u - u) < Math.abs(best.u - u)) best = r;
  return best;
}

// deterministic random
function rng(seed) { let s = Math.floor(seed * 1e6) || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }


export class InjuryManager {
  constructor(scene, meshes) {
    this.scene = scene; this.meshes = meshes; this.list = []; this.targets = {};
    this.extraGroup = new THREE.Group(); scene.add(this.extraGroup);
    this.fiberMat = new THREE.MeshStandardMaterial({ color: 0xd9b9ae, roughness: 0.6 });
    this.fragMat = new THREE.MeshStandardMaterial({ color: 0xd8ccb2, roughness: 0.85, flatShading: true });
    const linkedCart = new Set();
    for (const [id, mesh] of Object.entries(meshes)) {
      const kind = injuryKind(id);
      if (!kind) continue;
      const uniforms = {
        uInjN: { value: 0 },
        uInjA: { value: Array.from({ length: MAX }, () => new THREE.Vector4()) },
        uInjB: { value: Array.from({ length: MAX }, () => new THREE.Vector4()) },
        uInjC: { value: Array.from({ length: MAX }, () => new THREE.Vector4()) },
        uFlap: { value: STRUCTURES[id].flapToward ? new THREE.Vector4(...STRUCTURES[id].flapToward, 1) : new THREE.Vector4() },
      };
      const family = kind === 'bone' ? 'bone' : 'sweep';
      if (family === 'sweep') addSweepAttributes(mesh.geometry);
      patchMaterial(mesh.material, uniforms, family);
      const linked = [mesh];
      // a cartilage mesh shared by several bones (foot) follows the first bone that claims it
      for (const c of CARTILAGE_OF[id] || []) if (meshes[c] && !linkedCart.has(c)) { linkedCart.add(c); patchMaterial(meshes[c].material, uniforms, 'bone'); linked.push(meshes[c]); }
      this.targets[id] = { kind, family, uniforms, linked };
    }
  }

  // Snap a world-space hit to the structure and build the anchor for an injury.
  anchorFor(id, point) {
    const mesh = this.meshes[id];
    const res = mesh.geometry.boundsTree.closestPointToPoint(mesh.worldToLocal(point.clone()));
    const p = res.point;
    const g = mesh.geometry, ia = g.index.array[res.faceIndex * 3];
    const nrm = new THREE.Vector3().fromBufferAttribute(g.attributes.normal, ia).normalize();
    if (g.attributes.uv && this.targets[id].family === 'sweep') return { u: g.attributes.uv.array[ia * 2], p: p.toArray(), n: nrm.toArray() };
    return { p: p.toArray(), n: nrm.toArray() };
  }

  add(id, type, anchor, seed = Math.random()) {
    if (this.list.filter((x) => x.id === id).length >= MAX) return null;
    const inj = { id, type, anchor, seed: Math.round(seed * 1000) / 1000 };
    this.list.push(inj);
    this.rebuild();
    return inj;
  }
  undo() { this.list.pop(); this.rebuild(); }
  remove(i) { this.list.splice(i, 1); this.rebuild(); }
  clear() { this.list = []; this.rebuild(); }
  set(list) { this.list = list.slice(); this.rebuild(); }

  // world position for the numbered tag
  tagPoint(inj) { return this.meshes[inj.id].localToWorld(this._tagLocal(inj)); }
  _tagLocal(inj) {
    const t = this.targets[inj.id];
    const p = new THREE.Vector3().fromArray(inj.anchor.p);
    if (t.family === 'sweep' && inj.type === T.BUCKET) {
      const r = ringAt(this.meshes[inj.id].geometry, inj.anchor.u);
      return r.center.clone().addScaledVector(r.side, -0.9).add(new THREE.Vector3(0, 0.35, 0));
    }
    if (t.family === 'sweep' && inj.type === T.FLAP) {
      const to = STRUCTURES[inj.id].flapToward;
      return to ? p.lerp(new THREE.Vector3(...to), 0.18) : p.add(new THREE.Vector3(0, 0.45, 0));
    }
    if (inj.type === T.DISPLACED) return p;
    return p;
  }

  rebuild() {
    for (const c of [...this.extraGroup.children]) { this.extraGroup.remove(c); c.geometry.dispose(); }
    for (const [id, t] of Object.entries(this.targets)) {
      const mine = this.list.filter((x) => x.id === id);
      t.uniforms.uInjN.value = mine.length;
      const needsBack = mine.some((x) => [T.G2, T.G3, T.SPLIT, T.BUCKET, T.FLAP, T.DISPLACED, T.SHATTERED].includes(x.type));
      for (const m of t.linked) { if (m.material.side !== (needsBack ? THREE.DoubleSide : THREE.FrontSide)) { m.material.side = needsBack ? THREE.DoubleSide : THREE.FrontSide; m.material.needsUpdate = true; } }
      this._owner = id;
      mine.forEach((inj, i) => {
        const A = t.uniforms.uInjA.value[i], B = t.uniforms.uInjB.value[i], C = t.uniforms.uInjC.value[i];
        const p = new THREE.Vector3().fromArray(inj.anchor.p), n = new THREE.Vector3().fromArray(inj.anchor.n);
        if (t.family === 'bone') {
          A.set(p.x, p.y, p.z, inj.type);
          // crack direction: roughly around the bone (perpendicular to its long axis), randomised by seed
          const axis = new THREE.Vector3(0, 1, 0);
          let dir = new THREE.Vector3().crossVectors(n, axis);
          if (dir.lengthSq() < 0.05) dir.set(1, 0, 0);
          dir.normalize().applyAxisAngle(n, (inj.seed - 0.5) * 0.9);
          if (inj.type === T.DISPLACED) {
            // break plane: mostly transverse, slightly oblique; the joint-side piece shifts
            const pn = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0.3).normalize(), (inj.seed - 0.5) * 0.7).normalize();
            const jointSide = id === 'femur' || id === 'patella' ? (id === 'patella' ? 1 : -1) : 1;
            B.set(pn.x, pn.y, pn.z, inj.seed * 10);
            C.set(n.x, n.y, n.z, jointSide);
          } else {
            B.set(dir.x, dir.y, dir.z, inj.seed * 10);
            C.set(n.x, n.y, n.z, 1);
          }
          if (inj.type === T.SHATTERED) this.addFragments(p, n, dir, inj.seed);
        } else {
          A.set(inj.anchor.u, 0, 0, inj.type); B.set(inj.seed * 10, 0, 0, 0);
          if (inj.type === T.G2 || inj.type === T.G3) this.addFibres(id, inj);
        }
      });
    }
  }

  syncExtras() {
    for (const c of this.extraGroup.children) { const o = this.meshes[c.userData.owner]; if (o) { c.position.copy(o.position); c.visible = o.visible; } }
  }

  addFragments(p, n, dir, seed) {
    const r = rng(seed + 0.17);
    const perp = new THREE.Vector3().crossVectors(n, dir).normalize();
    const count = 9;
    for (let k = 0; k < count; k++) {
      const sc = CFG.injuryScale ?? 1;
      const a = (k / count) * Math.PI * 2 + r() * 0.5, d = (0.15 + r() * 0.6) * sc;
      const c = p.clone().addScaledVector(dir, Math.cos(a) * d).addScaledVector(perp, Math.sin(a) * d).addScaledVector(n, -0.05 + r() * 0.25);
      const size = (0.18 + r() * 0.26) * sc;
      const pts = [];
      for (let j = 0; j < 7; j++) pts.push(new THREE.Vector3((r() - 0.5) * size * 2.2, (r() - 0.5) * size * 1.2, (r() - 0.5) * size * 1.6));
      const g = new ConvexGeometry(pts);
      g.translate(c.x, c.y, c.z);
      const m = new THREE.Mesh(g, this.fragMat);
      m.userData.owner = this._owner;
      this.extraGroup.add(m);
    }
  }

  addFibres(id, inj) {
    const geom = this.meshes[id].geometry; const r = rng(inj.seed + 0.31);
    const sides = inj.type === T.G3 ? [-1, 1] : [0];
    for (const sg of sides) {
      const u = inj.anchor.u + sg * (inj.type === T.G3 ? 0.34 : 0);
      const ring = ringAt(geom, u);
      // follow the same end deformation used in the shader (k = 1 at the torn end)
      const t = ring.tangent;
      let c = ring.center.clone();
      if (inj.type === T.G3) {
        c.addScaledVector(t, sg * 0.35);
        const perp = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0.3, 1, 0.2)).normalize();
        const perp2 = new THREE.Vector3().crossVectors(t, perp);
        const a = 2.6 * sg;
        c.addScaledVector(perp, (1 - Math.cos(a)) * 0.55).addScaledVector(perp2, Math.sin(a) * 0.6 * 0.55);
      }
      const rad = ring.radius * (inj.type === T.G3 ? 0.45 : 0.9);
      const nF = inj.type === T.G3 ? 14 : 10;
      for (let k = 0; k < nF; k++) {
        const ang = r() * Math.PI * 2;
        const off = new THREE.Vector3(Math.cos(ang), Math.sin(ang), (r() - 0.5)).cross(t).normalize().multiplyScalar(rad * (0.3 + r() * 0.7));
        const start = c.clone().add(off);
        const outDir = inj.type === T.G3 ? t.clone().multiplyScalar(-sg) : off.clone().normalize();
        const len = (0.25 + r() * 0.45) * (CFG.injuryScale ?? 1);
        const mid = start.clone().addScaledVector(outDir, len * 0.5).add(new THREE.Vector3((r() - 0.5) * 0.15, (r() - 0.5) * 0.15, (r() - 0.5) * 0.15));
        const end = start.clone().addScaledVector(outDir, len).add(new THREE.Vector3((r() - 0.5) * 0.3, (r() - 0.5) * 0.3, (r() - 0.5) * 0.3));
        const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
        const g = new THREE.TubeGeometry(curve, 6, 0.022 + r() * 0.018, 4, false);
        const fm = new THREE.Mesh(g, this.fiberMat); fm.userData.owner = this._owner; this.extraGroup.add(fm);
      }
    }
  }
}

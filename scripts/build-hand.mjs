// Builds the right forearm and hand into public/hand/ (same format as public/anatomy/, see build-lib.mjs).
// Scanned parts (BodyParts3D 4.0 via @dagno/anatomy-model, see extract-arm-extra.mjs) plus modelled cartilage,
// wrist and finger ligaments, finger extensor tendons and the three nerves.
// Frame: cm, origin at the wrist (lunate), fingers +Y, palm +Z, thumb side +X.
import * as THREE from 'three';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { mix, smoothstep } from './sdf.mjs';
import { crop, loopSubdivide, normals, bvhOf, merge, weld, shell } from './meshops.mjs';
import { v3, sweep, ellipseProfile, lensProfile, hintFrame, hug, normalAt, relax, mergeSweeps, contactShell, withFibres, slabs, clearOf, cropBy, largestPiece, writeAnatomy } from './build-lib.mjs';
import { STRUCTURES } from '../src/hand-structures.js';

const OUT = path.resolve('public/hand');
fs.mkdirSync(OUT, { recursive: true });
const Y0 = -21, Y1 = 17; // kept window: just below the elbow to past the fingertips (the elbow end fades out in the app)
const T0 = Date.now(); const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);

const IDX = JSON.parse(fs.readFileSync('data/bodyparts3d/arm-extra.json', 'utf8'));
const BIN = zlib.gunzipSync(fs.readFileSync('data/bodyparts3d/arm-extra.bin'));
function part(fj) {
  const e = IDX.find((x) => x.id === fj); if (!e) throw new Error('missing ' + fj);
  return { positions: new Float32Array(BIN.buffer.slice(BIN.byteOffset + e.pos, BIN.byteOffset + e.pos + e.vc * 12)),
    indices: new Uint32Array(BIN.buffer.slice(BIN.byteOffset + e.idx, BIN.byteOffset + e.idx + e.ic * 4)) };
}
const src = (...fjs) => merge(fjs.map(part));
const centroid = (g) => { const P = g.positions, c = [0, 0, 0]; for (let i = 0; i < P.length; i += 3) { c[0] += P[i]; c[1] += P[i + 1]; c[2] += P[i + 2]; } return v3(c.map((v) => v / (P.length / 3))); };

// ---------- Bones ----------
const PH = { // individual phalanges (proximal, middle, distal), merged per finger for display
  thumb: ['FJ3327', 'FJ3198'], index: ['FJ3322', 'FJ3303', 'FJ3193'], middle: ['FJ3325', 'FJ3306', 'FJ3196'],
  ring: ['FJ3326', 'FJ3292', 'FJ3197'], little: ['FJ3323', 'FJ3304', 'FJ3194'],
};
const BONES = [
  ['radius', ['FJ3349']], ['ulna', ['FJ3391']], ['scaphoid', ['FJ3383']], ['lunate', ['FJ3374']], ['triquetrum', ['FJ3390']], ['pisiform', ['FJ3382']],
  ['trapezium', ['FJ3388']], ['trapezoid', ['FJ3389']], ['capitate', ['FJ3361']], ['hamate', ['FJ3367']],
  ['metacarpal_1', ['FJ3350']], ['metacarpal_2', ['FJ3352']], ['metacarpal_3', ['FJ3354']], ['metacarpal_4', ['FJ3356']], ['metacarpal_5', ['FJ3358']],
];
const smoothBone = (g) => normals(loopSubdivide(loopSubdivide(crop(g, Y0, Y1))));
const bones = {}, piece = {};
for (const [id, fjs] of BONES) bones[id] = smoothBone(src(...fjs));
for (const [f, fjs] of Object.entries(PH)) { fjs.forEach((fj, k) => { piece[`${f}_${k}`] = smoothBone(part(fj)); }); bones[`${f}_bones`] = normals(merge(fjs.map((_, k) => piece[`${f}_${k}`]))); }
for (const id of Object.keys(bones).filter((k) => !k.endsWith('_bones'))) piece[id] = bones[id];
log('bones', Object.values(bones).reduce((a, g) => a + g.positions.length / 3, 0), 'verts');

// Joint centre between two bones: midpoint of the closest vertex pair (bones are dense after subdivision).
function joint(a, b) {
  const bvh = bvhOf([b]), P = a.positions, t = new THREE.Vector3(); let best = null;
  for (let i = 0; i < P.length; i += 3) { t.set(P[i], P[i + 1], P[i + 2]); const r = bvh.closestPointToPoint(t, {}); if (r && (!best || r.distance < best.d)) best = { d: r.distance, p: t.clone().lerp(r.point, 0.5) }; }
  return best.p;
}
const FINGERS = ['index', 'middle', 'ring', 'little'];
const MC = { thumb: 'metacarpal_1', index: 'metacarpal_2', middle: 'metacarpal_3', ring: 'metacarpal_4', little: 'metacarpal_5' };
const J = {}; // J[f] = [MCP, PIP, DIP] (thumb: [MCP, IP])
for (const f of ['thumb', ...FINGERS]) {
  const chain = [piece[MC[f]], ...PH[f].map((_, k) => piece[`${f}_${k}`])];
  J[f] = chain.slice(1).map((g, k) => joint(chain[k], g));
}
const tip = (f) => { const g = piece[`${f}_${PH[f].length - 1}`], P = g.positions, a = J[f][J[f].length - 1]; let best = a, bd = 0; for (let i = 0; i < P.length; i += 3) { const d = a.distanceTo(v3([P[i], P[i + 1], P[i + 2]])); if (d > bd) { bd = d; best = v3([P[i], P[i + 1], P[i + 2]]); } } return best; };
for (const f of Object.keys(J)) log('joints', f, J[f].map((p) => p.toArray().map((v) => v.toFixed(2)).join(',')).join(' | '), 'tip', tip(f).toArray().map((v) => v.toFixed(2)).join(','));
const PALM = v3([0, 0, 1]);

// ---------- Cartilage (modelled) ----------
const ccat = (list) => normals(merge(list.map((g) => ({ positions: g.positions, indices: g.indices }))));
const cart = {};
{
  const b = bones, o = { dist: 0.32, thick: 0.1, inset: 0.05, smooth: 4 };
  cart.wrist_cartilage = ccat([
    contactShell(b.radius, [b.scaphoid, b.lunate], { ...o, dist: 0.5, thick: 0.14, region: (x, y) => y > -2.5 }),
    contactShell(b.scaphoid, [b.radius, b.lunate, b.capitate, b.trapezium, b.trapezoid], o),
    contactShell(b.lunate, [b.radius, b.scaphoid, b.capitate, b.triquetrum, b.hamate], o),
    contactShell(b.triquetrum, [b.lunate, b.hamate, b.pisiform], o),
    contactShell(b.capitate, [b.scaphoid, b.lunate, b.hamate, b.trapezoid, b.metacarpal_3], o),
    contactShell(b.hamate, [b.capitate, b.triquetrum, b.lunate, b.metacarpal_4, b.metacarpal_5], o),
    contactShell(b.trapezium, [b.scaphoid, b.trapezoid, b.metacarpal_1], { ...o, dist: 0.4 }),
    contactShell(b.trapezoid, [b.scaphoid, b.trapezium, b.capitate, b.metacarpal_2], o),
    contactShell(b.metacarpal_1, [b.trapezium], { ...o, dist: 0.4, region: (x, y) => y < 2 }),
  ]);
  const fingerList = [];
  for (const f of ['thumb', ...FINGERS]) {
    const chain = [piece[MC[f]], ...PH[f].map((_, k) => piece[`${f}_${k}`])];
    for (let k = 1; k < chain.length; k++) {
      // only the joint surfaces that face each other across the joint, so no collar shows round the sides
      const c = J[f][k - 1], ax = J[f][k] ? J[f][k].clone().sub(J[f][k - 1]).normalize() : tip(f).sub(c).normalize();
      const face = (bone, other, sgn) => { const bvh = bvhOf([other]), t = v3([0, 0, 0]);
        return shell(bone, (x, y, z, nx, ny, nz) => { if (c.distanceTo(t.set(x, y, z)) > 1.3) return 0; const facing = sgn * (nx * ax.x + ny * ax.y + nz * ax.z);
          const r = bvh.closestPointToPoint(t, {}); return r ? smoothstep(0.35, 0.65, facing) * (1 - smoothstep(0.3, 0.55, r.distance)) : 0; }, { thick: 0.1, inset: 0.05, smooth: 4, edge: [0.5, 0.9] }); };
      fingerList.push(face(chain[k - 1], chain[k], 1), face(chain[k], chain[k - 1], -1));
    }
  }
  cart.finger_cartilage = ccat(fingerList);
}
for (const [k, g] of Object.entries(cart)) log(k, g.positions.length / 3, 'verts');

// ---------- Ligaments and tendons (modelled) ----------
const sweeps = {};
const allBones = bvhOf(Object.values(bones));
// axis of a finger segment and the side / back directions around it
function frameAt(a, b) {
  const ax = b.clone().sub(a).normalize();
  const side = new THREE.Vector3().crossVectors(ax, PALM).normalize(); // +X-ish = thumb side for a finger pointing up
  const back = new THREE.Vector3().crossVectors(side, ax).normalize().negate(); // away from the palm
  if (back.z > 0) back.negate();
  return { ax, side, back };
}
// collateral ligaments on both sides of each finger's middle (PIP) joint
{
  const list = [];
  for (const f of FINGERS) {
    const [mcp, pip, dip] = J[f]; const { ax, side, back } = frameAt(mcp, dip);
    const bvh = bvhOf([piece[`${f}_0`], piece[`${f}_1`]]);
    for (const s of [-1, 1]) {
      let pts = [pip.clone().addScaledVector(ax, -0.55).addScaledVector(back, 0.18), pip.clone().addScaledVector(back, 0.05), pip.clone().addScaledVector(ax, 0.5).addScaledVector(back, -0.15)]
        .map((p) => p.addScaledVector(side, s * 1.2).toArray());
      pts = hug(pts, 0.09, bvh); pts = hug(relax(pts, 1), 0.09, bvh);
      list.push(sweep({ points: pts, n: 24, m: 16, frame: hintFrame(() => side.clone().multiplyScalar(s).toArray()), profile: (t) => ellipseProfile(mix(0.42, 0.36, t), 0.13, 16, 0, 0.5) }));
    }
  }
  sweeps.finger_collateral_ligaments = mergeSweeps(list, 20);
}
// thumb UCL: index-finger side of the thumb knuckle (MCP), from the metacarpal head to the base of the proximal phalanx
{
  const [mcp, ip] = J.thumb; const { ax } = frameAt(mcp, ip);
  let toIndex = J.index[0].clone().sub(mcp); toIndex.addScaledVector(ax, -toIndex.dot(ax)).normalize();
  const back = new THREE.Vector3().crossVectors(ax, toIndex).normalize(); if (back.z > 0) back.negate();
  const bvh = bvhOf([bones.metacarpal_1, piece.thumb_0]);
  let pts = [mcp.clone().addScaledVector(ax, -0.7).addScaledVector(back, 0.25), mcp.clone().addScaledVector(back, 0.08), mcp.clone().addScaledVector(ax, 0.55).addScaledVector(back, -0.15)].map((p) => p.addScaledVector(toIndex, 1.3).toArray());
  pts = hug(pts, 0.1, bvh); pts = hug(relax(pts, 1), 0.1, bvh);
  sweeps.thumb_ucl = sweep({ points: pts, n: 28, m: 18, frame: hintFrame(() => toIndex.toArray()), profile: (t) => ellipseProfile(mix(0.55, 0.48, t), 0.16, 18, 0, 0.5) });
}
// scapholunate ligament: dorsal band across the scaphoid-lunate gap, with its thinner proximal part
{
  const s = centroid(bones.scaphoid), l = centroid(bones.lunate), jc = joint(bones.lunate, bones.scaphoid);
  const g = s.clone().sub(l).normalize(); const bvh = bvhOf([bones.scaphoid, bones.lunate]);
  const dorsal = (dy) => { let pts = [-0.55, 0, 0.55].map((k) => jc.clone().addScaledVector(g, k).add(v3([0, dy, -1.2])).toArray()); pts = hug(pts, 0.1, bvh); return relax(pts, 1); };
  sweeps.scapholunate_ligament = mergeSweeps([
    sweep({ points: dorsal(0.15), n: 20, m: 16, frame: hintFrame(() => [0, 0, -1]), profile: (t) => ellipseProfile(0.62, 0.24, 16, 0, 0.5) }),
    sweep({ points: hug([-0.5, 0, 0.5].map((k) => jc.clone().addScaledVector(g, k).add(v3([0, -0.9, 0])).toArray()), 0.08, bvh), n: 20, m: 16, frame: hintFrame(() => [0, -1, 0]), profile: () => ellipseProfile(0.5, 0.12, 16, 0, 0.5) }),
  ], 20);
}
// TFCC: a triangular pad on top of the ulnar head, from the edge of the radius to the base of the ulnar styloid
{
  const P = bones.ulna.positions; let top = -1e9; for (let i = 1; i < P.length; i += 3) top = Math.max(top, P[i]);
  const headPts = []; for (let i = 0; i < P.length; i += 3) if (P[i + 1] > top - 1.2) headPts.push(v3([P[i], P[i + 1], P[i + 2]]));
  const hc = headPts.reduce((a, p) => a.add(p), v3([0, 0, 0])).divideScalar(headPts.length);
  const styl = headPts.reduce((a, p) => (p.x < a.x ? p : a), headPts[0]); // little-finger edge
  const rad = bvhOf([bones.radius]).closestPointToPoint(hc, {}).point;
  const y = top + 0.25;
  const pts = [rad.clone().setY(y), hc.clone().setY(y + 0.05), styl.clone().setY(Math.min(y, styl.y + 0.5))].map((p) => p.toArray());
  sweeps.tfcc = sweep({ points: relax(pts, 1), n: 30, m: 22, frame: hintFrame(() => [0, 1, 0]), profile: (t) => ellipseProfile(mix(1.5, 0.7, smoothstep(0.2, 1, t)), mix(0.16, 0.3, t), 22, 0, 0.55) });
  log('tfcc from', rad.toArray().map((v) => v.toFixed(2)), 'to', styl.toArray().map((v) => v.toFixed(2)), 'ulna top', top.toFixed(2));
}
// extensor tendons over the back of each finger: from the PIP joint to the base of the last bone (mallet finger site)
{
  const list = [];
  for (const f of FINGERS) {
    const [mcp, pip, dip] = J[f]; const { back } = frameAt(pip, dip);
    const bvh = bvhOf([piece[`${f}_0`], piece[`${f}_1`], piece[`${f}_2`]]);
    const tp = tip(f);
    let pts = [pip.clone().lerp(mcp, 0.35), pip, pip.clone().lerp(dip, 0.5), dip, dip.clone().lerp(tp, 0.28)].map((p) => p.clone().addScaledVector(back, 1.0).toArray());
    pts = hug(pts, 0.1, bvh); pts = hug(relax(pts, 2), 0.1, bvh);
    list.push(sweep({ points: pts, n: 40, m: 18, frame: hintFrame(() => back.toArray()), profile: (t) => ellipseProfile(mix(0.75, 0.42, smoothstep(0.1, 1, t)), 0.12, 18, 0, 0.6) }));
  }
  sweeps.extensor_tendons = mergeSweeps(list, 20);
}
for (const [id, s] of Object.entries(sweeps)) log(id, s.positions.length / 3, 'verts', s.length.toFixed(2), 'cm');

// ---------- Muscles (scanned, most include their tendons) ----------
const MUSCLES = [
  ['flexor_digitorum_superficialis', ['FJ1475', 'FJ1499'], 'y'], ['flexor_digitorum_profundus', ['FJ1497'], 'y'], ['flexor_pollicis_longus', ['FJ1498'], 'y'],
  ['flexor_carpi_radialis', ['FJ1496'], 'y'], ['flexor_carpi_ulnaris', ['FJ1473', 'FJ1518'], 'y'], ['palmaris_longus', ['FJ1502'], 'y'],
  ['pronator_teres', ['FJ1474', 'FJ1516'], 'y'], ['pronator_quadratus', ['FJ1503'], 'pca'], ['supinator', ['FJ1505'], 'y'],
  ['brachioradialis', ['FJ1487'], 'y'], ['extensor_carpi_radialis', ['FJ1490', 'FJ1489'], 'y'], ['extensor_digitorum', ['FJ1492'], 'y'],
  ['extensor_digiti_minimi', ['FJ1491'], 'y'], ['extensor_carpi_ulnaris', ['FJ1472', 'FJ1517'], 'y'], ['extensor_indicis', ['FJ1493'], 'y'],
  ['thumb_extensors', ['FJ1484', 'FJ1494', 'FJ1495'], 'y'], ['anconeus', ['FJ1485'], 'pca'],
  ['thenar_muscles', ['FJ1483', 'FJ1469', 'FJ1514', 'FJ1501'], 'pca'], ['adductor_pollicis', ['FJ1481', 'FJ1515'], 'pca'],
  ['hypothenar_muscles', ['FJ1466', 'FJ1470', 'FJ1482'], 'pca'], ['interossei', ['FJ1509', 'FJ1511'], 'y'], ['lumbricals', ['FJ1510'], 'y'],
];
const muscles = {};
for (const [id, fjs, kind] of MUSCLES) {
  let g = crop(src(...fjs), Y0, Y1);
  g = loopSubdivide(g); if (g.positions.length / 3 < 1500) g = loopSubdivide(g);
  g = normals(g);
  const small = ['thenar_muscles', 'adductor_pollicis', 'hypothenar_muscles', 'interossei', 'lumbricals', 'pronator_quadratus', 'anconeus'].includes(id);
  muscles[id] = withFibres(g, kind, small ? 0.8 : 1.6);
  log(id, muscles[id].positions.length / 3, 'verts');
}
const soft = {};
{
  let g = normals(loopSubdivide(src('FJ1471'))); soft.flexor_retinaculum = g;
  g = normals(loopSubdivide(crop(src('FJ1476'), Y0, Y1))); soft.interosseous_membrane = g;
}

// ---------- Blood vessels (scanned), grouped by name ----------
const VG = [
  ['radial_artery', (e) => e.system === 'arterial' && /radial artery|radialis indicis|princeps pollicis|carpal branch of right radial/i.test(e.name)],
  ['ulnar_artery', (e) => e.system === 'arterial' && /ulnar artery|carpal branch of ulnar|ulnar recurrent/i.test(e.name)],
  ['forearm_arteries', (e) => e.system === 'arterial' && /interosseous|recurrent|collateral/i.test(e.name)],
  ['hand_arteries', (e) => e.system === 'arterial'],
  ['deep_veins', (e) => e.system === 'venous' && /radial vein|ulnar vein|interosseous/i.test(e.name)],
  ['superficial_veins', (e) => e.system === 'venous'],
];
const vessels = {}, used = new Set();
for (const [id, test] of VG) {
  const list = IDX.filter((e) => !used.has(e.id) && test(e)); list.forEach((e) => used.add(e.id));
  if (!list.length) continue;
  vessels[id] = normals(crop(merge(list.map((e) => { let p = part(e.id); p = loopSubdivide(p); if (p.positions.length / 3 < 1200) p = loopSubdivide(p); return p; })), Y0, Y1));
  log(id, list.length, 'parts', vessels[id].positions.length / 3, 'verts');
}

// ---------- Skin ----------
let skin = largestPiece(cropBy(part('FJ2810'), (x, y, z) => y > Y0 && y < Y1));
skin = normals(loopSubdivide(loopSubdivide(skin)));
{ // outward check against the slab centres along Y
  const P = skin.positions, N = skin.normals, sl = slabs(skin, 1.5); let dot = 0;
  const cy = new Map(); for (const r of sl) cy.set(Math.round(r.c[1] / 1.5), r.c);
  for (let i = 0; i < P.length; i += 3) { const c = cy.get(Math.round(P[i + 1] / 1.5)); if (c) dot += (P[i] - c[0]) * N[i] + (P[i + 2] - c[2]) * N[i + 2]; }
  log('skin outward check', dot.toFixed(0));
  if (dot < 0) { const I = skin.indices; for (let t = 0; t < I.length; t += 3) { const k = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = k; } skin = normals(skin); }
}
{ // the scanned skin is coarse and sits tight on the superficial tendons: lift it 2 mm so nothing pokes through
  const P = skin.positions, N = skin.normals; for (let i = 0; i < P.length; i++) P[i] += N[i] * 0.2; skin = normals(skin);
}
log('skin', skin.positions.length / 3, 'verts');

// the scanned superficial veins poke through the coarse scanned skin in places: tuck them just under it
{
  const sb = bvhOf([skin]), g = vessels.superficial_veins, P = g.positions, t = v3([0, 0, 0]); let moved = 0;
  for (let i = 0; i < P.length; i += 3) { t.set(P[i], P[i + 1], P[i + 2]); const r = sb.closestPointToPoint(t, {}); if (!r || r.distance > 1.2) continue;
    const n = normalAt(sb, r.point); if (t.clone().sub(r.point).dot(n) > -0.2) { const q = r.point.clone().addScaledVector(n, -0.2); P[i] = q.x; P[i + 1] = q.y; P[i + 2] = q.z; moved++; } }
  vessels.superficial_veins = normals(g); log('veins tucked under skin', moved);
}
// ---------- Nerves (modelled: BodyParts3D has no arm nerves) ----------
const muscleBVH = bvhOf(Object.values(muscles));
function along(g, ys, off = [0, 0, 0]) {
  const P = g.positions;
  return ys.map((y) => { for (let w = 0.5; ; w *= 1.6) { let c = [0, 0], k = 0; for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i + 1] - y) < w) { c[0] += P[i]; c[1] += P[i + 2]; k++; } if (k >= 3) return [c[0] / k + off[0], y + off[1], c[1] / k + off[2]]; } });
}
// keep nerves under the skin (at least 0.45 cm deep)
const skinBVH = bvhOf([skin]);
function underSkin(points, depth = 0.45) {
  return points.map((p) => { const v = v3(p), r = skinBVH.closestPointToPoint(v, {}); if (!r) return p; const n = normalAt(skinBVH, r.point);
    return v.clone().sub(r.point).dot(n) > -depth ? r.point.clone().addScaledVector(n, -depth).toArray() : p; });
}
function nerve(points, w0, w1, { m = 12, clear = 0.2 } = {}) {
  const pts = underSkin(clearOf(underSkin(relax(points, 2)), allBones, clear + w0 / 2));
  const len = pts.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]) : 0), 0);
  return sweep({ points: pts, n: Math.max(16, Math.round(len * 3)), m, frame: hintFrame(() => [0, 0, 1]), profile: (t) => ellipseProfile(mix(w0, w1, t) * 1.3, mix(w0, w1, t), m, 0, 0.1) });
}
const nerves = {};
{
  // median: between the two finger flexors in the forearm, under the retinaculum (carpal tunnel), then to the thumb and first three fingers
  const fds = muscles.flexor_digitorum_superficialis, fdp = muscles.flexor_digitorum_profundus;
  const ys = [-19, -15, -11, -7, -4];
  const a = along(fds, ys), b = along(fdp, ys);
  const forearm = a.map((p, i) => [(p[0] + b[i][0]) / 2, p[1], (p[2] + b[i][2]) / 2]);
  const ret = centroid(soft.flexor_retinaculum);
  const tunnel = [[ret.x - 0.1, -1.6, ret.z - 0.75], [ret.x, 0.6, ret.z - 0.9], [ret.x + 0.1, 2.6, ret.z - 0.6]];
  const split = tunnel[2];
  const toFinger = (f, s) => { const [mcp, pip] = J[f]; const { side } = frameAt(mcp, pip); return [mcp.clone().addScaledVector(side, s * 0.55).add(v3([0, -0.6, 0.9])).toArray(), mcp.clone().lerp(pip, 0.6).addScaledVector(side, s * 0.6).add(v3([0, 0, 0.55])).toArray()]; };
  nerves.median_nerve = mergeSweeps([
    nerve([...forearm, ...tunnel], 0.5, 0.42),
    nerve([split, ...toFinger('thumb', -1)], 0.16, 0.09),
    nerve([split, ...toFinger('index', 1)], 0.16, 0.09),
    nerve([split, ...toFinger('middle', 0)], 0.16, 0.09),
    nerve([split, ...toFinger('ring', 1)], 0.14, 0.09),
  ], 0.01);
  // ulnar: beside the ulnar artery, on the thumb side of the pisiform (Guyon canal), to the little and ring fingers
  const ua = IDX.find((e) => /Right ulnar artery/.test(e.name));
  const pis = centroid(bones.pisiform);
  const fu = along(part(ua.id), [-18, -14, -10, -6, -3], [-0.55, 0, -0.15]);
  const guyon = [pis.x + 0.7, pis.y + 0.1, pis.z + 0.35];
  nerves.ulnar_nerve = mergeSweeps([
    nerve([...fu, guyon, [pis.x + 0.5, pis.y + 1.6, pis.z + 0.2]], 0.42, 0.3),
    nerve([[pis.x + 0.5, pis.y + 1.6, pis.z + 0.2], ...toFinger('little', 1)], 0.16, 0.09),
    nerve([[pis.x + 0.5, pis.y + 1.6, pis.z + 0.2], ...toFinger('ring', -1)], 0.14, 0.09),
  ], 0.01);
  // superficial radial nerve: under brachioradialis, then over the thumb side of the wrist to the back of the thumb and index finger
  const br = along(muscles.brachioradialis, [-19, -15, -11], [0.2, 0, -0.4]);
  const rs = bones.radius; const RP = rs.positions; let styl = null; for (let i = 0; i < RP.length; i += 3) if (!styl || RP[i] > styl[0]) styl = [RP[i], RP[i + 1], RP[i + 2]];
  const wristBack = [styl[0] + 0.5, styl[1] + 0.2, styl[2] - 0.9];
  nerves.radial_nerve = mergeSweeps([
    nerve([...br, [styl[0] + 0.6, -6, -0.6], [styl[0] + 0.6, -2.5, -0.9], wristBack], 0.3, 0.22),
    nerve([wristBack, J.thumb[0].clone().add(v3([0.2, -0.4, -0.7])).toArray(), J.thumb[1].clone().add(v3([0.0, -0.3, -0.6])).toArray()], 0.16, 0.1),
    nerve([wristBack, J.index[0].clone().add(v3([0.4, -1.5, -0.8])).toArray(), J.index[0].clone().add(v3([0.4, 0.4, -0.6])).toArray()], 0.16, 0.1),
  ], 0.01);
}
for (const [id, s] of Object.entries(nerves)) log(id, s.positions.length / 3, 'verts', s.length.toFixed(1), 'cm');

// ---------- Write ----------
const meshes = [];
for (const [id, g] of Object.entries(bones)) meshes.push({ id, ...g });
for (const [id, g] of Object.entries(cart)) meshes.push({ id, ...g });
for (const [id, g] of Object.entries(muscles)) meshes.push({ id, ...g });
for (const [id, g] of Object.entries(soft)) meshes.push({ id, ...g });
for (const [id, g] of Object.entries(vessels)) meshes.push({ id, ...g });
for (const [id, s] of Object.entries({ ...sweeps, ...nerves })) meshes.push({ id, positions: s.positions, normals: s.normals, uvs: s.uvs, indices: s.indices });
meshes.push({ id: 'skin', ...skin });
for (const m of meshes) if (!STRUCTURES[m.id]) throw new Error('no structure entry for ' + m.id);
writeAnatomy(meshes, STRUCTURES, OUT, log);

// Builds the right shoulder, upper arm and elbow into public/shoulder/ (same format as public/anatomy/, see build-lib.mjs).
// Scanned parts (BodyParts3D 4.0 via @dagno/anatomy-model, see extract-region.mjs) plus modelled cartilage, labrum,
// shoulder and elbow ligaments, rotator cuff and biceps tendons and the five main arm nerves.
// Frame: cm, origin near the humeral head, +X toward the middle of the body, +Y up, +Z front.
import * as THREE from 'three';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { mix, smoothstep } from './sdf.mjs';
import { loopSubdivide, normals, bvhOf, merge, shell } from './meshops.mjs';
import { v3, sweep, ellipseProfile, lensProfile, hintFrame, hug, normalAt, relax, mergeSweeps, contactShell, withFibres, clearOf, cropBy, largestPiece, writeAnatomy } from './build-lib.mjs';
import { STRUCTURES, fade } from '../src/shoulder-structures.js';

const OUT = path.resolve('public/shoulder');
fs.mkdirSync(OUT, { recursive: true });
const T0 = Date.now(); const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);

const IDX = JSON.parse(fs.readFileSync('data/bodyparts3d/shoulder-extra.json', 'utf8'));
const BIN = zlib.gunzipSync(fs.readFileSync('data/bodyparts3d/shoulder-extra.bin'));
function part(fj) {
  const e = IDX.find((x) => x.id === fj); if (!e) throw new Error('missing ' + fj);
  return { positions: new Float32Array(BIN.buffer.slice(BIN.byteOffset + e.pos, BIN.byteOffset + e.pos + e.vc * 12)),
    indices: new Uint32Array(BIN.buffer.slice(BIN.byteOffset + e.idx, BIN.byteOffset + e.idx + e.ic * 4)) };
}
const byName = (re) => IDX.filter((e) => re.test(e.name)).map((e) => e.id);
const src = (...fjs) => merge(fjs.map(part));
const keep = (g) => cropBy(g, (x, y, z) => fade(x, y, z) > 0.01);
const pts = (g) => { const P = g.positions, o = []; for (let i = 0; i < P.length; i += 3) o.push(v3([P[i], P[i + 1], P[i + 2]])); return o; };
const ext = (g, fn, filter = () => true) => pts(g).filter(filter).reduce((a, p) => (!a || fn(p) > fn(a) ? p : a), null);
const mean = (list) => list.reduce((a, p) => a.add(p), v3([0, 0, 0])).divideScalar(list.length);

// ---------- Bones ----------
const BONES = [
  ['clavicle', byName(/^Right clavicle$/)], ['scapula', byName(/^Right scapula$/)], ['humerus', byName(/^Right humerus$/)],
  ['radius', byName(/^Right radius$/)], ['ulna', byName(/^Right ulna$/)], ['sternum', byName(/^Manubrium$|^Body of sternum$/)],
  ['upper_ribs', byName(/^Right (first|second|third|fourth|fifth|sixth|seventh) (rib|costal cartilage)$/)],
];
const bones = {};
for (const [id, fjs] of BONES) { let g = keep(src(...fjs)); g = loopSubdivide(g); if (g.positions.length / 3 < 20000) g = loopSubdivide(g); bones[id] = normals(g); }
log('bones', Object.values(bones).reduce((a, g) => a + g.positions.length / 3, 0), 'verts');

// ---------- Muscles (scanned, most include their tendons) ----------
const MUSCLES = [
  ['deltoid', ['FJ1467', 'FJ1468', 'FJ1513'], 'pca'], ['supraspinatus', ['FJ1506'], 'pca'], ['infraspinatus', ['FJ1500'], 'pca'],
  ['teres_minor', ['FJ1508'], 'pca'], ['subscapularis', ['FJ1504'], 'pca'], ['teres_major', ['FJ1507'], 'pca'],
  ['biceps_brachii', ['FJ1478', 'FJ1512'], 'y'], ['triceps_brachii', ['FJ1477', 'FJ1479', 'FJ1480'], 'y'], ['brachialis', ['FJ1486'], 'y'],
  ['coracobrachialis', ['FJ1488'], 'y'], ['pectoralis_major', ['FJ1446', 'FJ1447', 'FJ1464'], 'pca'], ['pectoralis_minor', ['FJ1456'], 'pca'],
  ['trapezius', ['FJ1520', 'FJ1521', 'FJ1554'], 'pca'], ['rhomboids', ['FJ1536', 'FJ1537'], 'pca'], ['levator_scapulae', ['FJ1532'], 'pca'],
  ['serratus_anterior', ['FJ1459'], 'pca'], ['brachioradialis', ['FJ1487'], 'y'], ['pronator_teres', ['FJ1474', 'FJ1516'], 'y'],
  ['forearm_flexors', ['FJ1473', 'FJ1518', 'FJ1496', 'FJ1499', 'FJ1502'], 'y'], ['forearm_extensors', ['FJ1489', 'FJ1490', 'FJ1472', 'FJ1491', 'FJ1484'], 'y'],
  ['supinator', ['FJ1505'], 'pca'], ['anconeus', ['FJ1485'], 'pca'],
];
const muscles = {};
for (const [id, fjs, kind] of MUSCLES) {
  let g = keep(src(...fjs));
  g = loopSubdivide(g); if (g.positions.length / 3 < 3000) g = loopSubdivide(g);
  muscles[id] = withFibres(normals(g), kind, ['supinator', 'anconeus', 'teres_minor'].includes(id) ? 1 : 2);
  log(id, muscles[id].positions.length / 3, 'verts');
}
const soft = { interosseous_membrane: normals(loopSubdivide(keep(src('FJ1476')))) };

// ---------- Blood vessels (scanned), grouped by name ----------
const VG = [
  ['main_arteries', (e) => e.system === 'arterial' && /subclavian artery|axillary artery|brachial artery$|^Right brachial artery/i.test(e.name)],
  ['shoulder_arteries', (e) => e.system === 'arterial' && /circumflex|thoraco-acromial|subscapular|suprascapular|thoracodorsal|scapular|thoracic|cervical/i.test(e.name)],
  ['elbow_arteries', (e) => e.system === 'arterial'],
  ['superficial_veins', (e) => e.system === 'venous' && /cephalic|basilic|cubital|antebrachial/i.test(e.name)],
  ['deep_veins', (e) => e.system === 'venous'],
];
const vessels = {}, used = new Set();
for (const [id, test] of VG) {
  const list = IDX.filter((e) => !used.has(e.id) && test(e)); list.forEach((e) => used.add(e.id));
  if (!list.length) continue;
  vessels[id] = normals(keep(merge(list.map((e) => { let p = part(e.id); p = loopSubdivide(p); if (p.positions.length / 3 < 1200) p = loopSubdivide(p); return p; }))));
  log(id, list.length, 'parts', vessels[id].positions.length / 3, 'verts');
}

// ---------- Skin ----------
let skin = largestPiece(keep(part('FJ2810')));
skin = normals(loopSubdivide(loopSubdivide(skin)));
{ // outward check: normals should point away from the arm axis / chest centre on average
  const P = skin.positions, N = skin.normals; let dot = 0; const c = mean(pts(skin));
  for (let i = 0; i < P.length; i += 3) dot += (P[i] - c.x) * N[i] + (P[i + 1] - c.y) * N[i + 1] + (P[i + 2] - c.z) * N[i + 2];
  log('skin outward check', dot.toFixed(0));
  if (dot < 0) { const I = skin.indices; for (let t = 0; t < I.length; t += 3) { const k = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = k; } skin = normals(skin); }
  for (let i = 0; i < P.length; i++) skin.positions[i] += skin.normals[i] * 0.25; skin = normals(skin);
}
log('skin', skin.positions.length / 3, 'verts');

export { bones, muscles, soft, vessels, skin, pts, ext, mean };
if (process.env.PROBE) { const { probe } = await import(process.env.PROBE); probe({ bones, muscles, vessels, skin, pts, ext, mean }); process.exit(0); }


// ---------- Landmarks ----------
const D = Math.PI / 180;
const fv = (p) => p.toArray().map((v) => v.toFixed(1)).join(',');
const B = Object.fromEntries(Object.entries(bones).map(([k, g]) => [k, bvhOf([g])]));
const near = (bvh, p) => bvh.closestPointToPoint(p, {});
// humeral head: sphere fit to the top 5 cm of the humerus
const HP = pts(bones.humerus), hTop = Math.max(...HP.map((p) => p.y));
let HC, HR;
{
  const hp = HP.filter((p) => p.y > hTop - 5); let c = mean(hp);
  for (let it = 0; it < 300; it++) { const r = hp.reduce((a, p) => a + p.distanceTo(c), 0) / hp.length; const g = v3([0, 0, 0]); for (const p of hp) { const d = p.distanceTo(c); g.addScaledVector(c.clone().sub(p), (d - r) / d / hp.length); } c = c.sub(g.multiplyScalar(0.5)); }
  HC = c; HR = hp.reduce((a, p) => a + p.distanceTo(c), 0) / hp.length;
}
const GC = mean(pts(bones.scapula).filter((p) => p.y < HC.y + 1.6 && near(B.humerus, p).distance < 0.45));
const CUP = GC.clone().sub(HC).normalize(); // from the head centre into the socket
const AT = ext(bones.scapula, (p) => -p.x, (p) => p.y > HC.y + 1.5); // acromion tip
const CL = ext(bones.clavicle, (p) => -p.x); // lateral end of the collarbone
const ACJ = CL.clone().lerp(near(B.scapula, CL).point, 0.5);
const CT = ext(bones.scapula, (p) => p.z); // coracoid tip
const GT = ext(bones.humerus, (p) => -p.x + 0.6 * p.y, (p) => p.y > HC.y - 3.5 && p.distanceTo(HC) > HR + 0.25); // greater tuberosity
const low = (p) => p.y < -21;
const LE = ext(bones.humerus, (p) => -p.x, low), ME = ext(bones.humerus, (p) => p.x, low);
const RH = ext(bones.radius, (p) => p.y), OL = ext(bones.ulna, (p) => p.y);
const RT = ext(bones.radius, (p) => p.x + 0.7 * p.z, (p) => p.y < RH.y - 2 && p.y > RH.y - 4.5); // radial tuberosity
const SUB = ext(bones.ulna, (p) => p.x, (p) => p.y < RH.y - 0.5 && p.y > RH.y - 3); // sublime tubercle (inner side of the coronoid)
log('landmarks: head', fv(HC), 'r', HR.toFixed(2), 'glenoid', fv(GC), 'acromion', fv(AT), 'AC', fv(ACJ), 'coracoid', fv(CT), 'GT', fv(GT));
log('elbow: lat epi', fv(LE), 'med epi', fv(ME), 'radial head', fv(RH), 'olecranon', fv(OL), 'radial tub', fv(RT), 'sublime', fv(SUB));
const UP = v3([0, 1, 0]), FRONT = v3([0, 0, 1]);

const sweeps = {};
let A, RIM, E1, E2;
{ // glenoid labrum: a ring on the socket rim, found by casting rays out from the head centre
  const ref = Math.abs(CUP.y) < 0.9 ? UP : v3([1, 0, 0]);
  const e1 = new THREE.Vector3().crossVectors(CUP, ref).normalize(), e2 = new THREE.Vector3().crossVectors(CUP, e1).normalize();
  const ray = new THREE.Ray(), N = 48, rim = []; E1 = e1; E2 = e2;
  for (let k = 0; k < N; k++) {
    const side = e1.clone().multiplyScalar(Math.cos((k / N) * Math.PI * 2)).addScaledVector(e2, Math.sin((k / N) * Math.PI * 2));
    let last = 8;
    for (let a = 8; a <= 80; a += 1) {
      ray.origin.copy(HC); ray.direction.copy(CUP.clone().multiplyScalar(Math.cos(a * D)).addScaledVector(side, Math.sin(a * D)).normalize());
      const h = B.scapula.raycastFirst(ray, THREE.DoubleSide);
      if (h && h.distance < HR + 1.1) last = a; else if (a - last > 4) break;
    }
    rim.push({ a: last, side });
  }
  A = rim.map((r) => r.a); for (let it = 0; it < 4; it++) for (let k = 0; k < N; k++) A[k] = 0.25 * A[(k + N - 1) % N] + 0.5 * A[k] + 0.25 * A[(k + 1) % N];
  log('labrum rim angle', Math.min(...A).toFixed(0), '-', Math.max(...A).toFixed(0), 'deg');
  const ring = rim.map((r, k) => { const a = (A[k] + 2) * D; return HC.clone().addScaledVector(CUP.clone().multiplyScalar(Math.cos(a)).addScaledVector(r.side, Math.sin(a)).normalize(), HR + 0.3).toArray(); });
  sweeps.glenoid_labrum = sweep({ points: ring, n: 140, m: 18, closedCurve: true, caps: false, frame: hintFrame((t, p) => HC.clone().sub(v3(p)).toArray()),
    profile: () => { const out = []; const m = 18; for (let j = 0; j < m; j++) { const a = (j / m) * Math.PI * 2; const c = Math.cos(a), s = Math.sin(a); out.push([0.44 * c * (s > 0 ? 1 - 0.55 * s : 1), 0.36 * s + 0.06]); } return out; } });
}
// rim angle (degrees from the socket centre) in a given direction
const rimAngle = (d) => { const phi = Math.atan2(d.dot(E2), d.dot(E1)); const k = ((phi / (Math.PI * 2)) * 48 + 48) % 48, k0 = Math.floor(k) % 48, f = k - Math.floor(k); return A[k0] * (1 - f) + A[(k0 + 1) % 48] * f; };
// ---------- Cartilage (modelled) ----------
const ss = smoothstep;
const cart = {};
{
  const head = shell(bones.humerus, (x, y, z, nx, ny, nz) => {
    const d = v3([x, y, z]).sub(HC), r = d.length(); d.divideScalar(r);
    return (1 - ss(HR + 0.3, HR + 0.55, r)) * ss(0.7, 0.85, d.x * nx + d.y * ny + d.z * nz) * ss(-0.15, 0.1, d.dot(CUP) + 0.25 * d.y);
  }, { thick: 0.18, inset: 0.08, smooth: 10, edge: [0.5, 0.9] });
  const glen = shell(bones.scapula, (x, y, z, nx, ny, nz) => {
    const d = v3([x, y, z]).sub(HC), r = d.length(); d.divideScalar(r);
    const ang = Math.acos(Math.min(1, d.dot(CUP))) / D;
    return (1 - ss(HR + 0.6, HR + 0.9, r)) * ss(0.4, 0.6, -(d.x * nx + d.y * ny + d.z * nz)) * (1 - ss(rimAngle(d) - 3, rimAngle(d) - 1, ang));
  }, { thick: 0.16, inset: 0.08, smooth: 8, edge: [0.5, 0.9] });
  cart.shoulder_cartilage = normals(merge([head, glen]));
  // elbow: only the joint surfaces that face the neighbouring bone across the joint
  const facing = (bone, others, maxD, region) => { const bvh = bvhOf(others), t = v3([0, 0, 0]);
    return shell(bone, (x, y, z, nx, ny, nz) => { if (region && !region(x, y, z, nx, ny, nz)) return 0; const r = bvh.closestPointToPoint(t.set(x, y, z), {}); if (!r) return 0;
      const d = r.point.clone().sub(t); const L = d.length() || 1; return (1 - ss(maxD * 0.6, maxD, L)) * ss(0.25, 0.55, (d.x * nx + d.y * ny + d.z * nz) / L); }, { thick: 0.15, inset: 0.07, smooth: 8, edge: [0.5, 0.9] }); };
  cart.elbow_cartilage = normals(merge([
    shell(bones.humerus, (x, y, z, nx, ny, nz) => (y < LE.y + 1.2 && x > LE.x + 0.7 && x < ME.x - 1.1 ? 1 : 0) * ss(-0.1, 0.3, -ny + 0.6 * nz) * (1 - ss(-0.2, 0.4, -nz - 0.2 + ny * 0)) , { thick: 0.15, inset: 0.07, smooth: 8, edge: [0.5, 0.9] }),
    facing(bones.ulna, [bones.humerus], 1.4, (x, y) => y > RH.y - 2.5),
    facing(bones.radius, [bones.humerus, bones.ulna], 1.4, (x, y) => y > RH.y - 1.2),
  ]));
}
for (const [k, g] of Object.entries(cart)) log(k, g.positions.length / 3, 'verts');

// ---------- Ligaments, tendons (modelled) ----------
const band = (points, w, h, hint, bvh, off = 0.12, n = 32) => {
  let p = points.map((q) => (q.toArray ? q.toArray() : q)); if (bvh) { p = hug(p, off, bvh); p = hug(relax(p, 1), off, bvh); }
  return sweep({ points: p, n, m: 16, frame: hintFrame(typeof hint === 'function' ? hint : () => hint.toArray()), profile: (t) => lensProfile(typeof w === 'function' ? w(t) : w, h * (0.7 + 0.3 * Math.sin(Math.PI * t)), 16) });
};
{ // AC joint: a short band over the top of the joint
  const ax = CL.clone().sub(ext(bones.clavicle, (p) => p.x)).normalize(); // along the collarbone, outward
  const bvh = bvhOf([bones.clavicle, bones.scapula]);
  sweeps.ac_ligament = band([ACJ.clone().addScaledVector(ax, -1.3).add(v3([0, 0.9, 0])), ACJ.clone().add(v3([0, 0.9, 0])), ACJ.clone().addScaledVector(ax, 1.2).add(v3([0, 0.9, 0]))], 1.3, 0.28, UP, bvh, 0.1, 24);
  // coracoclavicular ligaments: trapezoid (outer) and conoid (inner) from the coracoid up to the underside of the collarbone
  const cc = [2.2, 3.6].map((k) => { const top = ext(bones.clavicle, (p) => -p.y, (p) => Math.abs(p.x - (CL.x + k)) < 0.4); const bot = ext(bones.scapula, (p) => -p.distanceTo(top), (p) => p.z > 0.3 && p.y < top.y - 0.8); return [bot, top]; });
  const bvh2 = bvhOf([bones.clavicle, bones.scapula]);
  sweeps.coracoclavicular_ligaments = mergeSweeps(cc.map(([b, t], i) => sweep({ points: relax([b.clone().add(v3([0, 0.15, 0])).toArray(), b.clone().lerp(t, 0.5).toArray(), t.clone().add(v3([0, -0.15, 0])).toArray()], 1), n: 20, m: 16, frame: hintFrame(() => [1, 0, 0]), profile: (t) => ellipseProfile(mix(1.0, i ? 0.8 : 1.1, t), 0.38, 16, 0, 0.4) })), 20);
  log('CC ligament ends', cc.map(([b, t]) => fv(b) + ' -> ' + fv(t)).join(' | '));
  // coracoacromial ligament: a flat band from the coracoid to the acromion, the roof over the rotator cuff
  sweeps.coracoacromial_ligament = band([CT.clone().add(v3([0, 0.3, -0.6])), CT.clone().lerp(AT, 0.5).add(v3([0, 0.6, 0])), AT.clone().add(v3([0.4, -0.2, 0.6]))], (t) => mix(1.4, 1.0, t), 0.22, UP, bvhOf([bones.scapula]), 0.08, 28);
}
{ // rotator cuff (supraspinatus) tendon: over the top of the head, under the acromion, to the greater tuberosity
  const dir = (p) => p.clone().sub(HC).normalize();
  const d0 = UP.clone().addScaledVector(CUP, 0.9).normalize(), d1 = dir(GT);
  const path = []; for (let k = 0; k <= 8; k++) { const d = d0.clone().lerp(d1, k / 8).normalize(); path.push(HC.clone().addScaledVector(d, HR + 0.4)); }
  const bvh = bvhOf([bones.humerus, cart.shoulder_cartilage]);
  let p = hug(path.map((q) => q.toArray()), 0.3, bvh); p = hug(relax(p, 2), 0.3, bvh);
  sweeps.rotator_cuff_tendon = sweep({ points: p, n: 48, m: 18, frame: hintFrame((t, q) => v3(q).sub(HC).toArray()), profile: (t) => lensProfile(mix(1.8, 2.5, ss(0, 0.8, t)), 0.45, 18) });
}
{ // long head of biceps tendon: from the top of the socket, over the front of the head, down the groove
  const top = HC.clone().addScaledVector(CUP, HR * 0.95).add(v3([0, HR * 0.55, 0]));
  const over = HC.clone().add(v3([-0.6, HR * 0.75, HR * 0.75]));
  const groove = [-3, -5.5, -8, -10.5].map((dy) => { const y = HC.y + dy; return ext(bones.humerus, (p) => p.z - 0.3 * Math.abs(p.x - (HC.x - 1.2)), (p) => Math.abs(p.y - y) < 0.35); });
  const bvh = bvhOf([bones.humerus, bones.scapula, cart.shoulder_cartilage]);
  let p = [top, over, ...groove].map((q) => q.toArray()); p = hug(relax(p, 1), 0.3, bvh); p = hug(relax(p, 2), 0.3, bvh);
  sweeps.biceps_tendon_long_head = sweep({ points: p, n: 56, m: 16, frame: hintFrame(() => [0, 0, 1]), profile: (t) => ellipseProfile(mix(0.55, 0.7, t), 0.32, 16, 0, 0.3) });
}
const shaftAt = (y) => { const L = pts(bones.humerus).filter((p) => Math.abs(p.y - y) < 0.5); return mean(L); };
{ // distal biceps tendon: from the front of the elbow down to the radial tuberosity
  const start = v3([mix(LE.x, ME.x, 0.55), LE.y + 1.8, 0]); start.z = shaftAt(start.y).z + 2.2;
  const mid = v3([mix(LE.x, ME.x, 0.5), RH.y + 0.3, RH.z + 1.1]);
  sweeps.distal_biceps_tendon = sweep({ points: relax([start.toArray(), mid.toArray(), RT.clone().add(v3([0.15, 0, 0.05])).toArray()], 1), n: 30, m: 16, frame: hintFrame(() => [0, 0, 1]), profile: (t) => ellipseProfile(mix(0.7, 0.5, t), 0.34, 16, 0, 0.3) });
}
{ // common extensor tendon (tennis elbow) and common flexor tendon (golfer's elbow)
  const fdir = v3([-0.25, -1, 0.1]).normalize();
  const ce = [LE.clone().add(v3([0.3, 0.1, 0.9])), LE.clone().addScaledVector(fdir, 1.6).add(v3([-0.2, 0, 0.5])), LE.clone().addScaledVector(fdir, 2.8).add(v3([-0.3, 0, 0.7]))];
  sweeps.common_extensor_tendon = band(ce, (t) => mix(0.8, 1.2, t), 0.3, (t, q) => v3(q).sub(v3([mix(LE.x, ME.x, 0.5), q[1], 0])).toArray(), bvhOf([bones.humerus, bones.radius]), 0.15, 24);
  const fdir2 = v3([0.15, -1, 0.25]).normalize();
  const cf = [ME.clone().add(v3([-0.1, 0.2, 0.3])), ME.clone().addScaledVector(fdir2, 1.6).add(v3([0.1, 0, 0.5])), ME.clone().addScaledVector(fdir2, 2.8).add(v3([0, 0, 0.8]))];
  sweeps.common_flexor_tendon = band(cf, (t) => mix(0.8, 1.2, t), 0.3, (t, q) => v3(q).sub(v3([mix(LE.x, ME.x, 0.5), q[1], 0])).toArray(), bvhOf([bones.humerus, bones.ulna]), 0.15, 24);
}
{ // elbow ligaments
  const bvh = bvhOf([bones.humerus, bones.ulna, bones.radius, cart.elbow_cartilage]);
  // ulnar collateral ligament (inner side): from under the medial epicondyle to the sublime tubercle of the ulna
  sweeps.elbow_ucl = band([ME.clone().add(v3([0.1, -0.6, 0.2])), ME.clone().lerp(SUB, 0.5).add(v3([0.4, 0, 0])), SUB.clone().add(v3([0.1, 0, 0]))], (t) => mix(0.9, 1.3, t), 0.3, v3([1, 0, 0]), bvh, 0.12, 24);
  // radial collateral ligament (outer side): from the lateral epicondyle down to the ring ligament
  const rhC = mean(pts(bones.radius).filter((p) => p.y > RH.y - 1.6 && p.y < RH.y - 0.6));
  const ringR = pts(bones.radius).filter((p) => Math.abs(p.y - (RH.y - 1.0)) < 0.25).reduce((a, p) => a + Math.hypot(p.x - rhC.x, p.z - rhC.z), 0) / pts(bones.radius).filter((p) => Math.abs(p.y - (RH.y - 1.0)) < 0.25).length;
  sweeps.elbow_lcl = band([LE.clone().add(v3([-0.1, -0.5, 0.1])), v3([rhC.x - ringR - 0.35, RH.y + 0.1, rhC.z]), v3([rhC.x - ringR - 0.3, RH.y - 0.9, rhC.z])], (t) => mix(0.8, 1.1, t), 0.28, v3([-1, 0, 0]), bvh, 0.12, 24);
  // annular (ring) ligament round the neck of the radius, open on the ulna side where it is attached
  const ring = []; for (let k = 0; k <= 28; k++) { const a = (-150 + (300 * k) / 28) * D; ring.push([rhC.x - Math.cos(a) * (ringR + 0.22), RH.y - 1.0, rhC.z + Math.sin(a) * (ringR + 0.22)]); }
  sweeps.annular_ligament = sweep({ points: ring, n: 60, m: 16, frame: hintFrame(() => [0, 1, 0]), profile: () => ellipseProfile(0.95, 0.2, 16, Math.PI / 2, 0.5) });
  log('radial head centre', fv(rhC), 'ring r', ringR.toFixed(2));
}
for (const [id, g] of Object.entries(sweeps)) log(id, g.positions.length / 3, 'verts', g.length?.toFixed(1), 'cm');

// ---------- Nerves (modelled: BodyParts3D has no arm nerves) ----------
const allBones = bvhOf(Object.values(bones));
const skinBVH = bvhOf([skin]);
function underSkin(points, depth = 0.6) {
  return points.map((p) => { const v = v3(p), r = skinBVH.closestPointToPoint(v, {}); if (!r) return p; const n = normalAt(skinBVH, r.point);
    return v.clone().sub(r.point).dot(n) > -depth ? r.point.clone().addScaledVector(n, -depth).toArray() : p; });
}
function nerve(points, w0, w1, { m = 12, clear = 0.25 } = {}) {
  const P0 = points.map((q) => (q.toArray ? q.toArray() : q));
  const pts2 = underSkin(clearOf(underSkin(relax(P0, 2)), allBones, clear + w0 / 2));
  const len = pts2.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - pts2[i - 1][0], p[1] - pts2[i - 1][1], p[2] - pts2[i - 1][2]) : 0), 0);
  return sweep({ points: pts2, n: Math.max(16, Math.round(len * 2.5)), m, frame: hintFrame(() => [0, 0, 1]), profile: (t) => ellipseProfile(mix(w0, w1, t) * 1.25, mix(w0, w1, t), m, 0, 0.1) });
}
// centre of a mesh's vertices in a thin slab at height y
function along(g, ys, off = [0, 0, 0]) {
  const P = g.positions;
  return ys.map((y) => { for (let w = 0.5; w < 20; w *= 1.6) { let c = [0, 0, 0], k = 0; for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i + 1] - y) < w) { c[0] += P[i]; c[2] += P[i + 2]; k++; } if (k >= 3) return v3([c[0] / k + off[0], y + off[1], c[2] / k + off[2]]); } return null; });
}
// humerus shaft centre at height y
const shaft = (y) => along(bones.humerus, [y])[0];
const nerves = {};
{
  const ART = merge(byName(/^Right brachial artery$/).map(part));
  // brachial artery line down the inner side of the arm (only below the armpit, where it is a single vessel)
  const art = along(ART, [-6, -10, -14, -18, -21]);
  log('brachial artery line', art.map(fv).join(' | '));
  const ax = v3([HC.x + 3.2, HC.y - 3, HC.z + 0.8]); // the armpit, below and in front of the shoulder joint
  // median nerve: beside the brachial artery, then in front of the elbow on the inner side of the biceps tendon
  nerves.median_nerve = nerve([ax.clone().add(v3([0.6, 1.5, 0.6])), ax, ...art.map((p) => p.clone().add(v3([0.5, 0, 0.3]))), v3([mix(LE.x, ME.x, 0.72), ME.y - 0.5, ME.z + 2.2]), v3([mix(LE.x, ME.x, 0.7), RH.y - 3.5, RH.z + 2.2]), v3([mix(LE.x, ME.x, 0.62), -36, 1.8])], 0.5, 0.42);
  // ulnar nerve: down the inner side of the arm, behind the medial epicondyle (funny bone), into the forearm
  const sh = (y) => shaft(y);
  nerves.ulnar_nerve = nerve([ax.clone().add(v3([0.4, 1.5, 0.2])), ax.clone().add(v3([0.2, 0, -0.6])), ...[-9, -14, -19].map((y) => sh(y).add(v3([2.4, 0, -0.8]))), ME.clone().add(v3([0.25, 1.6, -1.1])), ME.clone().add(v3([0.05, 0, -1.05])), ME.clone().add(v3([-0.4, -2.0, -0.6])), v3([ME.x - 1.4, -36, 0.2])], 0.45, 0.38);
  // radial nerve: winds round the back of the humerus in the spiral groove, then to the front of the lateral epicondyle
  const spiral = [];
  for (let k = 0; k <= 8; k++) { const y = -7 - k * 1.6, c = sh(y), a = (40 + k * 19) * D; spiral.push(c.clone().add(v3([Math.cos(a) * 1.75, 0, -Math.sin(a) * 1.75]))); }
  nerves.radial_nerve = nerve([ax.clone().add(v3([0.2, 1.2, 0])), ax.clone().add(v3([-0.2, -1.5, -0.6])), ...spiral, v3([LE.x - 0.2, LE.y + 3.5, LE.z + 2.0]), v3([LE.x + 0.3, LE.y + 0.5, LE.z + 2.4]), v3([LE.x + 0.4, RH.y - 2, RH.z + 1.6]), v3([LE.x - 0.4, -36, 1.4])], 0.5, 0.36);
  // axillary nerve: from the armpit backward under the shoulder joint and round the neck of the humerus to the deltoid
  const neckY = HC.y - 4.8, nc = sh(neckY), wrap = [];
  for (let k = 0; k <= 7; k++) { const a = (-40 + k * 30) * D; wrap.push(nc.clone().add(v3([Math.cos(a) * 2.0 * (a < 0 ? 1 : 1), 0, -Math.sin(a) * 2.0]))); }
  nerves.axillary_nerve = nerve([ax.clone().add(v3([0.2, 1.0, 0.2])), ax.clone().add(v3([-0.4, -0.8, -0.8])), ...wrap.slice(1), wrap[7].clone().add(v3([-0.8, 0.5, 1.2]))], 0.34, 0.24);
  // musculocutaneous nerve: through coracobrachialis, between biceps and brachialis, out on the outer side of the elbow
  const bic = along(muscles.biceps_brachii, [-9, -14, -19], [0, 0, -1.3]);
  nerves.musculocutaneous_nerve = nerve([ax.clone().add(v3([0, 1.2, 0.8])), ax.clone().add(v3([-1.5, -2.5, 1.2])), ...bic, v3([mix(LE.x, ME.x, 0.25), LE.y + 1.5, LE.z + 2.4]), v3([LE.x, -33, 2.0])], 0.34, 0.24);
}
for (const [id, s] of Object.entries(nerves)) log(id, s.positions.length / 3, 'verts', s.length.toFixed(1), 'cm');

// ---------- Write ----------
if (process.env.NOWRITE) process.exit(0);
const meshes = [];
for (const [id, g] of Object.entries({ ...bones, ...muscles, ...soft, ...vessels })) meshes.push({ id, ...g });
for (const [id, g] of Object.entries(cart)) meshes.push({ id, ...g });
for (const [id, g] of Object.entries({ ...sweeps, ...nerves })) meshes.push({ id, positions: g.positions, normals: g.normals, uvs: g.uvs, indices: g.indices });
meshes.push({ id: 'skin', ...skin });
for (const m of meshes) if (!STRUCTURES[m.id]) throw new Error('no structure entry for ' + m.id);
writeAnatomy(meshes, STRUCTURES, OUT, log);

// Builds the skull, face and jaw into public/head/ (same format as public/anatomy/, see build-lib.mjs).
// Scanned parts (BodyParts3D 4.0 via @dagno/anatomy-model, region "head" of extract-region.mjs) plus modelled jaw joint discs.
// Frame: cm, origin near the middle of the skull, +X toward the body's left, +Y up, +Z front.
import * as THREE from 'three';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { loopSubdivide, normals, bvhOf, merge } from './meshops.mjs';
import { v3, sweep, ellipseProfile, hintFrame, withFibres, cropBy, largestPiece, writeAnatomy } from './build-lib.mjs';
import { STRUCTURES, fade } from '../src/head-structures.js';

const OUT = path.resolve('public/head');
fs.mkdirSync(OUT, { recursive: true });
const T0 = Date.now(); const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);
const IDX = JSON.parse(fs.readFileSync('data/bodyparts3d/head-extra.json', 'utf8'));
const BIN = zlib.gunzipSync(fs.readFileSync('data/bodyparts3d/head-extra.bin'));
function part(fj) {
  const e = IDX.find((x) => x.id === fj);
  return { positions: new Float32Array(BIN.buffer.slice(BIN.byteOffset + e.pos, BIN.byteOffset + e.pos + e.vc * 12)),
    indices: new Uint32Array(BIN.buffer.slice(BIN.byteOffset + e.idx, BIN.byteOffset + e.idx + e.ic * 4)) };
}
const used = new Set();
const pick = (test) => { const l = IDX.filter((e) => !used.has(e.id) && test(e)); l.forEach((e) => used.add(e.id)); if (!l.length) throw new Error('nothing for ' + test); return l.map((e) => e.id); };
const byName = (re, sys) => pick((e) => re.test(e.name) && (!sys || e.system === sys));
const keep = (g) => cropBy(g, (x, y, z) => fade(x, y, z) > 0.01);
const smooth = (ids, target, each = false) => {
  let g = each ? merge(ids.map((id) => { let p = part(id); if (p.positions.length / 3 < 500 || target) p = loopSubdivide(p); return p; })) : merge(ids.map(part));
  if (!each) { g = loopSubdivide(g); if (g.positions.length / 3 < target) g = loopSubdivide(g); }
  return normals(keep(g));
};
const pts = (g) => { const P = g.positions, o = []; for (let i = 0; i < P.length; i += 3) o.push(v3([P[i], P[i + 1], P[i + 2]])); return o; };
const fv = (p) => p.toArray().map((v) => v.toFixed(1)).join(',');

// ---------- Bones ----------
const BONES = [
  ['frontal_bone', /^Frontal bone$/], ['right_parietal_bone', /^Right parietal bone$/], ['left_parietal_bone', /^Left parietal bone$/],
  ['right_temporal_bone', /^Right temporal bone$/], ['left_temporal_bone', /^Left temporal bone$/], ['occipital_bone', /^Occipital bone$/],
  ['sphenoid_bone', /^Sphenoid bone$/], ['ethmoid_bone', /^Ethmoid$/], ['nasal_bones', /nasal bone$/], ['maxilla', /maxilla$/],
  ['right_zygomatic_bone', /^Right zygomatic bone$/], ['left_zygomatic_bone', /^Left zygomatic bone$/], ['palatine_bones', /palatine bone$/],
  ['vomer', /^Vomer$/], ['lacrimal_bones', /lacrimal bone$/], ['mandible', /^Mandible$/], ['upper_teeth', /upper .*tooth$/], ['lower_teeth', /lower .*tooth$/],
  ['hyoid', /^Hyoid bone$/], ['c1', /^Atlas$/], ['c2', /^Axis$/],
];
const bones = {};
for (const [id, re] of BONES) bones[id] = smooth(byName(re), id.endsWith('teeth') ? 0 : 6000, id.endsWith('teeth'));
log('bones', Object.values(bones).reduce((a, g) => a + g.positions.length / 3, 0), 'verts');

// ---------- Jaw joint discs (modelled): a small pad on top of each mandibular condyle ----------
const sweeps = {};
for (const [id, s] of [['right_tmj_disc', -1], ['left_tmj_disc', 1]]) {
  const P = pts(bones.mandible).filter((p) => Math.sign(p.x) === s && p.z < 1.5);
  const top = P.reduce((a, p) => (p.y > a.y ? p : a));
  const near = P.filter((p) => p.distanceTo(top) < 0.9); const c = near.reduce((a, p) => a.add(p), v3([0, 0, 0])).divideScalar(near.length);
  const cen = v3([c.x, top.y + 0.2, c.z + 0.1]);
  const ring = []; for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; ring.push([cen.x + Math.sin(a) * 0.55, cen.y, cen.z + Math.cos(a) * 0.4]); }
  sweeps[id] = sweep({ points: ring, n: 60, m: 16, closedCurve: true, caps: false, frame: hintFrame(() => [0, 1, 0]), profile: () => ellipseProfile(0.7, 0.22, 16, 0, 0.5) });
  log(id, 'condyle top', fv(top), 'disc centre', fv(cen));
}

// ---------- Brain, eyes, nerves, arteries ----------
const soft = {};
soft.brain = normals(keep(merge(byName(/gyrus|lobe|Cerebellum|^Pons$|Medulla oblongata|^Midbrain$|Peduncle|insula/i, 'nervous').map(part))));
soft.eye_nerves = smooth(byName(/nerve|ganglion|Optic chiasm|optic tract/i, 'nervous'), 0, true);
soft.eyes = normals(merge(byName(/sclera|cornea|iris|^Left lens$|^Right lens$/).map((id) => loopSubdivide(part(id)))));
soft.brain_arteries = normals(keep(merge(pick((e) => e.system === 'arterial' || e.system === 'venous').map((id) => { let p = part(id); if (p.positions.length / 3 < 400) p = loopSubdivide(p); return p; }))));
for (const [k, g] of Object.entries(soft)) log(k, g.positions.length / 3, 'verts');

// ---------- Muscles ----------
const MUSCLES = [
  ['eye_muscles', /rectus$|oblique$|levator palpebrae/i], ['sternocleidomastoid', /sternocleidomastoid/i],
  ['suboccipital_muscles', /rectus capitis posterior|obliquus capitis|semispinalis capitis|longissimus capitis|rotator|interspinal|intertransvers|splenius/i],
  ['prevertebral_muscles', /longus capitis|rectus capitis (anterior|lateralis)|longus colli/i],
  ['suprahyoid_muscles', /digastric|mylohyoid|geniohyoid|stylohyoid/i], ['tongue_muscles', /glossus/i], ['soft_palate_muscles', /veli palatini|uvular/i],
];
const muscles = {};
for (const [id, re] of MUSCLES) {
  const list = byName(re, 'muscular');
  const g = normals(keep(merge(list.map((m) => { let p = part(m); if (p.positions.length / 3 < 1500) p = loopSubdivide(p); return p; }))));
  muscles[id] = withFibres(g, id === 'eye_muscles' ? 'pca' : 'y', id === 'eye_muscles' ? 0.5 : 1);
  log(id, list.length, 'parts', muscles[id].positions.length / 3, 'verts');
}
log('unused muscles', IDX.filter((e) => e.system === 'muscular' && !used.has(e.id)).map((e) => e.name).join(', '));

// ---------- Skin and ears ----------
let skin = largestPiece(keep(part(IDX.find((e) => e.name === 'Skin').id)));
skin = normals(loopSubdivide(loopSubdivide(skin)));
{
  const P = skin.positions, N = skin.normals; let dot = 0;
  for (let i = 0; i < P.length; i += 3) dot += P[i] * N[i] + (P[i + 1] - 2) * N[i + 1] + P[i + 2] * N[i + 2];
  log('skin outward check', dot.toFixed(0));
  if (dot < 0) { const I = skin.indices; for (let t = 0; t < I.length; t += 3) { const k = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = k; } skin = normals(skin); }
  for (let i = 0; i < P.length; i++) skin.positions[i] += skin.normals[i] * 0.15; skin = normals(skin);
}
skin = normals(merge([skin, normals(loopSubdivide(part(IDX.find((e) => e.name === 'External ear').id)))]));
log('skin', skin.positions.length / 3, 'verts');
if (process.env.NOWRITE) process.exit(0);

const meshes = [];
for (const [id, g] of Object.entries({ ...bones, ...soft, ...muscles })) meshes.push({ id, ...g });
for (const [id, g] of Object.entries(sweeps)) meshes.push({ id, positions: g.positions, normals: g.normals, uvs: g.uvs, indices: g.indices });
meshes.push({ id: 'skin', ...skin });
for (const m of meshes) if (!STRUCTURES[m.id]) throw new Error('no structure entry for ' + m.id);
writeAnatomy(meshes, STRUCTURES, OUT, log);

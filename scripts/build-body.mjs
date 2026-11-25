// Packs the whole-body BodyParts3D model into per-system files for the body explorer.
// Source: the npm package @dagno/anatomy-model@0.1.2 (BodyParts3D 4.0, CC BY 4.0):
//   mkdir -p /tmp/bp3d && cd /tmp/bp3d && npm pack @dagno/anatomy-model@0.1.2 && tar xzf *.tgz
//   node scripts/build-body.mjs /tmp/bp3d/package/model
// Output: public/body/manifest.json + public/body/<system>.dat (gzip of quantised geometry).
// Units: metres, Y up, feet at y = 0, +Z front, +X = the body's left.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const SRC = process.argv[2];
if (!SRC) throw new Error('usage: node scripts/build-body.mjs <path to anatomy-model/model>');
const OUT = path.resolve('public/body');
fs.mkdirSync(OUT, { recursive: true });

const atlas = JSON.parse(fs.readFileSync(path.join(SRC, 'atlas.json'), 'utf8'));
const chunks = atlas.chunks.map((c) => zlib.gunzipSync(fs.readFileSync(path.join(SRC, path.basename(c.gzip)))));

// Systems grouped into the layers people switch on and off.
const PACKS = [
  { id: 'skin', label: 'Skin', systems: ['integumentary'] },
  { id: 'muscles', label: 'Muscles', systems: ['muscular'] },
  { id: 'skeleton', label: 'Skeleton', systems: ['skeletal'] },
  { id: 'joints', label: 'Ligaments and tendons', systems: ['connective'] },
  { id: 'nerves', label: 'Brain and nerves', systems: ['nervous'] },
  { id: 'arteries', label: 'Arteries', systems: ['arterial'] },
  { id: 'veins', label: 'Veins', systems: ['venous'] },
  { id: 'organs', label: 'Organs', systems: ['cardiac', 'respiratory', 'digestive', 'urinary', 'reproductive', 'endocrine', 'lymphatic'] },
  { id: 'senses', label: 'Eyes and ears', systems: ['sensory'] },
];

const manifest = {
  version: 1, units: 'm', source: atlas.version,
  credit: 'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International',
  packs: [],
};
let total = 0;
for (const pack of PACKS) {
  const parts = atlas.parts.filter((p) => pack.systems.includes(p.system));
  let nv = 0, nt = 0;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) { nv += p.vertexCount; nt += p.indexCount / 3; for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], p.bounds[0][a]); max[a] = Math.max(max[a], p.bounds[1][a]); } }
  const pos = new Uint16Array(nv * 3), nrm = new Int8Array(nv * 3 + ((4 - ((nv * 3) % 4)) % 4)), pid = new Uint16Array(nv + (nv % 2)), idx = new Uint16Array(nt * 3);
  const list = [];
  let v0 = 0, t0 = 0;
  parts.forEach((p, k) => {
    const buf = chunks[p.chunk];
    const P = new Float32Array(buf.buffer.slice(buf.byteOffset + p.positions, buf.byteOffset + p.positions + p.vertexCount * 12));
    const N = new Int16Array(buf.buffer.slice(buf.byteOffset + p.normals, buf.byteOffset + p.normals + p.vertexCount * 6));
    const I = new Uint32Array(buf.buffer.slice(buf.byteOffset + p.indices, buf.byteOffset + p.indices + p.indexCount * 4));
    if (p.vertexCount > 65535) throw new Error('part too large for 16-bit indices: ' + p.id);
    for (let i = 0; i < p.vertexCount; i++) {
      for (let a = 0; a < 3; a++) {
        pos[(v0 + i) * 3 + a] = Math.round(((P[i * 3 + a] - min[a]) / (max[a] - min[a])) * 65535);
        nrm[(v0 + i) * 3 + a] = Math.round((N[i * 3 + a] / 32767) * 127);
      }
      pid[v0 + i] = k;
    }
    for (let i = 0; i < p.indexCount; i++) idx[t0 * 3 + i] = I[i];
    const c = [0, 1, 2].map((a) => +((p.bounds[0][a] + p.bounds[1][a]) / 2).toFixed(4));
    const r = +(Math.hypot(...[0, 1, 2].map((a) => p.bounds[1][a] - p.bounds[0][a])) / 2).toFixed(4);
    list.push({ id: p.id, name: p.name, system: p.system, v0, vc: p.vertexCount, t0, tc: p.indexCount / 3, c, r });
    v0 += p.vertexCount; t0 += p.indexCount / 3;
  });
  // file layout: positions | normals (padded) | part ids (padded) | local indices
  const raw = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(nrm.buffer), Buffer.from(pid.buffer), Buffer.from(idx.buffer)]);
  const gz = zlib.gzipSync(raw, { level: 9 });
  fs.writeFileSync(path.join(OUT, `${pack.id}.dat`), gz);
  total += gz.length;
  manifest.packs.push({
    id: pack.id, label: pack.label, file: `${pack.id}.dat`, bytes: gz.length, nv, nt, min, max,
    layout: { pos: 0, nrm: pos.byteLength, pid: pos.byteLength + nrm.byteLength, idx: pos.byteLength + nrm.byteLength + pid.byteLength },
    parts: list,
  });
  console.log(`${pack.id}: ${parts.length} parts, ${nv} verts, ${nt} tris, ${(gz.length / 1e6).toFixed(2)} MB`);
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest));
console.log(`total ${(total / 1e6).toFixed(1)} MB`);

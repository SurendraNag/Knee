// Builds public/spine-move/ for the spine movement page: a subset of public/spine/ (run build:spine first) holding only
// the vertebrae, sacrum, hip bones, discs, longitudinal ligaments, spinal cord and nerve roots, so phones load less.
// The meshes are copied byte for byte (same format, see writeAnatomy in build-lib.mjs and loadAnatomy in src/main.js).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const SRC = path.resolve('public/spine'), OUT = path.resolve('public/spine-move');
const KEEP = /^(c\d|t\d+|l\d|sacrum|right_hip_bone|left_hip_bone|disc_.*|anterior_longitudinal_ligament|posterior_longitudinal_ligament|spinal_cord|nerve_roots)$/;
const man = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));
const raw = zlib.gunzipSync(fs.readFileSync(path.join(SRC, 'anatomy.dat')));
const list = man.meshes.filter((m) => KEEP.test(m.id));
// every mesh's streams sit together in one span of the file: [first offset, start of the next mesh)
const starts = man.meshes.map((m) => m.pos).concat(raw.length);
const chunks = [], meshes = []; let off = 0;
for (const m of list) {
  const i = man.meshes.indexOf(m), a = m.pos, b = starts[i + 1];
  const out = { ...m };
  for (const k of ['pos', 'nrm', 'ao', 'idx', 'uv', 'tint']) if (out[k] !== undefined) { if (out[k] < a || out[k] >= b) throw new Error(`${m.id} ${k} outside its span`); out[k] = out[k] - a + off; }
  chunks.push(raw.subarray(a, b)); off += b - a; meshes.push(out);
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'anatomy.dat'), zlib.gzipSync(Buffer.concat(chunks), { level: 9 }));
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ ...man, meshes }));
console.log(`${meshes.length} meshes, ${(off / 1e6).toFixed(2)} MB raw, ${(fs.statSync(path.join(OUT, 'anatomy.dat')).size / 1e6).toFixed(2)} MB gzip`);

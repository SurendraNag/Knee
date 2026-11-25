// One-off: copies one body region's parts out of the whole-body BodyParts3D package @dagno/anatomy-model@0.1.2
// (CC BY 4.0) into data/bodyparts3d/<region>-extra.*, converted to that region's centimetre frame
// (scan axes kept: +X toward the body's left, +Y up, +Z front; origin given per region).
// Usage: node scripts/extract-region.mjs <path to package/model> <region>
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
const [SRC, REGION] = process.argv.slice(2);
const atlas = JSON.parse(fs.readFileSync(path.join(SRC, 'atlas.json'), 'utf8'));
const chunks = atlas.chunks.map((c) => zlib.gunzipSync(fs.readFileSync(path.join(SRC, path.basename(c.gzip)))));
const centre = (b) => [0, 1, 2].map((i) => (b[0][i] + b[1][i]) / 2);
const segDist = (p, a, b) => { const ab = b.map((v, i) => v - a[i]), ap = p.map((v, i) => v - a[i]); const t = Math.max(0, Math.min(1, ap.reduce((s, v, i) => s + v * ab[i], 0) / ab.reduce((s, v) => s + v * v, 0))); return Math.hypot(...ap.map((v, i) => v - t * ab[i])); };

const REGIONS = {
  // right shoulder girdle, upper arm, elbow and the top of the forearm; origin at the centre of the humeral head
  shoulder: {
    O: [-0.18, 1.385, -0.025],
    take: (p, c) => {
      if (/^Right (clavicle|scapula|humerus|radius|ulna|(first|second|third|fourth|fifth|sixth|seventh) (rib|costal cartilage))$|^Manubrium$|^Body of sternum$/.test(p.name)) return true;
      if (p.system === 'skeletal' && !/levator scapulae|subscapularis/.test(p.name)) return false; // ribs, spine, teeth...
      if (/intercostal|oblique|iliocostalis|longissimus|serratus posterior|levatores|intertransversarius|psoas|platysma|omohyoid|scalen|transversus|subclavius|hepat|segmental|portal|renal|phrenic|lumbar|ileocolic|bronch|colon|ileum|jejun|kidney|Skin|subcostal|thyroid|costocervical|deep cervical|thyrocervical|iliac|colic|epigastric|gluteal/i.test(p.name)) return false;
      if (!/muscular|arterial|venous|skeletal|connective/.test(p.system)) return false;
      if (!/right|^Set of right/i.test(p.name) && !/axillary|brachial|cephalic|basilic|cubital/i.test(p.name)) return false;
      return c[0] < -0.03 && c[0] > -0.34 && c[1] > 0.95 && c[1] < 1.52 && c[2] > -0.14 && c[2] < 0.13;
    },
    // skin round the arm, plus the right half of the upper chest, shoulder top and upper back
    skin: (x, y, z) => x < 0.01 && y > 0.97 && y < 1.53 && (y > 1.22 || segDist([x, y, z], [-0.19, 1.38, -0.03], [-0.22, 1.11, -0.02]) < 0.075 || segDist([x, y, z], [-0.22, 1.11, -0.02], [-0.25, 0.95, 0.0]) < 0.06),
  },
};
const R = REGIONS[REGION];
const conv = (x, y, z) => [(x - R.O[0]) * 100, (y - R.O[1]) * 100, (z - R.O[2]) * 100];
const index = [], bufs = []; let off = 0;
for (const p of atlas.parts) {
  const skin = p.name === 'Skin';
  if (!skin && !R.take(p, centre(p.bounds))) continue;
  const buf = chunks[p.chunk];
  let P = new Float32Array(buf.buffer.slice(buf.byteOffset + p.positions, buf.byteOffset + p.positions + p.vertexCount * 12));
  let I = new Uint32Array(buf.buffer.slice(buf.byteOffset + p.indices, buf.byteOffset + p.indices + p.indexCount * 4));
  if (skin) { // keep triangles whose corners are all inside, then compact the vertices
    const keepV = new Uint8Array(P.length / 3); for (let i = 0; i < keepV.length; i++) keepV[i] = R.skin(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]) ? 1 : 0;
    const map = new Int32Array(keepV.length).fill(-1), NP = [], NI = [];
    for (let t = 0; t < I.length; t += 3) { const a = I[t], b = I[t + 1], c = I[t + 2]; if (!(keepV[a] && keepV[b] && keepV[c])) continue;
      for (const v of [a, b, c]) { if (map[v] < 0) { map[v] = NP.length / 3; NP.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); } NI.push(map[v]); } }
    P = new Float32Array(NP); I = new Uint32Array(NI);
  }
  for (let i = 0; i < P.length; i += 3) { const c = conv(P[i], P[i + 1], P[i + 2]); P[i] = c[0]; P[i + 1] = c[1]; P[i + 2] = c[2]; }
  index.push({ id: p.id, name: p.name, system: p.system, pos: off, vc: P.length / 3, idx: off + P.byteLength, ic: I.length });
  bufs.push(Buffer.from(P.buffer), Buffer.from(I.buffer)); off += P.byteLength + I.byteLength;
}
fs.writeFileSync(`data/bodyparts3d/${REGION}-extra.bin`, zlib.gzipSync(Buffer.concat(bufs), { level: 9 }));
fs.writeFileSync(`data/bodyparts3d/${REGION}-extra.json`, JSON.stringify(index, null, 0));
console.log(index.length, 'parts', (off / 1e6).toFixed(1), 'MB raw');
const sys = {}; for (const e of index) sys[e.system] = (sys[e.system] || 0) + 1; console.log(sys);
console.log(index.filter((e) => e.system !== 'arterial' && e.system !== 'venous').map((e) => e.id + ' ' + e.name).join('\n'));

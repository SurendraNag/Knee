// One-off: copies the right forearm and hand parts (bones, muscles with their tendons, vessels, flexor retinaculum,
// interosseous membrane, skin) out of the whole-body BodyParts3D package @dagno/anatomy-model@0.1.2 (CC BY 4.0)
// into data/bodyparts3d/arm-extra.*, converted to the hand app's centimetre frame.
// Usage: node scripts/extract-arm-extra.mjs <path to package/model>
//
// Hand frame: origin at the wrist (centre of the lunate), fingers point up (+Y), palm faces front (+Z),
// thumb side is +X and little-finger side -X. That is the scan's right hand turned 180 degrees about the
// front-back axis (a rotation, so it stays a right hand).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
const SRC = process.argv[2];
const atlas = JSON.parse(fs.readFileSync(path.join(SRC, 'atlas.json'), 'utf8'));
const chunks = atlas.chunks.map((c) => zlib.gunzipSync(fs.readFileSync(path.join(SRC, path.basename(c.gzip)))));
const W = [-0.252, 0.882, 0.018];
export const conv = (x, y, z) => [-(x - W[0]) * 100, -(y - W[1]) * 100, (z - W[2]) * 100];
const inBox = (b) => { const c = [0, 1, 2].map((i) => (b[0][i] + b[1][i]) / 2); return c[0] > -0.37 && c[0] < -0.16 && c[1] > 0.72 && c[1] < 1.10 && c[2] > -0.08 && c[2] < 0.12; };
// skin: keep what lies near the forearm axis (wrist -> elbow) or around the hand, then the app keeps the largest piece
const ELBOW = [-0.222, 1.11, -0.012];
const segDist = (p, a, b) => { const ab = b.map((v, i) => v - a[i]), ap = p.map((v, i) => v - a[i]); const t = Math.max(0, Math.min(1, ap.reduce((s, v, i) => s + v * ab[i], 0) / ab.reduce((s, v) => s + v * v, 0))); return Math.hypot(...ap.map((v, i) => v - t * ab[i])); };
const nearArm = (x, y, z) => y < 1.115 && (segDist([x, y, z], W, ELBOW) < 0.06 || segDist([x, y, z], W, [-0.27, 0.79, 0.06]) < 0.1);
const index = [], bufs = []; let off = 0;
for (const p of atlas.parts) {
  const skin = p.name === 'Skin';
  if (!skin && !inBox(p.bounds)) continue;
  const buf = chunks[p.chunk];
  let P = new Float32Array(buf.buffer.slice(buf.byteOffset + p.positions, buf.byteOffset + p.positions + p.vertexCount * 12));
  let I = new Uint32Array(buf.buffer.slice(buf.byteOffset + p.indices, buf.byteOffset + p.indices + p.indexCount * 4));
  if (skin) { // crop triangles, then compact the vertices
    const keepV = new Uint8Array(P.length / 3); for (let i = 0; i < keepV.length; i++) keepV[i] = nearArm(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]) ? 1 : 0;
    const map = new Int32Array(keepV.length).fill(-1), NP = [], NI = [];
    for (let t = 0; t < I.length; t += 3) { const a = I[t], b = I[t + 1], c = I[t + 2]; if (!(keepV[a] && keepV[b] && keepV[c])) continue;
      for (const v of [a, b, c]) { if (map[v] < 0) { map[v] = NP.length / 3; NP.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); } NI.push(map[v]); } }
    P = new Float32Array(NP); I = new Uint32Array(NI);
  }
  for (let i = 0; i < P.length; i += 3) { const c = conv(P[i], P[i + 1], P[i + 2]); P[i] = c[0]; P[i + 1] = c[1]; P[i + 2] = c[2]; }
  // the 180-degree turn keeps handedness, so the winding stays as it is
  index.push({ id: p.id, name: p.name, system: p.system, pos: off, vc: P.length / 3, idx: off + P.byteLength, ic: I.length });
  bufs.push(Buffer.from(P.buffer), Buffer.from(I.buffer)); off += P.byteLength + I.byteLength;
}
fs.writeFileSync('data/bodyparts3d/arm-extra.bin', zlib.gzipSync(Buffer.concat(bufs), { level: 9 }));
fs.writeFileSync('data/bodyparts3d/arm-extra.json', JSON.stringify(index, null, 0));
console.log(index.length, 'parts', (off / 1e6).toFixed(1), 'MB raw');

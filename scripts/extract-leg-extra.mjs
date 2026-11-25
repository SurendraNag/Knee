// One-off: copies the right-leg parts that the region GLBs lack (small muscles, vessels, skin) out of the
// whole-body BodyParts3D package @dagno/anatomy-model@0.1.2 (CC BY 4.0) into data/bodyparts3d/leg-extra.*,
// converted to the app's centimetre frame. Usage: node scripts/extract-leg-extra.mjs <path to package/model>
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
const SRC = process.argv[2];
const atlas = JSON.parse(fs.readFileSync(path.join(SRC, 'atlas.json'), 'utf8'));
const chunks = atlas.chunks.map((c) => zlib.gunzipSync(fs.readFileSync(path.join(SRC, path.basename(c.gzip)))));
const IDS = `FJ1404 FJ1425 FJ1416 FJ1417 FJ1427 FJ1432 FJ1438 FJ1423 FJ1408 FJ1415 FJ1411 FJ1407 FJ1400 FJ1390 FJ1383 FJ1385 FJ1387 FJ1389
FJ1384 FJ1386 FJ1388 FJ1393 FJ1396 FJ1398 FJ1445 FJ1399 FJ1391 FJ1412
FJ3567 FJ2143 FJ2158 FJ2057 FJ2203 FJ2127 FJ2137 FJ2170 FJ2150 FJ2152 FJ2162 FJ2166 FJ2167 FJ2131 FJ2130 FJ2172 FJ2195 FJ2055 FJ2133 FJ2136
FJ2163 FJ2159 FJ2164 FJ2169 FJ2179 FJ2196 FJ2197 FJ2204 FJ2205 FJ2206 FJ2141 FJ2058
FJ3568 FJ2144 FJ2135 FJ2201 FJ2202 FJ2145 FJ2176 FJ2171 FJ2151 FJ2153 FJ2181 FJ2182 FJ2132 FJ2193 FJ2173 FJ2194 FJ2200
FJ2061 FJ2062 FJ2129 FJ2160 FJ2165 FJ2175 FJ2198 FJ2207 FJ2138 FJ2174 FJ2192`.split(/\s+/);
// dagno metres (feet at 0, +Z front, +X = body's left) -> app cm (knee at 0, +Z front, +X medial for the right leg)
const conv = (x, y, z) => [x * 100 + 7.2, y * 100 - 44.911, z * 100 + 2.0];
const index = [], bufs = []; let off = 0;
const want = new Set(IDS);
for (const p of atlas.parts) {
  let keep = want.has(p.id);
  if (p.name === 'Skin') keep = true;
  if (!keep) continue;
  const buf = chunks[p.chunk];
  const P = new Float32Array(buf.buffer.slice(buf.byteOffset + p.positions, buf.byteOffset + p.positions + p.vertexCount * 12));
  const I = new Uint32Array(buf.buffer.slice(buf.byteOffset + p.indices, buf.byteOffset + p.indices + p.indexCount * 4));
  for (let i = 0; i < P.length; i += 3) { const c = conv(P[i], P[i + 1], P[i + 2]); P[i] = c[0]; P[i + 1] = c[1]; P[i + 2] = c[2]; }
  index.push({ id: p.id, name: p.name, system: p.system, pos: off, vc: p.vertexCount, idx: off + P.byteLength, ic: p.indexCount });
  bufs.push(Buffer.from(P.buffer), Buffer.from(I.buffer)); off += P.byteLength + I.byteLength;
}
fs.writeFileSync('data/bodyparts3d/leg-extra.bin', zlib.gzipSync(Buffer.concat(bufs), { level: 9 }));
fs.writeFileSync('data/bodyparts3d/leg-extra.json', JSON.stringify(index, null, 0));
console.log(index.length, 'parts', (off / 1e6).toFixed(1), 'MB raw', 'missing:', IDS.filter((i) => !index.find((x) => x.id === i)));

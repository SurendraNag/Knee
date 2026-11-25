// Minimal GLB reader for the BodyParts3D region files (no extensions, float positions, u16/u32 indices).
import fs from 'node:fs';
const COMP = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
export function readGlb(file) {
  const b = fs.readFileSync(file);
  const jl = b.readUInt32LE(12); const j = JSON.parse(b.subarray(20, 20 + jl).toString());
  const binStart = 20 + jl + 8; const bin = b.subarray(binStart);
  const acc = (i) => {
    const a = j.accessors[i], bv = j.bufferViews[a.bufferView];
    const T = COMP[a.componentType], n = a.count * SIZE[a.type];
    const off = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const copy = Buffer.from(bin.subarray(off, off + n * T.BYTES_PER_ELEMENT));
    return new T(copy.buffer, copy.byteOffset, n);
  };
  const out = [];
  for (const n of j.nodes) {
    if (n.mesh === undefined) continue;
    for (const p of j.meshes[n.mesh].primitives) {
      out.push({ name: n.name, fj: (n.name.match(/FJ\d+M?/) || [''])[0], positions: acc(p.attributes.POSITION), indices: Uint32Array.from(acc(p.indices)) });
    }
  }
  return out;
}
// BodyParts3D mm, Z up, patient right = -X, anterior = -Y  ->  app cm, Y up, +Z anterior, +X medial (right knee).
export const KNEE_ORIGIN = [-72, -80, 371];
export function toApp(pos, o = KNEE_ORIGIN) {
  const r = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) { r[i] = (pos[i] - o[0]) / 10; r[i + 1] = (pos[i + 2] - o[2]) / 10; r[i + 2] = -(pos[i + 1] - o[1]) / 10; }
  return r;
}

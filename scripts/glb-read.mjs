// Read an EXT_meshopt_compression + KHR_mesh_quantization GLB into world-space meshes (data only).
import fs from 'node:fs';
import * as THREE from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
export async function readGLB(file) {
  await MeshoptDecoder.ready;
  const b = fs.readFileSync(file);
  const jl = b.readUInt32LE(12); const J = JSON.parse(b.subarray(20, 20 + jl).toString());
  const bo = 20 + jl; const bl = b.readUInt32LE(bo); const BIN = b.subarray(bo + 8, bo + 8 + bl);
  const views = J.bufferViews.map((v) => {
    const e = v.extensions?.EXT_meshopt_compression;
    if (!e) return BIN.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
    const src = BIN.subarray(e.byteOffset || 0, (e.byteOffset || 0) + e.byteLength);
    const out = new Uint8Array(e.count * e.byteStride);
    MeshoptDecoder.decodeGltfBuffer(out, e.count, e.byteStride, new Uint8Array(src), e.mode, e.filter || 'NONE');
    return out;
  });
  const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const acc = (i) => {
    const a = J.accessors[i], v = views[a.bufferView], bv = J.bufferViews[a.bufferView];
    const T = CT[a.componentType], nc = NC[a.type], stride = (bv.byteStride || bv.extensions?.EXT_meshopt_compression?.byteStride || nc * T.BYTES_PER_ELEMENT) / T.BYTES_PER_ELEMENT;
    const raw = new T(v.buffer, v.byteOffset + (a.byteOffset || 0), Math.floor((v.byteLength - (a.byteOffset || 0)) / T.BYTES_PER_ELEMENT));
    const out = new Float32Array(a.count * nc);
    const norm = a.normalized ? { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[a.componentType] : 1;
    for (let k = 0; k < a.count; k++) for (let c = 0; c < nc; c++) out[k * nc + c] = a.normalized ? Math.max(-1, raw[k * stride + c] / norm) : raw[k * stride + c];
    return { data: out, type: a.type };
  };
  // world matrices
  const world = new Array(J.nodes.length);
  const local = (n) => { const m = new THREE.Matrix4(); if (n.matrix) m.fromArray(n.matrix); else m.compose(new THREE.Vector3(...(n.translation || [0, 0, 0])), new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(n.scale || [1, 1, 1]))); return m; };
  const roots = J.scenes[J.scene || 0].nodes;
  const walk = (i, parent, group) => { const n = J.nodes[i]; world[i] = parent.clone().multiply(local(n)); n._group = group; (n.children || []).forEach((c) => walk(c, world[i], group ?? n.name)); };
  roots.forEach((r) => walk(r, new THREE.Matrix4(), null));
  const meshes = [];
  J.nodes.forEach((n, i) => {
    if (n.mesh === undefined) return;
    const M = J.meshes[n.mesh];
    for (const p of M.primitives) {
      const P = acc(p.attributes.POSITION).data, I = p.indices !== undefined ? acc(p.indices).data : null;
      const v = new THREE.Vector3(); const pos = new Float32Array(P.length);
      for (let k = 0; k < P.length; k += 3) { v.set(P[k], P[k + 1], P[k + 2]).applyMatrix4(world[i]); pos[k] = v.x; pos[k + 1] = v.y; pos[k + 2] = v.z; }
      meshes.push({ name: M.name || n.name, group: n._group, positions: pos, indices: I ? Uint32Array.from(I) : null, extras: M.extras || n.extras });
    }
  });
  return { meshes, json: J };
}
